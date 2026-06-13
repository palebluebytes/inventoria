/**
 * Canonical HTML pre-cleaner for the scraper proxy.
 *
 * Single source of truth shared by the Cloudflare Worker proxy, the Vite dev
 * proxy middleware, and the unit tests, so the three can never drift apart.
 *
 * The cleaned HTML is never rendered into a DOM — it is only mined for
 * JSON-LD / Open Graph metadata downstream — so the goal here is purely to
 * shrink the payload (bypassing proxy size limits) while preserving the
 * `application/ld+json` blocks that ingestion depends on.
 */
export function cleanHtml(html: string): string {
  // Remove <style> blocks.
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");

  // Remove inline <svg> blocks.
  html = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, "");

  // Remove <script> blocks except application/ld+json. Per the HTML spec a
  // script element is terminated by the first "</script>", so the non-greedy
  // match mirrors real parser behaviour and pairs each opener with its own
  // closer rather than swallowing intervening markup.
  html = html.replace(
    /<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi,
    (match, attrs) =>
      /type\s*=\s*['"]?application\/ld\+json['"]?/i.test(attrs) ? match : ""
  );

  return html;
}
