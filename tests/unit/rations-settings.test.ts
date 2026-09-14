import { describe, it, expect, vi } from "vitest";
import { render } from "svelte/server";
import LogSettingsSection from "../../src/lib/views/logs/LogSettingsSection.svelte";
import PairedDevicesSection from "../../src/lib/views/pairing/PairedDevicesSection.svelte";
import { facetOf } from "../../src/lib/facets/registry";
import { readCode, readSource } from "./support/source";
import { trackedSvelteFiles } from "./support/markup";
import { stubLocalStorage } from "./support/local-storage";

/**
 * Rations settings (#310): the food gear's one named, full-height surface, and
 * the Local Logs card it carries.
 *
 * The surface itself cannot be rendered here — `BottomSheet` sits on a bits-ui
 * dialog, which portals and emits nothing through Svelte's SSR path — so the
 * claims about the sheet are structural, made against its source the way
 * `log-facility.test.ts` makes ADR-0054 §5's. They are deliberately loose about
 * spelling, because what they pin is which module a value comes from and not how
 * a line is formatted, and the behavioural half is in CI: `rations-ui.spec.ts`
 * opens the gear and reads the heading. The card underneath renders, so its
 * split is asserted the ordinary way.
 */

const SHEET = readSource("src/lib/views/food/FoodSettingsSheet.svelte");

// Comments taken out below, so a sentence in a doc comment cannot satisfy a
// claim about markup. `SHEET` above keeps its own, because the claims on it are
// about a `<BottomSheet>` tag no comment could impersonate.
const DATA = readCode("src/lib/views/food/FoodDataSection.svelte");
const IMPORT = readCode("src/lib/views/ledger/LedgerImport.svelte");
const BADGE = readCode("src/lib/views/storage/PersistenceBadge.svelte");
const STORAGE = readCode("src/lib/views/storage/StorageStatus.svelte");

describe("the surface the food gear opens (ADR-0080 §7)", () => {
  it("takes its title from the registry rather than typing the name", () => {
    // §8: the registry supplies identity, so a second Facet gets its own title
    // without a second decision. A literal in the markup would be the one place
    // the name a home screen installs under and the name this title says could
    // drift, so the derivation and its use are both asserted.
    expect(SHEET).toMatch(/title = `\$\{facetOf\("food"\)\.name\} settings`/);
    expect(SHEET).toMatch(/<BottomSheet[^>]*\{title\}/);
  });

  it("names Rations, which is what that title reads", () => {
    expect(`${facetOf("food").name} settings`).toBe("Rations settings");
  });

  it("is pinned to its full height rather than sized to its content", () => {
    // The threshold ADR-0080 §7 crossed was not a count of blocks: it was a
    // destructive action and a run that reports progress for minutes, loose in
    // a container whose shape changes every time it opens.
    expect(SHEET).toMatch(/<BottomSheet[^>]*\bfillHeight\b/);
  });

  it("carries Rations' own Local Logs card, raised over the sheet", () => {
    // `elevated` is what puts the review this card opens above the settings
    // sheet rather than beside it on the same layer (`ui/BottomSheet.svelte`).
    expect(SHEET).toMatch(/<LogSettingsSection[^>]*facetId="food"/);
    expect(SHEET).toMatch(/<LogSettingsSection[^>]*\belevated\b/);
  });
});

