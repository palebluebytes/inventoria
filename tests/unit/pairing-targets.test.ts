import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  DECLARED_STATES,
  DECLARED_STATE_DEFAULT,
  pairingSearchCorpus,
  readPairingIndex,
  type PairingIndex,
  type PairingNutrientStore,
  type PairingTargetRow,
} from "../../src/lib/food/pairing-targets";
import {
  buildSearchCorpus,
  searchIndexRows,
  storedPanelFor,
  type SearchCorpus,
  type SearchIndex,
  type UsdaCorpusRow,
  type UsdaIndexRow,
} from "../../src/lib/food/usda-corpus";

// ADR-0113 §11. The cooked records ship as a second corpus, reached only after a
// person declares the pack in their hand cooked, and never by the food search.

const ARCHIVES = [
  {
    dataset: "SR Legacy",
    release: "2018-04",
    file: "sr.zip",
    sha256: "abc",
  },
];

const row = (
  fdcId: number,
  description: string,
  over: Partial<PairingTargetRow> = {}
): PairingTargetRow => ({
  fdcId,
  description,
  dataType: "SR Legacy",
  macros: {
    calories: 132,
    protein_content: 8.86,
    fat_content: 0.54,
    carbohydrate_content: 23.7,
  },
  ...over,
});

const pairingIndex = (foods: PairingTargetRow[]): PairingIndex => ({
  artifact: "usda-pairing-index",
  schema_version: 10,
  generated_from: ARCHIVES,
  foods,
});

/** The shipped index, in the only part of it the pairing search borrows. */
const shipped: SearchIndex = {
  artifact: "usda-search-index",
  schema_version: 10,
  generated_from: ARCHIVES,
  state_qualifiers: ["raw", "uncooked"],
  vocabulary_off: {
    licence: "ODbL",
    source: "Open Food Facts",
    url: "https://static.openfoodfacts.org/x.json",
    sha256: "abc",
    expansions: { aubergine: ["eggplant"] },
  },
  vocabulary_local: {
    source: "Inventoria, hand-written",
    expansions: { gammon: ["pork cured ham"] },
  },
  foods: [],
};

describe("readPairingIndex — the shipped reading, over the cooked rows", () => {
  const shared: SearchCorpus = buildSearchCorpus(shipped);
  const index = pairingIndex([
    row(173735, "Beans, black, dried, cooked, boiled"),
    row(173740, "Beans, kidney, all types, dried, cooked, boiled"),
  ]);

  it("reads every row the way the food search reads one", () => {
    const corpus = readPairingIndex(index, shared);
    expect(corpus.foods).toHaveLength(2);
    expect(corpus.foods[0].row.fdcId).toBe(173735);
    expect(corpus.foods[0].name.words).toContain("beans");
  });

  it("borrows the shipped index's vocabulary rather than carrying one", () => {
    // There is no path to declaring a pack cooked that has not already loaded
    // the shipped index's header, so a second copy would be two maps read as
    // one — and the one a search rescued a query through would depend on which
    // corpus it was asked of.
    const corpus = readPairingIndex(index, shared);
    expect(corpus.vocabulary).toBe(shared.vocabulary);
    expect(corpus.state_qualifiers).toBe(shared.state_qualifiers);
  });

  it("carries the Pairing index's own schema version, not the shipped one", () => {
    const corpus = readPairingIndex({ ...index, schema_version: 11 }, shared);
    expect(corpus.schema_version).toBe(11);
  });

  it("answers a typed cooking word, because nothing strips one", () => {
    // §11 writes this consequence down rather than leaving it to be found: the
    // shared roster holds the six UNCOOKED spellings, so `boiled` reaches the
    // rows that say it instead of being taken out of the query first.
    const found = searchIndexRows(readPairingIndex(index, shared), "boiled");
    expect(found.hits.map((hit) => hit.row.fdcId)).toContain(173735);
  });
});

