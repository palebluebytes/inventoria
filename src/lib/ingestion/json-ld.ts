/**
 * The identifiers a scraped page may carry. They are **attributes of an item**,
 * never its identity: a GTIN is the identity of the packaged food it was printed
 * for, and an item merely has one (ADR-0086 §3).
 */
export type ItemIdentifierKind = "gtin" | "isbn" | "sku" | "asin" | "dpp";

export interface ScrapedProduct {
  entityId: string;
  name: string;
  image: string;
  description: string;
  brand: string;
  /**
   * What the page carried, for the caller to write as `item/<kind>`. Absent when
   * the page identified the product only by its URL, or not at all.
   */
  identifier?: { kind: ItemIdentifierKind; value: string };
}

/**
 * The scraper mints `twin:` and nothing else (ADR-0086 §3).
 *
 * It used to pick its prefix from whatever the page's JSON-LD happened to carry
 * — `gtin:`, `isbn:`, `sku:`, `asin:`, `url:`, `url:temp_`, and for a `did:` or
 * `gs1:` `@id` the whole entity id **verbatim from the page**. That made it the
 * one minting site in the app whose entity identity was decided by an external
 * document, so it collided with food on `gtin:` and with media on `isbn:`, and
 * its collision surface grew without anyone editing the app.
 *
 * The suffix is not decoration. ADR-0014's whole decision is that two offline
 * devices scraping the same page independently construct the same entity id, so
 * `twin:` with the `Date.now()`/`Math.random()` suffix the manual form uses
 * would have repealed it in silence. Naming the identifier the page carried
 * keeps determinism everywhere it existed, and keeps the id legible in the raw
 * database, which ADR-0014 also asks for.
 *
 * `twin:temp_` is the one non-deterministic case, exactly as `url:temp_` was: a
 * page with no identifier and no URL has nothing to be deterministic about.
 */
function itemEntity(kind: ItemIdentifierKind | "url" | "temp", value: string) {
  return `twin:${kind}_${value}`;
}

/**
 * The identifier the page carried, in priority order, or `null` if it carried
 * none. An Amazon id read out of the page URL counts: it identifies the product
 * and survives the query string being different next time.
 */
function pickIdentifier(
  productObj: any,
  pageUrl?: string
): { kind: ItemIdentifierKind; value: string } | null {
  // A Digital Product Passport URI is the strongest identifier a page can
  // carry, and it is now a *suffix* rather than the whole entity id — which is
  // what lets the prefix roster bound it at all.
  const atId = productObj["@id"];
  if (
    typeof atId === "string" &&
    (atId.startsWith("did:") || atId.startsWith("gs1:"))
  ) {
    return { kind: "dpp", value: atId };
  }

  const rawGtin =
    productObj.gtin13 ||
    productObj.gtin ||
    productObj.gtin8 ||
    productObj.gtin12 ||
    productObj.gtin14;
  if (rawGtin) return { kind: "gtin", value: String(rawGtin).trim() };
  if (productObj.isbn)
    return { kind: "isbn", value: String(productObj.isbn).trim() };
  if (productObj.sku)
    return { kind: "sku", value: String(productObj.sku).trim() };
  if (productObj.mpn)
    return { kind: "sku", value: String(productObj.mpn).trim() };

  const asin = pageUrl ? extractAsin(cleanUrl(pageUrl)) : null;
  return asin ? { kind: "asin", value: asin } : null;
}

/** The entity id for a page carrying no identifier: its URL, else the clock. */
function entityFromUrlAlone(pageUrl?: string): string {
  return pageUrl
    ? itemEntity("url", simpleHash(cleanUrl(pageUrl)))
    : itemEntity("temp", String(Date.now()));
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
    const name = normalize_temperature_ranges(
      (
        getMetaTag(html, "og:title") ||
        getMetaTag(html, "twitter:title") ||
        getMetaTag(html, "title") ||
        getTitleTag(html) ||
        ""
      ).trim()
    );

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

    // No JSON-LD Product, so the only identifier available is an Amazon id in
    // the URL. Everything else falls back to the URL hash.
    const asin = pageUrl ? extractAsin(cleanUrl(pageUrl)) : null;
    const identifier = asin
      ? ({ kind: "asin", value: asin } as const)
      : undefined;

    return {
      entityId: identifier
        ? itemEntity(identifier.kind, identifier.value)
        : entityFromUrlAlone(pageUrl),
      name,
      image,
      description,
      brand,
      identifier,
    };
  }

  // What the page says this product is, in priority order. The identity is
  // always `twin:` whatever it says (ADR-0086 §3); this only decides the suffix
  // and what the caller writes as an `item/` attribute.
  const identifier = pickIdentifier(productObj, pageUrl) ?? undefined;
  const entityId = identifier
    ? itemEntity(identifier.kind, identifier.value)
    : entityFromUrlAlone(pageUrl);

  // Extract name
  const name = normalize_temperature_ranges(
    String(productObj.name || "").trim()
  );

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
    identifier,
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

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch (e) {
    const qIndex = url.indexOf("?");
    const hIndex = url.indexOf("#");
    if (qIndex !== -1 && hIndex !== -1) {
      return url.substring(0, Math.min(qIndex, hIndex));
    } else if (qIndex !== -1) {
      return url.substring(0, qIndex);
    } else if (hIndex !== -1) {
      return url.substring(0, hIndex);
    }
    return url;
  }
}

function normalize_temperature_ranges(text: string): string {
  // Format temperature ranges like "-20 to 300C", "- 20 to 300C", "20 to - 30C", etc. to "-20°C to 300°C"
  return text.replace(
    /([\-\u2212\u2013\u2014]\s*\d+|\d+)\s*(?:to|-)\s*([\-\u2212\u2013\u2014]\s*\d+|\d+)\s*°?[Cc]\b/g,
    (match, min_val, max_val) => {
      const clean_min = min_val.replace(/[\-\u2212\u2013\u2014]\s*/, "-");
      const clean_max = max_val.replace(/[\-\u2212\u2013\u2014]\s*/, "-");
      return `${clean_min}°C to ${clean_max}°C`;
    }
  );
}
