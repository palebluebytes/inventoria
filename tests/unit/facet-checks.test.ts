import { describe, it, expect } from "vitest";
import { facetOf, precacheBandOf } from "../../src/lib/facets/registry";
import {
  checkPrecacheBand,
  checkViewContainment,
  checkOutdatedCacheCleanup,
  checkShareTargets,
} from "../../src/lib/facets/checks";
import type { FacetBundle, FacetPrecache } from "../../src/lib/facets/precache";

// #309. The four claims `pnpm check:facets` carries, checked where they can be
// handed a build that does not exist. The script around them does the reading;
// everything that can be wrong *silently* is here, because a gate whose rule is
// wrong reports success over the thing it exists to catch — which is ADR-0083's
// whole subject.

const ROOT = facetOf("root");
const FOOD = facetOf("food");

const precache = (over: Partial<FacetPrecache>): FacetPrecache => ({
  facet: "root",
  urls: [],
  count: 0,
  bytes: 0,
  ...over,
});

const bundle = (over: Partial<FacetBundle>): FacetBundle => ({
  facet: "root",
  entry: "index.html",
  entryChunk: "assets/root-abc.js",
  files: [],
  modules: [],
  bytes: 0,
  ...over,
});

describe("the precache band (ADR-0083 §3)", () => {
  it("passes a build sitting on its measured weight", () => {
    const claim = checkPrecacheBand(
      ROOT,
      precache({ facet: "root", bytes: ROOT.precacheBytes })
    );
    expect(claim.ok).toBe(true);
  });

  it("fails a manifest that has re-inflated", () => {
    const claim = checkPrecacheBand(
      ROOT,
      precache({ facet: "root", bytes: ROOT.precacheBytes + 4_000_000 })
    );
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("above");
    // Every failure names the Facet it is about, never "the app" (ADR-0083 §1).
    expect(claim.message).toContain("Inventoria");
  });

  it("fails a manifest that has collapsed, which a ceiling would pass", () => {
    // The half a ceiling cannot see. A Facet whose derived manifest failed open
    // installs, boots, and then finds no food — `usda/nutrient-store.json` is
    // read seconds after mount(), so the offline gate is looking the other way.
    const claim = checkPrecacheBand(
      FOOD,
      precache({ facet: "food", bytes: 4_000_000 })
    );
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("below");
    expect(claim.message).toContain("Rations");
  });

  it("passes movement inside the band and fails just outside it", () => {
    const { floor, ceiling } = precacheBandOf(FOOD);
    expect(
      checkPrecacheBand(FOOD, precache({ facet: "food", bytes: floor })).ok
    ).toBe(true);
    expect(
      checkPrecacheBand(FOOD, precache({ facet: "food", bytes: ceiling })).ok
    ).toBe(true);
    expect(
      checkPrecacheBand(FOOD, precache({ facet: "food", bytes: floor - 1 })).ok
    ).toBe(false);
    expect(
      checkPrecacheBand(FOOD, precache({ facet: "food", bytes: ceiling + 1 }))
        .ok
    ).toBe(false);
  });

  it("fails a Facet the build recorded no precache for", () => {
    // Not a pass by default. A Facet missing from the artifact is a build that
    // dropped an app, which is the failure the band exists downstream of.
    const claim = checkPrecacheBand(FOOD, undefined);
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("Rations");
  });
});

