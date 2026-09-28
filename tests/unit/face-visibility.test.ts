/**
 * Hiding a face (ADR-0114 §10), from the toggle to the grid.
 *
 * **The claim the section cannot make on its own is the one that matters**:
 * hiding removes a face from the switcher and *nothing else*. So the shell is
 * booted here rather than the grid rendered, the way `landing-screen.test.ts`
 * next door boots it — the landing screen **is** the switcher (§9), so the root's
 * own first paint is where a hidden face has to be missing, and it is the same
 * one list both hosts of `FaceGrid` read.
 *
 * The preference is snapshotted at import like every other device setting, which
 * is why each test stubs the jar and re-imports: the section and both shells read
 * it on their first paint, and a value that arrived a frame later would draw the
 * tiles and then take some away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  FACES,
  UNHIDEABLE_FACE,
  faceOf,
  facesOf,
  facetOf,
  hideableFaces,
  nestedFacetsOf,
  shownFaces,
  storagePrefixesOf,
} from "../../src/lib/facets/registry";
import { readCode } from "./support/source";
import { tileNames } from "./support/faces";
import { stubLocalStorage } from "./support/local-storage";
import type { Component } from "svelte";

const KEY = "inventoria_pref_hidden_faces";

/**
 * A component imported afresh, **with `svelte/server` imported afresh beside
 * it**, and the second half is not optional.
 *
 * `vi.resetModules()` invalidates the whole graph, Svelte's own internals
 * included, so a `render` held from the top of this file renders a component
 * built against a *different* copy of them: the first `onDestroy` reaches for an
 * SSR context the other graph is holding and finds `null`. Both halves have to
 * come out of the same reset, which is why this returns the pair.
 */
async function freshRender<P extends Record<string, unknown>>(
  load: () => Promise<{ default: Component<P> }>,
  props: P
): Promise<string> {
  vi.resetModules();
  const { render } = await import("svelte/server");
  const component = (await load()).default;
  return render(component, { props }).body;
}

/** Stubbed for the reason the shell suites next door stub it: it is the boot. */
vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    init: (path: string) => Promise.resolve(path),
    query: () => Promise.resolve([]),
    append: () => Promise.resolve(),
    subscribe: () => () => {},
  },
}));

const DESKTOP = { platform: "Linux x86_64", maxTouchPoints: 0 };

/**
 * Room for the first shell boot, which is a **compile** rather than a render.
 *
 * `landing-screen.test.ts` imports `App` at the top of the file, so its whole
 * tree is transformed during collection and no test pays for it. These two have
 * to import it *after* stubbing the jar — the preference is read at import — so
 * the first of them wears the transform of the entire root shell, which is past
 * the 5s default on a cold cache and nowhere near it on a warm one.
 *
 * **Measured, and the measurement is why the number is this large** (#534). The
 * first boot takes 17.8 s when this file runs alone and **38,731 ms** in a
 * `pnpm test:unit` where it competes with 198 other files for workers, so the
 * 30 s this started at failed the whole roster on a clean tree — the second test
 * then costs 373 ms, because the first one paid for the transform.
 *
 * The budget is set at three times the measurement rather than just above it,
 * because what it is defending is a *compile* whose cost is a property of the
 * machine and of how many workers are competing, not of the assertion: a budget
 * fitted to this laptop would fail again on a slower runner, and the price of a
 * generous one is nothing at all while the test passes and ninety seconds, once,
 * on the day something is genuinely hung.
 */
const FIRST_BOOT_MS = 120_000;

/**
 * The root's landing screen, with `hidden` already in the jar.
 *
 * The shell is imported *after* the stub, so its `$hiddenFaces` is the fresh
 * module's — a shell imported once at the top of the file would hold the
 * snapshot the first test took.
 */
async function landingWith(hidden: string[]): Promise<string> {
  const ls = stubLocalStorage();
  ls.store.set(KEY, JSON.stringify(hidden));
  const href = "https://inventoria.example/";
  const url = new URL(href);
  vi.stubGlobal("window", {
    navigator: DESKTOP,
    location: { href, origin: url.origin, search: "", hash: "" },
    history: { replaceState: () => {} },
  });
  return freshRender(() => import("../../src/App.svelte"), {
    facet: facetOf("root"),
  });
}