describe("the Local Logs card, once per Facet (ADR-0080 §2)", () => {
  it("lists the channels the Facet's own domains write", () => {
    // There is exactly one registered channel in the app and it is food's, so
    // both Facets list it — the root because it holds every domain, Rations
    // because it holds the one that writes it.
    const rations = render(LogSettingsSection, { props: { facetId: "food" } });
    const root = render(LogSettingsSection, { props: { facetId: "root" } });
    expect(rations.body).toContain(">search<");
    expect(root.body).toContain(">search<");
  });

  it("carries the #142 readout on neither, the channel on both", () => {
    // §2 gave that row to the root and nothing to Rations; §6 then deleted it
    // outright (#303), because a verdict about a corpus decision is a
    // maintainer reading a ticket over the user's shoulder — and a permanent
    // readout of a question that has an ending is how the #41 comments went
    // stale.
    const rations = render(LogSettingsSection, { props: { facetId: "food" } });
    const root = render(LogSettingsSection, { props: { facetId: "root" } });
    const heading = "What the search log says about #142";
    expect(root.body).not.toContain(heading);
    expect(rations.body).not.toContain(heading);
    // The channel's own `reader` names #142 too, and that stays in both: it is
    // what the channel is for, not a readout of where the question stands. The
    // recording and the export are what §6 kept.
    expect(rations.body).toContain("#142 and #123;");
    expect(root.body).toContain("#142 and #123;");
  });
});

describe("the dial, and what no longer marks a channel (ADR-0092)", () => {
  it("draws one dial at three positions on both Facets' cards", () => {
    // §4's departure from every framework #264 surveyed: one dial, facility
    // wide, on a card that renders once per Facet. A Rations-only install has no
    // way out (ADR-0078), so its user has to be able to reach the control that
    // governs what their device records.
    const rations = render(LogSettingsSection, { props: { facetId: "food" } });
    const root = render(LogSettingsSection, { props: { facetId: "root" } });
    for (const { body } of [rations, root]) {
      expect(body).toContain("How much is recorded");
      expect(body).toContain("Errors &amp; warnings");
      expect(body).toContain(">Normal<");
      expect(body).toContain(">Noisy<");
    }
  });

  it("starts at Normal, and says what that position records", () => {
    const root = render(LogSettingsSection, { props: { facetId: "root" } });
    expect(root.body).toMatch(
      /data-value="9"[^>]*data-state="checked"|data-state="checked"[^>]*data-value="9"/
    );
    expect(root.body).toContain("Every session, and every error.");
    // Not an off switch: that is the per-channel pause, and the hint says so.
    expect(root.body).toContain("not an off switch");
  });

  it("marks no channel as sensitive, and puts nothing in the badge's place", () => {
    // §11 deleted `ChannelSensitivity` rather than replacing it. Any warning
    // badge is field classification wearing a different word, so the slot stays
    // empty in both views and the channel's prose is what says what it holds.
    const card = readCode("src/lib/views/logs/LogSettingsSection.svelte");
    const review = readCode("src/lib/views/logs/LogReviewSheet.svelte");
    for (const source of [card, review]) {
      expect(source).not.toMatch(/sensitivity|personal|technical/);
      expect(source).not.toContain("<Badge");
    }
  });
});

describe("the review shows the counters, not only the entries (ADR-0092 §9)", () => {
  // Structural, like the rest of the claims about this sheet: `BottomSheet`
  // portals and renders nothing through Svelte's SSR path.
  const REVIEW = readCode("src/lib/views/logs/LogReviewSheet.svelte");

  it("reads them from the facility, on the key the file is built from", () => {
    // The part a Delete does not reach, on the screen where Delete lives: a
    // review showing only entries would show less than what exists, on the one
    // surface whose whole job is to show what exists (#214 §10).
    expect(REVIEW).toContain("channelCounters");
    expect(REVIEW).toMatch(/countersByChannel/);
  });

  it("dates them, and never calls a total a lifetime (#214 §9)", () => {
    // A number without its epoch is a dishonest label, and after a Clear the
    // totals start again — so the sheet reads "since 5 September".
    expect(REVIEW).toMatch(/Counted since/);
    // `REVIEW` has its comments stripped, so the one place this file says the
    // forbidden word — explaining why — cannot satisfy the claim about markup.
    expect(REVIEW).not.toMatch(/lifetime/i);
  });
});

