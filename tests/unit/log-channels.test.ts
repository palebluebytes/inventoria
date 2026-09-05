import { describe, it, expect } from "vitest";
import { freshModule, stubLocalStorage } from "./support/local-storage";
import { readCode } from "./support/source";
import { sourceFilesUnder } from "./support/importers";

/**
 * The Log channel roster (#221): `src/lib/logs/channels.ts`, the one module that
 * knows which channels exist.
 *
 * A channel is declared and registered in the same act, so `registeredChannels()`
 * only ever returns channels whose module something happened to import. Until
 * this roster existed that something was a view, which made two things true and
 * neither of them intended: a channel whose only importer was deleted vanished
 * from the Settings list, the review sheet and therefore the export — with
 * nothing failing — while its records stayed on disk, unreachable and
 * unredactable; and the order channels appear in an exported file was import
 * order rather than anything anyone declared.
 *
 * So the claims below are about the roster and not about any one channel: that
 * importing it alone fills the registry, that the order a surface sees is the
 * one the roster states, and that the roster is not something a new channel can
 * be added without.
 *
 * The structural claims read source with its **comments taken out**
 * (`support/source.ts`), which matters more here than in most suites: this
 * feature's modules discuss their own imports at length, and a claim a doc
 * comment can satisfy is a claim that survives deleting the code it is about.
 */

const ROSTER = "src/lib/logs/channels.ts";

/**
 * The roster imported into an empty registry, with the facility read out of the
 * same module graph.
 *
 * `freshModule` resets first, so the second import resolves to the instance the
 * roster just registered into rather than to a copy some earlier suite filled.
 * **Nothing else is imported**, which is the whole of the second claim: no view,
 * no channel module by name.
 */
async function loadRoster() {
  stubLocalStorage();
  const roster = await freshModule(() => import("../../src/lib/logs/channels"));
  const facility = await import("../../src/lib/logs/log-facility");
  return { roster, facility };
}

describe("the roster registers every channel by itself", () => {
  it("fills the registry with no view and no channel module imported", async () => {
    const { facility } = await loadRoster();

    // Named and counted against a literal, not against the roster's own array:
    // two lists derived from one file agree with each other however wrong both
    // are, and `toEqual` between two empty lists passes for a roster that
    // imports nothing at all. Adding a channel is meant to edit this line.
    expect(facility.registeredChannels().map((c) => c.name)).toEqual([
      "search",
      "scan",
    ]);
  });

  it("registers them in the roster's declared order", async () => {
    const { roster, facility } = await loadRoster();

    // Count and order in one assertion, because they are one property: the
    // registry is a Map filled by module evaluation, and evaluation follows the
    // roster's import statements. Reordering the array without reordering those
    // imports is what this catches — and until it fires, it is what lets
    // `registeredChannels()` be read as the roster's order.
    expect(facility.registeredChannels().map((c) => c.name)).toEqual(
      roster.LOG_CHANNELS.map((c) => c.name)
    );
  });

  it("re-exports each channel it registers", async () => {
    const { roster, facility } = await loadRoster();

    // The roster is a door, not just a side effect: every channel it puts in
    // the registry is reachable through it as a named export. Identity rather
    // than name, because a second object with the same name would be a second
    // channel and not a re-export of this one.
    const exported: unknown[] = Object.values(roster);
    for (const channel of facility.registeredChannels())
      expect(exported).toContain(channel);
  });
});

describe("what a Facet's surfaces are handed", () => {
  it("puts the roster's channels in the roster's order", async () => {
    const { roster } = await loadRoster();

    expect(roster.channelsOfFacet("food")).toEqual(
      roster.LOG_CHANNELS.filter(
        (c) => c.domain === "food" || c.domain === null
      )
    );
  });

  it("still shows a registered channel the roster does not name, last", async () => {
    const { roster, facility } = await loadRoster();
    // A channel in the registry is a channel writing records. Ordering it last
    // is a presentation choice; hiding it would be the #221 defect again, since
    // a surface that cannot show a channel cannot redact it either.
    const stray = facility.defineChannel({
      name: "stray",
      domain: "food",
      purpose: "this test; it decides whether the roster gates membership.",
      cap: 3,
      version: 1,
      parse: (raw: unknown) => raw as null,
    });

    const shown = roster.channelsOfFacet("food");
    expect(shown).toContain(stray);
    expect(shown[shown.length - 1]).toBe(stray);
  });
});

describe("the roster is the only place that knows the roster", () => {
  it("imports every module that declares a channel", () => {
    const source = readCode(ROSTER);
    const declaring = sourceFilesUnder("src")
      // `log-facility.ts` is where `defineChannel` is written, not where one is
      // called; the roster itself would be a cycle. Every other file in `src/`
      // is fair game, because ADR-0071's scan channel is the next one and its
      // module need not live beside this one.
      .filter((path) => path !== "src/lib/logs/log-facility.ts")
      .filter((path) => path !== ROSTER)
      .filter((path) => /\bdefineChannel\(/.test(readCode(path)));

    expect(declaring.length).toBeGreaterThan(0);
    for (const path of declaring) {
      const module = path.replace(/^.*\//, "").replace(/\.ts$/, "");
      expect(source).toContain(`/${module}"`);
    }
  });

  it("is how a surface reaches a registry-derived list", () => {
    // `channelsOfFacet` and `registeredChannels` both read the registry, so a
    // caller outside the facility that takes either straight from
    // `log-facility.ts` is a caller whose answer depends on what some other
    // module happened to import. The roster exports the one a surface needs;
    // this is what keeps the other door shut.
    const offenders = sourceFilesUnder("src")
      .filter((path) => !path.startsWith("src/lib/logs/"))
      .filter((path) => reachesFacilityRegistry(readCode(path)));

    expect(offenders).toEqual([]);
  });
});

/**
 * Does this file take a registry-derived list straight from the facility?
 *
 * Both ways in are read, because they are one hazard: the named bindings an
 * `import { … }` brings in, and the member access behind an `import * as`. Read
 * off the import statement rather than off the file's text — the surfaces
 * discuss `channelsOfFacet` in prose and still import other things from the
 * facility, which is fine and is not what this is about.
 */
function reachesFacilityRegistry(source: string): boolean {
  const FACILITY = String.raw`"[^"]*logs/log-facility"`;
  const REGISTRY = /^(channelsOfFacet|registeredChannels)$/;

  const named = [
    ...source.matchAll(
      new RegExp(
        String.raw`import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*${FACILITY}`,
        "g"
      )
    ),
  ].flatMap((match) =>
    match[1].split(",").map(
      (binding) =>
        binding
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
    )
  );
  if (named.some((name) => REGISTRY.test(name))) return true;

  const namespaced = [
    ...source.matchAll(
      new RegExp(String.raw`import\s*\*\s*as\s+(\w+)\s*from\s*${FACILITY}`, "g")
    ),
  ].map((match) => match[1]);
  return namespaced.some((alias) =>
    new RegExp(
      String.raw`\b${alias}\.(channelsOfFacet|registeredChannels)\b`
    ).test(source)
  );
}
