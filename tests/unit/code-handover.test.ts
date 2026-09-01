/**
 * A Safari tab on iOS shows the code and says where to put it (ADR-0082 §2),
 * and the boot-order change that lets it (§8).
 *
 * **A stubbed `navigator` proves the branch and not the platform.** ADR-0074 §9
 * flagged the same hole about the asset router, and ADR-0082's Consequences
 * split the roster explicitly. What is held here: the handover page renders in
 * place of the app, `dbClient.init` is never called, and the URL is cleaned.
 * What only a device can hold — that a real web clip reports
 * `navigator.standalone === true` — is
 * [#287](https://github.com/palebluebytes/inventoria/issues/287).
 *
 * `tests/receive-link.spec.ts` carries the browser half: the persistence
 * request and the socket both live in an `onMount` the SSR path never runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "svelte/server";
import App from "../../src/App.svelte";
import { facetOf } from "../../src/lib/facets/registry";
import CodeHandover from "../../src/lib/views/food/CodeHandover.svelte";
import {
  mintSendCode,
  sendCodeLink,
  type SendCode,
} from "../../src/lib/p2p/send-code";

const ORIGIN = "https://inventoria.example";

/**
 * The one call ADR-0082 §8 is about. It is stubbed rather than spied on because
 * the real one creates a Worker and opens OPFS, neither of which exists here —
 * and because "was it called" is the whole assertion.
 */
const init = vi.fn((path: string) => Promise.resolve(path));
vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    init: (path: string) => init(path),
    query: () => Promise.resolve([]),
    append: () => Promise.resolve(),
    subscribe: () => () => {},
  },
}));

describe("the page a Safari tab on iOS shows instead of the meal", () => {
  /**
   * The page as it renders for one code, handed over by an iOS Safari tab.
   *
   * The `&` between the code's two halves comes back escaped, which is the
   * markup being correct rather than the link being different; it is undone
   * here so the assertions can name the link the person is looking at.
   */
  function page(code: SendCode): string {
    const { body } = render(CodeHandover, {
      props: { opening: { kind: "code", code }, origin: ORIGIN },
    });
    return body.replace(/&amp;/g, "&");
  }

  it("shows the code, as the whole link the field on the other end takes", () => {
    const code = mintSendCode();

    // Not the bare fragment: ADR-0082 §12 puts the bar on the code's content,
    // and `readSendCode` refuses anything that is not a URL carrying both
    // halves with an exactly-32-byte key.
    expect(page(code)).toContain(sendCodeLink(code, ORIGIN));
  });

  it("offers a control that copies it", () => {
    expect(page(mintSendCode())).toContain("Copy the code");
  });

  it("says both sentences, to a reader it has not identified", () => {
    const shown = page(mintSendCode());

    // §5: one wording, no branch, no question. The second sentence is for
    // somebody who may not exist, which is why it costs nothing when it is
    // unnecessary — the page cannot tell, and nothing will ever let it.
    const said = shown.replace(/\s+/g, " ");
    expect(said).toContain("Open Inventoria and paste this into Scan.");
    expect(said).toContain(
      "If you have not installed it yet, add it to the Home Screen first and come back."
    );
  });

  it("offers no export beside the working path, and no countdown", () => {
    const shown = page(mintSendCode());

    // §11.8: a second route offered beside a working one reads as doubt about
    // the first. §11.12: the code carries a room and a key and no timestamp, so
    // a timer here would be inventing a figure.
    expect(shown.toLowerCase()).not.toContain("export");
    expect(shown).not.toMatch(/\bminutes?\b/);
  });

  it("refuses a damaged code where it was read, with the cause behind a disclosure", () => {
    const { body } = render(CodeHandover, {
      props: {
        opening: { kind: "broken", reason: "this code's key is 3 bytes." },
        origin: ORIGIN,
      },
    });

    // ADR-0074 §6's shape, unchanged: one line, cause behind a "show why". A
    // truncated link is refused here rather than after somebody has carried it
    // into another app.
    expect(body).toContain("This code is damaged.");
    expect(body).toContain("Show why");
    expect(body).not.toContain("Copy the code");
  });
});

