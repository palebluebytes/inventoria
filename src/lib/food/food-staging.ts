import type { FoodResult } from "./food-search";
import type { NutritionInfo, Portion } from "./nutrition";
import type { EntityPayload } from "../ingestion/ingest";
import type { LabelCapture, ManualEntry, ManualEntryKind } from "./provenance";

/**
 * The full-panel capture seed the four label-capture doors (ADR-0034 §1/§6) hand
 * the stager beyond the four-macro fast path. Every field is optional and purely
 * additive over the plain custom choice — a hand-typed entry sets none of them,
 * so the existing hosts and the fast path are untouched; the missing/poor/unread
 * doors populate what the label and OFF gave them, keyed by whether a barcode
 * reached the form. Consumed by #57 (the form) and #59 (the triggers).
 */
export interface LabelCaptureSeed {
  /** Brand as read from the label / OFF, when known. */
  brand?: string;
  /**
   * Category as read from OFF (`food/category`, a comma-separated taxonomy list)
   * or typed on the form — OFF's language-neutral "what this is". Carried so a
   * found-but-poor enrichment forwards the category it already has, and so an OFF
   * contribution can `add_categories` it (ADR-0034 §8, #84).
   */
  category?: string;
  /**
   * Canonical OFF ingredients (`food/ingredients_text`) as read from OFF/the twin
   * or corrected on the form — true read-along (ADR-0043 §5). Carried so a
   * found-but-poor enrichment forwards the ingredients it already has, and so an
   * OFF contribution can send them back (bare `ingredients_text`, REPLACE). NB the
   * canonical OFF text, NOT `food/ingredients` (the menu-descriptor, ADR-0035).
   */
  ingredientsText?: string;
  /**
   * The panel-so-far: a partial {@link NutritionInfo} the doors prefill (an OFF
   * partial payload, or empty for guided-manual). Absent keys mean "not on the
   * label", never 0 — the same absent-not-zero discipline the panel keeps.
   */
  nutrition?: Partial<NutritionInfo>;
  /** Household portions carried from a partial OFF payload, when present. */
  portions?: Portion[];
  /** The captured label photos (base64), first = display; empty for no photo. */
  labelPhotos?: string[];
  /**
   * The barcode that reached this form, when one did — it decides where the twin
   * is keyed on save (`gtin:<code>` enrich vs `food:custom_` mint, §6).
   */
  barcode?: string;
  /** The partial OFF payload staged by the found-but-poor door, for review. */
  offPayload?: EntityPayload;
  /** OFF's own `completeness` (0–1), surfaced by the found-but-poor door (§1). */
  completeness?: number;
}

/**
 * Shared contract between the food-staging component (`FoodStager`) and its
 * hosts — the direct-log sheet and the add-ingredient sheet. The stager owns the
 * Search / Scan / Custom flow, the staged result + amount, and the custom form;
 * it hands the resolved choice back through {@link FoodChoice}, and the host maps
 * it to its own action (log a Consumption Event, or add a recipe ingredient)
 * without the stager knowing which.
 */

/**
 * What the stager emits when the user commits: either a searched/scanned food at
 * a gram amount, or a hand-entered custom food with its per-serving macros (and
 * an optional photo, when the host allows it).
 */
export type FoodChoice =
  | { kind: "food"; food: FoodResult; grams: number }
  | ({
      kind: "custom";
      name: string;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
      photo_base64: string | null;
      /**
       * The user-origin provenance envelope for a full-panel label capture (#57),
       * built by the Custom form ({@link buildLabelCapture}) and set alongside the
       * full {@link LabelCaptureSeed.nutrition} panel. Present whenever the form
       * committed a panel; absent for the legacy four-macro-only choice, so a host
       * routes `nutrition`-bearing choices through `saveLabelFood` and the rest
       * through `saveCustomFood`.
       */
      labelCapture?: LabelCapture;
      /**
       * The manual-entry provenance envelope for one of the Custom chooser's three
       * intents — quick estimate, from a menu, from a plate photo (ADR-0035). Its
       * PRESENCE is what routes a host to the manual-entry writer (`saveManualFood`)
       * instead of `saveLabelFood` / `saveCustomFood`, and its `kind` decides
       * reusability; absent for the label-capture and legacy fast paths. These
       * intents are calories-only (no macros), so `protein`/`fat`/`carbs` above are
       * 0 and the host logs the event with calories frozen and macros OMITTED
       * (absent ≠ 0, ADR-0035 §7).
       */
      manualEntry?: ManualEntry;
      /**
       * The menu dish's free-text ingredients (ADR-0035 §4) — descriptive only,
       * stored as `food/ingredients`; it NEVER computes calories. Present only for
       * the `menu` / `plate_estimate` intents when the user typed any.
       */
      ingredients?: string;
      /**
       * The existing twin's entity id when this commit is an EDIT of an already-saved
       * label capture (the staged card's origin badge re-opens the form, §7). Present,
       * the host enriches THAT entity in place so the correction supersedes rather than
       * minting a duplicate — for a `food:custom_` twin as much as a `gtin:` one. Absent
       * on a fresh capture, where the barcode (or its lack) keys the save as before.
       */
      editEntityId?: string;
    } & LabelCaptureSeed);