describe("the distinct type — the gate is a compile error", () => {
  // ADR-0113 §11's Scope: cooked rows reaching the Search index is the one leak
  // the record puts out of scope, and with an identical row type it is one
  // mistaken call away. These are type assertions rather than behaviour — if the
  // `@ts-expect-error`s below stop being errors, `pnpm check` fails here and the
  // gate is gone. Nothing in this block is ever called.

  it("refuses a Pairing index where the food search's own index is wanted", () => {
    // And it is not only the compiler: forced through, the reader reaches for a
    // Vocabulary map the Pairing index does not have. The type is what turns
    // that into a message somebody reads before shipping.
    expect(() =>
      // @ts-expect-error a Pairing index is not a Search index: it names itself
      // differently and carries no Vocabulary map of its own.
      buildSearchCorpus(pairingIndex([]))
    ).toThrow();
  });

  it("refuses a Pairing target where a Search index row is wanted", () => {
    const asShipped = (target: PairingTargetRow): UsdaIndexRow =>
      // @ts-expect-error the two rows are the same fields under different types.
      target;
    // The assignment is an identity at runtime, which is the point: nothing but
    // the type stands between a cooked row and the Search index.
    expect(asShipped(row(173735, "Beans, black")).fdcId).toBe(173735);
  });

  it("refuses a Search index row where a Pairing target is wanted", () => {
    // Symmetric, and deliberately so: a Reference food offered as a pairing
    // target for a pack somebody declared cooked is §11's forward error, which
    // the Declared state refuses by the same construction as the reverse one.
    const asTarget = (shippedRow: UsdaIndexRow): PairingTargetRow =>
      // @ts-expect-error same fields, different types, in both directions.
      shippedRow;
    // Written out rather than spread off `row`, because spreading a Pairing
    // target carries the phantom with it and the gate catches that too.
    const apples: UsdaIndexRow = {
      fdcId: 9999,
      description: "Apples, without skin",
      dataType: "SR Legacy",
      macros: { calories: 48 },
    };
    expect(asTarget(apples).fdcId).toBe(9999);
  });

  it("lets both through where only the fields are read", () => {
    // The ranking and the payload mapper read a row and never ask which corpus
    // wrote it, so they take the shared shape and accept both by saying so.
    const fields = (row: UsdaCorpusRow) => row.fdcId;
    const target: PairingTargetRow = row(173735, "Beans, black");
    expect(fields(target)).toBe(173735);
  });
});

describe("the committed store, read as a staged panel", () => {
  // The Pairing nutrient store is the half a person reaches when they ACCEPT a
  // row rather than look at one (ADR-0047 §2, inherited by ADR-0113 §11), and
  // `storedPanelFor` is what reads it. Asserted against the committed file, and
  // against the row this map was chartered on: `fdcId 173740` is the boiled
  // kidney bean whose fibre matches the jarred Spanish pulse's printed label,
  // and it left the Search index when ADR-0104 shipped.
  const store: PairingNutrientStore = JSON.parse(
    readFileSync("public/usda/pairing-nutrient-store.json", "utf8")
  );

  it("builds a whole panel for the row the map was chartered on", () => {
    const panel = storedPanelFor(store, 173740);
    expect(Object.keys(store.foods["173740"])).toHaveLength(98);
    expect(panel?.fiber_content).toBeCloseTo(6.4, 1);
  });

  it("says nothing about a food it does not carry", () => {
    // A Reference food is not in this store, and asking is legitimate: the
    // guard is on the food because a caller can hold an id from either set.
    expect(storedPanelFor(store, 173740 + 1)).toBeUndefined();
  });
});

