import { describe, it, expect } from "vitest";
import { FACETS, facetOf } from "../../src/lib/facets/registry";
import {
  bundleFor,
  entryChunkOf,
  matchesDeclaration,
  precacheUrlsFor,
  reachableFrom,
  withAssetSizes,
  type BundleChunk,
} from "../../src/lib/facets/precache";

// #306. What each Facet precaches is worked out from the build (ADR-0077 §2),
// and the build is the one thing a unit test cannot have — so the walk takes a
// bundle as a parameter and this hands it one. The numbers a real build produces
// are measured in the commit that introduced this; what is checked here is the
// rule, which is the half that can be wrong silently.

/** A three-entry build, shaped like the real one and small enough to read. */
const chunk = (over: Partial<BundleChunk> & { file: string }): BundleChunk => ({
  entryModule: null,
  imports: [],
  dynamicImports: [],
  css: [],
  modules: [],
  bytes: 0,
  ...over,
});

const BUNDLE: BundleChunk[] = [
  chunk({
    file: "assets/root.js",
    entryModule: "index.html",
    imports: ["assets/shared.js"],
    dynamicImports: ["assets/notes.js"],
    css: ["assets/root.css"],
    modules: ["src/main.ts", "src/App.svelte"],
    bytes: 100,
  }),
  chunk({
    file: "assets/food.js",
    entryModule: "food/index.html",
    imports: ["assets/shared.js"],
    css: ["assets/food.css"],
    modules: ["src/food-main.ts", "src/Rations.svelte"],
    bytes: 10,
  }),
  chunk({
    file: "assets/shared.js",
    modules: ["src/lib/views/FoodView.svelte"],
    bytes: 1000,
  }),
  chunk({
    file: "assets/notes.js",
    modules: ["src/lib/views/NotesView.svelte"],
    bytes: 4000,
  }),
];

const SIZES: Record<string, number> = {
  "assets/root.css": 64,
  "assets/food.css": 3,
};
const sizeOf = (file: string) => SIZES[file] ?? 0;

describe("what a Facet's entry reaches (ADR-0077 §2)", () => {
  it("finds an entry chunk by the module it is the facade for", () => {
    // Never by its emitted name. `root-*.js` was `index-*.js` until a second
    // entry gave the inputs named keys, and a check matching on the name failed
    // by finding nothing — which is the way a gate goes green over a real
    // failure (ADR-0083 §6).
    expect(entryChunkOf(BUNDLE, "food/index.html")?.file).toBe(
      "assets/food.js"
    );
    expect(entryChunkOf(BUNDLE, "assets/food.js")).toBeUndefined();
  });

  it("follows dynamic imports, because a lazy view is still in the Facet", () => {
    const root = entryChunkOf(BUNDLE, "index.html")!;
    expect(
      reachableFrom(BUNDLE, root)
        .map((f) => f.file)
        .sort()
    ).toEqual([
      "assets/notes.js",
      "assets/root.css",
      "assets/root.js",
      "assets/shared.js",
    ]);
  });

  it("leaves the other Facet's code out, which is the whole saving", () => {
    const food = entryChunkOf(BUNDLE, "food/index.html")!;
    const reached = reachableFrom(BUNDLE, food).map((f) => f.file);
    expect(reached).toContain("assets/shared.js");
    expect(reached).not.toContain("assets/notes.js");
    expect(reached).not.toContain("assets/root.js");
  });

  it("weighs the stylesheets, which the walk itself cannot", () => {
    // A chunk carries its own byte count and an emitted asset does not, so a
    // stylesheet arrives at zero. Left unfilled, a Facet's recorded weight
    // silently omits every stylesheet it ships.
    const root = entryChunkOf(BUNDLE, "index.html")!;
    const weighed = withAssetSizes(reachableFrom(BUNDLE, root), sizeOf);
    expect(weighed.find((f) => f.file === "assets/root.css")?.bytes).toBe(64);
  });

  it("names the Facet when a build has dropped its entry", () => {
    // The failure mode this guards is an app that installs and then opens on
    // nothing. A message about a missing file would send the reader to the
    // wrong build (ADR-0083 §1).
    expect(() =>
      bundleFor(facetOf("food"), "food/nowhere.html", BUNDLE, sizeOf)
    ).toThrow(/Rations/);
  });

  it("records every source module inside the chunks it reached", () => {
    const food = bundleFor(facetOf("food"), "food/index.html", BUNDLE, sizeOf);
    expect(food.modules).toEqual([
      "src/Rations.svelte",
      "src/food-main.ts",
      "src/lib/views/FoodView.svelte",
    ]);
    expect(food.bytes).toBe(10 + 1000 + 3);
  });
});

