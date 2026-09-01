/**
 * The paste affordance on the Scan way in (ADR-0082 §4, §12 and §13).
 *
 * The property under test is the narrowed rule: **the bar is on the code's
 * content, not on how the characters arrived.** A full link is taken and
 * anything shorter is refused, on every platform, and the refusal is one line.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import MealLinkField from "../../src/lib/views/food/MealLinkField.svelte";
import { readPastedLink } from "../../src/lib/p2p/pasted-link";
import {
  mintSendCode,
  sendCodeFragment,
  sendCodeLink,
} from "../../src/lib/p2p/send-code";

const ORIGIN = "https://inventoria.example";

describe("a pasted meal link", () => {
  it("takes the whole link the sender's own screen minted", () => {
    const code = mintSendCode();

    expect(readPastedLink(sendCodeLink(code, ORIGIN))).toEqual({
      kind: "meal",
      code,
    });
  });

  it("takes it with the whitespace a messenger wrapped around it", () => {
    const code = mintSendCode();

    expect(readPastedLink(`  ${sendCodeLink(code, ORIGIN)}\n`)).toEqual({
      kind: "meal",
      code,
    });
  });

  it("takes a link from any origin, because the code is what is read", () => {
    const code = mintSendCode();

    expect(
      readPastedLink(sendCodeLink(code, "https://rations.example"))
    ).toEqual({ kind: "meal", code });
  });
});

describe("anything that is not a whole link is refused, in one line", () => {
  it("refuses an empty field without saying anything", () => {
    // Not a refusal of anything: nobody has pasted yet.
    expect(readPastedLink("   ")).toEqual({ kind: "empty" });
  });

  it("refuses the bare fragment, which is a code without its link", () => {
    const short = sendCodeFragment(mintSendCode());

    expect(readPastedLink(short).kind).toBe("refused");
  });

  it("refuses a link whose key was truncated in transit", () => {
    const read = readPastedLink(`${ORIGIN}/#r=a-room&k=AAAA`);

    expect(read.kind).toBe("refused");
    expect(read.kind === "refused" && read.line).toMatch(/damaged/);
  });

  it("refuses a link carrying only half of itself", () => {
    expect(readPastedLink(`${ORIGIN}/#r=a-room`).kind).toBe("refused");
  });

  it("refuses a product barcode, which is not the code it is looking for", () => {
    expect(readPastedLink("5000112637922").kind).toBe("refused");
  });

  it("refuses a short code nobody could have been handed", () => {
    // ADR-0072 §4 as narrowed: no code a human is expected to reproduce. This
    // is the shape that rule exists to keep off the surface, and it is refused
    // on every platform rather than on iOS alone.
    const read = readPastedLink("bright-otter-42");

    expect(read.kind).toBe("refused");
    expect(read.kind === "refused" && read.line).toMatch(/not a meal link/);
  });

  it("refuses an ordinary URL that carries no code at all", () => {
    expect(readPastedLink("https://example.com/lunch").kind).toBe("refused");
  });
});

describe("the field it lands in", () => {
  const field = () =>
    render(MealLinkField, { props: { onMealCode: () => {} } }).body;

  it("carries no placeholder, because nothing invites anyone to type", () => {
    // ADR-0082 §12: the narrowed rule is that no code a human is expected to
    // reproduce may exist, and a placeholder showing one is that invitation.
    expect(field()).not.toMatch(/placeholder="[^"]+"/);
  });

  it("says a link is pasted here, and says it in a label", () => {
    expect(field()).toContain("Handed a meal link? Paste it here.");
  });
});

describe("nothing in the app reads the pasteboard (ADR-0082 §11.10)", () => {
  /** Every `.ts` and `.svelte` file under `src/`, with its comments stripped. */
  function appCode(): string[] {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(`${dir}/${entry.name}`)
          : /\.(ts|svelte)$/.test(entry.name)
            ? [`${dir}/${entry.name}`]
            : []
      );
    // Stripped, because the refusal is quoted verbatim in the comments that
    // explain it — the same trap `importersOf` names. A raw search would read
    // the documentation as the offence and be satisfied by deleting it.
    return walk("src").filter((path) =>
      /readText\s*\(/.test(
        readFileSync(path, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1")
      )
    );
  }

  it("calls `navigator.clipboard.readText` nowhere", () => {
    // The programmatic read is gated three ways and carries two residuals no
    // public source can close: whether WebKit's own Paste callout counts as
    // UIKit "user intent", and whether the same-origin auto-grant survives the
    // crossing. Manual paste is settled, so the design takes the settled path.
    // Stated once over the whole app rather than once per surface that might be
    // tempted, because the rule is about the app and not about one field.
    expect(appCode()).toEqual([]);
  });
});