describe("the two loaders — on demand, and precached by neither Facet", () => {
  const fetchMock = vi.fn();

  /** A fresh module, because a loaded artifact is memoised per session. */
  async function freshLoaders() {
    vi.resetModules();
    return {
      ...(await import("../../src/lib/food/pairing-targets")),
      ...(await import("../../src/lib/food/bundled-artifact")),
    };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const answers = (body: unknown) =>
    fetchMock.mockResolvedValue({ ok: true, json: async () => body });

  it("fetches each artifact from its own committed url", async () => {
    const { loadPairingIndex, loadPairingNutrientStore } = await freshLoaders();
    answers({ foods: [] });
    await loadPairingIndex();
    expect(fetchMock).toHaveBeenCalledWith("/usda/pairing-index.json");
    await loadPairingNutrientStore();
    expect(fetchMock).toHaveBeenCalledWith("/usda/pairing-nutrient-store.json");
  });

  it("fetches once per session, however many times it is asked", async () => {
    const { loadPairingIndex } = await freshLoaders();
    answers(pairingIndex([row(173735, "Beans, black, dried, cooked, boiled")]));
    const first = await loadPairingIndex();
    expect(await loadPairingIndex()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says which file needs a network when nothing answers at all", async () => {
    // Neither Facet precaches these, so an offline device reaches this by
    // design rather than by accident (ADR-0077 §5, #307) and the caller is
    // handed something it can turn into a sentence naming the network.
    const { loadPairingIndex, ArtifactUnreachableError: Unreachable } =
      await freshLoaders();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const failure = await loadPairingIndex().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Unreachable);
    expect((failure as InstanceType<typeof Unreachable>).subject).toBe(
      "The cooked foods"
    );
  });

  it("forgets a failure so the next declaration tries again", async () => {
    const { loadPairingIndex } = await freshLoaders();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await loadPairingIndex().catch(() => {});
    answers(pairingIndex([]));
    await expect(loadPairingIndex()).resolves.toMatchObject({
      artifact: "usda-pairing-index",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a served-but-broken file as the status it came back with", async () => {
    const { loadPairingNutrientStore } = await freshLoaders();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(loadPairingNutrientStore()).rejects.toThrow(
      /pairing-nutrient-store\.json \(404\)/
    );
  });
});

describe("the Declared state — which set a pairing search reaches (§11)", () => {
  // One question about the pack in a person's hand, two values, defaulting to
  // as-bought and recorded nowhere. What it decides is which corpus a keystroke
  // reads, and the claim worth pinning is the **symmetry**: declaring cooked
  // reaches the Pairing index and never the Search index, and the default
  // reaches the Search index and never the Pairing index. That is what refuses
  // both signs of the confusion at once — a cooked pack onto a dried row, and
  // the 101 reverse confusions #497 measured below ×0.7.
  const asBought = async () =>
    buildSearchCorpus({
      ...shipped,
      foods: [
        {
          fdcId: 168409,
          description: "Beans, kidney, raw",
          dataType: "SR Legacy",
          macros: { calories: 333 },
        },
      ],
    });
  const cooked = async () =>
    readPairingIndex(
      pairingIndex([row(173740, "Beans, kidney, dried, cooked, boiled")]),
      buildSearchCorpus(shipped)
    );

  it("defaults to as you bought it", () => {
    // The 22 twins that already pair behave exactly as they do today, a person
    // never meets the question unless they reach for it, and the second
    // artifact's fetch stays off the common path.
    expect(DECLARED_STATE_DEFAULT).toBe("as-bought");
  });

  it("reaches the Search index and never the Pairing index by default", async () => {
    const unreachable = () => {
      throw new Error("the Pairing index was reached");
    };
    const corpus = await pairingSearchCorpus(
      DECLARED_STATE_DEFAULT,
      unreachable,
      asBought
    )();
    expect(corpus.foods.map((food) => food.row.fdcId)).toEqual([168409]);
  });

  it("reaches the Pairing index and never the Search index once cooked is declared", async () => {
    const unreachable = () => {
      throw new Error("the Search index was reached");
    };
    const corpus = await pairingSearchCorpus("cooked", cooked, unreachable)();
    expect(corpus.foods.map((food) => food.row.fdcId)).toEqual([173740]);
  });

  it("offers two values and no third, as-bought first", () => {
    // An *I don't know* that showed both sets would re-admit, by the option
    // nobody reads carefully, the whole error this partition exists to refuse.
    expect(DECLARED_STATES.map((state) => state.value)).toEqual([
      "as-bought",
      "cooked",
    ]);
    expect(DECLARED_STATES[0].value).toBe(DECLARED_STATE_DEFAULT);
  });
});
