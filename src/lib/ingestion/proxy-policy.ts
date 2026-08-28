/**
 * Post-fetch response policy shared by the Cloudflare Worker proxy and the Vite
 * dev proxy, so the two cannot drift on the size cap, image-type allowlist, or
 * the security headers applied to scraped content. The upstream fetch itself is
 * guarded by `url-guard`; this module governs what comes back.
 */
import { cleanHtml } from "./html-clean";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Defence-in-depth headers applied to every proxied response. */
export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/** The body is opaque scraped markup; lock rendering down hard in case it is
 *  ever loaded directly in a browser context. */
export const HTML_CSP =
  "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-ancestors 'none'";

/** Raised by readCapped when a body exceeds MAX_RESPONSE_BYTES mid-stream. */
export class ResponseTooLargeError extends Error {}

/**
 * Reads a response body, aborting as soon as it exceeds `max` bytes. This bounds
 * memory regardless of whether the upstream sent an honest content-length — a
 * chunked/length-omitted body cannot be trusted, so we must measure while
 * reading rather than buffering the whole thing first.
 *
 * The buffer is spelled `ArrayBuffer` rather than left at the default
 * `ArrayBufferLike`, because everything returned here is allocated here and so
 * is never shared-backed. Without that, the bytes cannot be handed to a
 * `Response`: `BodyInit` refuses a view that might sit on a `SharedArrayBuffer`.
 */
export async function readCapped(
  response: Response,
  max: number
): Promise<Uint8Array<ArrayBuffer>> {
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

/** The rendered result of applying the proxy policy to an upstream response. */
export type ProxyPayload =
  | { kind: "image"; mime: string; body: Uint8Array<ArrayBuffer> }
  | { kind: "html"; html: string }
  | { kind: "error"; status: number; message: string };

/**
 * Applies the size cap and image-type allowlist to an already-guarded upstream
 * response and returns the body to emit: a capped image buffer, cleaned HTML, or
 * a structured refusal. Each proxy is left to translate the result into its own
 * response type (Web `Response` in the Worker, Node `res` in the dev proxy) while
 * sharing the constants and `securityHeaders`/`HTML_CSP` above.
 */
export async function readProxyPayload(
  response: Response
): Promise<ProxyPayload> {
  // Reject oversized payloads early when the upstream declares a length;
  // readCapped still enforces the cap for chunked/length-omitted bodies.
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    return {
      kind: "error",
      status: 413,
      message: "Target response exceeds 5MB size limit",
    };
  }

  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("image/")) {
      const mime = contentType.split(";")[0].trim().toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
        return {
          kind: "error",
          status: 415,
          message: `Unsupported image type: ${mime}`,
        };
      }
      return {
        kind: "image",
        mime,
        body: await readCapped(response, MAX_RESPONSE_BYTES),
      };
    }

    const raw = new TextDecoder().decode(
      await readCapped(response, MAX_RESPONSE_BYTES)
    );
    return { kind: "html", html: cleanHtml(raw) };
  } catch (err) {
    if (err instanceof ResponseTooLargeError) {
      return {
        kind: "error",
        status: 413,
        message: "Target response exceeds 5MB size limit",
      };
    }
    throw err;
  }
}
