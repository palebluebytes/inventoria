import { describe, it, expect, vi, afterEach } from "vitest";
import { extractJsonLd } from "../../src/lib/ingestion/json-ld";
import { fetchHtml } from "../../src/lib/ingestion/fetcher";

describe("extractJsonLd - Mock tests", () => {
  // ADR-0086 §3. The scraper used to pick its entity prefix from whatever the
  // page happened to carry, which is how `gtin:` came to be co-owned with food
  // and `isbn:` with media. It mints `twin:` now, whatever the page says.
  it("mints twin: and nothing else, whatever identifier the page carries", () => {
    const page = (body: string) =>
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"X",${body}}</script>`;
    const pages = [
      page('"@id":"did:dpp:eu:1"'),
      page('"@id":"gs1:01/1"'),
      page('"gtin13":"1234567890123"'),
      page('"isbn":"9780201379624"'),
      page('"sku":"S-1"'),
      page('"mpn":"M-1"'),
      page('"name":"no ids"'),
    ];
    for (const html of pages) {
      const product = extractJsonLd(html, "https://shop.example/p/1");
      expect(product!.entityId.startsWith("twin:")).toBe(true);
    }
    // And with no page URL either, which is the one non-deterministic case.
    expect(extractJsonLd(page('"name":"x"'))!.entityId).toMatch(/^twin:temp_/);
  });

  // ADR-0014's whole decision: two offline devices scraping the same page must
  // independently construct the same id. "Always mint twin:" would have repealed
  // it, because the only twin: site in the app carries a clock/random suffix.
  it("stays deterministic for every identifier it can read", () => {
    const cases: [string, string][] = [
      ['"gtin13":"1234567890123"', "twin:gtin_1234567890123"],
      ['"isbn":"9780201379624"', "twin:isbn_9780201379624"],
      ['"sku":"S-1"', "twin:sku_S-1"],
      ['"@id":"did:dpp:eu:1"', "twin:dpp_did:dpp:eu:1"],
    ];
    for (const [body, expected] of cases) {
      const html = `<script type="application/ld+json">{"@type":"Product","name":"X",${body}}</script>`;
      expect(extractJsonLd(html, "https://a.example/x")!.entityId).toBe(
        expected
      );
      // A different URL, the same product: still the same entity.
      expect(extractJsonLd(html, "https://b.example/y")!.entityId).toBe(
        expected
      );
    }
  });

  // A scraped grocery page and a scanned barcode are now two entities, and a
  // scraped book and its Open Library twin are two as well (ADR-0086 §4). The
  // point of the split is that neither can reach the other's prefix.
  it("cannot mint a food or a media entity from a barcode or an ISBN", () => {
    const barcoded = `<script type="application/ld+json">{"@type":"Product","name":"Tinned Tomatoes","gtin13":"3017620422003"}</script>`;
    const book = `<script type="application/ld+json">{"@type":"Product","name":"Design Patterns","isbn":"9780201379624"}</script>`;
    for (const html of [barcoded, book]) {
      const id = extractJsonLd(html, "https://shop.example/p")!.entityId;
      expect(id.startsWith("gtin:")).toBe(false);
      expect(id.startsWith("isbn:")).toBe(false);
    }
  });

  it("extracts a product with a DID", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "@id": "did:dpp:eu:123456789",
              "name": "Sustainable T-Shirt",
              "image": "https://example.com/shirt.jpg",
              "description": "Made from organic cotton.",
              "brand": {
                "@type": "Brand",
                "name": "EcoBrand"
              }
            }
          </script>
        </head>
      </html>
    `;

    const product = extractJsonLd(html);
    expect(product).not.toBeNull();
    expect(product!.entityId).toBe("twin:dpp_did:dpp:eu:123456789");
    expect(product!.identifier).toEqual({
      kind: "dpp",
      value: "did:dpp:eu:123456789",
    });
    expect(product!.name).toBe("Sustainable T-Shirt");
    expect(product!.image).toBe("https://example.com/shirt.jpg");
    expect(product!.brand).toBe("EcoBrand");
    expect(product!.description).toBe("Made from organic cotton.");
  });

  it("extracts a product with a GS1 Digital Link", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": "gs1:01/09780201379624/21/123",
          "name": "Design Patterns Book",
          "image": ["https://example.com/cover.jpg"]
        }
      </script>
    `;

    const product = extractJsonLd(html);
    expect(product).not.toBeNull();
    expect(product!.entityId).toBe("twin:dpp_gs1:01/09780201379624/21/123");
    expect(product!.name).toBe("Design Patterns Book");
    expect(product!.image).toBe("https://example.com/cover.jpg");
  });

  it("prioritizes GTIN over SKU/MPN", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Test Item",
          "gtin13": "1234567890123",
          "sku": "SKU-999"
        }
      </script>
    `;

    const product = extractJsonLd(html);
    expect(product).not.toBeNull();
    expect(product!.entityId).toBe("twin:gtin_1234567890123");
    expect(product!.identifier).toEqual({
      kind: "gtin",
      value: "1234567890123",
    });
  });

  it("uses SKU if GTIN is missing", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Test Item",
          "sku": "SKU-999"
        }
      </script>
    `;

    const product = extractJsonLd(html);
    expect(product).not.toBeNull();
    expect(product!.entityId).toBe("twin:sku_SKU-999");
  });

  it("uses URL fallback if all identifiers are missing", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "No Identifiers Product"
        }
      </script>
    `;

    const product = extractJsonLd(html, "https://my-store.com/products/no-ids");
    expect(product).not.toBeNull();
    expect(product!.entityId).toMatch(/^twin:url_/);
    expect(product!.identifier).toBeUndefined();
  });

  it("handles @graph arrays in JSON-LD", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "name": "Store Front"
            },
            {
              "@type": "Product",
              "name": "Graph Product",
              "sku": "GRAPH-123"
            }
          ]
        }
      </script>
    `;

    const product = extractJsonLd(html);
    expect(product).not.toBeNull();
    expect(product!.name).toBe("Graph Product");
    expect(product!.entityId).toBe("twin:sku_GRAPH-123");
  });

  it("falls back to Open Graph/Meta tags if no JSON-LD is present", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Open Graph Product" />
          <meta property="og:image" content="https://example.com/og-image.jpg" />
          <meta name="description" content="Open Graph Description" />
          <meta property="og:site_name" content="OG Brand" />
        </head>
      </html>
    `;

    const product = extractJsonLd(html, "https://example.com/products/og");
    expect(product).not.toBeNull();
    expect(product!.name).toBe("Open Graph Product");
    expect(product!.image).toBe("https://example.com/og-image.jpg");
    expect(product!.description).toBe("Open Graph Description");
    expect(product!.brand).toBe("OG Brand");
    expect(product!.entityId).toBe("twin:url_92z9lq");
  });

  it("extracts Amazon-specific landing image and title fallback", () => {
    const html = `
      <html>
        <head>
          <title>Amazon Product &amp; Stuff</title>
          <meta name="description" content="Product Description" />
        </head>
        <body>
          <img id="landingImage" src="https://m.media-amazon.com/images/I/image_low.jpg" data-old-hires="https://m.media-amazon.com/images/I/image_high.jpg" />
        </body>
      </html>
    `;

    const product = extractJsonLd(html, "https://amazon.es/dp/B0GY7PR6NK");
    expect(product).not.toBeNull();
    expect(product!.name).toBe("Amazon Product & Stuff");
    expect(product!.image).toBe(
      "https://m.media-amazon.com/images/I/image_high.jpg"
    );
    expect(product!.description).toBe("Product Description");
    expect(product!.entityId).toBe("twin:asin_B0GY7PR6NK");
  });

  it("extracts ASINs from different Amazon URL formats", () => {
    const html = `<html><head><title>Test Product</title></head></html>`;

    const formats = [
      "https://www.amazon.es/-/en/Meet-Beauty-Magnetic-Mosquito-Mosquitoes/dp/B0GY7PR6NK?th=1",
      "https://www.amazon.com/dp/B0GY7PR6NK",
      "https://www.amazon.co.uk/gp/product/B0GY7PR6NK",
      "https://amazon.de/gp/aw/d/B0GY7PR6NK",
    ];

    for (const url of formats) {
      const product = extractJsonLd(html, url);
      expect(product).not.toBeNull();
      expect(product!.entityId).toBe("twin:asin_B0GY7PR6NK");
    }
  });

  it("normalizes standard URLs by stripping query parameters and hashes before hashing", () => {
    const html = `<html><head><title>Test Product</title></head></html>`;

    const urlClean = "https://blenheimforge.co.uk/product/santoku/";
    const urlWithParams =
      "https://blenheimforge.co.uk/product/santoku/?utm_source=ref&discount=10#specifications";

    const productClean = extractJsonLd(html, urlClean);
    const productParams = extractJsonLd(html, urlWithParams);

    expect(productClean).not.toBeNull();
    expect(productParams).not.toBeNull();

    // They must have the exact same entityId since the query parameters and hashes are stripped before generating simpleHash
    expect(productClean!.entityId).toBe(productParams!.entityId);
    expect(productClean!.entityId).not.toContain("?");
    expect(productClean!.entityId).not.toContain("#");
  });

  it("normalizes minus signs and temperature ranges in the product name", () => {
    const html1 = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "RAPT - Bluetooth Thermometer -20 to 300C - 20cm HTC Probe"
        }
      </script>
    `;
    const product1 = extractJsonLd(html1);
    expect(product1).not.toBeNull();
    expect(product1!.name).toBe(
      "RAPT - Bluetooth Thermometer -20°C to 300°C - 20cm HTC Probe"
    );

    const html2 = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Bluetooth Thermometer - 20 to 300C"
        }
      </script>
    `;
    const product2 = extractJsonLd(html2);
    expect(product2).not.toBeNull();
    expect(product2!.name).toBe("Bluetooth Thermometer -20°C to 300°C");
  });
});

describe("fetchHtml + extractJsonLd integration (mocked network)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches HTML and extracts product details without a real network call", async () => {
    const url = "https://shop.example.com/p/quinby-chair-mustard";
    const cannedHtml = `<html><head><script type="application/ld+json">${JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": "did:example:quinby-chair",
        name: "Quinby Chair Mustard",
        offers: {
          "@type": "Offer",
          price: "199.00",
          priceCurrency: "EUR",
        },
      }
    )}</script></head><body><h1>Quinby Chair</h1></body></html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => cannedHtml,
    } as Response);

    const html = await fetchHtml(url);
    const product = extractJsonLd(html, url);

    expect(product).not.toBeNull();
    expect(product!.name).toBe("Quinby Chair Mustard");
    expect(product!.entityId).toBeTruthy();
  });
});
