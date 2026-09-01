/**
 * The paste affordance on the Scan way in (ADR-0082 §4, §12 and §13).
 *
 * The property under test is the narrowed rule: **the bar is on the code's
 * content, not on how the characters arrived.** A full link is taken and
 * anything shorter is refused, on every platform, and the refusal is one line.
 */
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

  it("tells somebody who pasted a product number what they pasted", () => {
    const read = readPastedLink("5000112637922");

    expect(read.kind).toBe("refused");
    expect(read.kind === "refused" && read.line).toMatch(/barcode/);
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

  it("offers nothing that would read the pasteboard for you", () => {
    // §11.10: `navigator.clipboard.readText()` is refused outright, so there is
    // no "paste for me" control here to be tempted into wiring one behind.
    expect(field().toLowerCase()).not.toContain("<button");
  });
});
