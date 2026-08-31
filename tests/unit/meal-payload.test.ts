import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MEAL_ATTRIBUTE_NAMESPACES,
  MEAL_PAYLOAD_ARTIFACT,
  MEAL_PAYLOAD_CEILING_BYTES,
  MEAL_PAYLOAD_SCHEMA_VERSION,
  MEAL_ROOT_PREFIX,
  MEAL_TWIN_PREFIXES,
  OMITTED_ATTRIBUTES,
  buildMealPayload,
  referencesOf,
  winningRows,
} from "../../src/lib/p2p/meal-payload";
import { LEDGER_EXPORT_ARTIFACT } from "../../src/lib/db/ledger-export";
import type { LedgerRow } from "../../src/lib/db/db.core";
import { row } from "./support/ledger-rows";
import {
  LARGE_MEAL_FOODS,
  LARGE_MEAL_RECIPES,
  synthesiseLargeMeal,
} from "./support/large-meal";

/** The read seam over a fixed ledger, remembering what it was asked for. */
function ledgerOf(rows: LedgerRow[]) {
  const asked: string[][] = [];
  return {
    asked,
    read: async (entities: string[]) => {
      asked.push([...entities]);
      return rows.filter((r) => entities.includes(r.entity));
    },
  };
}

const linesOf = (ndjson: string) => ndjson.split("\n").filter((l) => l !== "");
const envelopeOf = (ndjson: string) => JSON.parse(linesOf(ndjson)[0]);
const datomsOf = (ndjson: string): LedgerRow[] =>
  linesOf(ndjson)
    .slice(1)
    .map((l) => JSON.parse(l));
const entitiesIn = (ndjson: string) =>
  new Set(datomsOf(ndjson).map((r) => r.entity));
const attributesOn = (ndjson: string, entity: string) =>
  datomsOf(ndjson)
    .filter((r) => r.entity === entity)
    .map((r) => r.attribute);

/** One consumed food: the event, and the twin it points at. */
function oneFoodMeal(): LedgerRow[] {
  return [
    row("event:consume_a", "event/type", "ConsumeAction"),
    row("event:consume_a", "event/target", "fdc:1"),
    row("event:consume_a", "event/quantity", "90g"),
    row("fdc:1", "food/name", "Kale, raw"),
    row("fdc:1", "nutrition/info", { serving_size: "100 g", calories: 35 }),
  ];
}

describe("the meal payload envelope", () => {
  const oneFoodEnvelope = async () =>
    envelopeOf(
      await buildMealPayload(["event:consume_a"], ledgerOf(oneFoodMeal()).read)
    );

  it("names its own artifact, never the ledger export's", async () => {
    const envelope = await oneFoodEnvelope();

    expect(envelope.artifact).toBe(MEAL_PAYLOAD_ARTIFACT);
    expect(envelope.artifact).toBe("inventoria-meal");
    expect(envelope.artifact).not.toBe(LEDGER_EXPORT_ARTIFACT);
  });

  it("carries a schema version of its own", async () => {
    expect((await oneFoodEnvelope()).schema_version).toBe(
      MEAL_PAYLOAD_SCHEMA_VERSION
    );
  });

  it("declares the consumption events that are the closure's roots", async () => {
    const rows = [
      ...oneFoodMeal(),
      row("event:consume_b", "event/target", "fdc:1"),
    ];

    const envelope = envelopeOf(
      await buildMealPayload(
        ["event:consume_a", "event:consume_b"],
        ledgerOf(rows).read
      )
    );

    expect(envelope.roots).toEqual(["event:consume_a", "event:consume_b"]);
  });

  it("carries no sender identity and no row count", async () => {
    expect(Object.keys(await oneFoodEnvelope()).sort()).toEqual([
      "artifact",
      "roots",
      "schema_version",
    ]);
  });
});

