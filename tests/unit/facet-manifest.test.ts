import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FACETS, facetOf } from "../../src/lib/facets/registry";
import {
  facetForPath,
  manifestFor,
  manifestUrlOf,
  withOwnManifestLink,
} from "../../src/lib/facets/manifest";

// #305. Why the manifest is hand-written rather than plugin-generated is in
// `src/lib/facets/manifest.ts`; what it has to *say* is here, because a manifest
// is only read by a browser at install time and nothing else in the gate roster
// opens one.

describe("what a Facet's manifest says (ADR-0076 §1)", () => {
  it("reads Rations' identity off the registry rather than repeating it", () => {
    const rations = facetOf("food");
    const manifest = manifestFor(rations);
    expect({
      name: manifest.name,
      short_name: manifest.short_name,
      scope: manifest.scope,
      start_url: manifest.start_url,
    }).toEqual({
      name: "Rations",
      short_name: "Rations",
      scope: "/food/",
      start_url: "/food/",
    });
  });

  it("pins `id`, so a later `start_url` cannot rename the installed app", () => {
    // The manifest spec defaults `id` to `start_url` and treats a differing
    // identity as a *distinct application*. Two Facets already differ, so two
    // apps is the default outcome; `id` is what holds that still when a
    // `start_url` moves.
    for (const facet of FACETS) {
      expect([facet.id, manifestFor(facet).id]).toEqual([
        facet.id,
        facet.startUrl,
      ]);
    }
  });

  it("installs every Facet standalone, which is what makes it a Facet", () => {
    for (const facet of FACETS) {
      expect([facet.id, manifestFor(facet).display]).toEqual([
        facet.id,
        "standalone",
      ]);
    }
  });

  it("names icons that are files in the build, at their true sizes", () => {
    // The guard is not "is it set" but "is it there": a manifest naming an icon
    // that 404s installs an app with no mark and fails nothing at build time.
    for (const facet of FACETS) {
      expect([facet.id, manifestFor(facet).icons.length > 0]).toEqual([
        facet.id,
        true,
      ]);
      for (const icon of manifestFor(facet).icons) {
        const served = new URL(`../../public${icon.src}`, import.meta.url);
        expect({
          src: icon.src,
          served: existsSync(fileURLToPath(served)),
        }).toEqual({ src: icon.src, served: true });
      }
    }
  });

  it("keeps every icon inside the Facet's own scope", () => {
    // ADR-0077 §1 gives each Facet a service worker at its own scope, and a
    // service worker cannot precache a URL above itself. An icon outside the
    // scope is one the Facet whose whole record is precaching its own weight
    // would fetch over the network — see docs/icon-provenance.md.
    for (const facet of FACETS) {
      for (const icon of manifestFor(facet).icons) {
        expect([icon.src, icon.src.startsWith(facet.scope)]).toEqual([
          icon.src,
          true,
        ]);
      }
    }
  });

  it("gives Rations an Android crop of its own", () => {
    // docs/icon-provenance.md derives `rations-maskable-512.png` for exactly
    // this member; without it Android crops the `any` icon and takes the tin's
    // rim off with it.
    const purposes = manifestFor(facetOf("food")).icons.map((i) => i.purpose);
    expect(purposes).toContain("maskable");
  });

  it("serves each manifest from inside the scope it declares", () => {
    expect(manifestUrlOf(facetOf("root"))).toBe("/manifest.webmanifest");
    expect(manifestUrlOf(facetOf("food"))).toBe("/food/manifest.webmanifest");
  });
});

describe("which manifest a page carries (#305)", () => {
  it("answers a path with the deepest Facet that contains it", () => {
    // The same longest-prefix rule a service worker's scope follows, and for
    // the same reason: `/food/index.html` is inside both scopes and only one of
    // them is the page's own.
    expect(facetForPath("/index.html")?.id).toBe("root");
    expect(facetForPath("/food/index.html")?.id).toBe("food");
  });

  it("leaves exactly one manifest link, and it is the page's own", () => {
    // The whole point. `VitePWA` appends the root's link to *both* entries, and
    // the HTML spec reads only the first `rel="manifest"` in tree order — so a
    // second one is not a warning, it is the difference between installing
    // Rations and installing Inventoria under Rations' name.
    const injected =
      "<!doctype html><html><head><title>x</title>" +
      '<link rel="manifest" href="/manifest.webmanifest"></head><body></body></html>';
    const out = withOwnManifestLink(injected, facetOf("food"));
    expect(out.match(/rel="manifest"/g)).toHaveLength(1);
    expect(out).toContain('href="/food/manifest.webmanifest"');
    expect(out).not.toContain('href="/manifest.webmanifest"');
  });

  it("gives a page its link even when nothing injected one", () => {
    // Dev serves the entries without a build, so the transform cannot be a
    // rewrite of something it assumes is there.
    const bare = "<!doctype html><html><head></head><body></body></html>";
    const out = withOwnManifestLink(bare, facetOf("food"));
    expect(out.match(/rel="manifest"/g)).toHaveLength(1);
    expect(out).toContain('href="/food/manifest.webmanifest"');
  });

  it("leaves the root's page carrying the root's manifest", () => {
    const injected =
      "<!doctype html><html><head>" +
      '<link rel="manifest" href="/manifest.webmanifest"></head><body></body></html>';
    const out = withOwnManifestLink(injected, facetOf("root"));
    expect(out.match(/rel="manifest"/g)).toHaveLength(1);
    expect(out).toContain('href="/manifest.webmanifest"');
  });
});
