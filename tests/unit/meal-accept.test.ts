import { describe, it, expect, vi } from "vitest";
import {
  acceptMealPayload,
  receivedEventId,
  type MealAcceptSeams,
} from "../../src/lib/p2p/meal-accept";
import { mealPayloadEnvelope } from "../../src/lib/p2p/meal-payload";
import type { ReceivedMealPayload } from "../../src/lib/p2p/meal-reader";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";
import {
  buildSearchCorpus,
  mapIndexRowToPayload,
  type SearchCorpus,
  type UsdaIndexRow,
} from "../../src/lib/food/usda-corpus";
import { FOOD_ARRIVAL_ATTR } from "../../src/lib/food/provenance";
import type { Datom, LedgerRow } from "../../src/lib/db/db.core";
import { row } from "./support/ledger-rows";

// The accept path reaches the ledger through its seams, so nothing here needs a
// Worker — but `meal-accept` imports the client for its default seams, and the
// client's `?worker` import has no business being evaluated in a unit test.
vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    query: vi.fn(),
    append: vi.fn(),
    onInvalidate: vi.fn(() => () => {}),
  },
}));

/**
 * What a received meal becomes (ADR-0073 §3, §5, §6, §7 and §11).
 *
 * Everything here is judged on what reaches the two write seams: the datom
 * batch the twins land as, and the copy the events are re-logged through. A
 * `Datom` carries no stamp at all — no `hlc_ms`, no `device_id` — so the shape
 * of that batch IS §7's guarantee that the recipient's own clock is the only
 * clock in play, and that `Hlc.update` has nothing to be called against.
 */

const RECEIVED_AT = new Date("2026-08-31T19:04:00").getTime();
const VIEWED_DAY = new Date("2026-08-31T00:00:00");

/** One bundled USDA row, so the `fdc:` provenance rebuild has a source. */
const KALE: UsdaIndexRow = {
  fdcId: 1001,
  description: "Kale, raw",
  dataType: "Foundation",
  foodCategory: "Vegetables and Vegetable Products",
  macros: {
    calories: 35,
    protein_content: 2.9,
    fat_content: 1.5,
    carbohydrate_content: 4.4,
  },
};

function corpusOf(foods: UsdaIndexRow[]): SearchCorpus {
  return buildSearchCorpus({
    artifact: "usda-search-index",
    schema_version: 6,
    generated_from: [],
    vocabulary_off: {
      source: "off",
      expansions: {},
      licence: "ODbL",
      url: "https://example.invalid",
      sha256: "0".repeat(64),
    },
    vocabulary_local: { source: "hand", expansions: {} },
    foods,
  });
}

function payloadOf(rows: LedgerRow[], roots: string[]): ReceivedMealPayload {
  return { envelope: mealPayloadEnvelope(roots), roots, rows };
}

/** One USDA food, eaten once — the smallest whole meal there is. */
function oneFoodMeal(): ReceivedMealPayload {
  return payloadOf(
    [
      row("event:consume_src", "event/type", "ConsumeAction"),
      row("event:consume_src", "event/target", "fdc:1001"),
      row("event:consume_src", "event/quantity", "90g"),
      row("event:consume_src", "event/meal_type", "lunch"),
      row("event:consume_src", "event/metrics", { calories: 32, protein: 2.6 }),
      row("fdc:1001", "food/name", "Kale, raw"),
      row("fdc:1001", "nutrition/info", {
        serving_size: "100 g",
        calories: 35,
      }),
    ],
    ["event:consume_src"]
  );
}

/** The seams, remembering what the accept path asked each of them to do. */
function seamsOver(
  held: string[] = [],
  corpus: SearchCorpus | Error = corpusOf([KALE])
) {
  const appended: Datom[][] = [];
  const logged: {
    items: ConsumptionEvent[];
    meal_type: string;
    selectedDate: Date;
    ids: string[];
  }[] = [];
  const seams: MealAcceptSeams = {
    heldEntities: async (entities) =>
      entities.filter((entity) => held.includes(entity)),
    append: async (datoms) => {
      appended.push(datoms);
    },
    logMeal: async (items, meal_type, selectedDate, mintEventId) => {
      logged.push({
        items,
        meal_type,
        selectedDate,
        ids: items.map(mintEventId),
      });
      return { copied: items.length, lost: 0 };
    },
    loadCorpus: async () => {
      if (corpus instanceof Error) throw corpus;
      return corpus;
    },
    now: () => RECEIVED_AT,
  };
  return { seams, appended, logged };
}

