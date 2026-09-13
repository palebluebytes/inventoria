import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The live search on `docs/food-search.html`, driven through the same handler a
// keystroke triggers.
//
// It exists because the page shipped once with the search entirely dead. The
// bundle's export list is a STRING inside the generator, a name was dropped from
// it by an edit that silently did not match, and nothing noticed: the page still
// built, still passed its staleness gate, and still answered a search — because
// the results path never calls the annotation's functions. The verification at
// the time ran queries and read the result rows, so it went green while every
// query on the page threw.
//
// So this drives the CLIENT rather than the ranking. `usda-corpus.test.ts`
// already proves the search is right; what is unproven without this is that the
// page can call it.

const PAGE = "docs/food-search.html";

/** The three payloads the page carries, pulled out the way a browser gets them. */
function payloads() {
  const page = readFileSync(PAGE, "utf8");
  const corpus =
    /<script id="corpus" type="application\/json">([\s\S]*?)<\/script>/.exec(
      page
    );
  if (!corpus) throw new Error("the page carries no corpus payload");
  // The bundle is the first plain <script> after the corpus, and the client the
  // one after that. Positional because that is the order the page depends on:
  // the client reads `window.FoodSearch` at parse time.
  const afterCorpus = page.indexOf("</script>", page.indexOf('id="corpus"'));
  const bundleAt = page.indexOf("<script>", afterCorpus) + "<script>".length;
  const bundle = page.slice(bundleAt, page.indexOf("</script>", bundleAt));
  const clientAt =
    page.indexOf("<script>", page.indexOf("</script>", bundleAt)) +
    "<script>".length;
  const client = page.slice(clientAt, page.indexOf("</script>", clientAt));
  return { corpus: corpus[1], bundle, client };
}

/** The page's elements, enough of them for the client to run. */
function mount(corpusText: string) {
  const node = (id: string) => ({
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    dataset: {} as Record<string, string>,
    handler: null as null | (() => void),
    addEventListener(_: string, fn: () => void) {
      this.handler = fn;
    },
    focus() {},
  });
  const nodes: Record<string, unknown> = {
    q2: node("q2"),
    count2: node("count2"),
    hits: node("hits"),
    corpus: { textContent: corpusText },
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = globalThis;
  globals.document = {
    getElementById: (id: string) => nodes[id] ?? null,
    querySelectorAll: () => [],
  };
  return nodes as {
    q2: ReturnType<typeof node>;
    count2: ReturnType<typeof node>;
    hits: ReturnType<typeof node>;
  };
}

const { corpus, bundle, client } = payloads();
const dom = mount(corpus);
// eslint-disable-next-line no-eval
(0, eval)(bundle);
// eslint-disable-next-line no-eval
(0, eval)(client);

const search = (query: string) => {
  dom.q2.value = query;
  dom.q2.handler?.();
  return {
    rows: (dom.hits.innerHTML.match(/class="hit"/g) ?? []).length,
    line: dom.count2.textContent,
    html: dom.hits.innerHTML,
  };
};

describe("the live search on docs/food-search.html", () => {
  it("exports every function the client calls", () => {
    // The failure this file was written for. A missing name is not a build
    // error, a render error or a wrong answer — it is a thrown exception on the
    // first keystroke, and only the client ever finds it.
    const api = (
      globalThis as unknown as Record<string, Record<string, unknown>>
    ).FoodSearch;
    for (const name of [
      "buildSearchCorpus",
      "searchIndexRows",
      "SEARCH_RESULT_LIMIT",
      "compareRelevance",
      "compileReferenceFoodQuery",
      "readReferenceFoodName",
      "readRowRank",
    ])
      expect([name, typeof api[name]]).toEqual([
        name,
        name === "SEARCH_RESULT_LIMIT" ? "number" : "function",
      ]);
  });

  it("answers every query the page offers as a preset", () => {
    for (const query of [
      "beef",
      "potato",
      "cheese",
      "milk",
      "grape",
      "olive oil",
      "aubergine",
      "gammon",
    ]) {
      const { rows } = search(query);
      expect([query, rows > 0]).toEqual([query, true]);
    }
  });

  it("stops at the page cap and says so", () => {
    const { rows, line } = search("beef");
    expect(rows).toBe(50);
    expect(line).toMatch(/50-row cap/);
  });

  it("reports the vocabulary answering, where it is what answered", () => {
    // `aubergine` reaches nothing literally, so ADR-0049's fallback substitutes
    // `eggplant` — and the page says which phrase it used rather than passing
    // the row off as a literal match.
    const { rows, line, html } = search("aubergine");
    expect(rows).toBeGreaterThan(0);
    expect(line).toMatch(/vocabulary answered/);
    expect(html).toMatch(/reached as/);
  });

  it("renders the key vector the page's caption promises", () => {
    const { html } = search("grape");
    for (const column of ["tier", "raw", "head", "pos", "sib", "desig"])
      expect([column, html.includes(">" + column + "<")]).toEqual([
        column,
        true,
      ]);
  });

  it("says nothing found rather than throwing, for a word no food carries", () => {
    const { rows, line } = search("qwertyuiop");
    expect(rows).toBe(0);
    expect(line).toBe("0 rows");
  });

  it("asks for a query rather than searching for nothing", () => {
    expect(search("   ").line).toBe("Type something.");
  });
});