describe("winning datoms only", () => {
  it("sends the winner and leaves the superseded fact behind", async () => {
    const rows = [
      ...oneFoodMeal(),
      row("fdc:1", "food/name", "Kale", { hlc_ms: 1_700_000_000_500 }),
    ];

    const names = datomsOf(
      await buildMealPayload(["event:consume_a"], ledgerOf(rows).read)
    ).filter((r) => r.attribute === "food/name");

    expect(names).toHaveLength(1);
    expect(names[0].value).toBe(JSON.stringify("Kale"));
  });

  it("decides the winner on the logical clock, not on `time`", () => {
    const older = row("fdc:1", "food/name", "Kale", {
      time: 9_000_000_000_000,
      hlc_ms: 1_000,
    });
    const winner = row("fdc:1", "food/name", "Kale, raw", {
      time: 1_000,
      hlc_ms: 2_000,
    });

    expect(winningRows([older, winner])).toEqual([winner]);
  });

  it("separates two facts stamped in the same millisecond by their counter", () => {
    const first = row("fdc:1", "food/name", "Kale", {
      hlc_ms: 5_000,
      hlc_ctr: 0,
    });
    const second = row("fdc:1", "food/name", "Kale, raw", {
      hlc_ms: 5_000,
      hlc_ctr: 1,
    });

    expect(winningRows([second, first])).toEqual([second]);
  });

  it("keeps every attribute of an entity, one winner each", () => {
    const kept = winningRows(oneFoodMeal());

    expect(kept.filter((r) => r.entity === "fdc:1")).toHaveLength(2);
    expect(kept.filter((r) => r.entity === "event:consume_a")).toHaveLength(3);
  });
});

describe("exactly three attributes are omitted", () => {
  it("omits provenance and both photo attributes", async () => {
    const rows = [
      ...oneFoodMeal(),
      row("fdc:1", "twin/raw_provenance", { adapter: "usda" }),
      row("fdc:1", "food/label_photos", ["data:image/jpeg;base64,AAAA"]),
      row("fdc:1", "food/photo_base64", "data:image/jpeg;base64,BBBB"),
    ];

    const ndjson = await buildMealPayload(
      ["event:consume_a"],
      ledgerOf(rows).read
    );

    expect(attributesOn(ndjson, "fdc:1").sort()).toEqual([
      "food/name",
      "nutrition/info",
    ]);
    expect([...OMITTED_ATTRIBUTES]).toEqual([
      "twin/raw_provenance",
      "food/label_photos",
      "food/photo_base64",
    ]);
  });

  it("crosses the sender's own capture records verbatim", async () => {
    const capture = { kind: "label", captured_at: 1_700_000_000_000 };
    const manual = { kind: "menu_dish" };
    const rows = [
      ...oneFoodMeal(),
      row("fdc:1", "food/label_capture", capture),
      row("fdc:1", "food/manual_entry", manual),
    ];

    const sent = datomsOf(
      await buildMealPayload(["event:consume_a"], ledgerOf(rows).read)
    );

    expect(sent.find((r) => r.attribute === "food/label_capture")?.value).toBe(
      JSON.stringify(capture)
    );
    expect(sent.find((r) => r.attribute === "food/manual_entry")?.value).toBe(
      JSON.stringify(manual)
    );
  });
});

