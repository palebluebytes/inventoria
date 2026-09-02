/**
 * The root reads no receive link, and the reader is deleted rather than left
 * unreachable (ADR-0084 §5).
 *
 * A meal is `event:consume_*` and food twins, so the hand-off is Rations' — and
 * keeping a second reader at `/` would be one arrival with two doors, which is
 * the inverse of §2's rule about a hand-off with no owner. The link mints at
 * `/food/` and `tests/unit/code-handover.test.ts` drives the shell that reads
 * it.
 *
 * **A deletion is only provable from the outside**, which is why this boots the
 * root on a URL that would have opened both of the old readings and watches
 * what it does not do. A grep for the imports would pass a reader that had been
 * kept and made unreachable, which is the thing §5 names.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "../../src/App.svelte";
import { facetOf } from "../../src/lib/facets/registry";
import { mintSendCode, sendCodeLink } from "../../src/lib/p2p/send-code";
import { importersOf } from "./support/importers";
import { bootShell } from "./support/shell-boot";

const ORIGIN = "https://inventoria.example";

/** Stubbed for the reason `code-handover.test.ts` stubs it: it is the assertion. */
const init = vi.fn((path: string) => Promise.resolve(path));
vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: {
    init: (path: string) => init(path),
    query: () => Promise.resolve([]),
    append: () => Promise.resolve(),
    subscribe: () => () => {},
  },
}));

/**
 * Boots the root on `href`, and reports what it did about the ledger and the
 * address bar.
 *
 * The same harness `tests/unit/code-handover.test.ts` asks of Rations, which is
 * the point: §5's decision is a pair of claims about two shells, and only one
 * question asked twice can state it.
 */
function boot(
  href: string,
  navigator: Record<string, unknown>
): { body: string; inits: number; cleaned: string[] } {
  return {
    ...bootShell(App, "root", href, navigator),
    inits: init.mock.calls.length,
  };
}

/** The one platform on which the root used to take a second branch (ADR-0082 §6). */
const IOS_TAB = { platform: "iPhone", maxTouchPoints: 5, standalone: false };
const DESKTOP = { platform: "Linux x86_64", maxTouchPoints: 0 };

/**
 * A code on the root's own path: the shape the deleted reader used to take.
 *
 * Both paths come off the roster rather than being written out, which is the
 * rule `sendCodeLink` itself now follows — a literal here would keep passing on
 * the day either Facet's start URL moved.
 */
const rootLink = () => {
  const link = new URL(sendCodeLink(mintSendCode(), ORIGIN));
  link.pathname = facetOf("root").startUrl;
  return link.href;
};

beforeEach(() => {
  init.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a receive link landing on the root (ADR-0084 §5)", () => {
  it("opens the ledger, because the fragment is nothing to this shell now", () => {
    // The old reader ran ahead of `init` on one branch and cleaned the URL on
    // both. An ordinary boot is what is left.
    expect(boot(rootLink(), DESKTOP).inits).toBe(1);
  });

  it("leaves the URL exactly as it arrived, having read nothing off it", () => {
    // The clean is the read's other half (ADR-0074 §8), so a URL still carrying
    // its fragment is the strongest available evidence that nothing read it.
    expect(boot(rootLink(), DESKTOP).cleaned).toEqual([]);
  });

  it("shows the app rather than the handover page, on iOS as anywhere else", () => {
    // ADR-0082 §2's reading moved with the ordinary one: both live on the page
    // the link now lands on, and neither is left here.
    const { body, inits, cleaned } = boot(rootLink(), IOS_TAB);

    expect(body).not.toContain('data-testid="code-handover"');
    expect(inits).toBe(1);
    expect(cleaned).toEqual([]);
  });

  it("is not imported by the root at all, so there is nothing to make reachable", () => {
    // The behavioural tests above are the claim; this is what says the reader
    // was **deleted** rather than kept and left unreachable, which is the shape
    // §5 names. An import, not a mention: the root's script still explains in
    // prose why no meal arrives there, and a substring grep would read that as
    // a dependency and be satisfied by deleting the explanation.
    //
    // **Narrowed to the shells**, which are exactly the files directly under
    // `src/`. Three food components import `ReceiveOpening` as a *type* and
    // none of them reads a URL, so the whole list would lock four files to
    // hold a claim about one. A boot-time read needs a shell.
    const shells = importersOf("receive-link").filter((path) =>
      /^src\/[^/]+$/.test(path)
    );

    expect(shells).toEqual(["src/Rations.svelte"]);
  });

  it("opens no receiving surface for a link at Rations' own path either", () => {
    // The root cannot be reached at `/food/`, so this is the belt to the
    // braces: whatever fragment arrives, this shell has no reading of it.
    const { body, cleaned } = boot(
      sendCodeLink(mintSendCode(), ORIGIN),
      IOS_TAB
    );

    expect(body).not.toContain('data-testid="code-handover"');
    expect(body).not.toContain('data-testid="received-meal"');
    expect(cleaned).toEqual([]);
  });
});
