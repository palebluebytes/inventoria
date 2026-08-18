import type { EntityPayload } from "../ingestion/ingest";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance, type RawProvenance } from "./provenance";
import { getSecret } from "../stores/secrets";

// Mapper version, bumped when the OFF -> nutrition/info normalisation changes.
// OFF_BASE (the product endpoint) is defined below and reused for source_uri.
// v2: panel gains trans fat, cholesterol and unsaturated fat (mono + poly).
// v3: panel gains the twelve Nutrition-Facts micronutrients (ADR-0030), read
//     from the `*_100g` nutriments (OFF already reports these in grams).
// v4: emits food/category (categories), food/ingredients_text (ingredients_text),
//     twin/brand (brands) and the OFF-only food/assessment blob (ADR-0030 §4).
// v5: emits a single food/portions entry from serving_quantity/serving_size
//     when the product carries serving data (ADR-0030 §2/§5).
// v6: assessment gains OFF's NOVA evidence trail — nova_group_debug (the marker
//     trail behind the verdict) and the labelled nova_groups_tags — read back by
//     the NOVA badge's `deriveNovaVerdict` selector (ADR-0041 §7). Forward-only:
//     the tier itself already rides in `nova_group`, so older foods still rate.
// v7: assessment gains OFF's traces_tags (cross-contamination "may contain"),
//     read back by `deriveAllergenVerdict`'s May-contain line (ADR-0043 §6).
//     Forward-only: older foods simply lack that source; Contains/Free-from
//     still read from their already-captured allergens_tags/labels_tags.
const ADAPTER_VERSION = "7";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Open Food Facts reports every nutriment per 100 g already in the panel's
// fixed units (macros in grams, energy in kcal, sodium in grams), so the values
// map straight across with no conversion.
export interface OFFNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number;
  "saturated-fat_100g"?: number;
  "trans-fat_100g"?: number;
  cholesterol_100g?: number;
  "monounsaturated-fat_100g"?: number;
  "polyunsaturated-fat_100g"?: number;
  // Micronutrients — the twelve US Nutrition-Facts label vitamins and minerals
  // (ADR-0030). OFF reports each `*_100g` already in grams, so they map straight
  // across with no conversion. Folate is OFF's `vitamin-b9`.
  "vitamin-d_100g"?: number;
  calcium_100g?: number;
  iron_100g?: number;
  potassium_100g?: number;
  "vitamin-a_100g"?: number;
  "vitamin-c_100g"?: number;
  "vitamin-e_100g"?: number;
  "vitamin-b6_100g"?: number;
  "vitamin-b12_100g"?: number;
  "vitamin-b9_100g"?: number;
  magnesium_100g?: number;
  zinc_100g?: number;
}

/**
 * Open Food Facts' consumer-facing assessment signals, captured as one atomic
 * `food/assessment` blob (ADR-0030 §4). OFF-only — no schema.org counterpart.
 * Every sub-field is optional: the mapper carries across only what the product
 * reports, so a product with only a Nutri-Score yields `{ nutri_score }`.
 */
export interface FoodAssessment {
  nova_group?: number;
  /**
   * OFF's `nova_group_debug` — the human-readable trail of markers that drove the
   * NOVA verdict (e.g. which additive or ingredient forced group 4). The
   * evidence the explainer (#92) shows; the NOVA badge's `deriveNovaVerdict`
   * reads it into a verdict's `evidence.debug`. Forward-only (adapter v6): older
   * foods carry the tier without the trail (ADR-0041 §7).
   */
  nova_group_debug?: string;
  /**
   * OFF's labelled `nova_groups_tags` (e.g. `["4"]`, or `["unknown"]` when OFF
   * could not classify) — belt-and-braces alongside the numeric `nova_group` for
   * the known-vs-missing distinction (ADR-0041 §7). Forward-only (adapter v6).
   */
  nova_groups_tags?: string[];
  nutri_score?: string;
  eco_score?: string;
  nutrient_levels?: Record<string, string>;
  allergens?: string[];
  /**
   * OFF's `traces_tags` — cross-contamination "may contain" allergens, a list
   * DISTINCT from `allergens` (present ingredients). Read back by
   * `deriveAllergenVerdict`'s May-contain line (ADR-0043 §6). Forward-only
   * (adapter v7): captured only for foods looked up after the widening, so an
   * older food simply has no May-contain source. No selector depends on it.
   */
  traces?: string[];
  additives?: string[];
  labels?: string[];
}

