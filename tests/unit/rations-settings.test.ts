import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "svelte/server";
import LogSettingsSection from "../../src/lib/views/logs/LogSettingsSection.svelte";
import { facetOf } from "../../src/lib/facets/registry";

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

const SHEET = readFileSync(
  new URL("../../src/lib/views/food/FoodSettingsSheet.svelte", import.meta.url),
  "utf8"
);

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

  it("keeps the #142 readout on the root and out of Rations", () => {
    // §2 gives that row to the root and nothing to Rations, and §6 deletes it
    // outright (#303). A verdict about a corpus decision is a maintainer
    // reading a ticket over the user's shoulder.
    const rations = render(LogSettingsSection, { props: { facetId: "food" } });
    const root = render(LogSettingsSection, { props: { facetId: "root" } });
    const heading = "What the search log says about #142";
    expect(root.body).toContain(heading);
    expect(rations.body).not.toContain(heading);
    // The channel's own `reader` names #142 too, and that stays in both: it is
    // what the channel is for, not a readout of where the question stands.
    expect(rations.body).toContain("#142 and #123;");
  });
});