describe("view containment (ADR-0078 §8, ADR-0083 §5)", () => {
  it("passes a Facet reaching exactly its domains' screens", () => {
    const claim = checkViewContainment(
      FOOD,
      bundle({
        facet: "food",
        modules: [
          "src/food-main.ts",
          "src/lib/views/FoodView.svelte",
          "src/lib/views/food/FoodStager.svelte",
        ],
      })
    );
    expect(claim.ok).toBe(true);
  });

  it("fails a crossing, which is the day someone imports ItemsView", () => {
    const claim = checkViewContainment(
      FOOD,
      bundle({
        facet: "food",
        modules: [
          "src/lib/views/FoodView.svelte",
          "src/lib/views/ItemsView.svelte",
        ],
      })
    );
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("src/lib/views/ItemsView.svelte");
    // Named with the domain that owns it, so the reader is told whose screen it
    // is rather than left to work it out from the path.
    expect(claim.message).toContain("Physical items");
  });

  it("fails a crossing one file below a screen", () => {
    // The failure a population of screens alone passes. Six screens are six of
    // the ninety modules under `src/lib/views/`, and `ItemCard` inside a food
    // component is the same crossing as `ItemsView` inside the shell.
    const claim = checkViewContainment(
      FOOD,
      bundle({
        facet: "food",
        modules: [
          "src/lib/views/FoodView.svelte",
          "src/lib/views/items/ItemCard.svelte",
        ],
      })
    );
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("src/lib/views/items/ItemCard.svelte");
  });

  it("takes a screen's own components as the domain's", () => {
    const claim = checkViewContainment(
      FOOD,
      bundle({
        facet: "food",
        modules: [
          "src/lib/views/FoodView.svelte",
          "src/lib/views/food/FoodStager.svelte",
          "src/lib/views/food/panels/DayPanel.svelte",
        ],
      })
    );
    expect(claim.ok).toBe(true);
  });

  it("fails a missing screen, which equality is for", () => {
    // A subset check passes this. A Rations build whose food screen tree-shook
    // away is caught by nothing else in the roster and ships as an installed app
    // that opens on nothing.
    const claim = checkViewContainment(
      FOOD,
      bundle({ facet: "food", modules: ["src/food-main.ts"] })
    );
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("src/lib/views/FoodView.svelte");
  });

  it("counts what no domain owns rather than passing it in silence", () => {
    // `SettingsView` and the ledger, log and storage blocks under it are the
    // jar-wide surface, and which Facet should carry one is the judgement
    // ADR-0083 §10 declined to gate. So they are not crossings — and the number
    // of them goes in the message, where the size of the gap is visible.
    const claim = checkViewContainment(
      FOOD,
      bundle({
        facet: "food",
        modules: [
          "src/lib/views/FoodView.svelte",
          "src/lib/views/SettingsView.svelte",
          "src/lib/views/ledger/LedgerPage.svelte",
        ],
      })
    );
    expect(claim.ok).toBe(true);
    expect(claim.message).toContain("2 jar-wide, unjudged");
  });

  it("takes two domains sharing one screen as one screen", () => {
    // Habits and calendar events both draw through AgendaView, so the root's
    // six domains imply five screens and an expected set built by counting
    // would never be satisfiable. Only habits owns `views/habits/`: a shared
    // directory would be two owners for one path.
    const claim = checkViewContainment(
      ROOT,
      bundle({
        facet: "root",
        modules: [
          "src/lib/views/AgendaView.svelte",
          "src/lib/views/FoodView.svelte",
          "src/lib/views/ItemsView.svelte",
          "src/lib/views/MediaView.svelte",
          "src/lib/views/NotesView.svelte",
        ],
      })
    );
    expect(claim.ok).toBe(true);
  });

  it("fails a Facet the build recorded no bundle for", () => {
    expect(checkViewContainment(ROOT, undefined).ok).toBe(false);
  });
});

describe("the outdated-cache cleanup (ADR-0083 §7)", () => {
  const WITH =
    "s.precacheAndRoute([]),s.cleanupOutdatedCaches(),s.registerRoute";
  const WITHOUT = "s.precacheAndRoute([]),s.registerRoute";

  it("fails the root when the cleanup is on", () => {
    // The one-word config edit that deletes the entire Rations offline install
    // on every root activation, and the only claim in the roster a dependency
    // upgrade can break with no source change.
    const claim = checkOutdatedCacheCleanup(ROOT, WITH);
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("Inventoria");
  });

  it("passes the root when it is off", () => {
    expect(checkOutdatedCacheCleanup(ROOT, WITHOUT).ok).toBe(true);
  });

  it("fails Rations when the cleanup is off", () => {
    // Not a mirror of the root's clause but the same rule read the other way:
    // nothing nests inside `/food/`, so its scope is a substring of no other
    // cache name and it deletes nothing but its own stale precache.
    const claim = checkOutdatedCacheCleanup(FOOD, WITHOUT);
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("Rations");
  });

  it("passes Rations when it is on", () => {
    expect(checkOutdatedCacheCleanup(FOOD, WITH).ok).toBe(true);
  });
});

describe("at most one share target (ADR-0084 §8)", () => {
  const target = { action: "/", method: "GET" };

  it("passes the roster as it stands: the root declares it and Rations does not", () => {
    const claim = checkShareTargets([
      { facet: ROOT, manifest: { share_target: target } },
      { facet: FOOD, manifest: {} },
    ]);
    expect(claim.ok).toBe(true);
  });

  it("passes a roster where nobody declares one", () => {
    // At most one, not exactly one. Who owns the hand-off is ADR-0084 §1's
    // argument; a gate asserting the root keeps it would re-record that
    // conclusion, which is the registry field §8 refused.
    const claim = checkShareTargets([
      { facet: ROOT, manifest: {} },
      { facet: FOOD, manifest: {} },
    ]);
    expect(claim.ok).toBe(true);
  });

  it("fails a second Facet acquiring one by copying a manifest", () => {
    const claim = checkShareTargets([
      { facet: ROOT, manifest: { share_target: target } },
      { facet: FOOD, manifest: { share_target: target } },
    ]);
    expect(claim.ok).toBe(false);
    expect(claim.message).toContain("Inventoria");
    expect(claim.message).toContain("Rations");
  });
});
