import { describe, it, expect } from "vitest";
import {
  MEAL_PAYLOAD_ARTIFACT,
  MEAL_PAYLOAD_SCHEMA_VERSION,
  MEAL_ROOT_PREFIX,
  MEAL_TWIN_PREFIXES,
  MEAL_WIRE_COMPRESSION,
  OMITTED_ATTRIBUTES,
  buildMealPayload,
  mealPayloadEnvelope,
} from "../../src/lib/p2p/meal-payload";
import {
  MEAL_PAYLOAD_SUPPORTED_SCHEMA_VERSIONS,
  MealPayloadRefusedError,
  MealPayloadTooLargeError,
  decodeMealPayload,
  readMealPayload,
} from "../../src/lib/p2p/meal-reader";
import {
  LEDGER_EXPORT_ARTIFACT,
  LEDGER_EXPORT_SCHEMA_VERSION,
  datomLine,
  envelopeLine,
} from "../../src/lib/db/ledger-export";
import { readImportEnvelope } from "../../src/lib/db/ledger-import";
import { row } from "./support/ledger-rows";
import { synthesiseLargeMeal } from "./support/large-meal";

/** The read seam over a fixed ledger. */
const ledgerOf =
  (rows: ReturnType<typeof row>[]) => async (entities: string[]) =>
    rows.filter((r) => entities.includes(r.entity));

/** One consumed food: the event, and the twin it points at. */
const oneFoodMeal = () => [
  row("event:consume_a", "event/type", "ConsumeAction"),
  row("event:consume_a", "event/target", "fdc:1"),
  row("fdc:1", "food/name", "Kale, raw"),
];

/** A payload the builder made, which the reader must accept. */
const sentMeal = (rows = oneFoodMeal(), roots = ["event:consume_a"]) =>
  buildMealPayload(roots, ledgerOf(rows));

/** A payload assembled line by line, for the shapes the builder cannot make. */
const payloadOf = (
  roots: string[],
  rows: ReturnType<typeof row>[],
  envelope: Record<string, unknown> = {}
) =>
  JSON.stringify({ ...mealPayloadEnvelope(roots), ...envelope }) +
  "\n" +
  rows.map(datomLine).join("");

const refusal = (payload: string): MealPayloadRefusedError => {
  try {
    readMealPayload(payload);
  } catch (err) {
    if (err instanceof MealPayloadRefusedError) return err;
    throw err;
  }
  throw new Error("the payload was accepted, and a refusal was expected");
};

/**
 * The sender's half of the wire's compression, which lives in the test because
 * it is the transport's to own (#233) and the reader's job is only to undo it.
 * A decompression bomb is not something the app can produce, so the fixture has
 * to be built here anyway.
 */