/** The visibility section itself, reading a jar seeded first. */
async function section(hidden: string[], facetId: "root" | "food" = "root") {
  const ls = stubLocalStorage();
  ls.store.set(KEY, JSON.stringify(hidden));
  const body = await freshRender(
    () => import("../../src/lib/views/settings/FaceVisibilitySection.svelte"),
    { faces: facesOf(facetOf(facetId)) }
  );
  return { body, ls };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("the rule: what may be hidden, and what survives being named", () => {
  it("offers a row for every face a shell holds except the one it stands on", () => {
    // §10: Settings is not toggleable, being where hiding is undone. Read off
    // both rosters, because the section is drawn under both shells and the count
    // differs — six rows at the root, two under Rations.
    expect(hideableFaces(FACES).map((f) => f.id)).not.toContain(
      UNHIDEABLE_FACE
    );
    expect(hideableFaces(FACES)).toHaveLength(FACES.length - 1);
    expect(hideableFaces(facesOf(facetOf("food"))).map((f) => f.id)).toEqual([
      "rations",
      "recipes",
    ]);
  });

  it("keeps Settings on the grid even when the store names it", () => {
    // The one defensive clause in `shownFaces`, and it is load-bearing:
    // `hideableFaces` can never produce this value, but `localStorage` is a text
    // file a person can edit, and a jar whose Settings tile is gone is a jar with
    // no way to put anything back.
    const kept = shownFaces(FACES, [UNHIDEABLE_FACE, "media"]);
    expect(kept.map((f) => f.id)).toContain(UNHIDEABLE_FACE);
    expect(kept.map((f) => f.id)).not.toContain("media");
  });

  it("drops what is hidden and re-sorts nothing", () => {
    // ADR-0114 §7's fixed order, which a filter must not disturb: the tiles a
    // person has left keep the positions they learned them in.
    const shown = shownFaces(FACES, ["recipes", "notes"]);
    expect(shown.map((f) => f.id)).toEqual(
      FACES.filter((f) => f.id !== "recipes" && f.id !== "notes").map(
        (f) => f.id
      )
    );
  });

  it("is reached by neither wipe, which is right for both", () => {
    // The Facet-scoped wipe matches a domain's `localStorage` prefixes and no
    // domain claims this key; the jar-wide wipe takes only what would otherwise
    // make the wipe a lie, which is the pairings and the carried-deletion notice
    // (`lib/jar-wipe.ts`). A switcher this device tidied is a preference, and a
    // preference left behind is not a resurrection.
    for (const facetId of ["root", "food"]) {
      expect(
        storagePrefixesOf(facetId).filter((prefix) => KEY.startsWith(prefix))
      ).toEqual([]);
    }
  });

  it("reads an unknown id as naming nothing", () => {
    // A face retired from the roster leaves a dead id in the jar. It matches
    // nothing, so it costs nothing, and a migration to sweep it would be written
    // for a rename that has not happened.
    expect(shownFaces(FACES, ["phonograph"])).toHaveLength(FACES.length);
  });
});

describe("the section a person hides a face from", () => {
  it("draws a row per face with its mark, and never a Settings row", async () => {
    const { body } = await section([]);
    for (const face of hideableFaces(FACES)) {
      expect(body).toContain(`src="${face.mark}"`);
      expect(body).toContain(`id="face-visible-${face.id}"`);
    }
    expect(body).not.toContain(`id="face-visible-${UNHIDEABLE_FACE}"`);
  });

  it("ticks what is shown, because the sentence above it is written that way", async () => {
    const { body } = await section(["media"]);
    const box = (id: string) =>
      body.slice(body.indexOf(`id="face-visible-${id}"`)).slice(0, 200);
    expect(box("media")).not.toContain("checked");
    expect(box("notes")).toContain("checked");
  });

  it("says what hiding does not do, which is the thing a toggle cannot say", async () => {
    // A tick-box beside a list of names is otherwise read as "turn this part of
    // the app off", and whether the data went with it is the one question a
    // person must not have to answer by experiment.
    const { body } = await section([]);
    expect(body).toMatch(/nothing you have logged is touched/i);
  });

  it("names the beta faces, so hiding one is not a decision made blind", async () => {
    // ADR-0114 §11's badge, drawn here from `ui/Badge` as a third site the record
    // counts two of (#534 folds it in). Rations ships and Media does not, and the
    // row is where a person decides which of them to keep.
    const { body } = await section([]);
    const row = (id: string) => {
      const at = body.indexOf(`id="face-visible-${id}"`);
      return body.slice(Math.max(0, at - 600), at);
    };
    expect(row("media")).toContain("BETA");
    expect(row("rations")).not.toContain("BETA");
  });

  it("writes one key and leaves its neighbours alone", async () => {
    const { ls } = await section([]);
    const prefs = await import("../../src/lib/stores/device-settings");
    ls.store.set("inventoria_pref_round_nutrition", "false");

    prefs.setFaceHidden("media", true);
    expect(JSON.parse(ls.store.get(KEY)!)).toEqual(["media"]);
    prefs.setFaceHidden("notes", true);
    expect(JSON.parse(ls.store.get(KEY)!)).toEqual(["media", "notes"]);
    prefs.setFaceHidden("media", false);
    expect(JSON.parse(ls.store.get(KEY)!)).toEqual(["notes"]);
    expect(get(prefs.hiddenFaces)).toEqual(["notes"]);
    // ADR-0031 §2: a writer touches only what it owns.
    expect(ls.store.get("inventoria_pref_round_nutrition")).toBe("false");
  });
});

describe("what the shells draw once a face is hidden", () => {
  it(
    "takes the tile off the root's landing grid, which is the switcher",
    async () => {
      // §9 makes the landing screen the grid itself, so this is the switcher and
      // not a second drawing of it — one filtered list feeds both hosts.
      const names = tileNames(await landingWith(["media", "notes"]));
      expect(names).toEqual(
        FACES.filter((f) => f.id !== "media" && f.id !== "notes").map(
          (f) => f.name
        )
      );
    },
    FIRST_BOOT_MS
  );

  it("leaves the screens standing, so a link or a shared meal still lands", async () => {
    // The whole of §10's promise, and the reason `shownFaces` is called where the
    // grid is drawn rather than where a face is chosen: hiding is a drawing and
    // never a reach. A share-target arrival opens Items with Items hidden.
    const shell = readCode("src/App.svelte");
    expect(shell).toMatch(/shownFaces\(facesOf\(facet\), \$hiddenFaces\)/);
    expect(shell).toMatch(/<FaceGrid \{faces\}/);
    // The ladder below it is keyed on `face`, which the filter never touches.
    expect(shell).toMatch(/\{#if face === "items"\}/);
    expect(readCode("src/Rations.svelte")).toMatch(
      /shownFaces\(facesOf\(facet\), \$hiddenFaces\)/
    );
  });

  it(
    "hides Settings from nobody, in the shell as well as in the rule",
    async () => {
      const names = tileNames(await landingWith([UNHIDEABLE_FACE]));
      // Off the roster rather than typed, so a rename cannot make this vacuous.
      expect(names).toContain(faceOf(UNHIDEABLE_FACE).name);
    },
    FIRST_BOOT_MS
  );
});

describe("the install offer is enumerated, not gated (ADR-0078 §3)", () => {
  it("offers the Facets nested inside this one and no others", () => {
    // What `JarSettings` iterates, and the whole reason it needs no rule written
    // down against `root`: only a Facet containing another can link to it without
    // leaving its own scope. So the root offers Rations, Rations offers nothing,
    // and Rations' sheet drawn inside the root offers nothing either — because
    // the offer is read off the *surface's* Facet, which is food there.
    expect(nestedFacetsOf("root").map((f) => f.id)).toEqual(["food"]);
    expect(nestedFacetsOf("food")).toEqual([]);
    const jar = readCode("src/lib/views/settings/JarSettings.svelte");
    expect(jar).toMatch(
      /\{#each nestedFacetsOf\(facetId\) as facet \(facet\.id\)\}\s*<FacetExit \{facet\} \/>/
    );
    // And it is off the Rations face, which is what §10 moved: an offer of a
    // rival copy of itself, made from inside the face that copy is of.
    expect(readCode("src/App.svelte")).not.toContain("FacetExit");
  });
});
