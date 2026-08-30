import {
  checkProxyTarget,
  guardedFetch,
} from "../../src/lib/ingestion/url-guard";
import {
  corsHeaders,
  securityHeaders,
  HTML_CSP,
  readProxyPayload,
} from "../../src/lib/ingestion/proxy-policy";
import type { RelayNamespace } from "./relay";

// The relay is a Durable Object defined in this script, so wrangler needs it
// exported from the entry module (ADR-0072 §9: one Worker, two routes — a
// second Worker means a second dashboard-configured build that nothing in the
// repo records, which is the failure ADR-0070 was written to end).
export { Relay } from "./relay";

const FETCH_TIMEOUT_MS = 20_000;

// The one path this Worker answers, matching the `/api/proxy` the Vite dev
// middleware serves so a scrape reaches the same URL in both environments.
//
// Everything else on this origin is a static asset, and the platform serves
// those before the Worker is invoked at all (`run_worker_first` defaults off).
// A request arriving here on any other path therefore matched no asset either,
// which makes it a 404 rather than a proxy request missing its `url`.
const PROXY_PATH = "/api/proxy";

/**
 * The relay's route, on the same origin as the app and its receive link
 * (ADR-0072 §9): app, link and socket are one origin, so there is no allowlist
 * to write, maintain and get wrong.
 */
const RELAY_PATH = "/api/relay";

/** The bindings this script is deployed with; see `wrangler.toml`. */
export interface WorkerEnv {
  RELAY: RelayNamespace;
}

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

/**
 * Hand a socket to the room its Send code names.
 *
 * ADR-0072 §10: the room id is client-minted, drawn from the same CSPRNG draw
 * as the key, and the relay accepts any id it is handed. There is nothing to
 * validate beyond its presence — a guessed id buys a socket and nothing else,
 * since the ciphertext can be neither opened nor forged, so guessing is a
 * denial attack exclusively and never a disclosure one. Server-minting is
 * refused: it would cost a round trip before the sender's code could be drawn,
 * and put a server-chosen identifier into a code three decisions were spent
 * keeping the server out of.
 */
async function relayRequest(
  request: Request,
  env: WorkerEnv,
  room: string | null
): Promise<Response> {
  if (!room) {
    return errorResponse("Missing room id", 400);
  }
  return env.RELAY.get(env.RELAY.idFromName(room)).fetch(request);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);

    if (pathname === RELAY_PATH) {
      return relayRequest(request, env, searchParams.get("room"));
    }

    if (pathname !== PROXY_PATH) {
      return errorResponse("Not found", 404);
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, ...securityHeaders },
      });
    }

    const urlString = searchParams.get("url");
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

      const payload = await readProxyPayload(response);

      if (payload.kind === "error") {
        return errorResponse(payload.message, payload.status);
      }

      if (payload.kind === "image") {
        return new Response(payload.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            "Content-Type": payload.mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      return new Response(payload.html, {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          "Content-Type": "text/html;charset=UTF-8",
          "Content-Security-Policy": HTML_CSP,
        },
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return errorResponse("Target request timed out", 504);
      }
      return errorResponse(`Proxy Error: ${error?.message || error}`, 500);
    } finally {
      clearTimeout(timeout);
    }
  },
};