/**
 * The host's verdict on a committed {@link FoodChoice}. `ok` lets the host close
 * or unmount the sheet its own way; otherwise `message` is the reason the commit
 * was refused, which the stager surfaces while staying open (e.g. an
 * incompatible-unit re-add, issue #14).
 */
export type ChooseOutcome = { ok: boolean; message?: string };

/**
 * The one-time pre-population an edited manual-entry log hands the stager (ADR-0035
 * edit path): the intent `kind` and the fields the mini-form owns, read back off
 * the food twin (`food/name`, `nutrition/info.calories`, `twin/brand`,
 * `food/ingredients`, the photo). Re-opening the intent's OWN mini-form — not the
 * label form — is what keeps the re-saved twin a manual entry (so a menu dish
 * stays in Recent), rather than degrading it to a label capture.
 */
export interface ManualEntrySeed {
  /** Which intent minted the edited twin — decides which mini-form re-opens. */
  manualKind: ManualEntryKind;
  /** The dish/food name. */
  name: string;
  /** Calories as a string (the mini-form's field type). */
  calories: string;
  /** Menu "Place" (`twin/brand`); empty for quick/plate. */
  place: string;
  /** Free-text ingredients (`food/ingredients`); empty when none. */
  ingredients: string;
  /** The captured photo (base64), or null. */
  photo_base64: string | null;
}

/**
 * A one-time pre-population of the stager, used by the direct-log sheet's edit
 * mode: a gram-logged food re-stages on its twin (so the amount editor scales it
 * the same way), a manual-entry log re-opens its intent's mini-form pre-filled
 * ({@link ManualEntrySeed}), and any other per-serving custom entry re-opens the
 * label form pre-filled. Applied once when it first becomes non-null (the food
 * and manual cases may resolve asynchronously, after the twin is fetched).
 */
export type StagerSeed =
  | { kind: "food"; food: FoodResult; grams: number }
  /**
   * Edit a food's own twin in the label form (ADR-0034 §7). The whole twin
   * rides along because a logged event freezes only the four headline macros:
   * seeding an edit from the event would drop the brand, the rest of the panel,
   * the portions, the photos — and the entity, so the re-save would mint a
   * duplicate twin instead of enriching this one.
   */
  | { kind: "edit_twin"; entity: string; attributes: Record<string, unknown> }
  | ({ kind: "manual" } & ManualEntrySeed)
  | ({
      kind: "custom";
      name: string;
      calories: string;
      protein: string;
      fat: string;
      carbs: string;
      photo_base64: string | null;
    } & LabelCaptureSeed);

/**
 * The live staging context a host reads to build the primary button's label —
 * the wording differs per host ("Log 134 kcal" vs "Add 341 kcal" vs "Save
 * changes"), but the inputs it derives from are the same on both surfaces.
 */
export interface PrimaryLabelContext {
  method: string;
  staged: FoodResult | null;
  factor: number;
  /**
   * On the Custom full-panel form, how many AI-prefilled rows are still
   * unverified (ADR-0034 §4). Zero on the guided-manual v1 path and every
   * non-custom method; a deferred AI-confirm result makes it positive, so a host
   * flips its primary CTA to "Review & save" — the label lives host-side, so the
   * form needs no change when the model call arrives.
   */
  toReview: number;
}

/** A host-injected method tab beyond the built-in Search / Scan / Custom. */
export type StagerExtraTab = { id: string; icon: string; label: string };

/**
 * DOM ids the stager stamps on its inputs and primary button, so each host keeps
 * the ids its own e2e selectors expect (the two flows use different ids).
 */
export interface StagerIds {
  search: string;
  barcode: string;
  primary: string;
  customName: string;
  customCal: string;
  customProt: string;
  customFat: string;
  customCarb: string;
}
