export default {
  async fetch(request: Request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "text/html;charset=UTF-8",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const urlString = new URL(request.url).searchParams.get("url");
    if (!urlString) {
      return new Response("Missing target URL", {
        status: 400,
        headers: corsHeaders,
      });
    }

    try {
      const decodedUrl = decodeURIComponent(urlString);

      // Perform the fetch mimicking a browser
      const response = await fetch(decodedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      if (!response.ok) {
        // Return the failure status back to the client
        return new Response(`Failed to fetch: ${response.statusText}`, {
          status: response.status,
          headers: corsHeaders,
        });
      }

      let html = await response.text();

      // HTML Minification via Regex to bypass size limitations and save bandwidth
      // 1. Remove all style tags
      html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");

      // 2. Remove all svg tags
      html = html.replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "");

      // 3. Remove all script tags *except* type="application/ld+json"
      html = html.replace(
        /<script([^>]*)>([\s\S]*?)<\/script>/gi,
        (match, attrs) => {
          const isJsonLd = /type\s*=\s*['"]?application\/ld\+json['"]?/i.test(
            attrs
          );
          return isJsonLd ? match : "";
        }
      );

      return new Response(html, {
        status: 200,
        headers: corsHeaders,
      });
    } catch (error: any) {
      return new Response(`Proxy Error: ${error?.message || error}`, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