async function deflated(text: string): Promise<Uint8Array> {
  const piped = new Blob([text])
    .stream()
    .pipeThrough(
      new CompressionStream(
        MEAL_WIRE_COMPRESSION
      ) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
    );
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

// ---------------------------------------------------------------------------
// 1 and 2: what line one says this is
// ---------------------------------------------------------------------------

describe("the artifact this reader answers to", () => {
  it("refuses a whole ledger export, which merges by rules a meal does not share", () => {
    const payload =
      envelopeLine({
        artifact: LEDGER_EXPORT_ARTIFACT,
        schema_version: LEDGER_EXPORT_SCHEMA_VERSION,
      }) + datomLine(row("fdc:1", "food/name", "Kale, raw"));

    expect(refusal(payload).message).toContain(LEDGER_EXPORT_ARTIFACT);
    expect(refusal(payload).message).toContain(MEAL_PAYLOAD_ARTIFACT);
  });

  it("is refused in turn by the ledger reader, so the two refuse each other", () => {
    expect(() =>
      readImportEnvelope(
        JSON.stringify(mealPayloadEnvelope(["event:consume_a"]))
      )
    ).toThrow(/inventoria-meal/);
  });

  it("refuses an artifact from another program entirely", () => {
    expect(
      refusal(
        payloadOf(["event:consume_a"], oneFoodMeal(), {
          artifact: "something-else",
        })
      ).message
    ).toContain("something-else");
  });

  it("says nothing about the payload being newer, which it cannot know", () => {
    const message = refusal(
      payloadOf(["event:consume_a"], oneFoodMeal(), {
        artifact: "something-else",
      })
    ).message;

    expect(message).not.toMatch(/newer|older|version/i);
  });
});

describe("the schema version this reader understands", () => {
  it("reads the version the builder writes", () => {
    expect(MEAL_PAYLOAD_SUPPORTED_SCHEMA_VERSIONS).toContain(
      MEAL_PAYLOAD_SCHEMA_VERSION
    );
  });

  it("refuses a version it is not on the list for", () => {
    const message = refusal(
      payloadOf(["event:consume_a"], oneFoodMeal(), { schema_version: 99 })
    ).message;

    expect(message).toContain("99");
  });

  it("refuses a payload that does not say which version it is", () => {
    expect(() =>
      readMealPayload(
        payloadOf(["event:consume_a"], oneFoodMeal(), { schema_version: "1" })
      )
    ).toThrow(MealPayloadRefusedError);
  });
});

describe("bytes that are not the format at all", () => {
  it("refuses a payload whose first line is not JSON", () => {
    expect(refusal("not json at all\n").lineNumber).toBe(1);
  });

  it("refuses a payload with no lines in it", () => {
    expect(() => readMealPayload("")).toThrow(MealPayloadRefusedError);
  });
});

// ---------------------------------------------------------------------------
// 3: the datom grammar, the ledger reader's own
// ---------------------------------------------------------------------------

describe("a line that is not a well-formed datom row", () => {
  const brokenLine = async (line: string) =>
    refusal((await sentMeal()) + line + "\n");

  it("refuses a line that is not JSON, naming the line a person would find", async () => {
    expect((await brokenLine("{oops")).lineNumber).toBe(5);
  });

  it("refuses a row missing a column", async () => {
    expect(
      (
        await brokenLine(
          JSON.stringify({ entity: "fdc:2", attribute: "food/name" })
        )
      ).message
    ).toMatch(/value/);
  });

  it("refuses a stamp that is not a whole number", async () => {
    const broken = { ...row("fdc:2", "food/name", "Water"), hlc_ms: 1.5 };

    expect((await brokenLine(JSON.stringify(broken))).message).toMatch(
      /hlc_ms/
    );
  });

  it("refuses a value that is not the JSON text the ledger stores", async () => {
    const broken = { ...row("fdc:2", "food/name", "Water"), value: "Water" };

    expect((await brokenLine(JSON.stringify(broken))).message).toMatch(/value/);
  });
});

// ---------------------------------------------------------------------------
// 4: the roots the envelope declares
// ---------------------------------------------------------------------------

describe("the closure roots the envelope declares", () => {
  it("refuses a payload that declares none, which is a bag of datoms", () => {
    expect(() => readMealPayload(payloadOf([], oneFoodMeal()))).toThrow(
      MealPayloadRefusedError
    );
  });

  it("refuses roots that are not a list of entity ids", () => {
    expect(() =>
      readMealPayload(
        payloadOf(["event:consume_a"], oneFoodMeal(), {
          roots: "event:consume_a",
        })
      )
    ).toThrow(MealPayloadRefusedError);
    expect(() =>
      readMealPayload(
        payloadOf(["event:consume_a"], oneFoodMeal(), { roots: [7] })
      )
    ).toThrow(MealPayloadRefusedError);
  });

  it("refuses a declared root no line carries", () => {
    const payload = payloadOf(
      ["event:consume_a", "event:consume_missing"],
      oneFoodMeal()
    );

    expect(refusal(payload).message).toContain("event:consume_missing");
  });

  it("refuses a root that is not a Consumption Event, which would make the closure whatever the sender declared", () => {
    const payload = payloadOf(
      ["settings:global"],
      [row("settings:global", "settings/food/targets", { calories: 1 })]
    );

    expect(refusal(payload).message).toContain("settings:global");
  });

  it("reads the prefix off the format rather than off a literal", () => {
    expect(MEAL_ROOT_PREFIX).toBe("event:consume_");
  });
});

// ---------------------------------------------------------------------------
// 5: reachability, the clause doing the security work
// ---------------------------------------------------------------------------

describe("an entity reachable from no declared root", () => {
  const ridingAlong = (rider: ReturnType<typeof row>) =>
    refusal(payloadOf(["event:consume_a"], [...oneFoodMeal(), rider]));

  it("refuses settings riding along inside a meal", () => {
    expect(
      ridingAlong(
        row("settings:global", "settings/food/targets", { calories: 1 })
      ).message
    ).toContain("settings:global");
  });

  it("refuses a habit riding along inside a meal", () => {
    expect(
      ridingAlong(row("habit:water", "habit/name", "Water")).message
    ).toContain("habit:water");
  });

  it("refuses a notes op riding along inside a meal", () => {
    expect(
      ridingAlong(row("notes:op_1", "notes/op", { kind: "put" })).message
    ).toContain("notes:op_1");
  });

  it("refuses a food no event in the meal points at", () => {
    expect(
      ridingAlong(row("fdc:99", "food/name", "A food nobody ate")).message
    ).toContain("fdc:99");
  });

  it("refuses settings a reference reaches, which reachability alone would admit", () => {
    const payload = payloadOf(
      ["event:consume_a"],
      [
        row("event:consume_a", "event/target", "settings:global"),
        row("settings:global", "settings/food/targets", { calories: 1 }),
      ]
    );

    expect(refusal(payload).message).toContain("settings:global");
  });

  it("refuses a habit an instantiation ingredient reaches", () => {
    const payload = payloadOf(
      ["event:consume_a"],
      [
        row("event:consume_a", "event/instantiation", {
          based_on: "recipe:soup",
          ingredients: [{ ref: "habit:water" }],
        }),
        row("recipe:soup", "recipe/name", "Kale soup"),
        row("habit:water", "habit/name", "Water"),
      ]
    );

    expect(refusal(payload).message).toContain("habit:water");
  });

  it("refuses a notes op a recipe ingredient reaches", () => {
    const payload = payloadOf(
      ["event:consume_a"],
      [
        row("event:consume_a", "event/target", "recipe:soup"),
        row("recipe:soup", "recipe/ingredients", [{ ref: "notes:op_1" }]),
        row("notes:op_1", "notes/op", { kind: "put" }),
      ]
    );

    expect(refusal(payload).message).toContain("notes:op_1");
  });

  it.each([...MEAL_TWIN_PREFIXES])(
    "accepts a %s twin the meal points at",
    (prefix) => {
      const twin = `${prefix}1`;
      const payload = payloadOf(
        ["event:consume_a"],
        [
          row("event:consume_a", "event/target", twin),
          row(twin, "food/name", "Something eaten"),
        ]
      );

      expect(readMealPayload(payload).rows).toHaveLength(2);
    }
  );

  it("accepts everything the roots do reach, through a recipe and its rows", async () => {
    const rows = [
      row("event:consume_r", "event/target", "recipe:soup"),
      row("event:consume_r", "event/instantiation", {
        based_on: "recipe:soup",
        ingredients: [{ ref: "fdc:2", name: "Kale", amount: 80, unit: "g" }],
      }),
      row("recipe:soup", "recipe/name", "Kale soup"),
      row("recipe:soup", "recipe/ingredients", [
        { ref: "fdc:1", amount: 80, unit: "g" },
      ]),
      row("fdc:1", "food/name", "Kale, raw"),
      row("fdc:2", "food/name", "Water"),
    ];

    const meal = readMealPayload(await sentMeal(rows, ["event:consume_r"]));

    expect(new Set(meal.rows.map((r) => r.entity))).toEqual(
      new Set(["event:consume_r", "recipe:soup", "fdc:1", "fdc:2"])
    );
  });
});

// ---------------------------------------------------------------------------
// 6: every reference resolves inside the payload
// ---------------------------------------------------------------------------

describe("a reference that does not resolve inside the payload", () => {
  it("refuses an event/target that did not come with it", () => {
    const payload = payloadOf(
      ["event:consume_a"],
      [row("event:consume_a", "event/target", "fdc:gone")]
    );

    expect(refusal(payload).message).toContain("fdc:gone");
    expect(refusal(payload).message).toContain("event/target");
  });

  it("refuses an instantiation whose based_on did not come with it", () => {
    const payload = payloadOf(
      ["event:consume_r"],
      [
        row("event:consume_r", "event/instantiation", {
          based_on: "recipe:gone",
          ingredients: [],
        }),
      ]
    );

    expect(refusal(payload).message).toContain("recipe:gone");
  });

  it("refuses an instantiation ingredient that did not come with it", () => {
    const payload = payloadOf(
      ["event:consume_r"],
      [
        row("event:consume_r", "event/instantiation", {
          based_on: "recipe:soup",
          ingredients: [{ ref: "fdc:gone", amount: 80, unit: "g" }],
        }),
        row("recipe:soup", "recipe/name", "Kale soup"),
      ]
    );

    expect(refusal(payload).message).toContain("fdc:gone");
  });

  it("refuses a recipe ingredient that did not come with it", () => {
    const payload = payloadOf(
      ["event:consume_r"],
      [
        row("event:consume_r", "event/target", "recipe:soup"),
        row("recipe:soup", "recipe/ingredients", [
          { ref: "fdc:gone", amount: 80 },
        ]),
      ]
    );

    expect(refusal(payload).message).toContain("fdc:gone");
  });

  it("names the line the unresolvable reference sat on", () => {
    const payload = payloadOf(
      ["event:consume_a"],
      [row("event:consume_a", "event/target", "fdc:gone")]
    );

    expect(refusal(payload).lineNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7: the three attributes a meal never carries
// ---------------------------------------------------------------------------

describe("an attribute a meal never carries", () => {
  it.each([...OMITTED_ATTRIBUTES])(
    "refuses %s rather than dropping it silently",
    (attribute) => {
      const payload = payloadOf(
        ["event:consume_a"],
        [...oneFoodMeal(), row("fdc:1", attribute, "whatever it holds")]
      );

      expect(refusal(payload).message).toContain(attribute);
    }
  );

  it("names the line the forbidden attribute sat on", () => {
    const payload = payloadOf(
      ["event:consume_a"],
      [
        ...oneFoodMeal(),
        row("fdc:1", "food/photo_base64", "data:image/jpeg;base64,AAAA"),
      ]
    );

    expect(refusal(payload).lineNumber).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// The one thing that looks like a refusal and is not
// ---------------------------------------------------------------------------

describe("an unknown attribute", () => {
  it("is accepted, because reachability already contains the threat", async () => {
    const rows = [
      ...oneFoodMeal(),
      row("fdc:1", "food/invented_by_a_later_release", { anything: true }),
    ];

    const meal = readMealPayload(await sentMeal(rows));

    expect(meal.rows.map((r) => r.attribute)).toContain(
      "food/invented_by_a_later_release"
    );
  });
});

// ---------------------------------------------------------------------------
// What an accepted payload reads back as
// ---------------------------------------------------------------------------

describe("a payload the builder made", () => {
  it("reads back its envelope, its roots and every row", async () => {
    const meal = readMealPayload(await sentMeal());

    expect(meal.envelope.artifact).toBe(MEAL_PAYLOAD_ARTIFACT);
    expect(meal.roots).toEqual(["event:consume_a"]);
    expect(meal.rows).toEqual(oneFoodMeal());
  });

  it("passes over a blank line rather than refusing it", async () => {
    expect(readMealPayload((await sentMeal()) + "\n").rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// The ceiling: 1 MiB of decoded bytes, counted as they decode
// ---------------------------------------------------------------------------

describe("the ceiling on decoded bytes", () => {
  it("decodes a meal the builder deflated", async () => {
    const ndjson = await sentMeal();

    expect(await decodeMealPayload(await deflated(ndjson))).toBe(ndjson);
  });

  it("lets a large complex meal through, because the ceiling never refuses an honest meal", async () => {
    const { roots, rows } = await synthesiseLargeMeal();
    const ndjson = await buildMealPayload(roots, ledgerOf(rows));

    const decoded = await decodeMealPayload(await deflated(ndjson));

    expect(readMealPayload(decoded).roots).toEqual(roots);
  });

  it("aborts a decompression bomb mid-decode rather than after it", async () => {
    const ceiling = 64 * 1024;
    const bomb = await deflated("a".repeat(8 * 1024 * 1024));

    const err = await decodeMealPayload(bomb, ceiling).then(
      () => null,
      (e: unknown) => e as MealPayloadTooLargeError
    );

    expect(err).toBeInstanceOf(MealPayloadTooLargeError);
    expect(err).toBeInstanceOf(MealPayloadRefusedError);
    expect(err?.ceilingBytes).toBe(ceiling);
    // The whole point: it stopped counting near the ceiling rather than at the
    // 8 MiB the bomb would have decoded to.
    expect(err?.bytes).toBeLessThan(2 * ceiling);
  });

  it("says how big it got and what the ceiling was", async () => {
    const bomb = await deflated("a".repeat(1024 * 1024));

    await expect(decodeMealPayload(bomb, 1024)).rejects.toThrow(/1.0 KB/);
  });

  it("refuses bytes that are not a deflate stream at all", async () => {
    await expect(
      decodeMealPayload(new Uint8Array([1, 2, 3, 4, 5]))
    ).rejects.toThrow(MealPayloadRefusedError);
  });
});
