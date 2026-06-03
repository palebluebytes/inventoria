export interface ScrapedProduct {
  entityId: string;
  name: string;
  image: string;
  description: string;
  brand: string;
}

export function extractJsonLd(
  html: string,
  pageUrl?: string
): ScrapedProduct | null {
  // Regex to extract application/ld+json contents
  const scriptRegex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const products: any[] = [];

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      // The parsed JSON-LD could be a single object, an array of objects, or a graph
      if (Array.isArray(parsed)) {
        products.push(...parsed);
      } else if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
        products.push(...parsed["@graph"]);
      } else {
        products.push(parsed);
      }
    } catch (e) {
      // Ignore syntax errors in individual JSON-LD blocks
    }
  }

  // Find the first object that is a schema:Product (case insensitive comparison)
  const productObj = products.find((obj) => {
    if (!obj || typeof obj !== "object") return false;
    const type = obj["@type"];
    if (Array.isArray(type)) {
      return type.some((t) => String(t).toLowerCase() === "product");
    }
    return String(type).toLowerCase() === "product";
  });

  if (!productObj) {
    const name =
      getMetaTag(html, "og:title") ||
      getMetaTag(html, "twitter:title") ||
      getMetaTag(html, "title") ||
      getTitleTag(html);

    if (!name) {
      return null;
    }

    const image =
      getAmazonLandingImage(html) ||
      getMetaTag(html, "og:image") ||
      getMetaTag(html, "twitter:image");

    const description =
      getMetaTag(html, "og:description") ||
      getMetaTag(html, "twitter:description") ||
      getMetaTag(html, "description");

    const brand = getMetaTag(html, "og:site_name") || "";

    let entityId = "";
    if (pageUrl) {
      const asin = extractAsin(pageUrl);
      entityId = asin ? `asin:${asin}` : `url:${simpleHash(pageUrl)}`;
    } else {
      entityId = `url:temp_${Date.now()}`;
    }

    return {
      entityId,
      name,
      image,
      description,
      brand,
    };
  }

  // Determine the identifier based on priority:
  // 1. DPP standard URI: @id if it starts with "did:" or "gs1:"
  // 2. Legacy barcode/sku: gtin13, gtin8, gtin12, gtin14, isbn, sku, mpn
  // 3. Fallback: url hash
  let entityId = "";

  const atId = productObj["@id"];
  if (
    typeof atId === "string" &&
    (atId.startsWith("did:") || atId.startsWith("gs1:"))
  ) {
    entityId = atId;
  } else {
    const rawGtin =
      productObj.gtin13 ||
      productObj.gtin ||
      productObj.gtin8 ||
      productObj.gtin12 ||
      productObj.gtin14;
    if (rawGtin) {
      entityId = `gtin:${String(rawGtin).trim()}`;
    } else if (productObj.isbn) {
      entityId = `isbn:${String(productObj.isbn).trim()}`;
    } else if (productObj.sku) {
      entityId = `sku:${String(productObj.sku).trim()}`;
    } else if (productObj.mpn) {
      entityId = `sku:${String(productObj.mpn).trim()}`;
    } else if (pageUrl) {
      const asin = extractAsin(pageUrl);
      entityId = asin ? `asin:${asin}` : `url:${simpleHash(pageUrl)}`;
    } else {
      entityId = `url:temp_${Date.now()}`;
    }
  }

  // Extract name
  const name = String(productObj.name || "").trim();

  // Extract image
  let image = "";
  if (productObj.image) {
    if (typeof productObj.image === "string") {
      image = productObj.image;
    } else if (Array.isArray(productObj.image) && productObj.image.length > 0) {
      image =
        typeof productObj.image[0] === "string"
          ? productObj.image[0]
          : productObj.image[0].url || "";
    } else if (typeof productObj.image === "object") {
      image = productObj.image.url || "";
    }
  }

  // Extract description
  const description = String(productObj.description || "").trim();

  // Extract brand
  let brand = "";
  if (productObj.brand) {
    if (typeof productObj.brand === "string") {
      brand = productObj.brand;
    } else if (typeof productObj.brand === "object") {
      brand = productObj.brand.name || "";
    }
  }

  return {
    entityId,
    name,
    image,
    description,
    brand,
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function getMetaTag(html: string, nameOrProperty: string): string {
  const regexes = [
    new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${nameOrProperty}["'][^>]*content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${nameOrProperty}["']`,
      "i"
    ),
  ];
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match) return decodeHtmlEntities(match[1].trim());
  }
  return "";
}

function getTitleTag(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function getAmazonLandingImage(html: string): string {
  const imgRegex = /<img\s+[^>]*id=["']landingImage["'][^>]*>/i;
  const match = html.match(imgRegex);
  if (match) {
    const tag = match[0];
    const hiresMatch = tag.match(/data-old-hires=["']([^"']*)["']/i);
    if (hiresMatch && hiresMatch[1]) return hiresMatch[1].trim();

    const srcMatch = tag.match(/src=["']([^"']*)["']/i);
    if (srcMatch && srcMatch[1]) return srcMatch[1].trim();
  }
  return "";
}

function extractAsin(url: string): string | null {
  const match = url.match(/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : null;
}