describe("the reference closure", () => {
  it("walks event/target to the twin the meal points at", async () => {
    const rows = [
      ...oneFoodMeal(),
      row("fdc:99", "food/name", "A food nobody ate"),
    ];

    const entities = entitiesIn(
      await buildMealPayload(["event:consume_a"], ledgerOf(rows).read)
    );

    expect(entities).toEqual(new Set(["event:consume_a", "fdc:1"]));
  });

  it("walks a recipe instantiation to its template and its frozen rows", async () => {
    const rows = [
      row("event:consume_r", "event/target", "recipe:soup"),
      row("event:consume_r", "event/instantiation", {
        based_on: "recipe:soup",
        yield: 4,
        ingredients: [{ ref: "fdc:1", name: "Kale", amount: 80, unit: "g" }],
      }),
      row("recipe:soup", "recipe/name", "Kale soup"),
      row("recipe:soup", "recipe/yield", 4),
      row("recipe:soup", "recipe/ingredients", [
        { ref: "fdc:1", amount: 80, unit: "g" },
        { ref: "fdc:2", amount: 20, unit: "g" },
      ]),
      row("recipe:soup", "recipe/instructions", ["Boil it."]),
      row("fdc:1", "food/name", "Kale, raw"),
      row("fdc:2", "food/name", "Water"),
    ];

    const entities = entitiesIn(
      await buildMealPayload(["event:consume_r"], ledgerOf(rows).read)
    );

    expect(entities).toEqual(
      new Set(["event:consume_r", "recipe:soup", "fdc:1", "fdc:2"])
    );
  });

  it("crosses the recipe whole, not as its name alone", async () => {
    const rows = [
      row("event:consume_r", "event/target", "recipe:soup"),
      row("recipe:soup", "recipe/name", "Kale soup"),
      row("recipe:soup", "recipe/yield", 4),
      row("recipe:soup", "recipe/ingredients", []),
      row("recipe:soup", "recipe/instructions", ["Boil it."]),
    ];

    const ndjson = await buildMealPayload(
      ["event:consume_r"],
      ledgerOf(rows).read
    );

    expect(attributesOn(ndjson, "recipe:soup").sort()).toEqual([
      "recipe/ingredients",
      "recipe/instructions",
      "recipe/name",
      "recipe/yield",
    ]);
  });

  it("walks the winning reference, never the one it superseded", async () => {
    const rows = [
      row("event:consume_a", "event/target", "fdc:1", { hlc_ms: 1_000 }),
      row("event:consume_a", "event/target", "fdc:2", { hlc_ms: 2_000 }),
      row("fdc:1", "food/name", "The food it used to point at"),
      row("fdc:2", "food/name", "The food it points at now"),
    ];

    const entities = entitiesIn(
      await buildMealPayload(["event:consume_a"], ledgerOf(rows).read)
    );

    expect(entities).toEqual(new Set(["event:consume_a", "fdc:2"]));
  });

  it("reads each entity once, however many times it is referenced", async () => {
    const rows = [
      row("event:consume_a", "event/target", "fdc:1"),
      row("event:consume_b", "event/target", "fdc:1"),
      row("fdc:1", "food/name", "Kale, raw"),
    ];
    const ledger = ledgerOf(rows);

    await buildMealPayload(["event:consume_a", "event:consume_b"], ledger.read);

    expect(ledger.asked.flat()).toEqual([
      "event:consume_a",
      "event:consume_b",
      "fdc:1",
    ]);
  });

  it("terminates on a reference that points back into the closure", async () => {
    const rows = [
      row("event:consume_a", "event/target", "recipe:a"),
      row("recipe:a", "recipe/ingredients", [{ ref: "recipe:a", amount: 1 }]),
    ];

    const entities = entitiesIn(
      await buildMealPayload(["event:consume_a"], ledgerOf(rows).read)
    );

    expect(entities).toEqual(new Set(["event:consume_a", "recipe:a"]));
  });
});

describe("the rows on the wire", () => {
  it("carries every column, with `value` as the stored text", async () => {
    const rows = [
      row("event:consume_a", "event/target", "fdc:1"),
      row("fdc:1", "food/name", 'Kale, "raw"', {
        time: 42,
        hlc_ms: 43,
        hlc_ctr: 7,
        device_id: "dev_sender",
      }),
    ];

    const sent = datomsOf(
      await buildMealPayload(["event:consume_a"], ledgerOf(rows).read)
    );

    expect(sent).toContainEqual({
      entity: "fdc:1",
      attribute: "food/name",
      value: JSON.stringify('Kale, "raw"'),
      time: 42,
      hlc_ms: 43,
      hlc_ctr: 7,
      device_id: "dev_sender",
    });
  });
});

