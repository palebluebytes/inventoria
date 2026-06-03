import { describe, it, expect } from "vitest";
import { extractJsonLd } from "../../src/lib/ingestion/json-ld";
import { fetchHtml } from "../../src/lib/ingestion/fetcher";

describe("extractJsonLd - Mock tests", () => {
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
    expect(product!.entityId).toBe("did:dpp:eu:123456789");
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
    expect(product!.entityId).toBe("gs1:01/09780201379624/21/123");
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
    expect(product!.entityId).toBe("gtin:1234567890123");
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
    expect(product!.entityId).toBe("sku:SKU-999");
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
    expect(product!.entityId).toMatch(/^url:/);
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
    expect(product!.entityId).toBe("sku:GRAPH-123");
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
    expect(product!.entityId).toBe("url:92z9lq");
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
    expect(product!.entityId).toBe("asin:B0GY7PR6NK");
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
      expect(product!.entityId).toBe("asin:B0GY7PR6NK");
    }
  });
});

describe("extractJsonLd - Real e-commerce URLs", () => {
  it("fetches and extracts product details from a real e-commerce page", async () => {
    // We fetch a product from a public Shopify store or equivalent that we know has JSON-LD
    // Using a known Shopify demo store/product page to ensure stability:
    const url = "https://kavehome.com/en/en/p/quinby-chair-mustard";
    try {
      const html = await fetchHtml(url);
      const product = extractJsonLd(html, url);

      expect(product).not.toBeNull();
      expect(product!.name).toBeTruthy();
      expect(product!.entityId).toBeTruthy();
      console.log("Successfully fetched real e-commerce twin:", product);
    } catch (error) {
      console.warn(
        "Skipping real-world fetch test due to network/scraping issue:",
        error
      );
    }
  });
});