/** The attribute map of one landed entity, across every appended batch. */
function landedAttributes(
  appended: Datom[][],
  entity: string
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const batch of appended) {
    for (const datom of batch) {
      if (datom.entity === entity) attributes[datom.attribute] = datom.value;
    }
  }
  return attributes;
}

describe("the re-minted event id (ADR-0073 §5)", () => {
  it("is the same id every time, so a second accept cannot duplicate the meal", async () => {
    expect(await receivedEventId("event:consume_src")).toBe(
      await receivedEventId("event:consume_src")
    );
  });

  it("is a Consumption Event id, so nothing downstream can tell it apart", async () => {
    const id = await receivedEventId("event:consume_a4f9_1756000000000");
    expect(id.startsWith("event:consume_")).toBe(true);
    // Half of a SHA-256, rendered hex.
    expect(id.slice("event:consume_".length)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("separates two roots of the same meal", async () => {
    expect(await receivedEventId("event:consume_a")).not.toBe(
      await receivedEventId("event:consume_b")
    );
  });

  it("carries nothing of the sender: the root id is the whole input", async () => {
    // The same occasion, re-sent from a second device: different stamps,
    // different `device_id`, same declared root. The id is a function of that
    // root and of nothing else, which is what makes a re-send absorb rather than
    // duplicate — and what keeps §11's refusal of sender identity true of the id
    // as well.
    const resent = oneFoodMeal();
    resent.rows = resent.rows.map((r) => ({
      ...r,
      hlc_ms: r.hlc_ms + 90_000,
      device_id: "dev_their_other_phone",
    }));

    const first = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, first.seams);
    const second = seamsOver();
    await acceptMealPayload(resent, "dinner", VIEWED_DAY, second.seams);

    expect(second.logged[0].ids).toEqual(first.logged[0].ids);
  });
});

describe("accepting a meal", () => {
  it("logs the meal into the recipient's own meal and day", async () => {
    const { seams, logged } = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, seams);

    expect(logged).toHaveLength(1);
    // The sender logged this at lunch; the recipient is accepting into dinner.
    expect(logged[0].meal_type).toBe("dinner");
    expect(logged[0].selectedDate).toBe(VIEWED_DAY);
    expect(logged[0].items.map((i) => i.target)).toEqual(["fdc:1001"]);
  });

  it("re-mints the event from the declared root and rewrites no reference", async () => {
    const { seams, logged } = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, seams);

    expect(logged[0].ids).toEqual([await receivedEventId("event:consume_src")]);
    expect(logged[0].items[0].target).toBe("fdc:1001");
  });

  it("lands the twin's own facts, and its minted id verbatim", async () => {
    const meal = payloadOf(
      [
        row("event:consume_src", "event/type", "ConsumeAction"),
        row("event:consume_src", "event/target", "food:custom_x1y2"),
        row("event:consume_src", "event/quantity", "1 serving"),
        row("event:consume_src", "event/metrics", { calories: 480 }),
        row("food:custom_x1y2", "food/name", "Nan's apple cake"),
        row("food:custom_x1y2", "food/manual_entry", {
          adapter: "manual",
          adapter_version: 1,
          kind: "menu",
          fields: ["name", "calories"],
        }),
      ],
      ["event:consume_src"]
    );
    const { seams, appended } = seamsOver();
    await acceptMealPayload(meal, "dinner", VIEWED_DAY, seams);

    const landed = landedAttributes(appended, "food:custom_x1y2");
    expect(landed["food/name"]).toBe("Nan's apple cake");
    // §2 and §11: the sender's classification crosses, and it is what decides
    // whether the recipient can log this dish again.
    expect(landed["food/manual_entry"]).toMatchObject({ kind: "menu" });
  });

  it("writes every twin of one meal in a single batch", async () => {
    const meal = oneFoodMeal();
    meal.rows.push(
      row("event:consume_two", "event/type", "ConsumeAction"),
      row("event:consume_two", "event/target", "food:custom_x1y2"),
      row("event:consume_two", "event/quantity", "1 serving"),
      row("event:consume_two", "event/metrics", { calories: 480 }),
      row("food:custom_x1y2", "food/name", "Nan's apple cake")
    );
    meal.roots.push("event:consume_two");
    const { seams, appended } = seamsOver();
    await acceptMealPayload(meal, "dinner", VIEWED_DAY, seams);

    // One append, so a meal's foods land or none of them do.
    expect(appended).toHaveLength(1);
    expect(new Set(appended[0].map((d) => d.entity))).toEqual(
      new Set(["fdc:1001", "food:custom_x1y2"])
    );
  });

  it("lands the winning fact when a payload carries two for one attribute", async () => {
    // §1 narrows a payload to one row per (entity, attribute) on the way out,
    // and nothing the reader refuses enforces it on the way in. The logical
    // clock decides, never the order the lines happened to arrive in — so the
    // superseded name here loses even though it comes last.
    const meal = oneFoodMeal();
    meal.rows.push(
      row("fdc:1001", "food/name", "Kale, corrected", {
        hlc_ms: 1_700_000_009_000,
      }),
      row("fdc:1001", "food/name", "Kale, superseded", {
        hlc_ms: 1_600_000_000_000,
      })
    );
    const { seams, appended } = seamsOver();
    await acceptMealPayload(meal, "dinner", VIEWED_DAY, seams);

    expect(landedAttributes(appended, "fdc:1001")["food/name"]).toBe(
      "Kale, corrected"
    );
  });

  it("counts what it did", async () => {
    const { seams } = seamsOver();
    const result = await acceptMealPayload(
      oneFoodMeal(),
      "dinner",
      VIEWED_DAY,
      seams
    );
    expect(result).toEqual({
      logged: 1,
      absorbed: 0,
      lost: 0,
      landed: 1,
      skipped: 0,
    });
  });
});