describe("referencesOf", () => {
  it("finds nothing in an attribute that holds no reference", () => {
    expect(referencesOf(row("fdc:1", "food/name", "Kale"))).toEqual([]);
  });

  it("passes over a reference blob of the wrong shape rather than throwing", () => {
    expect(
      referencesOf(row("event:consume_a", "event/instantiation", "not a blob"))
    ).toEqual([]);
    expect(
      referencesOf(row("recipe:a", "recipe/ingredients", { ref: "fdc:1" }))
    ).toEqual([]);
  });
});

describe("the ceiling", () => {
  /**
   * The invariant, not the figure. `docs/research/199-large-meal-payload-measurements.md`
   * priced this meal at 114.6 KiB raw on 2026-08-28, and that number is not
   * asserted here: it moves with every corpus regeneration, while ADR-0073 §9's
   * rule — the ceiling must never be the reason an honest meal cannot be sent —
   * does not.
   */
  it("clears 1 MiB for a large complex meal of thirty foods and three dishes", async () => {
    const { roots, rows } = await synthesiseLargeMeal();

    const ndjson = await buildMealPayload(roots, ledgerOf(rows).read);

    // The meal is the size it claims to be, and the closure reached all of it.
    // Without these the ceiling could be cleared by a synthesis that quietly
    // built nothing. Both are read off the fixture's own shape rather than off
    // the corpus, so a regenerated bundle cannot break them.
    expect(roots).toHaveLength(LARGE_MEAL_FOODS + LARGE_MEAL_RECIPES);
    expect(entitiesIn(ndjson)).toEqual(new Set(rows.map((r) => r.entity)));

    expect(new TextEncoder().encode(ndjson).length).toBeLessThan(
      MEAL_PAYLOAD_CEILING_BYTES
    );
  });
});

/**
 * What a meal may carry is two allow-lists, and both fail closed (ADR-0076 §5):
 * a food twin kind or a namespace added to the registry and not to them stops
 * honest meals crossing, and the symptom shows up on somebody else's device.
 *
 * So the registry's own tables are **partitioned** against them, never merely
 * sampled. Everything the registry lists is either something a meal carries or
 * something named below as deliberately excluded, and a prefix in neither fails
 * this — which puts the decision on whoever coins it, at the moment they do.
 */
describe("the registry a meal's two allow-lists are read against", () => {
  const registry = readFileSync("docs/eavt-vocabulary.md", "utf8");

  /** Every backticked id in the first column of the table under a heading. */
  function prefixesUnder(heading: string): string[] {
    const body = registry.split(`### ${heading}\n`)[1].split("\n#")[0];
    return body
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .flatMap((line) =>
        [...line.split("|")[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
      );
  }

  /** Twins a meal deliberately never reaches: none of them is food. */
  const NOT_FOOD = ["tmdb:movie_", "tmdb:tv_", "isbn:", "twin:"];

  /**
   * Namespaces a meal deliberately never carries. `twin/` and `media/` are the
   * two that made ADR-0076 necessary: their projections scope by attribute
   * alone, so either would be read off a food twin.
   */
  const NOT_A_MEALS_BUSINESS = [
    "media/",
    "twin/",
    "habit/",
    "cal_event/",
    "settings/",
    "notes/",
  ];

  it("accounts for every Digital Twin the registry lists", () => {
    expect(prefixesUnder("Digital Twins").sort()).toEqual(
      [...MEAL_TWIN_PREFIXES, ...NOT_FOOD].sort()
    );
  });

  it("accounts for every attribute namespace the registry lists", () => {
    const declared = [...registry.matchAll(/^### `([a-z_]+\/)`$/gm)].map(
      (m) => m[1]
    );

    expect(declared.sort()).toEqual(
      [...MEAL_ATTRIBUTE_NAMESPACES, ...NOT_A_MEALS_BUSINESS].sort()
    );
  });

  it("reads the closure's root prefix off the registry's own event list", () => {
    expect(prefixesUnder("Events")).toContain(MEAL_ROOT_PREFIX);
  });
});
