/**
 * Client-side Open Food Facts taxonomy resolver (ADR-0043 §4) — maps a cryptic
 * canonical `en:` tag (e.g. `en:peanuts`, `en:e330`) to a human display name
 * (`"Peanuts"`, `"E330 - Citric acid"`) via OFF's static, CORS-open taxonomy
 * JSON files, cached after first load.
 *
 * Kept OUT of the pure `deriveDietaryVerdict` / `deriveAllergenVerdict` selectors
 * (`off-signals.ts`) so those stay pure and synchronous: they return `en:` tags,
 * and this module resolves them for display. It **degrades gracefully** — an
 * unknown or not-yet-loaded tag falls back to a prettified form of the bare
 * slug, so a missing taxonomy (offline, non-2xx) never blanks a safety line
 * (research/95 §7).
 */

/** The three OFF tagtypes whose surfaced signals are cryptic `en:` tag lists. */
export type TaxonomyKind = "allergens" | "additives" | "labels";

// OFF's static per-tagtype taxonomy files (research/95 §7): a direct
// canonical-tag → localized-name map, small enough to fetch once and cache.
// CORS-open (same class as the `taxonomy_suggestions` category lookup).
const TAXONOMY_URLS: Record<TaxonomyKind, string> = {
  allergens: "https://static.openfoodfacts.org/data/taxonomies/allergens.json",
  additives: "https://static.openfoodfacts.org/data/taxonomies/additives.json",
  labels: "https://static.openfoodfacts.org/data/taxonomies/labels.json",
};

// One tag→English-name map per successfully-loaded tagtype. A kind is present in
// the cache ONLY after a successful load, so a failed/pending load transparently
// falls through to the prettified-slug fallback and can be retried later.
const cache = new Map<TaxonomyKind, Map<string, string>>();

// In-flight loads, deduped so concurrent `ensureTaxonomy` calls for one kind
// share a single fetch rather than stampeding the static host.
const inflight = new Map<TaxonomyKind, Promise<void>>();

// One OFF taxonomy entry: `{ name: { en: "Milk", fr: "Lait", … } }`. Only the
// English name is read; every field is defensively optional.
interface TaxonomyEntry {
  name?: Record<string, string>;
}

/**
 * Prettifies a bare OFF `en:` tag into a readable fallback name — strips the
 * `xx:` language prefix, turns separators into spaces, and capitalises the first
 * letter: `en:peanuts → "Peanuts"`, `en:no-gluten → "No gluten"`. The graceful
 * fallback used whenever the taxonomy can't resolve a tag, so a name is never
 * blank. Pure and synchronous.
 */
export function prettifyTag(tag: string): string {
  const slug = tag
    .replace(/^[a-z]{2}:/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!slug) return tag;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Loads and caches one tagtype's taxonomy from OFF's static JSON, if not already
 * cached. Deduped across concurrent callers. Degrades silently: a non-2xx or a
 * network/parse failure leaves the kind UNcached (so `resolveTag` falls back to
 * the prettified slug and a later call can retry) rather than throwing.
 */
export async function ensureTaxonomy(kind: TaxonomyKind): Promise<void> {
  if (cache.has(kind)) return;
  const existing = inflight.get(kind);
  if (existing) return existing;

  const load = (async () => {
    try {
      const res = await fetch(TAXONOMY_URLS[kind]);
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, TaxonomyEntry>;
      const names = new Map<string, string>();
      for (const [tag, entry] of Object.entries(data)) {
        const name = entry?.name?.en;
        if (typeof name === "string" && name.trim()) names.set(tag, name);
      }
      cache.set(kind, names);
    } catch {
      /* offline / unparseable — leave uncached, fall back to prettified slugs */
    } finally {
      inflight.delete(kind);
    }
  })();
  inflight.set(kind, load);
  return load;
}

/**
 * Resolves a canonical `en:` tag to its display name from the cached taxonomy —
 * PURE and synchronous. Returns the taxonomy's English name when the tagtype is
 * loaded and knows the tag, otherwise the {@link prettifyTag} fallback. A caller
 * that wants real names should `await ensureTaxonomy(kind)` first; until then
 * (or if it fails) this still returns a readable prettified slug.
 */
export function resolveTag(kind: TaxonomyKind, tag: string): string {
  return cache.get(kind)?.get(tag) ?? prettifyTag(tag);
}

/** Test-only cache reset so a suite can assert cold-start fallback behaviour. */
export function __resetTaxonomyCache(): void {
  cache.clear();
  inflight.clear();
}
