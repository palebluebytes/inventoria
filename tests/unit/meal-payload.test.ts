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
  REFERENCE_ATTRIBUTES,
  buildMealPayload,
  referencesOf,
  winningRows,
} from "../../src/lib/p2p/meal-payload";
import { LEDGER_EXPORT_ARTIFACT } from "../../src/lib/db/ledger-export";
import { ownerOfEntity } from "../../src/lib/facets/registry";
import type { LedgerRow } from "../../src/lib/db/db.core";
import { row } from "./support/ledger-rows";
import {
  LARGE_MEAL_FOODS,
  LARGE_MEAL_RECIPES,
  synthesiseLargeMeal,
} from "./support/large-meal";

/**
 * The canonical registry of what the ledger holds, read as text. Two claims
 * below are read against it rather than against a mirror of it: what a meal is
 * allowed to carry, and which attributes hold an entity reference.
 */
const REGISTRY = readFileSync("docs/eavt-vocabulary.md", "utf8");

/** How the registry writes an attribute-namespace heading: ``### `food/` ``. */
const NAMESPACE_HEADING = /^### `([a-z_]+)\/`$/;

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
      row("fdc:1", "provenance/raw", { adapter: "usda" }),
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
      "provenance/raw",
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
 * What a meal may carry is two allow-lists, and both fail closed (ADR-0081 §5):
 * a food twin kind or a namespace added to the registry and not to them stops
 * honest meals crossing, and the symptom shows up on somebody else's device.
 *
 * So the registry's own tables are **partitioned** against them, never merely
 * sampled. Everything the registry lists is either something a meal carries or
 * something named below as deliberately excluded, and a prefix in neither fails
 * this — which puts the decision on whoever coins it, at the moment they do.
 */