describe("what a Facet declares (ADR-0077 §3)", () => {
  it("matches inside one path segment and never across a slash", () => {
    expect(
      matchesDeclaration("assets/sqlite3-*.wasm", "assets/sqlite3-a.wasm")
    ).toBe(true);
    // The declaration that would otherwise reach into another Facet's directory
    // the day the output layout moves.
    expect(matchesDeclaration("assets/*", "assets/deep/x.js")).toBe(false);
    expect(matchesDeclaration("fonts/OFL.txt", "fonts/OFL.txt")).toBe(true);
    expect(matchesDeclaration("fonts/OFL.txt", "fonts/OFLxtxt")).toBe(false);
  });

  it("keeps the Latin subsets and drops the ones nothing draws", () => {
    const declared = (file: string) =>
      facetOf("root").precache.some((p) => matchesDeclaration(p, file));
    expect(declared("assets/epilogue-latin-wght-normal-a.woff2")).toBe(true);
    expect(declared("assets/epilogue-latin-ext-wght-italic-a.woff2")).toBe(
      true
    );
    // An allowlist cannot fail the way the `globIgnores` denylist it replaced
    // could: a Fontsource release adding an eighth subset joins neither list.
    expect(declared("assets/epilogue-cyrillic-wght-normal-a.woff2")).toBe(
      false
    );
    expect(declared("assets/epilogue-vietnamese-wght-normal-a.woff2")).toBe(
      false
    );
  });

  it("has every Facet name a complete set rather than a subset of the root's", () => {
    // ADR-0076 §2 has Facets overlap rather than nest, so root-as-superset is
    // not merely untidy — the two already declare different USDA artifacts, and
    // a subset could not say so.
    const root = facetOf("root").precache;
    const food = facetOf("food").precache;
    for (const shared of ["assets/db.worker-*.js", "usda/search-index.json"]) {
      expect([root.includes(shared), food.includes(shared)]).toEqual([
        true,
        true,
      ]);
    }
    expect(food).toContain("usda/nutrient-store.json");
    expect(root).not.toContain("usda/nutrient-store.json");
  });

  it("gives Rations all three USDA artifacts, because ADR-0047 §11 binds it", () => {
    const food = facetOf("food").precache;
    expect(food).toEqual(
      expect.arrayContaining([
        "usda/search-index.json",
        "usda/nutrient-store.json",
        "assets/zxing_reader-*.wasm",
      ])
    );
    // The root keeps the landing screen's artifact and gives up the two that
    // are read in answer to an action (ADR-0077 §5). This roster is the whole of
    // why Rations never shows #307's "needs a network" line: it holds the files,
    // so neither path ever fetches one.
    expect(facetOf("root").precache).not.toContain(
      "assets/zxing_reader-*.wasm"
    );
  });
});

describe("what a Facet precaches, altogether", () => {
  const CANDIDATES = [
    "index.html",
    "food/index.html",
    "manifest.webmanifest",
    "food/manifest.webmanifest",
    "assets/root.js",
    "assets/root.css",
    "assets/food.js",
    "assets/food.css",
    "assets/shared.js",
    "assets/notes.js",
    "assets/db.worker-a.js",
    "usda/search-index.json",
    "usda/nutrient-store.json",
    "sw.js",
    "_headers",
  ];

  const urlsFor = (id: "root" | "food") => {
    const facet = facetOf(id);
    const entry = id === "root" ? "index.html" : "food/index.html";
    return precacheUrlsFor(
      facet,
      bundleFor(facet, entry, BUNDLE, sizeOf),
      CANDIDATES
    );
  };

  it("gives each Facet its own document and its own manifest, and only its own", () => {
    const root = urlsFor("root");
    const food = urlsFor("food");
    expect([...root].sort()).toEqual(
      expect.arrayContaining(["index.html", "manifest.webmanifest"])
    );
    expect(root.has("food/index.html")).toBe(false);
    expect(root.has("food/manifest.webmanifest")).toBe(false);
    expect([...food].sort()).toEqual(
      expect.arrayContaining(["food/index.html", "food/manifest.webmanifest"])
    );
    expect(food.has("manifest.webmanifest")).toBe(false);
  });

  it("takes the derived code and the declared statics, and nothing else", () => {
    const food = urlsFor("food");
    expect(food.has("assets/food.js")).toBe(true);
    expect(food.has("assets/shared.js")).toBe(true);
    expect(food.has("usda/nutrient-store.json")).toBe(true);
    // Emitted, globbed, and claimed by neither half. The glob makes no decision
    // (ADR-0077 §2), so a file nothing declares and nothing imports is a file
    // nothing installs.
    expect(food.has("sw.js")).toBe(false);
    expect(food.has("_headers")).toBe(false);
    expect(food.has("assets/notes.js")).toBe(false);
  });

  it("keeps a new view out of the other Facet with no edit anywhere", () => {
    // The property the derivation exists for: `globIgnores` had to be told
    // about every new view, and a forgotten one re-inflated a Facet silently
    // with every gate green.
    const extended = [
      ...BUNDLE.map((c) =>
        c.file === "assets/root.js"
          ? { ...c, dynamicImports: [...c.dynamicImports, "assets/habits.js"] }
          : c
      ),
      chunk({ file: "assets/habits.js", bytes: 5 }),
    ];
    const root = facetOf("root");
    const withNewView = precacheUrlsFor(
      root,
      bundleFor(root, "index.html", extended, sizeOf),
      [...CANDIDATES, "assets/habits.js"]
    );
    expect(withNewView.has("assets/habits.js")).toBe(true);

    const food = facetOf("food");
    expect(
      precacheUrlsFor(
        food,
        bundleFor(food, "food/index.html", extended, sizeOf),
        [...CANDIDATES, "assets/habits.js"]
      ).has("assets/habits.js")
    ).toBe(false);
  });

  it("declares a set for every Facet on the roster", () => {
    // A Facet added with no declaration would precache its code and none of the
    // Jar — no ledger worker, no SQLite — and would install as an app that
    // cannot open the thing it is a face onto.
    for (const facet of FACETS) {
      expect([facet.id, facet.precache.length > 0]).toEqual([facet.id, true]);
    }
  });
});