export interface OFFProduct {
  code: string;
  /** v3 API uses string status: "success" | "failure" */
  status: "success" | "failure" | 0 | 1;
  product: {
    product_name?: string;
    /**
     * OFF's own data-quality score for the record (0–1). Surfaced read-through
     * by the mapper so the found-but-poor predicate can use it as a corroborator
     * for a short generic name (ADR-0034 §1); a record-level signal, not a
     * nutriment. Absent on sparse records.
     */
    completeness?: number;
    // OFF's own product photos (remote URLs on images.openfoodfacts.org). Read
    // through so the found-but-poor door can show them for comparison while the
    // user reads the label into the form (ADR-0034 §8 read-feature / #54); they
    // are NOT adopted as the user's captured photos. Each face is optional.
    image_front_url?: string;
    image_nutrition_url?: string;
    image_ingredients_url?: string;
    image_packaging_url?: string;
    nutriments?: OFFNutriments;
    // Serving data (ADR-0030 §2/§5). OFF normalises `serving_quantity` to grams;
    // `serving_size` is the human label ("15 g", "1 portion (37 g)"). Either can
    // be absent, in which case no food/portions entry is emitted.
    serving_quantity?: number | string;
    serving_size?: string;
    // Record-level source signals (ADR-0030 §4). All optional; a missing field
    // is omitted from the payload rather than emitted as empty/null.
    brands?: string;
    categories?: string;
    ingredients_text?: string;
    nova_group?: number;
    // OFF's NOVA evidence (adapter v6, ADR-0041 §7). `nova_group_debug` is the
    // marker trail behind the verdict; `nova_groups_tags` its labelled form
    // (`["4"]` / `["unknown"]`). Both optional — many products carry neither.
    nova_group_debug?: string;
    nova_groups_tags?: string[];
    nutriscore_grade?: string;
    ecoscore_grade?: string;
    nutrient_levels?: Record<string, string>;
    allergens_tags?: string[];
    // OFF's "may contain" / cross-contamination allergens (adapter v7,
    // ADR-0043 §6) — a field DISTINCT from `allergens_tags` (present allergens).
    traces_tags?: string[];
    additives_tags?: string[];
    labels_tags?: string[];
  };
}

/**
 * The mapper's return: a normal {@link EntityPayload} carrying OFF's
 * `completeness` as a READ-THROUGH sibling of `attributes` (ADR-0034 §1). It is
 * deliberately NOT an attribute — `ingestEntity` only flattens `attributes`, so
 * completeness never becomes a datom; it rides the return value purely so the
 * found-but-poor predicate can read it from the freshly-looked-up payload.
 */
export interface OffPayload extends EntityPayload {
  completeness?: number;
  /**
   * OFF's own product photos (front / nutrition / ingredients / packaging), as
   * remote URLs in that read-order. Surfaced read-through — never datoms — so the
   * found-but-poor door can show them for comparison; the user still captures
   * their own photos separately (ADR-0034 §7/§8).
   */
  referenceImages?: string[];
}

/**
 * Gathers OFF's product photo URLs in a natural label-read order (front first
 * for identity, then the nutrition panel that carries the values, then
 * ingredients and packaging), dropping the faces the product doesn't have.
 */
