/**
 * The root's landing screen (ADR-0114 §9).
 *
 * **The claim is an absence and a presence together**, which is why it boots the
 * whole shell rather than rendering the grid: what §9 decides is that the app
 * opens on the grid *with nothing above it*, and neither half of that is a
 * property of `FaceGrid`. `face-switcher.test.ts` next door owns the grid's own
 * markup and the panel's geometry; this file owns which of them the root draws
 * before anybody has chosen anything.
 *
 * `bootShell` is the harness `root-reads-no-link.test.ts` and
 * `code-handover.test.ts` already ask their shells through, for the reason it
 * documents: a question two shells answer differently has to be asked the same
 * way twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import App from "../../src/App.svelte";
import { FACES } from "../../src/lib/facets/registry";
import { bootShell } from "./support/shell-boot";
import { tileNames } from "./support/faces";

const APP_SHELL = "src/App.svelte";
const RATIONS_SHELL = "src/Rations.svelte";
const GRID = "src/lib/layout/FaceGrid.svelte";

/** Stubbed for the reason the two shell tests next door stub it: it is the boot. */
const init = vi.fn((path: string) => Promise.resolve(path));
vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    init: (path: string) => init(path),
    query: () => Promise.resolve([]),
    append: () => Promise.resolve(),
    subscribe: () => () => {},
  },
}));

const DESKTOP = { platform: "Linux x86_64", maxTouchPoints: 0 };

/** The root, opened at its own start URL with nothing on it. */
const landing = () =>
  bootShell(App, "root", "https://inventoria.example/", DESKTOP).body;

beforeEach(() => init.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("the root opens on the grid rather than on a face", () => {
  it("draws every face the root holds, in the roster's order", () => {
    // The zero state, and the thing `activeTab = "food"` used to make
    // impossible: the app opens on the whole set instead of on one member of it.
    // Read against `FACES` rather than a literal, so a roster that gains a face
    // fails on the order here the way it does in the grid's own file.
    expect(tileNames(landing())).toEqual(FACES.map((f) => f.name));
  });

  it("draws no header line, so there is no trigger onto the screen you are on", () => {
    // §9's own reason, and the whole of why the header is conditional: the grid
    // **is** the switcher here, so a logo that dropped a panel would be offering
    // a copy of what is already on the screen.
    //
    // Both halves are asserted against a body the test above has already found
    // seven tiles in, so this is an absence inside a real render rather than the
    // absence of a render.
    const body = landing();
    expect(body).not.toContain('aria-controls="face-switcher-panel"');
    expect(body).not.toContain('class="face-title');
  });

  it("inverts no tile, because the grid is where you are", () => {
    // The landing hands no `current` at all rather than handing one that matches
    // nothing: `FaceGrid`'s default is `null` and §9 is what that default is for.
    expect(landing()).not.toContain("aria-current");
  });

  it("still carries the shell's readiness hook and its error line's box", () => {
    // §9 keeps DB status error-only **everywhere**, and the landing is the
    // screen that made "everywhere" worth saying: it reads nothing from the
    // ledger, so the only thing a failed boot can put in front of somebody here
    // is that line. The box it goes in is the column, which is drawn either way.
    const body = landing();
    expect(body).toContain('data-db="opening"');
    expect(body).toContain('class="shell-column"');
    // Nothing green, though. The retired badge's words are what fifteen specs
    // used to wait on (`tests/support/shell.ts`), and a landing screen that
    // announced a database nobody had asked about would be the same bargain.
    expect(body).not.toContain("DB Ready");
  });
});

describe("what the landing screen is allowed to know", () => {
  /** Every module `file` imports, in source order. */
  const imports = (file: string): string[] =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /^\s*import[\s\S]*?from\s+"([^"]+)"/gm
      ),
    ].map((m) => m[1]);

  /**
   * Every module the grid reaches, transitively, as repo-relative paths.
   *
   * **Transitive rather than direct, because the grid stopped being a leaf.**
   * #534 gave it `FaceMaturity`, and a ceiling on the direct list alone would
   * have been satisfied by a component that imported a store on the grid's
   * behalf — which is the same convenience import the direct list was written to
   * catch, moved one file along. Bare specifiers are left as they are written and
   * are not followed: `svelte` is the framework and stops the walk.
   */
  const closure = (entry: string): string[] => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      for (const spec of imports(file)) {
        if (!spec.startsWith(".")) {
          seen.add(spec);
          continue;
        }
        const from = file.slice(0, file.lastIndexOf("/"));
        const joined = new URL(spec, `file:///${from}/`).pathname.slice(1);
        const resolved = [joined, `${joined}.ts`].find((candidate) => {
          try {
            readFileSync(candidate);
            return true;
          } catch {
            return false;
          }
        });
        if (!resolved) throw new Error(`${file} imports unresolvable ${spec}`);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        walk(resolved);
      }
    };
    walk(entry);
    return [...seen].sort();
  };

  it("reaches the roster, a badge and nothing else", () => {
    // §9: it renders before the ledger opens and **must not subscribe to a
    // ledger store**, "which is what makes the boot win real rather than
    // incidental". Stated as the whole closure rather than as the absence of one
    // store, because the way this breaks is a convenience import nobody thought
    // of as a subscription — and every module here is either a build-time
    // constant (ADR-0076 §6) or a `ui/` primitive with no state of its own, so
    // this list is the honest ceiling.
    expect(closure(GRID)).toEqual([
      "src/lib/facets/domains.ts",
      "src/lib/facets/registry.ts",
      "src/lib/layout/FaceMaturity.svelte",
      "src/lib/ui/Badge.svelte",
      "src/lib/ui/badge.ts",
      "svelte",
    ]);
  });

  it("is the one thing the root draws with no ledger at all", () => {
    // The harness catches a render that throws and returns `""`, which is
    // `shell-boot.ts`'s documented behaviour and the measurement here: every
    // face mounts a view that subscribes to a ledger store, and there is no
    // ledger in this tier. So a shell that draws 7 tiles and a shell that draws
    // nothing is the boot win, sharper than any timing could be.
    //
    // A Web Share Target open is the URL used for the second arm because it is
    // the one arrival that opens a face before anybody has chosen one
    // (ADR-0084 §3, §4) — and it is read synchronously off the address bar for
    // that reason, since an arrival is not the zero state.
    expect(tileNames(landing())).toHaveLength(7);
    expect(
      bootShell(
        App,
        "root",
        "https://inventoria.example/?url=https%3A%2F%2Fexample.com%2Flamp",
        DESKTOP
      ).body
    ).toBe("");
  });
});

describe("the app's own mark goes home only where home is in scope", () => {
  it("is a control at the root and a drawing under Rations", () => {
    // ADR-0114 §6 and ADR-0078 §1 together, and the pair is the claim: the
    // triquetra's one job is the landing grid, which is inside the root's scope
    // and outside Rations' — under `/food/` that destination is `/`, and a link
    // there would eject an install into a browser tab.
    //
    // Read off the two shells' source because the affordance is only observable
    // with the panel open, and neither the server renderer nor the e2e suite has
    // a switcher spec that opens one. `FaceSwitcher` draws both spellings from
    // one rule, so what is left to hold is which shell hands the handler.
    //
    // The attribute rather than the word: Rations' script explains in prose why
    // it hands none, and a grep for the name would read that explanation as the
    // prop and be satisfied by deleting it — the trap `importersOf` documents.
    expect(readFileSync(APP_SHELL, "utf8")).toMatch(/onHome=\{/);
    expect(readFileSync(RATIONS_SHELL, "utf8")).not.toMatch(/onHome=/);
  });
});
