import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  prettifyTag,
  resolveTag,
  ensureTaxonomy,
  __resetTaxonomyCache,
} from "../../src/lib/food/off-taxonomy";

// The client-side OFF taxonomy resolver (ADR-0043 §4) maps a cryptic `en:` tag
// to a display name via OFF's static taxonomy JSON, cached after first load, and
// degrades gracefully to a prettified slug when the taxonomy is unreachable or
// not yet loaded — so a missing taxonomy never blanks a safety line.

describe("prettifyTag — the graceful fallback", () => {
  it("strips the en: prefix and capitalises (en:peanuts → Peanuts)", () => {
    expect(prettifyTag("en:peanuts")).toBe("Peanuts");
  });

  it("turns separators into spaces (en:no-gluten → No gluten)", () => {
    expect(prettifyTag("en:no-gluten")).toBe("No gluten");
    expect(prettifyTag("en:certified-b-corporation")).toBe(
      "Certified b corporation"
    );
  });

  it("strips any two-letter language prefix, not just en:", () => {
    expect(prettifyTag("fr:lait")).toBe("Lait");
  });

  it("handles a bare slug with no language prefix", () => {
    expect(prettifyTag("organic")).toBe("Organic");
  });
});

describe("resolveTag — cold cache falls back to prettified slug", () => {
  beforeEach(() => __resetTaxonomyCache());

  it("returns the prettified slug when the taxonomy is not loaded", () => {
    expect(resolveTag("allergens", "en:peanuts")).toBe("Peanuts");
    expect(resolveTag("labels", "en:no-gluten")).toBe("No gluten");
  });
});

describe("ensureTaxonomy — loads, caches, and resolves real names", () => {
  beforeEach(() => __resetTaxonomyCache());
  afterEach(() => vi.restoreAllMocks());

  it("resolves a loaded tag to its taxonomy English name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          "en:milk": { name: { en: "Milk", fr: "Lait" } },
          "en:peanuts": { name: { en: "Peanuts" } },
        }),
        { status: 200 }
      )
    );
    await ensureTaxonomy("allergens");
    expect(resolveTag("allergens", "en:milk")).toBe("Milk");
    // A tag missing from the loaded taxonomy still falls back gracefully.
    expect(resolveTag("allergens", "en:unicorn-dust")).toBe("Unicorn dust");
  });

  it("dedupes concurrent loads into a single fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ "en:vegan": { name: { en: "Vegan" } } }), {
        status: 200,
      })
    );
    await Promise.all([
      ensureTaxonomy("labels"),
      ensureTaxonomy("labels"),
      ensureTaxonomy("labels"),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(resolveTag("labels", "en:vegan")).toBe("Vegan");
  });

  it("degrades to prettified slugs on a non-2xx response (uncached, retryable)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 503 })
    );
    await ensureTaxonomy("additives");
    // Nothing cached → fallback; a later successful load can still populate it.
    expect(resolveTag("additives", "en:e330")).toBe("E330");
  });

  it("degrades to prettified slugs on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await ensureTaxonomy("allergens");
    expect(resolveTag("allergens", "en:milk")).toBe("Milk");
  });
});
