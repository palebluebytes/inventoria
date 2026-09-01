/**
 * The root's way in to Rations (ADR-0078 §4): a labelled link that opens a
 * browser tab, and not an install button.
 *
 * Both halves of that are decisions rather than styling. `beforeinstallprompt`
 * fires for the **current document's** manifest, so a button here could not
 * install `/food/` however it was written — the user has to be standing on a
 * `/food/` document. And a navigation in place would land them inside a Facet
 * ADR-0078 §1 guarantees has no door back, which is why the tab is the point
 * and the label saying so is the rest of it.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import FacetExit from "../../src/lib/layout/FacetExit.svelte";
import { facetOf } from "../../src/lib/facets/registry";

const door = (id: "root" | "food") =>
  render(FacetExit, { props: { facet: facetOf(id) } }).body;

describe("the door the root offers Rations through", () => {
  it("opens the Facet's own start URL in a tab of its own", () => {
    const body = door("food");
    expect(body).toContain(`href="${facetOf("food").startUrl}"`);
    expect(body).toContain('target="_blank"');
    // Without this the opened tab gets a handle on the opener, which is a
    // window into the app the link exists to leave.
    expect(body).toContain('rel="noopener"');
  });

  it("says where the tap goes, because a disguised exit is the trap", () => {
    const body = door("food");
    expect(body).toContain("Open Rations");
    expect(body).toMatch(/opens in a browser tab/i);
  });

  it("offers no install, because this document cannot make one", () => {
    expect(door("food")).not.toContain("<button");
  });

  it("takes every word off the roster, so it cannot advertise a stale name", () => {
    // A second Facet would be offered by the same component with none of its
    // words rewritten. The one sentence that is not the Facet's own is the
    // label above.
    const body = door("root");
    const root = facetOf("root");
    expect(body).toContain(`Open ${root.name}`);
    expect(body).toContain(root.description);
  });
});