describe("the registry a meal's two allow-lists are read against", () => {
  /** Every backticked id in the first column of the table under a heading. */
  function prefixesUnder(heading: string): string[] {
    const body = REGISTRY.split(`### ${heading}\n`)[1].split("\n#")[0];
    return body
      .split("\n")
      .filter((line) => line.startsWith("| `"))
      .flatMap((line) =>
        [...line.split("|")[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
      );
  }

  /** Twins a meal deliberately never reaches: none of them is food. */
  // `tmdb:movie:` and `tmdb:tv:` end in a colon and `olid:` exists: this list
  // predated #291's repair of the registry table, and was green only because
  // the table was wrong in the same two places.
  const NOT_FOOD = ["tmdb:movie:", "tmdb:tv:", "isbn:", "olid:", "twin:"];

  /**
   * Namespaces a meal deliberately never carries. `media/` is the one that
   * still makes ADR-0081 necessary: its projection folds a twin by attribute
   * alone, so `media/title` would be read off a food twin. `twin/` was the
   * other, and ADR-0086 §5 both renamed it (`item/`, `provenance/`) and scoped
   * that projection by entity, so the hazard is gone and the refusal is kept.
   *
   * `settings/` is not here because it no longer exists anywhere (ADR-0085).
   *
   * `deletion/` is the **Jar domain**'s and travels in a convergence deposit
   * between two replicas of one person's data (ADR-0096 §12), never in a meal
   * handed to another person. A meal is a narrowed closure of food facts, and a
   * fact about what its sender deleted is not one of them.
   */
  const NOT_A_MEALS_BUSINESS = [
    "media/",
    "item/",
    "provenance/",
    "habit/",
    "cal_event/",
    "notes/",
    "deletion/",
  ];

  it("accounts for every Digital Twin the registry lists", () => {
    expect(prefixesUnder("Digital Twins").sort()).toEqual(
      [...MEAL_TWIN_PREFIXES, ...NOT_FOOD].sort()
    );
  });

  it("accounts for every attribute namespace the registry lists", () => {
    const declared = [
      ...REGISTRY.matchAll(new RegExp(NAMESPACE_HEADING, "gm")),
    ].map((m) => `${m[1]}/`);

    expect(declared.sort()).toEqual(
      [...MEAL_ATTRIBUTE_NAMESPACES, ...NOT_A_MEALS_BUSINESS].sort()
    );
  });

  it("reads the closure's root prefix off the registry's own event list", () => {
    expect(prefixesUnder("Events")).toContain(MEAL_ROOT_PREFIX);
  });
});

/**
 * ADR-0105 §7. A Facet-scoped sync lane is sanctioned only where the Facet's
 * rows have no reference leaving them, and what proves that is `referencesOf`
 * being the ledger's whole reference vocabulary rather than an enumeration
 * somebody kept current. ADR-0079 §1's wipe rested on the same property
 * **once**, at the moment it shipped; a lane rests on it on every wake, which
 * is why ADR-0078 §8's argument transfers unchanged: a build rule with nothing
 * checking it is a comment.
 *
 * So the registry's marked references are **partitioned** the way the two
 * allow-lists above are. Every attribute the page marks `(reference)` is either
 * an edge the closure walks or one named below, and an attribute in neither
 * fails here, at the moment somebody coins it.
 */
describe("the reference attributes the registry marks", () => {
  /**
   * Marked references `referencesOf` deliberately does not read, each declared
   * with the entity kinds at its two ends.
   *
   * An entry is admissible only where the reference **resolves inside the
   * Tracked Domain of the row holding it**, because that is the property
   * ADR-0105 §7 needs: a lane scoped to one Facet then cannot ship a row
   * pointing outside its own scope. The ends are declared rather than described
   * so that criterion is a claim the third test reads through `ownerOfEntity`
   * instead of a sentence nothing checks, which is the failure ADR-0078 §8 is
   * about, one level up.
   *
   * And admissible only where the **holder** is not a prefix a meal carries
   * (#427, ADR-0105's third Amendment). A twin's rows land attribute-verbatim,
   * so a marked-but-unwalked reference held by one would land on a recipient's
   * ledger naming an entity their jar never held; a root's rows are re-minted
   * and never land at all, which is why the criterion reads the holder and not
   * the target. Both current entries clear it — `event:consume_` and `habit:`
   * are neither of them twin prefixes.
   *
   * Neither is a closure edge either: a meal crosses as it stands, not as the
   * corrections that produced it (ADR-0073 §1).
   */
  const RESOLVES_IN_ITS_OWN_DOMAIN: Record<string, [string, string]> = {
    // A Consumption Event naming the one that corrected it, `calorie.store.ts`.
    "event/replaced_by": ["event:consume_", "event:consume_"],
    // The Habit Lineage link, `habits.store.ts`.
    "habit/replaces": ["habit:", "habit:"],
  };

  /**
   * The mark the registry's "Attribute namespaces" preamble documents. Bold,
   * and reserved for an attribute bullet: the preamble names it in a code span
   * rather than writing one, so the last test can count every occurrence.
   */
  const MARK = String.raw`\*\*\(reference\)\*\*`;
  const MARKED_BULLET = new RegExp(String.raw`^- \`([a-z_]+)\` ` + MARK);

  /**
   * Every attribute the registry marks as holding an entity reference, as
   * `namespace/name`. The namespace comes from the enclosing `###` heading and
   * is cleared by any other one, so a mark outside an attribute section is
   * dropped rather than credited to the section above it.
   */
  function markedReferences(): string[] {
    const found: string[] = [];
    let namespace: string | null = null;
    for (const line of REGISTRY.split("\n")) {
      if (line.startsWith("### ")) {
        namespace = line.match(NAMESPACE_HEADING)?.[1] ?? null;
      }
      const name = line.match(MARKED_BULLET)?.[1];
      if (name && namespace) found.push(`${namespace}/${name}`);
    }
    return found;
  }

  it("accounts for every marked reference, as walked or as named", () => {
    expect(markedReferences().sort()).toEqual(
      [
        ...REFERENCE_ATTRIBUTES,
        ...Object.keys(RESOLVES_IN_ITS_OWN_DOMAIN),
      ].sort()
    );
  });

  it("keeps both ends of every named reference in one Tracked Domain", () => {
    for (const [attribute, [from, to]] of Object.entries(
      RESOLVES_IN_ITS_OWN_DOMAIN
    )) {
      const holder = ownerOfEntity(from);
      expect(
        holder,
        `${attribute} is held by an unowned entity`
      ).not.toBeNull();
      expect(
        ownerOfEntity(to)?.id,
        `${attribute} points out of its domain`
      ).toBe(holder?.id);
    }
  });

  /**
   * The criterion #427 settled on, and the reason there is no ninth receive
   * refusal: the decision about a marked-but-unwalked reference is taken here,
   * in this repo, at the moment somebody coins one — not months later on
   * somebody else's device, where a rule keyed on the mark would refuse a
   * marked dangling reference and accept an identical unmarked one
   * (`meal-reader.test.ts` asserts that acceptance).
   */
  it("refuses a named reference held by a prefix a meal carries", () => {
    for (const [attribute, [from]] of Object.entries(
      RESOLVES_IN_ITS_OWN_DOMAIN
    )) {
      expect(
        MEAL_TWIN_PREFIXES.some((prefix) => from.startsWith(prefix)),
        `${attribute} is held by a twin a meal carries, so it would land dangling`
      ).toBe(false);
    }
  });

  /**
   * Without this the partition above is only as honest as the parser: a mark on
   * a line the bullet grammar misses would be silently absent from both sides,
   * and the check would pass by not seeing the thing it is for.
   */
  it("credits every mark on the page to an attribute bullet", () => {
    expect(markedReferences()).toHaveLength(
      (REGISTRY.match(new RegExp(MARK, "g")) ?? []).length
    );
  });
});
