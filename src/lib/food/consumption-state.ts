import type { StoredDatom } from "../db/db.client";
import { groupByEntity, parseDatomValue } from "../db/datom-fold";
import {
  labelFromInstantiation,
  type Instantiation,
} from "./recipe-instantiation";
import { sumNutrition, type NutritionBreakdown } from "./nutrition";

export interface ConsumptionEvent {
  id: string;
  time: number;
  type?: string;
  target?: string;
  quantity?: string;
  meal_type?: string;
  /**
   * The frozen `event/metrics` snapshot (ADR-0022, widened by ADR-0030 / #28):
   * the four `{ calories, protein, fat, carbs }` headline macros plus every extra
   * nutrient the food carried, scaled to the amount logged. A nutrient the food
   * never reported is absent, never 0. The four macros are also surfaced flat
   * below — the headline the ring and summary read; the full breakdown lives here.
   */
  metrics?: NutritionBreakdown;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  foodName?: string;
  photoBase64?: string;
  /** "retracted" hides the event from the projection (append-only "delete"). */
  status?: string;
  /**
   * The **consumption link**: the `event:consume_` that consumed this one, on
   * each of the N events a Consolidate folded into one. Never a twin, and never
   * written by a correction (ADR-0111 §6). Folded, so it names the one successor
   * this event claims — see {@link mintedAsReplacement} for what the superseded
   * values are evidence of.
   */
  replaced_by?: string;
  // schema.org/Recipe display fields, enriched live from the recipe twin
  // (ADR-0021). These are the template's identity, safe to read live; the logged
  // occasion's nutrition and ingredient breakdown come from `instantiation`, not
  // from the (mutable) template, so recipe edits never rewrite logged history.
  description?: string;
  url?: string;
  image?: string;
  instructions?: string[];
  /**
   * The frozen Recipe Instantiation snapshot (`event/instantiation`, ADR-0022):
   * what was actually cooked this occasion — `based_on`, `yield`, and per-row
   * `{ ref, name, amount, unit, calories, protein, fat, carbs }`. The projection
   * reads a logged recipe's breakdown and per-serving macros from here rather
   * than live-deriving from the template, so correcting or deleting an ingredient
   * twin leaves an already-logged instantiation untouched. Present on recipe
   * Consumption Events; absent on plain food logs.
   */
  instantiation?: Instantiation;
}

/**
 * Every event id that appears as the value of an `event/replaced_by` datom —
 * the evidence that an event was **minted as a replacement** rather than logged
 * (ADR-0111 §5). One that appears here and is no predecessor's folded winner is
 * an **Unclaimed replacement**.
 *
 * It has to read the raw datoms: a superseded link is exactly what
 * `groupByEntity`'s latest-wins fold discards, so by the time there are entity
 * groups the evidence is gone.
 */
function mintedAsReplacement(datoms: StoredDatom[]): Set<string> {
  const minted = new Set<string>();
  for (const { attribute, value } of datoms) {
    if (attribute !== "event/replaced_by") continue;
    const successor = parseDatomValue(attribute, value);
    if (typeof successor === "string") minted.add(successor);
  }
  return minted;
}

/**
 * Folds the consumption datom stream (Consumption Events joined to their food /
 * recipe twins) into enriched events for the whole history. The pure worker-side
 * projection behind `CONSUMPTION`; the Food dashboard narrows to a day on the
 * main thread (ADR-0019).
 *
 * A Consumption Event stores its macros as an `event/metrics` blob, surfaced as
 * flat fields here. A logged recipe additionally carries its frozen
 * `event/instantiation` snapshot (ADR-0022) — its breakdown and per-serving
 * macros are read from that snapshot, never live-derived from the (mutable)
 * template, so logged history is immutable. The twin join only supplies the
 * recipe's live display identity (name, image, description, …).
 *
 * Two kinds of event are folded and then dropped: a retracted one, and an
 * **Unclaimed replacement** — an event minted as another's successor that no
 * predecessor's folded link still names (ADR-0111 §5). A reader taking
 * `ConsumptionEvent[]` has had both applied, and neither rule is repeatable
 * downstream: an unclaimed replacement carries no status, and a pure function
 * over projected events cannot rebuild the raw-datom view the second one needs
 * (ADR-0111 §7).
 */
