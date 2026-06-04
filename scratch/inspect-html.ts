async function inspectHtml(url: string) {
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

    const html = await response.text();

    console.log("\n=== Meta Tags ===");
    const metaRegex = /<meta\s+([^>]*?)>/gi;
    let match;
    const metaTags: string[] = [];
    while ((match = metaRegex.exec(html)) !== null) {
      const content = match[0];
      if (
        /property=["']og:|name=["'](title|description|keywords|twitter:)/i.test(
          content
        )
      ) {
        metaTags.push(content);
      }
    }
    metaTags.forEach((tag) => console.log(tag));

    console.log("\n=== Image Elements (Candidate Product Images) ===");
    // Let's print some image tags or main image container ids/classes
    // Amazon product image is usually inside id="imgTagWrapperId" or similar, or class "a-dynamic-image"
    const imgRegex = /<img\s+([^>]*?)>/gi;
    const imgTags: string[] = [];
    while ((match = imgRegex.exec(html)) !== null && imgTags.length < 15) {
      const content = match[0];
      if (
        /landingImage|main-image|a-dynamic-image|id=["']landingImage["']/i.test(
          content
        )
      ) {
        imgTags.push(content);
      }
    }
    imgTags.forEach((tag) => console.log(tag));

    console.log("\n=== Script tags with 'application/ld+json' or similar ===");
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptCount = 0;
    while ((match = scriptRegex.exec(html)) !== null) {
      const scriptContent = match[0];
      if (/ld\+json/i.test(scriptContent)) {
        console.log(scriptContent.slice(0, 500));
        scriptCount++;
      }
    }
    console.log(`Found ${scriptCount} matching script tags.`);
  } catch (error: any) {
    console.error("Failed:", error.message);
  }
}

const url = process.argv[2];
if (!url) {
  console.log("Usage: npx tsx scratch/inspect-html.ts <url>");
  process.exit(1);
}
inspectHtml(url);
