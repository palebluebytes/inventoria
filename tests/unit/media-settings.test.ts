import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Media settings (#303): the affordance ADR-0080 §4 commissioned when it put a
 * setting beside the thing it configures rather than with its Facet. The TMDB
 * key is a user credential for a user feature, and `MediaView` had nowhere to
 * put one.
 *
 * The sheet itself cannot be rendered here — `BottomSheet` sits on a bits-ui
 * dialog, which portals and emits nothing through Svelte's SSR path — so these
 * claims are structural, made against the source the way `rations-settings.test.ts`
 * makes ADR-0080 §7's. They are deliberately loose about spelling, because what
 * they pin is which module a value comes from and not how a line is formatted;
 * the behavioural half is in CI, where `settings-ui.spec.ts` opens the gear and
 * works the field.
 */

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SHEET = source("src/lib/views/media/MediaSettingsSheet.svelte");
const VIEW = source("src/lib/views/MediaView.svelte");
const SETTINGS = source("src/lib/views/SettingsView.svelte");

describe("the surface the Media gear opens (ADR-0080 §4)", () => {
  it("is opened by a gear on the Media header", () => {
    expect(VIEW).toMatch(/aria-label="Media settings"/);
    expect(VIEW).toMatch(/<MediaSettingsSheet/);
  });

  it("is qualified rather than a second screen called Settings", () => {
    // ADR-0076 §5 bans a second Settings. Unlike _Rations settings_ the word is
    // written rather than read off the registry: that derivation exists to stop
    // a Facet's install name drifting from its settings title, and Media is a
    // Tracked Domain, so it installs under no name to drift from.
    expect(SHEET).toMatch(/<BottomSheet[^>]*title="Media settings"/);
  });

  it("carries the TMDB key, keyed and labelled as the field it replaces", () => {
    expect(SHEET).toMatch(/id="tmdb-api-key"/);
    expect(SHEET).toMatch(/setSecret\("tmdb_api_key"/);
  });

  it("persists on blur rather than behind a Save button", () => {
    // The food sheet's shape: every field persists the moment it is left, so
    // the surface is dismissed rather than submitted. A Save button here would
    // be the only one in the app that a swipe could lose.
    expect(SHEET).toMatch(/onblur=\{persistTmdbKey\}/);
    expect(SHEET).not.toMatch(/type="submit"/);
  });
});

describe("what the root Settings screen gave up (ADR-0080 §2)", () => {
  // The screen's own prose still names both, which is the point of a comment,
  // so these read the surface — the fields and the heading over them — rather
  // than the file.

  it("no longer carries the TMDB key field", () => {
    expect(SETTINGS).not.toMatch(/id="tmdb-api-key"/);
    expect(SETTINGS).not.toMatch(/setSecret\(/);
  });

  it("no longer carries the scraper proxy field", () => {
    // §4: it is deleted rather than moved. `device-settings.ts` has carried a
    // working default since ADR-0070, so the field overrode a default that
    // already works, for a reader who does not exist.
    expect(SETTINGS).not.toMatch(/id="scraper-proxy-url"/);
    expect(SETTINGS).not.toMatch(/setScraperProxyUrl/);
  });

  it("has no API Credentials card left to hold either of them", () => {
    // §2: the card dissolves, because nothing is left in it — and with it the
    // screen's only form, its Save button and its saved badge.
    expect(SETTINGS).not.toMatch(/<h2>API Credentials<\/h2>/);
    expect(SETTINGS).not.toMatch(/type="submit"/);
    expect(SETTINGS).not.toMatch(/saved-badge/);
  });
});