describe("the group is Your data, and the delete is still food's (#335)", () => {
  it("heads the group with the name ADR-0080 §7 gives it", () => {
    // "Your food data" was right while the block held only food-scoped
    // controls. Two of its four are jar-wide now, so the narrower heading would
    // be making the claim about the import that ADR-0080 §3 refuses.
    expect(DATA).toContain("<h2>Your data</h2>");
    expect(DATA).not.toContain("Your food data");
  });

  it("leaves the delete button saying what it deletes", () => {
    // ADR-0079 §5's wording, unaffected: the wipe is food's alone, whatever the
    // heading over it now covers.
    expect(DATA).toContain("Delete all my food data");
  });
});

describe("the import Rations carries is whole (ADR-0080 §3)", () => {
  it("is the control the root offers, not a food-scoped sibling of the export", () => {
    // The export beside it takes a `scope`; this must not. Narrowing an import
    // is undefined rather than awkward — filtering would destroy rows the user
    // is holding in their hand, and refusing would make a whole-Jar backup
    // unrestorable from the app that most needs restoring.
    const tag = DATA.slice(DATA.indexOf("<LedgerImport"));
    expect(tag.slice(0, tag.indexOf(">"))).not.toMatch(
      /scope|entityPrefixes|prefix|facet/i
    );
    // And the control itself filters nothing on ownership on its way to the
    // ledger: the file it reads is the file it writes.
    expect(IMPORT).not.toMatch(/entityPrefixes|LedgerExportScope|facetOf/);
  });

  it("is told whether the worker is up, all the way from the shell", () => {
    // The one control on this sheet that needs it. `FoodView` already has the
    // prop from both entry points, so nothing new reads a global to find out.
    expect(DATA).toMatch(/<LedgerImport[^>]*\{dbReady\}/);
    expect(SHEET).toMatch(/<FoodDataSection[^>]*\{dbReady\}/);
  });

  it("does not answer to the root's id, because both can be live at once", () => {
    // The root renders Settings under every tab and merely hides it, so its
    // import is in the DOM while the food gear's sheet is open. One id on two
    // elements is an ambiguous selector rather than a duplicate that shows.
    expect(DATA).toMatch(/<LedgerImport[^>]*id="food-import-ledger-btn"/);
    expect(IMPORT).toMatch(/id = "import-ledger-btn"/);
  });
});

describe("the persistence badge goes and the usage figure does not (ADR-0080 §2)", () => {
  it("draws the badge on Rations settings", () => {
    // Clause (a): the only place the app says data may be evicted.
    expect(DATA).toMatch(/<PersistenceBadge[^>]*persistence/);
    expect(BADGE).toContain("<h3>Storage</h3>");
  });

  it("draws no usage figure there, because it would report the root's bytes", () => {
    // `estimate()` is per-origin, so on a surface that shows nothing but food
    // it would attribute the bundled corpus and the root's own bytes to this
    // user's meals. Neither the badge nor the screen that mounts it may reach
    // the figure or the words for it.
    for (const shown of [DATA, BADGE]) {
      expect(shown).not.toMatch(/readStorageEstimate|describeBytes/);
    }
    // The root keeps both halves, which is what makes this a split rather than
    // a move.
    expect(STORAGE).toMatch(/readStorageEstimate/);
    expect(STORAGE).toMatch(/<PersistenceBadge/);
  });

  it("reads on mount rather than on a prop, because a sheet mounts when it opens", () => {
    // #290's `shown` exists because the root's Settings screen is rendered
    // under every tab and mounts once per page load. A bottom sheet is created
    // when the gear is pressed and destroyed when it is dismissed, so the prop
    // would be a constant `true` here.
    // The reading itself is `storage/persistent-storage.ts`'s, so both surfaces
    // take it in the same order: the memoised request, then the read.
    expect(DATA).toMatch(/refreshPersistenceState\(\)/);
    expect(DATA).not.toMatch(/\bshown\b/);
    expect(BADGE).not.toMatch(/\bshown\b/);
  });
});

