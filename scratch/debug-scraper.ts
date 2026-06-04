import { extractJsonLd } from "../src/lib/ingestion/json-ld";

function cleanupHtml(html: string): string {
  // Same regex logic as the Cloudflare worker
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");
  html = html.replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "");
  html = html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs) => {
      const isJsonLd = /type\s*=\s*['"]?application\/ld\+json['"]?/i.test(
        attrs
      );
      return isJsonLd ? match : "";
    }
  );
  return html;
}

async function debugScraper(url: string) {
  console.log(`\n=== Testing Scraper on: ${url} ===`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const rawHtml = await response.text();
    const originalSizeKb = (Buffer.byteLength(rawHtml, "utf8") / 1024).toFixed(
      2
    );

    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Unknown Title";
    console.log(`- Response Status: ${response.status} ${response.statusText}`);
    console.log(`- Page Title:      "${title}"`);
    console.log(`- Original Size:   ${originalSizeKb} KB`);

    const rawJsonLdMatches = rawHtml.match(/application\/ld\+json/gi);
    console.log(
      `- Raw JSON-LD occurrences in HTML: ${rawJsonLdMatches ? rawJsonLdMatches.length : 0}`
    );

    const cleanedHtml = cleanupHtml(rawHtml);
    const cleanedSizeKb = (
      Buffer.byteLength(cleanedHtml, "utf8") / 1024
    ).toFixed(2);
    console.log(`- Cleaned Size:    ${cleanedSizeKb} KB`);

    const extracted = extractJsonLd(cleanedHtml, url);
    if (!extracted) {
      console.log("\n❌ No Schema.org JSON-LD found on this page!");

      // Let's check if there are script tags containing ld+json but we failed parsing them
      const scriptMatches = cleanedHtml.match(
        /<script[^>]*>[\s\S]*?<\/script>/gi
      );
      if (scriptMatches) {
        console.log(
          `\n- Found ${scriptMatches.length} raw JSON-LD blocks but extraction failed. Raw blocks:`
        );
        scriptMatches.forEach((s, i) => {
          console.log(`\nBlock #${i + 1}:`);
          console.log(s.slice(0, 500) + (s.length > 500 ? "..." : ""));
        });
      }
      return;
    }

    console.log("\n✅ Extraction Successful!");
    console.log("------------------------");
    console.log(`Entity ID:   ${extracted.entityId}`);
    console.log(`Name:        ${extracted.name}`);
    console.log(`Brand:       ${extracted.brand || "(none)"}`);
    console.log(`Image:       ${extracted.image || "(none)"}`);
    console.log(
      `Description: ${extracted.description ? extracted.description.slice(0, 100) + "..." : "(none)"}`
    );
    console.log("------------------------");
  } catch (error: any) {
    console.log(`\n❌ Scraper failed: ${error.message || error}`);
  }
}

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.log("Usage: pnpm dlx tsx scratch/debug-scraper.ts <product-url>");
  process.exit(1);
}

debugScraper(targetUrl);