function offReferenceImages(p: OFFProduct["product"]): string[] {
  return [
    p.image_front_url,
    p.image_nutrition_url,
    p.image_ingredients_url,
    p.image_packaging_url,
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
}

/**
 * The same photo URLs, recovered from a SAVED twin rather than a live lookup.
 *
 * `referenceImages` is a read-through on the live {@link OffPayload} and never
 * becomes a datom, so a twin already in the ledger — a barcode scanned a second
 * time, or any logged food re-opened for editing — has no reference images to
 * hand. They are still there, though: the untouched OFF response is kept as
 * `twin/raw_provenance` precisely so nothing has to be re-fetched (ADR-0016).
 * This reads them back out, and returns empty for a twin from any other source.
 */
export function offReferenceImagesFromTwin(
  attributes: Record<string, unknown> | undefined
): string[] {
  const provenance = attributes?.["twin/raw_provenance"] as
    | RawProvenance<OFFProduct>
    | undefined;
  if (provenance?.adapter !== "off") return [];
  const product = provenance.raw_data?.product;
  return product ? offReferenceImages(product) : [];
}

export class ProductNotFoundError extends Error {
  constructor(barcode: string) {
    super(`Product not found for barcode: ${barcode}`);
    this.name = "ProductNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Builds a food's `food/portions` list from OFF's serving fields (ADR-0030 §5).
 * OFF offers exactly one serving, so the list is 0 or 1 long: a single portion
 * that resolves to `serving_quantity` grams, labelled by `serving_size` (falling
 * back to a generic "1 serving" when the label is absent). Returns an empty list
 * — never a zero-gram portion — when there is no usable serving weight, so the
 * caller omits the attribute rather than emitting an empty one.
 */
function offPortions(
  serving_quantity: number | string | undefined,
  serving_size: string | undefined
): Portion[] {
  const grams =
    typeof serving_quantity === "string"
      ? Number(serving_quantity)
      : serving_quantity;
  if (grams == null || !Number.isFinite(grams) || grams <= 0) return [];
  const label = serving_size?.trim() || "1 serving";
  return [{ label, amount: 1, unit: "serving", grams }];
}

/**
 * Maps an Open Food Facts product response to an EntityPayload ready for
 * ingestion into the EAVT ledger. Nutrition is emitted as a single atomic
 * `nutrition/info` panel (ADR-0021), populated with whatever subset of the
 * schema.org fields the product carries.
 */
export function mapOffProductToPayload(product: OFFProduct): OffPayload {
  const p = product.product;
  const n = p.nutriments ?? {};

  const nutrition: NutritionInfo = { serving_size: PER_100G };
  const set = (value: number | undefined, key: keyof NutritionInfo) => {
    if (value != null) (nutrition[key] as number) = value;
  };
  set(n["energy-kcal_100g"], "calories");
  set(n.proteins_100g, "protein_content");
  set(n.fat_100g, "fat_content");
  set(n.carbohydrates_100g, "carbohydrate_content");
  set(n.fiber_100g, "fiber_content");
  set(n.sugars_100g, "sugar_content");
  set(n.sodium_100g, "sodium_content");
  set(n["saturated-fat_100g"], "saturated_fat_content");
  set(n["trans-fat_100g"], "trans_fat_content");
  set(n.cholesterol_100g, "cholesterol_content");
  // schema.org unsaturatedFatContent = mono + poly. Sum whatever OFF carries.
  const mono = n["monounsaturated-fat_100g"];
  const poly = n["polyunsaturated-fat_100g"];
  if (mono != null || poly != null) {
    // Round to shed float noise from the addition.
    nutrition.unsaturated_fat_content =
      Math.round(((mono ?? 0) + (poly ?? 0)) * 1e6) / 1e6;
  }
  // Micronutrients (ADR-0030) — OFF reports each `*_100g` already in grams.
  set(n["vitamin-d_100g"], "vitamin_d");
  set(n.calcium_100g, "calcium");
  set(n.iron_100g, "iron");
  set(n.potassium_100g, "potassium");
  set(n["vitamin-a_100g"], "vitamin_a");
  set(n["vitamin-c_100g"], "vitamin_c");
  set(n["vitamin-e_100g"], "vitamin_e");
  set(n["vitamin-b6_100g"], "vitamin_b6");
  set(n["vitamin-b12_100g"], "vitamin_b12");
  set(n["vitamin-b9_100g"], "folate");
  set(n.magnesium_100g, "magnesium");
  set(n.zinc_100g, "zinc");

  const attributes: EntityPayload["attributes"] = {
    "food/name": p.product_name || "Unknown",
    "nutrition/info": nutrition,
  };
  // Record-level source signals (ADR-0030 §4). Each is emitted only when the
  // product carries it, so a missing field is omitted (never empty/null).
  if (p.brands) attributes["twin/brand"] = p.brands;
  if (p.categories) attributes["food/category"] = p.categories;
  if (p.ingredients_text)
    attributes["food/ingredients_text"] = p.ingredients_text;

  // The OFF-only consumer assessments, gathered into one atomic blob. Only the
  // sub-fields the product carries are included; an assessment with no populated
  // sub-field is dropped entirely rather than emitted empty.
  const assessment: FoodAssessment = {};
  if (p.nova_group != null) assessment.nova_group = p.nova_group;
  // NOVA evidence trail (adapter v6, ADR-0041 §7) — forward-only: captured only
  // for foods looked up after this change, so the tier reads even when absent.
  if (p.nova_group_debug) assessment.nova_group_debug = p.nova_group_debug;
  if (p.nova_groups_tags?.length)
    assessment.nova_groups_tags = p.nova_groups_tags;
  if (p.nutriscore_grade) assessment.nutri_score = p.nutriscore_grade;
  if (p.ecoscore_grade) assessment.eco_score = p.ecoscore_grade;
  if (p.nutrient_levels && Object.keys(p.nutrient_levels).length > 0)
    assessment.nutrient_levels = p.nutrient_levels;
  if (p.allergens_tags?.length) assessment.allergens = p.allergens_tags;
  // May-contain / cross-contamination allergens (adapter v7, ADR-0043 §6) —
  // forward-only: only foods captured after this change carry the source.
  if (p.traces_tags?.length) assessment.traces = p.traces_tags;
  if (p.additives_tags?.length) assessment.additives = p.additives_tags;
  if (p.labels_tags?.length) assessment.labels = p.labels_tags;
  if (Object.keys(assessment).length > 0)
    attributes["food/assessment"] = assessment;

  // Household portion (ADR-0030 §2/§5). OFF's single product response already
  // carries the serving, so no second network call: map serving_quantity (grams)
  // to one food/portions entry, labelled by serving_size when present. Omitted
  // entirely when the product reports no usable serving weight.
  const portions = offPortions(p.serving_quantity, p.serving_size);
  if (portions.length > 0) attributes[FOOD_PORTIONS_ATTR] = portions;

  return {
    entity: `gtin:${product.code}`,
    // Read-through (never a datom, see {@link OffPayload}): only OFF's numeric
    // completeness rides along, so the poor-quality predicate can corroborate a
    // short generic name without a network re-fetch.
    completeness:
      typeof p.completeness === "number" ? p.completeness : undefined,
    referenceImages: offReferenceImages(p),
    attributes: {
      ...attributes,
      // Keep the untouched OFF response as immutable Provenance so nutriments
      // beyond the eight panel fields can be backfilled later with no network
      // re-fetch (ADR-0016).
      "twin/raw_provenance": buildRawProvenance({
        adapter: "off",
        adapter_version: ADAPTER_VERSION,
        source_uri: `${OFF_BASE}/${product.code}.json`,
        raw_data: product,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const OFF_BASE = "https://world.openfoodfacts.org/api/v3/product";

/**
 * Fetches product data from the Open Food Facts API for a given barcode and
 * returns it as an EntityPayload.
 *
 * @throws ProductNotFoundError when the product is not in the OFF database.
 */
export async function lookupBarcode(barcode: string): Promise<OffPayload> {
  const res = await fetch(`${OFF_BASE}/${barcode}.json`);

  // v3 returns HTTP 404 for unknown barcodes (empty body), catch it first
  if (!res.ok) {
    throw new ProductNotFoundError(barcode);
  }

  const data: OFFProduct = await res.json();

  // v3 uses string "failure"; v2 used integer 0 — handle both
  if (data.status === "failure" || data.status === 0) {
    throw new ProductNotFoundError(barcode);
  }

  return mapOffProductToPayload(data);
}

// ---------------------------------------------------------------------------
// Category taxonomy (read) — #84
// ---------------------------------------------------------------------------

// OFF's live category-autocomplete over its canonical taxonomy. A browser-side
// GET against prod (reads always hit the org host, like `lookupBarcode`); no
// backend, consistent with ADR-0034 §8 / #54.
const OFF_SUGGEST =
  "https://world.openfoodfacts.org/api/v3/taxonomy_suggestions";

/**
 * Splits OFF's category value into distinct trimmed entries. Comma is OFF's
 * multi-value separator, so the language-neutral list OFF stores ("Peanut
 * butters, Nut butters") — and anything the form joins back with commas — round-
 * trips through one representation; empty pieces are dropped so a raw comma-
 * bearing string never yields a phantom blank category (§8, #84).
 */
export function parseCategoryList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Low-level taxonomy query for a typed prefix (English only, `lc=en`): the
 * suggestion strings on success (possibly an empty list), or `null` when OFF gave
 * no usable answer (offline, non-2xx, or unparseable). The `null` lets a caller
 * tell "the English taxonomy genuinely has no match" (a real `[]` — e.g. a Dutch
 * term) apart from "we couldn't ask", which the English-membership check needs.
 */
async function requestCategorySuggestions(
  prefix: string,
  limit = 8
): Promise<string[] | null> {
  const string = prefix.trim();
  if (!string) return [];
  try {
    const url = `${OFF_SUGGEST}?tagtype=categories&string=${encodeURIComponent(
      string
    )}&lc=en&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { suggestions?: unknown };
    return Array.isArray(data.suggestions)
      ? data.suggestions.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return null;
  }
}

/**
 * Fetches canonical English category suggestions from OFF's taxonomy for a typed
 * prefix (#84), so the capture form offers discrete taxonomy entries ("Peanut
 * butters") to pick instead of free text — OFF canonicalizes them to `en:` ids on
 * write. English-only for now (`lc=en`). Any empty prefix short-circuits to `[]`
 * with no request; any network/parse failure degrades to `[]` so the field
 * silently falls back to free entry offline.
 */
export async function fetchCategorySuggestions(
  prefix: string,
  limit = 8
): Promise<string[]> {
  return (await requestCategorySuggestions(prefix, limit)) ?? [];
}

/**
 * Whether a category is an English taxonomy entry (#84) — used to hide non-
 * English seeds (a foreign product's own `food/category`, e.g. Dutch
 * "Pindakazen") from the English-only picker. `true`/`false` when OFF answered,
 * or `null` when it couldn't be reached — so the caller keeps an undetermined
 * category rather than erasing data it can't verify offline. Match is exact and
 * case-insensitive against the `lc=en` suggestions for the term.
 */
export async function isEnglishCategory(
  category: string
): Promise<boolean | null> {
  const c = category.trim();
  if (!c) return false;
  const res = await requestCategorySuggestions(c, 12);
  if (res === null) return null;
  return res.some((s) => s.toLowerCase() === c.toLowerCase());
}

// ---------------------------------------------------------------------------
// Contribution (write) — ADR-0034 §8, grounded in research/50
// ---------------------------------------------------------------------------
//
// The seam that gives a corrected barcoded twin back to Open Food Facts. It is a
// DIRECT browser POST — a live CORS spike (#54) proved OFF returns
// `Access-Control-Allow-Origin: *` and preflight-allows POST on staging AND prod,
// so the write both lands and is readable with NO backend. Kept swappable (a
// later variant could route via a relay) but the body IS the direct POST.
//
// The v3 JSON PATCH API is deliberately NOT used: it still can't carry nutriments
// (re-verified, #50). The legacy `POST /cgi/product_jqm2.pl` urlencoded upsert
// carries the whole panel, so that is the target.

/**
 * The write host, env-driven (ADR-0034 §8): the anti-indexing STAGING host in dev
 * so a manual test never mutates prod, production in a build. `VITE_OFF_WRITE_HOST`
 * overrides both. Trailing slashes are trimmed so the `/cgi/...` join is clean.
 */
export function offWriteHost(): string {
  const env = import.meta.env ?? {};
  const configured = (env.VITE_OFF_WRITE_HOST as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return env.DEV
    ? "https://world.openfoodfacts.net"
    : "https://world.openfoodfacts.org";
}

// OFF requires a User-Agent `AppName/Version (contact)`; a browser can't always
// set that header, so OFF lets it ride as the `user_agent` body param instead
// (#50). `app_name` attributes the edit so OFF moderators can trace/revert it.
const OFF_USER_AGENT = "Inventoria/0.1 (thomas@palebluebytes.space)";
const OFF_APP_NAME = "Inventoria";

// NutritionInfo panel key → OFF nutrient-taxonomy id — the exact mirror of the
// read mapper's `*_100g` fields (#50 mapping note). Energy is kcal; every mass
// field is grams (our panel's invariant unit). `unsaturated_fat_content` has no
// single OFF id (OFF splits mono/poly), so a summed value can't be cleanly
// reversed — it is deliberately NOT contributed rather than mis-attributed.
const NUTRIMENT_IDS: [keyof NutritionInfo, string][] = [
  ["calories", "energy-kcal"],
  ["protein_content", "proteins"],
  ["fat_content", "fat"],
  ["carbohydrate_content", "carbohydrates"],
  ["fiber_content", "fiber"],
  ["sugar_content", "sugars"],
  ["sodium_content", "sodium"],
  ["saturated_fat_content", "saturated-fat"],
  ["trans_fat_content", "trans-fat"],
  ["cholesterol_content", "cholesterol"],
  ["vitamin_d", "vitamin-d"],
  ["calcium", "calcium"],
  ["iron", "iron"],
  ["potassium", "potassium"],
  ["vitamin_a", "vitamin-a"],
  ["vitamin_c", "vitamin-c"],
  ["vitamin_e", "vitamin-e"],
  ["vitamin_b6", "vitamin-b6"],
  ["vitamin_b12", "vitamin-b12"],
  ["folate", "vitamin-b9"],
  ["magnesium", "magnesium"],
  ["zinc", "zinc"],
];

/** The structured data a contribution carries — name / brand / the full panel. */
export interface OffContribution {
  /** schema.org name — posted as `product_name` (replace, §8). */
  name: string;
  /** Brand — posted as `add_brands` so it appends, never clobbers (§8/#50). */
  brand?: string;
  /**
   * Category — OFF's language-neutral "what this is" (e.g. `en:peanut-butters`),
   * the identity a `product_name` can't carry across languages. Posted as
   * `add_categories` so it APPENDS (§8), mirroring `add_brands`. Comma is OFF's
   * multi-value separator, so a comma-bearing value (OFF's own `food/category` is
   * a comma list) is split-and-trimmed into distinct values, never posted raw;
   * OFF re-canonicalizes on write, so free text in the label's language is fine.
   */
  category?: string;
  /**
   * The corrected ingredients transcription (ADR-0043 §5) — posted as a BARE
   * `ingredients_text` param, which REPLACES OFF's parsed value (like `product_name`,
   * NOT `add_`), and is SUPPRESSED-WHEN-EMPTY so an untouched field never wipes OFF's
   * data. The bare (main-language) slot is round-tripped from the same read — never
   * `ingredients_text_en`, which would mislabel a non-English label as English.
   * Deferred (not built): OFF's `lc` label-language param, and `serving_quantity`
   * grams on write (§ Known gaps) — the write still sends only `serving_size`.
   */
  ingredientsText?: string;
  /**
   * The confirmed panel: grams (kcal for energy), `serving_size` its basis. Only
   * the keys the user actually supplied are present — an absent key is simply not
   * posted (absent ≠ 0), so a partial panel never writes phantom zeroes to OFF.
   */
  nutrition: NutritionInfo;
}

/**
 * A readable, defensively-parsed outcome of one contribution attempt (§8). The
 * write is online-only with manual retry, so every failure carries a message the
 * UI shows verbatim beside a persistent retry button.
 */
export type OffSubmitResult =
  | { ok: true; kind: "success"; message: string }
  | {
      ok: false;
      kind: "auth" | "data-quality" | "network" | "config";
      message: string;
    };

/**
 * Builds the urlencoded body for `product_jqm2.pl` from a contribution (§8).
 * PURE and side-effect-free (creds passed in, no `getSecret`, no clock), so the
 * mapping is asserted directly in tests without a network. Structured data ONLY —
 * no photo (deferred past v1). Barcode-keyed upsert: `code` both creates and edits.
 */
export function buildOffWriteBody(
  barcode: string,
  contribution: OffContribution,
  creds: { user_id: string; password: string }
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("code", barcode);
  // Auth as body params — cookie auth is impossible under `ACAO:*`, and anonymous
  // writes 403 (#50). These are the USER's own OFF creds, never a shipped secret.
  body.set("user_id", creds.user_id);
  body.set("password", creds.password);
  body.set("user_agent", OFF_USER_AGENT);
  body.set("app_name", OFF_APP_NAME);

  const n = contribution.nutrition;
  const name = contribution.name.trim();
  // `product_name` REPLACES (§8) — a corrected name should supersede a blank or
  // generic OFF one, which is the whole point of the found-but-poor fix.
  if (name) body.set("product_name", name);
  // Tags APPEND via the `add_` prefix (§8/#50) so enriching a poor product keeps
  // its existing brands rather than overwriting the list.
  const brand = contribution.brand?.trim();
  if (brand) body.set("add_brands", brand);
  // Categories APPEND via `add_` too (§8), carrying OFF's language-neutral identity
  // the name can't ("this is peanut butter" = en:peanut-butters). Comma is OFF's
  // multi-value separator, so split-and-trim into distinct values rather than
  // posting a raw comma-bearing string blind; OFF canonicalizes the result.
  const category = parseCategoryList(contribution.category).join(", ");
  if (category) body.set("add_categories", category);
  // Ingredients REPLACE via the BARE param (ADR-0043 §5) — a corrected transcription
  // supersedes OFF's parsed value, like `product_name`. Suppress-when-empty: an
  // untouched/blank field never posts, so it can't wipe OFF's existing ingredients.
  // Deliberately the bare main-language slot, NEVER `ingredients_text_en` (that would
  // mislabel a non-English label as English); the `lc` label-language edge is deferred.
  const ingredientsText = contribution.ingredientsText?.trim();
  if (ingredientsText) body.set("ingredients_text", ingredientsText);

  // `nutrition_data_per` is GLOBAL to the whole panel (#50): send the full set on
  // one basis. Our panel stamps `100 g` for the per-100 g case, else a serving
  // string, which maps to OFF's `serving` basis with the human `serving_size`.
  const per100 = n.serving_size === PER_100G;
  body.set("nutrition_data_per", per100 ? "100g" : "serving");
  if (!per100 && n.serving_size) body.set("serving_size", n.serving_size);

  for (const [key, id] of NUTRIMENT_IDS) {
    const value = n[key];
    if (typeof value !== "number") continue;
    body.set(`nutriment_${id}`, String(value));
    // Grams for every mass field, kcal for energy — our stored units.
    body.set(`nutriment_${id}_unit`, id === "energy-kcal" ? "kcal" : "g");
  }
  return body;
}

/**
 * Interprets OFF's write response DEFENSIVELY (§8): a 403 for bad creds comes
 * back as an HTML page, not JSON, so a naive `res.json()` would crash on the most
 * common failure. Read the body as text, try to parse it, and map:
 *   • JSON `status: 1` → success;
 *   • JSON `status: 0` → a data-quality rejection (surface OFF's own verbose);
 *   • non-JSON / non-OK under 500 → an auth failure (the HTML 403 case);
 *   • 5xx → a transient network/server outcome to retry.
 */
async function interpretOffWriteResponse(
  res: Response
): Promise<OffSubmitResult> {
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML or otherwise non-JSON body — handled below, never thrown */
  }

  if (json == null || typeof json !== "object") {
    // The canonical bad-creds path: a 401/403 comes back as an HTML page (§8).
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        kind: "auth",
        message:
          "Open Food Facts rejected the login. Check your username and password in Settings.",
      };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        kind: "network",
        message:
          "Open Food Facts is having trouble right now. Try contributing again shortly.",
      };
    }
    // Any other non-JSON body (rare — the endpoint normally returns JSON): a
    // readable generic outcome rather than a misleading "check your password".
    return {
      ok: false,
      kind: "network",
      message:
        "Open Food Facts returned an unexpected response. Please try again.",
    };
  }

  const record = json as { status?: unknown; status_verbose?: unknown };
  if (record.status === 1 || record.status === "success") {
    return {
      ok: true,
      kind: "success",
      message: "Contributed to Open Food Facts. Thank you!",
    };
  }
  // A rejected write (e.g. "Sugars higher than carbohydrates") — surface OFF's
  // own explanation so the user can fix the values and retry.
  const verbose =
    typeof record.status_verbose === "string" && record.status_verbose.trim()
      ? record.status_verbose
      : "Open Food Facts couldn’t accept this data. Check the values and retry.";
  return { ok: false, kind: "data-quality", message: verbose };
}

/**
 * Contributes a corrected barcoded twin back to Open Food Facts (ADR-0034 §8).
 *
 * Reads the user's own OFF login from `localStorage` (#60) and posts the
 * structured panel via {@link buildOffWriteBody} to the legacy upsert endpoint.
 * The CALLER gates the offer (a `gtin:` twin + a login + per-capture consent, §8);
 * this seam guards defensively too — a missing barcode or login returns a `config`
 * outcome rather than a doomed POST. Online-only: a fetch failure is a `network`
 * outcome, and the response is mapped without ever blind-calling `res.json()`.
 */
export async function submitToOpenFoodFacts(
  barcode: string,
  contribution: OffContribution
): Promise<OffSubmitResult> {
  const code = barcode.trim();
  if (!code) {
    return {
      ok: false,
      kind: "config",
      message: "No barcode to contribute under.",
    };
  }
  const user_id = getSecret("off_user_id").trim();
  const password = getSecret("off_password");
  if (!user_id || !password) {
    return {
      ok: false,
      kind: "config",
      message: "Add your Open Food Facts login in Settings to contribute.",
    };
  }

  const body = buildOffWriteBody(code, contribution, { user_id, password });

  let res: Response;
  try {
    res = await fetch(`${offWriteHost()}/cgi/product_jqm2.pl`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return {
      ok: false,
      kind: "network",
      message:
        "Couldn’t reach Open Food Facts. Check your connection and try again.",
    };
  }

  return interpretOffWriteResponse(res);
}