describe("Rations carries the whole pairing surface (ADR-0103 §10)", () => {
  it("mounts it as the Facet its acts run in", () => {
    // §1: a pairing carries the domains of the Facet the pairing act ran in,
    // and the section is where that Facet is known. The literal is the whole of
    // what the surface needs, and it is never worked out from the URL
    // (ADR-0076 §6).
    expect(SHEET).toMatch(/<PairedDevicesSection[^>]*facetId="food"/);
  });

  it("reaches the root's module by reference, and is not a second copy", () => {
    // ADR-0095, and ADR-0078 §1 is what permits it: the rule binds *screens*,
    // and a shared component is not a crossing. A copy under the food tree is
    // exactly what that record exists to refuse, so the population is
    // discovered rather than named — a second file anywhere under `src/` fails
    // here whatever it is called.
    const copies = trackedSvelteFiles().filter((file) =>
      file.endsWith("/PairedDevicesSection.svelte")
    );
    expect(copies).toEqual([
      "src/lib/views/pairing/PairedDevicesSection.svelte",
    ]);
    expect(SHEET).toContain(
      'import PairedDevicesSection from "../pairing/PairedDevicesSection.svelte"'
    );
    expect(readSource("src/lib/views/SettingsView.svelte")).toContain(
      'import PairedDevicesSection from "./pairing/PairedDevicesSection.svelte"'
    );
  });

  it("renders the act, the list and both of §11's states under either Facet", async () => {
    // The states are not chrome: a pending revocation is the half that stops
    // the lanes and retries its withdrawal on a later open, and under ADR-0078
    // §7 Rations has no route to the root's copy of either.
    const jar = JSON.stringify([
      {
        device_id: "dev_b0c1d2e3f4",
        name: null,
        deposit: {
          direction: "a2b",
          state: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          index: 0,
        },
        collect: {
          direction: "b2a",
          state: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
          index: 0,
        },
        peer_vector: {},
        scope: ["food"],
        unproductive_wakes: 200,
      },
    ]);
    stubLocalStorage({ seed: { inventoria_paired_devices: jar } });
    try {
      // The store reads the jar when its module is first imported, so the
      // section is re-imported here — and `svelte/server` with it, because a
      // reset graph gives the component a different Svelte instance from the
      // one this file imported and rendering across the two leaves the SSR
      // context empty.
      vi.resetModules();
      const [{ render: renderFresh }, Section] = await Promise.all([
        import("svelte/server"),
        import("../../src/lib/views/pairing/PairedDevicesSection.svelte"),
      ]);
      for (const facetId of ["food", "root"] as const) {
        const { body } = renderFresh(Section.default, { props: { facetId } });
        expect(body).toContain("Show a code");
        expect(body).toContain("Read a code");
        expect(body).toContain("Rename");
        expect(body).toContain("Unpair");
        expect(body).toContain("Carries Food.");
        // §11's stopped-at-K state, which has to say so somewhere the user can
        // reach — and on Rations that is here or nowhere.
        expect(body).toContain("one-sided");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gives the two ways in a DOM id per copy, because both can be live at once", () => {
    // The root renders `SettingsView` under every tab and merely hides it, so
    // opening the food gear's sheet puts a second Paired devices card in the
    // same document. One id on two elements is an ambiguous selector rather
    // than a duplicate that shows — the rule `LedgerImport` already follows
    // (#335).
    const ids = (facetId: "food" | "root") =>
      [
        ...render(PairedDevicesSection, { props: { facetId } }).body.matchAll(
          /id="([^"]+)"/g
        ),
      ].map(([, id]) => id);

    const food = ids("food");
    const root = ids("root");
    expect(food.length).toBeGreaterThan(0);
    expect(food).toHaveLength(root.length);
    expect(food.filter((id) => root.includes(id))).toEqual([]);
    // The root keeps the unqualified spelling, because it is the copy every
    // selector already written names.
    expect(root).toContain("pair-show-btn");
    expect(root).toContain("pair-read-btn");
  });

  it("takes nobody anywhere, so the Facet still contains no way out", () => {
    // ADR-0078 §1: Rations gains a screen of its own and no link to the root's.
    const { body } = render(PairedDevicesSection, {
      props: { facetId: "food" },
    });
    expect(body).not.toContain("<a ");
  });
});