describe("the boot order the handover needs (ADR-0082 §8)", () => {
  /**
   * Boots the app on `href` under a stubbed `navigator`, and reports what the
   * shell did about the ledger and the address bar.
   *
   * **A render that throws is caught and the counts are still read**, because
   * everything under test here happens at component initialisation, before the
   * first element: `dbClient.init` on one branch and `takeCodeHandover` on the
   * other. The app's *ordinary* shell mounts views that subscribe to ledger
   * stores, and there is no ledger here for them to read — which is the same
   * fact ADR-0082 §8 leans on from the other side, that the handover page is
   * safe to skip `init` for precisely because it mounts none of them.
   */
  function boot(
    href: string,
    navigator: Record<string, unknown>
  ): { body: string; inits: number; cleaned: string[] } {
    const cleaned: string[] = [];
    const url = new URL(href);
    const location = {
      href,
      origin: url.origin,
      search: url.search,
      hash: url.hash,
    };
    vi.stubGlobal("window", {
      navigator,
      location,
      history: {
        replaceState: (_s: unknown, _t: string, u: string) => cleaned.push(u),
      },
    });

    let body = "";
    try {
      body = render(App, { props: { facet: facetOf("root") } }).body;
    } catch {
      // See above: the shell wanted a store this test has no ledger for, and
      // the branch had already been taken by then.
    }
    return { body, inits: init.mock.calls.length, cleaned };
  }

  const IOS_TAB = { platform: "iPhone", maxTouchPoints: 5, standalone: false };
  const IOS_INSTALLED = {
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: true,
  };

  beforeEach(() => {
    init.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens no database at all when it is handing the code over", () => {
    // > The page must not ask the browser to durably keep a jar it is in the
    // > middle of telling you is not yours.
    //
    // `dbClient.init` runs synchronously at component initialisation, ahead of
    // every `onMount`, so the gate has to sit above it. Both of §6's tests are
    // synchronous property reads, which is what makes that affordable.
    expect(boot(sendCodeLink(mintSendCode(), ORIGIN), IOS_TAB).inits).toBe(0);
  });

  it("renders the handover page in place of the app's own shell", () => {
    const { body } = boot(sendCodeLink(mintSendCode(), ORIGIN), IOS_TAB);

    // No Sidebar and no views — skipping `init` is only safe while nothing
    // here subscribes to a ledger store. The Receiving surface in particular
    // is absent, which is what "it joins no room" comes to on this page: the
    // socket is opened by that surface and by nothing else.
    expect(body).toContain('data-testid="code-handover"');
    expect(body).not.toContain('data-testid="received-meal"');
    expect(body).not.toContain('class="app"');
  });

  it("cleans the URL, on the rule rather than on a branch in it", () => {
    const { cleaned } = boot(sendCodeLink(mintSendCode(), ORIGIN), IOS_TAB);

    expect(cleaned).toEqual(["/"]);
  });

  it("opens the database inside the installed copy, which can open the meal", () => {
    expect(
      boot(sendCodeLink(mintSendCode(), ORIGIN), IOS_INSTALLED).inits
    ).toBe(1);
  });

  it("opens the database on an ordinary iOS Safari load carrying no code", () => {
    // The gate is a receive link *and* the platform, never the platform alone:
    // an iPhone browsing the site is an ordinary boot, and skipping `init`
    // there would take the whole app down on one device.
    expect(boot(`${ORIGIN}/`, IOS_TAB).inits).toBe(1);
  });

  it("opens the database off iOS, which never takes this path at all", () => {
    // Android and desktop are untouched: a WebAPK launches the host browser
    // against the same profile and the same jar, so there is no wrong-jar case
    // there and a handover would be an obstacle built for nothing.
    expect(
      boot(sendCodeLink(mintSendCode(), ORIGIN), {
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }).inits
    ).toBe(1);
  });
});