export function computeConsumption(datoms: StoredDatom[]): ConsumptionEvent[] {
  const { twins: twinGroups, events: eventGroups } = groupByEntity(datoms, [
    "food/",
    "recipe/",
  ]);

  const groups = Array.from(eventGroups.values());

  // Where each event sits in the day. Arrival order by default — the ledger
  // hands the fold its datoms in HLC order, so this is the order things were
  // logged in.
  //
  // **A re-logged event inherits the place its predecessor held.** Every
  // correction in this domain is append-only: the amount picker's Done, a
  // Selection scale (ADR-0088 §5), turning foods into a recipe. Each retracts
  // the old event and appends a new one, so the *same* food comes back under a
  // new id whose first datom is the newest in the ledger. On arrival order
  // alone it would jump to the bottom of its meal the moment you corrected it,
  // which reads as the food being re-added rather than adjusted. The forward
  // link `retractConsumptionEvent` already writes — `event/replaced_by` — is
  // enough to hand the successor the slot.
  //
  // One pass suffices, and the walk cannot run away: the fold sees a
  // predecessor before its successor (the successor is minted later, so its
  // first datom is later), so by the time a link is read the predecessor's own
  // slot is already final. Where several events collapse into one — the foods
  // that become a recipe all point at it — the successor takes the EARLIEST of
  // their slots, landing where the first ingredient sat rather than the last.
  const slotOf = new Map<string, number>();
  groups.forEach((g, i) => slotOf.set(g.id, i));
  // The successors the folded links still name. A predecessor claims exactly
  // one, whatever it was linked to earlier, which is the whole of ADR-0111 §5's
  // test: a replacement no predecessor names here won nothing.
  const claimed = new Set<string>();
  for (const g of groups) {
    const successor = (g.fields as Record<string, any>).replaced_by;
    if (typeof successor !== "string") continue;
    claimed.add(successor);
    const slot = slotOf.get(g.id) as number;
    const held = slotOf.get(successor);
    if (held === undefined || slot < held) slotOf.set(successor, slot);
  }
  const minted = mintedAsReplacement(datoms);

  const events: ConsumptionEvent[] = groups
    .map((g) => {
      const f = g.fields as Record<string, any>;
      const event: ConsumptionEvent = { id: g.id, time: g.firstTime, ...f };
      if (f.metrics) {
        event.calories = f.metrics.calories;
        event.protein = f.metrics.protein;
        event.fat = f.metrics.fat;
        event.carbs = f.metrics.carbs;
      }
      return event;
    })
    // Retracted events (e.g. foods replaced by a recipe) are hidden but never
    // deleted — the ledger keeps their datoms. Read after the slots are worked
    // out, not before: a retracted event is what carries the link forward.
    .filter((e) => e.status !== "retracted")
    // **An Unclaimed replacement is dropped too** (ADR-0111 §5): it was minted
    // as another event's successor and no predecessor's folded link names it,
    // because a concurrent act on another device claimed them first. Two
    // devices correcting one banana before either saw the other left both
    // replacements live and the day reading 445 kcal where the truth was 267
    // (#463); two devices consolidating the same foods left two dishes. It is
    // not retracted — it carries no `event/status` at all — so the filter above
    // cannot see it, and this is the one place the rule lives (ADR-0111 §7).
    // The cost is that a real logged event goes: it did not lose a log, it lost
    // the link that defined it as a replacement, to the same latest-wins
    // discipline every other attribute obeys.
    .filter((e) => !minted.has(e.id) || claimed.has(e.id))
    .sort(
      (a, b) => (slotOf.get(a.id) as number) - (slotOf.get(b.id) as number)
    );

  // Enrich each event with its target twin's display fields.
  for (const event of events) {
    if (!event.target) continue;
    const twin = twinGroups.get(event.target);
    if (!twin) continue;
    const t = twin.fields as Record<string, any>;
    // `groupByEntity` merges the food/ and recipe/ prefixes into one flat map,
    // so a recipe twin's `recipe/name` and a food twin's `food/name` both land
    // as `t.name`.
    //
    // A twin that resolves and carries no name is an Impromptu Recipe (ADR-0110
    // §1), and it is labelled from the event's own frozen snapshot instead —
    // derived at render and never written back, so the twin stays genuinely
    // nameless, which is what keeps it out of the library. This is the line that
    // makes the absence survivable: without it `foodName` is undefined, and
    // `partitionCopyable` sorts the row into `lost`, a sent meal drops it on
    // landing, and search and reports skip it.
    //
    // **A twin that does not resolve at all is a different state and keeps its
    // old answer.** `Unknown Food` is reserved for exactly that, and ADR-0058
    // §11 counts such a row as lost rather than copying it — deriving a label
    // here would mint a second one instead. Which is why the fallback sits
    // after the `!twin` guard rather than before it.
    event.foodName = t.name || labelFromInstantiation(event.instantiation);
    event.photoBase64 = t.photo_base64 || t.photo || t.image;
    // schema.org/Recipe display identity, read live from the template (ADR-0021).
    // The logged occasion's nutrition and ingredient breakdown are NOT read here:
    // they live on the event's frozen `event/instantiation` snapshot (ADR-0022),
    // surfaced via the field spread above, so a template edit or an ingredient-
    // twin correction can never rewrite this logged event.
    event.description = t.description;
    event.url = t.url;
    event.image = t.image;
    event.instructions = t.instructions;
  }

  return events;
}

/**
 * Totals every nutrient present across a set of Consumption Events — the day (or
 * meal) breakdown the dashboard sums (ADR-0030 / #28). Each event's frozen
 * `metrics` breakdown is summed with round-then-sum ({@link sumNutrition}), so a
 * total matches the displayed per-food rows. A nutrient **no** event froze stays
 * absent: a macro-only event (a custom food logged with no source panel)
 * contributes only its macros and never fabricates a zero fibre/micronutrient for
 * the day. The pure
 * foundation the display tickets read from — it derives nothing from the mutable
 * twins, only from the frozen snapshots.
 */
export function totalNutrition(events: ConsumptionEvent[]): NutritionBreakdown {
  return sumNutrition(
    events
      .map((e) => e.metrics)
      .filter((m): m is NutritionBreakdown => m != null)
  );
}
