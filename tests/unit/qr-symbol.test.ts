/**
 * The Send code's symbol, and the one thing about it that is not the writer's:
 * whether a box on the panel gets to decide how big it is.
 */
import { describe, it, expect } from "vitest";
import { fitToBox } from "../../src/lib/p2p/qr-symbol";

// What zxing-wasm actually emits for a version 5 symbol: a declaration, then a
// root carrying its own module-unit dimensions and no viewBox.
const WRITTEN = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" style="shape-rendering:crispEdges"><rect width="45" height="45" fill="#FFFFFF"/></svg>`;

describe("fitToBox", () => {
  it("takes the writer's own width and height off the root", () => {
    const fitted = fitToBox(WRITTEN);
    // The inner rect keeps its dimensions; only the root loses them.
    expect(fitted.slice(0, fitted.indexOf(">") + 1)).not.toMatch(
      /width=|height=/
    );
  });

  it("synthesises the viewBox from the dimensions it removed", () => {
    expect(fitToBox(WRITTEN)).toContain('viewBox="0 0 45 45"');
  });

  it("leaves a viewBox the writer supplied alone", () => {
    const supplied = '<svg viewBox="0 0 21 21" width="21" height="21"></svg>';
    const fitted = fitToBox(supplied);
    expect(fitted).toContain('viewBox="0 0 21 21"');
    expect(fitted.match(/viewBox/g)).toHaveLength(1);
  });

  it("drops the XML declaration, which cannot be injected into a document", () => {
    expect(fitToBox(WRITTEN)).not.toContain("<?xml");
    expect(
      fitToBox(`<!DOCTYPE svg>\n<svg width="9" height="9"></svg>`)
    ).not.toContain("DOCTYPE");
  });

  it("keeps the symbol square inside whatever box holds it", () => {
    expect(fitToBox(WRITTEN)).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("leaves the modules themselves untouched", () => {
    // Nothing here rewrites the symbol — a symbol edited on the way to the
    // screen is a code that does not read back.
    expect(fitToBox(WRITTEN)).toContain('<rect width="45" height="45"');
  });
});