describe("what the recipient already holds (ADR-0073 §6)", () => {
  it("skips a held twin whole and logs against the one they have", async () => {
    const { seams, appended, logged } = seamsOver(["fdc:1001"]);
    const result = await acceptMealPayload(
      oneFoodMeal(),
      "dinner",
      VIEWED_DAY,
      seams
    );

    expect(appended).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.landed).toBe(0);
    // The meal still logs — against their own twin, which the id already names.
    expect(logged[0].items[0].target).toBe("fdc:1001");
  });

  it("never rewrites a held twin's numbers with the sender's", async () => {
    const meal = oneFoodMeal();
    const { seams, appended } = seamsOver(["fdc:1001"]);
    await acceptMealPayload(meal, "dinner", VIEWED_DAY, seams);
    // Not merged, not latest-wins: every line the payload carried for that
    // entity is discarded, so a correction the recipient made survives.
    expect(landedAttributes(appended, "fdc:1001")).toEqual({});
  });

  it("absorbs a second accept of the same payload", async () => {
    const first = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, first.seams);

    // The ledger now holds the twin and the re-minted event, which is exactly
    // what the derived id buys: the second accept has nothing left to write.
    const second = seamsOver([
      "fdc:1001",
      await receivedEventId("event:consume_src"),
    ]);
    const result = await acceptMealPayload(
      oneFoodMeal(),
      "dinner",
      VIEWED_DAY,
      second.seams
    );

    expect(result).toEqual({
      logged: 0,
      absorbed: 1,
      lost: 0,
      landed: 0,
      skipped: 1,
    });
    expect(second.appended).toEqual([]);
    expect(second.logged[0]?.items ?? []).toEqual([]);
  });
});

describe("the recipient's own clock (ADR-0073 §7)", () => {
  it("carries no stamp of the sender's into the ledger", async () => {
    const { seams, appended } = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, seams);

    for (const datom of appended.flat()) {
      // A `Datom` is the append path's write shape and has no stamp columns at
      // all — the worker stamps it from this device's own clock. So a foreign
      // `device_id` has no way in, and there is nothing to advance a clock to.
      expect(Object.keys(datom).sort()).toEqual([
        "attribute",
        "entity",
        "time",
        "value",
      ]);
      expect(datom.time).toBe(RECEIVED_AT);
    }
  });
});

