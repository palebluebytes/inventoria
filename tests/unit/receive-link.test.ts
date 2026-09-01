/**
 * The receive link, read once at boot and then taken off the URL
 * (ADR-0074 §8).
 *
 * The two behaviours §8 calls forced rather than chosen are the two properties
 * under test: the code is read exactly once, and a reload cannot be a retry
 * because there is nothing left on the URL to read.
 */
import { describe, it, expect } from "vitest";
import {
  takeCodeHandover,
  takeReceiveLink,
  type ReceiveLink,
  type ReceiveOpening,
} from "../../src/lib/p2p/receive-link";
import {
  mintSendCode,
  sendCodeFragment,
  sendCodeLink,
} from "../../src/lib/p2p/send-code";

const ORIGIN = "https://inventoria.example";

/** A boot on `href`, recording every URL the read rewrote the address bar to. */
function boot(href: string): { read: ReceiveLink; cleaned: string[] } {
  const cleaned: string[] = [];
  const read = takeReceiveLink({ href, clean: (url) => cleaned.push(url) });
  return { read, cleaned };
}

describe("a link is a code, and the code leaves the URL with it", () => {
  it("reads the code the sender's own link carries", () => {
    const code = mintSendCode();
    const { read } = boot(sendCodeLink(code, ORIGIN));

    expect(read).toEqual({ kind: "code", code });
  });

  it("takes the fragment off the URL, so a reload is not a second use", () => {
    const { cleaned } = boot(sendCodeLink(mintSendCode(), ORIGIN));

    expect(cleaned).toEqual(["/"]);
  });

  it("reads nothing the second time, because the first read cleaned it", () => {
    const link = sendCodeLink(mintSendCode(), ORIGIN);
    const { cleaned } = boot(link);

    expect(boot(new URL(cleaned[0], ORIGIN).href).read).toEqual({
      kind: "none",
    });
  });

  it("keeps the query, which is where the Share Target's own read lives", () => {
    const fragment = sendCodeFragment(mintSendCode());
    const { read, cleaned } = boot(`${ORIGIN}/?text=something#${fragment}`);

    expect(read.kind).toBe("code");
    expect(cleaned).toEqual(["/?text=something"]);
  });
});

describe("an ordinary boot is not a receive", () => {
  it("says there is no code on a plain load", () => {
    expect(boot(`${ORIGIN}/`).read).toEqual({ kind: "none" });
  });

  it("leaves a URL it found no code on alone", () => {
    expect(boot(`${ORIGIN}/#somebody-elses-anchor`).cleaned).toEqual([]);
  });
});

describe("a code that is a code and is broken", () => {
  it("says so rather than passing for an ordinary boot", () => {
    const { read } = boot(`${ORIGIN}/#r=a-room&k=AAAA`);

    expect(read.kind).toBe("broken");
    expect(read.kind === "broken" && read.reason).toMatch(/not 32/);
  });

  it("cleans the URL anyway: it was read, so it must not be read again", () => {
    expect(boot(`${ORIGIN}/#r=a-room`).cleaned).toEqual(["/"]);
  });
});

describe("the clean is what makes the read safe to keep", () => {
  it("hands the code back only once the URL is clean", () => {
    const link = sendCodeLink(mintSendCode(), ORIGIN);

    // A `replaceState` the browser refuses leaves a live secret in the address
    // bar, so the read fails rather than proceeding with a URL a reload would
    // read again. `App.svelte`'s try is what catches this.
    expect(() =>
      takeReceiveLink({
        href: link,
        clean: () => {
          throw new Error("replaceState refused");
        },
      })
    ).toThrow("replaceState refused");
  });
});

describe("the same link, on a page that will not open it (ADR-0082 §2)", () => {
  /** A boot on `href` in an iOS Safari tab, which hands the code over. */
  function handOver(href: string): {
    read: ReceiveOpening | null;
    cleaned: string[];
  } {
    const cleaned: string[] = [];
    const read = takeCodeHandover({ href, clean: (url) => cleaned.push(url) });
    return { read, cleaned };
  }

  it("reads the code, so the page has something to show", () => {
    const code = mintSendCode();

    expect(handOver(sendCodeLink(code, ORIGIN)).read).toEqual({
      kind: "code",
      code,
    });
  });

  it("cleans the URL anyway, on the rule rather than on a branch in it", () => {
    // ADR-0082 §9: nothing is retried here, but the address bar is still where
    // a secret gets screenshotted, enters history and renders in the tab
    // switcher — and §8 is not a rule to grow an exception in.
    expect(handOver(sendCodeLink(mintSendCode(), ORIGIN)).cleaned).toEqual([
      "/",
    ]);
  });

  it("says there is nothing to hand over on an ordinary boot", () => {
    expect(handOver(`${ORIGIN}/`).read).toBeNull();
    expect(handOver(`${ORIGIN}/`).cleaned).toEqual([]);
  });

  it("hands a broken code over as broken, refused where it was read", () => {
    const { read, cleaned } = handOver(`${ORIGIN}/#r=a-room&k=AAAA`);

    expect(read?.kind).toBe("broken");
    expect(cleaned).toEqual(["/"]);
  });

  it("still shows the code when the browser refused to clean the URL", () => {
    // The one thing that differs from `takeReceiveLink`, and it is not a
    // preference: a refused `replaceState` is fatal there because a reload
    // could spend the code a second time, and this page spends nothing. The
    // code is already in the address bar; refusing to show it as well helps
    // nobody.
    const code = mintSendCode();

    expect(
      takeCodeHandover({
        href: sendCodeLink(code, ORIGIN),
        clean: () => {
          throw new Error("replaceState refused");
        },
      })
    ).toEqual({ kind: "code", code });
  });
});
