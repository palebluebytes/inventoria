import { checkProxyTarget, guardedFetch } from "../../src/lib/ingestion/url-guard";
import { cleanHtml } from "../../src/lib/ingestion/html-clean";

/** Raised by readCapped when a body exceeds MAX_RESPONSE_BYTES mid-stream. */
class ResponseTooLargeError extends Error {}

/**
 * Reads a response body, aborting as soon as it exceeds `max` bytes. This bounds
 * memory regardless of whether the upstream sent an honest content-length — a
 * chunked/length-omitted body cannot be trusted, so we must measure while
 * reading rather than buffering the whole thing first.
 */
async function readCapped(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 20_000;
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Defence-in-depth headers applied to every response.
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders,
      ...securityHeaders,
      "Content-Type": "text/plain",
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, ...securityHeaders },
      });
    }

    const urlString = new URL(request.url).searchParams.get("url");
    if (!urlString) {
      return errorResponse("Missing target URL", 400);
    }

    // SSRF guard: reject internal/loopback/metadata hosts and non-HTTP schemes.
    const guard = checkProxyTarget(urlString);
    if (!guard.ok) {
      return errorResponse(`Refused target URL: ${guard.reason}`, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await guardedFetch(guard.url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      if (!response.ok) {
        return errorResponse(
          `Failed to fetch: ${response.statusText}`,
          response.status
        );
      }

      // Reject oversized payloads early when the upstream declares a length.
      // readCapped still enforces the cap for chunked/length-omitted bodies.
      const declaredLength = Number(
        response.headers.get("content-length") || 0
      );
      if (declaredLength > MAX_RESPONSE_BYTES) {
        return errorResponse("Target response exceeds 5MB size limit", 413);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("image/")) {
        const mime = contentType.split(";")[0].trim().toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
          return errorResponse(`Unsupported image type: ${mime}`, 415);
        }
        const body = await readCapped(response, MAX_RESPONSE_BYTES);
        return new Response(body, {
          status: 200,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            "Content-Type": mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      const raw = new TextDecoder().decode(
        await readCapped(response, MAX_RESPONSE_BYTES)
      );

      const html = cleanHtml(raw);

      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          "Content-Type": "text/html;charset=UTF-8",
          // The body is opaque scraped markup; lock rendering down hard in case
          // it is ever loaded directly in a browser context.
          "Content-Security-Policy":
            "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      });
    } catch (error: any) {
      if (error instanceof ResponseTooLargeError) {
        return errorResponse("Target response exceeds 5MB size limit", 413);
      }
      if (error?.name === "AbortError") {
        return errorResponse("Target request timed out", 504);
      }
      return errorResponse(`Proxy Error: ${error?.message || error}`, 500);
    } finally {
      clearTimeout(timeout);
    }
  },
};
