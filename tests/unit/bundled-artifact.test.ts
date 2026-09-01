import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ArtifactUnreachableError,
  needsNetworkLine,
} from "../../src/lib/food/bundled-artifact";

// ADR-0077 §5 takes the Nutrient store and the barcode reader out of the root's
// precache, so on a cold offline Inventoria both are asked for and neither is
// there. What #307 owes is that the app says the network is why, rather than
// surfacing a fetch error or — worse, on the scan path — reporting the user's
// photo as unreadable.

describe("what a Facet says about an artifact it did not keep", () => {
  const unreachable = new ArtifactUnreachableError(
    "The barcode reader",
    "/assets/zxing_reader-abc123.wasm",
    new TypeError("Failed to fetch")
  );

  it("names the network as the cause, which is what it is", () => {
    const line = needsNetworkLine(
      unreachable,
      "Type the number below instead."
    );
    expect(line).toContain("needs a network");
    expect(line).toContain("The barcode reader");
    expect(line).toContain("Type the number below instead.");
  });

  it("keeps the URL off the screen and on the error", () => {
    // The sentence this replaces was `Failed to load /usda/nutrient-store.json
    // (0)`, which reads as a broken build to the one person who recognises it.
    // The path is still there for that person, in the console.
    expect(needsNetworkLine(unreachable, "Try again.")).not.toContain(
      "zxing_reader"
    );
    expect(unreachable.url).toBe("/assets/zxing_reader-abc123.wasm");
    expect(unreachable.message).toContain("/assets/zxing_reader-abc123.wasm");
    expect(unreachable.cause).toBeInstanceOf(TypeError);
  });
});

// The ponyfill, stubbed at the seam the real one loads its wasm through:
// `prepareZXingModule` is where the fetch happens, and `detect` is what has to
// stay free of it (#307).
const { prepareZXingModule, purgeZXingModule, detect } = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(async (_options: unknown) => ({})),
  purgeZXingModule: vi.fn(() => {}),
  detect: vi.fn(async (_source: unknown) => [] as { rawValue: string }[]),
}));

vi.mock("barcode-detector/pure", () => ({
  prepareZXingModule,
  purgeZXingModule,
  BarcodeDetector: class {
    detect(source: unknown) {
      return detect(source);
    }
  },
}));

/** A fresh `barcode-scan`, because the detector is memoised per module. */
async function freshScanner() {
  vi.resetModules();
  return {
    ...(await import("../../src/lib/food/barcode-scan")),
    ...(await import("../../src/lib/food/bundled-artifact")),
  };
}

describe("a barcode reader that could not be reached (#307)", () => {
  beforeEach(() => {
    prepareZXingModule.mockReset().mockResolvedValue({});
    purgeZXingModule.mockReset();
    detect.mockReset().mockResolvedValue([]);
  });

  it("still reports a photo with no barcode in it as a non-decode", async () => {
    // The reader loaded and read the frame; there was no code in it. This is
    // the outcome the failure below used to be indistinguishable from.
    const { decodeBarcode } = await freshScanner();
    await expect(decodeBarcode({} as ImageBitmapSource)).resolves.toBeNull();
  });

  it("reports a reader that could not load as an unreachable artifact", async () => {
    // Not `null`. Returning "no barcode here" for a reader that never ran told
    // an offline user to photograph their label better.
    const { decodeBarcode, ArtifactUnreachableError } = await freshScanner();
    prepareZXingModule.mockRejectedValue(new TypeError("Failed to fetch"));

    const failure = await decodeBarcode({} as ImageBitmapSource).catch(
      (e) => e
    );
    expect(failure).toBeInstanceOf(ArtifactUnreachableError);
    expect(failure.subject).toBe("The barcode reader");
    expect(detect).not.toHaveBeenCalled();
  });

  it("fetches the wasm before the first frame, not inside it", async () => {
    // The whole of the distinction above: zxing instantiates lazily, so a wasm
    // that could not be fetched surfaced inside `detect()`, where the reader's
    // own catch cannot tell it from an unreadable frame.
    const { decodeBarcode } = await freshScanner();
    await decodeBarcode({} as ImageBitmapSource);
    expect(prepareZXingModule).toHaveBeenCalledWith(
      expect.objectContaining({ fireImmediately: true })
    );
  });

  it("forgets a failed load so the next scan tries again", async () => {
    // A cached rejection would answer every scan for the rest of the session,
    // and the cause here is one that clears by itself — the same rule
    // `loadNutrientStore` keeps.
    const { decodeBarcode } = await freshScanner();
    prepareZXingModule.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(decodeBarcode({} as ImageBitmapSource)).rejects.toThrow();
    // zxing caches its own module promise, so the retry only reaches a fetch if
    // the rejected one was purged as well as forgotten here.
    expect(purgeZXingModule).toHaveBeenCalled();
    detect.mockResolvedValue([{ rawValue: "5000112637922" }]);
    await expect(decodeBarcode({} as ImageBitmapSource)).resolves.toBe(
      "5000112637922"
    );
    expect(prepareZXingModule).toHaveBeenCalledTimes(2);
  });
});