describe("rebuilding what was left off the wire (ADR-0073 §3)", () => {
  it("rebuilds an fdc: twin's provenance from the bundle it already holds", async () => {
    const { seams, appended } = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, seams);

    // The identical blob the search path would have written, from the same
    // mapper over the same row — offline, and with no network.
    expect(
      landedAttributes(appended, "fdc:1001")["twin/raw_provenance"]
    ).toEqual(mapIndexRowToPayload(KALE).attributes["twin/raw_provenance"]);
  });

  it("lands the food without provenance when the corpus has no such row", async () => {
    const { seams, appended } = seamsOver([], corpusOf([]));
    const result = await acceptMealPayload(
      oneFoodMeal(),
      "dinner",
      VIEWED_DAY,
      seams
    );

    // A different corpus vintage is a silent degradation, never a refusal: the
    // NOVA badge reads "not rated", which is the neutral answer.
    const landed = landedAttributes(appended, "fdc:1001");
    expect(landed["twin/raw_provenance"]).toBeUndefined();
    expect(landed["food/name"]).toBe("Kale, raw");
    expect(result.logged).toBe(1);
  });

  it("lands the food when the bundle cannot be read at all", async () => {
    const { seams, appended } = seamsOver([], new Error("offline"));
    const result = await acceptMealPayload(
      oneFoodMeal(),
      "dinner",
      VIEWED_DAY,
      seams
    );
    expect(
      landedAttributes(appended, "fdc:1001")["twin/raw_provenance"]
    ).toBeUndefined();
    expect(result.logged).toBe(1);
  });

  it("never rebuilds a gtin: twin's provenance, which would need Open Food Facts", async () => {
    const meal = payloadOf(
      [
        row("event:consume_src", "event/type", "ConsumeAction"),
        row("event:consume_src", "event/target", "gtin:5000159407236"),
        row("event:consume_src", "event/quantity", "45g"),
        row("event:consume_src", "event/metrics", { calories: 229 }),
        row("gtin:5000159407236", "food/name", "Peanut M&M's"),
      ],
      ["event:consume_src"]
    );
    const { seams, appended } = seamsOver();
    await acceptMealPayload(meal, "dinner", VIEWED_DAY, seams);

    // Re-fetching it would tell OFF's servers which barcodes you were sent.
    expect(
      landedAttributes(appended, "gtin:5000159407236")["twin/raw_provenance"]
    ).toBeUndefined();
  });
});

describe("the arrival mark (ADR-0073 §11)", () => {
  it("marks every food the meal landed", async () => {
    const { seams, appended } = seamsOver();
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, seams);

    expect(landedAttributes(appended, "fdc:1001")[FOOD_ARRIVAL_ATTR]).toEqual({
      adapter: "send",
      adapter_version: 1,
      received_at: RECEIVED_AT,
    });
  });

  it("does not mark a food the recipient already held", async () => {
    const { seams, appended } = seamsOver(["fdc:1001"]);
    await acceptMealPayload(oneFoodMeal(), "dinner", VIEWED_DAY, seams);
    // Their own food is not a received one; the meal simply logs against it.
    expect(appended.flat()).toEqual([]);
  });

  it("does not mark a recipe, which reads correctly from its own prefix", async () => {
    const meal = payloadOf(
      [
        row("event:consume_src", "event/type", "ConsumeAction"),
        row("event:consume_src", "event/target", "recipe:bolognese"),
        row("event:consume_src", "event/quantity", "1 serving"),
        row("event:consume_src", "event/metrics", { calories: 620 }),
        row("event:consume_src", "event/instantiation", {
          based_on: "recipe:bolognese",
          yield: 4,
          ingredients: [],
        }),
        row("recipe:bolognese", "recipe/name", "Beef bolognese"),
        row("recipe:bolognese", "recipe/ingredients", []),
      ],
      ["event:consume_src"]
    );
    const { seams, appended } = seamsOver();
    await acceptMealPayload(meal, "dinner", VIEWED_DAY, seams);

    const landed = landedAttributes(appended, "recipe:bolognese");
    expect(landed["recipe/name"]).toBe("Beef bolognese");
    expect(landed[FOOD_ARRIVAL_ATTR]).toBeUndefined();
  });
});
