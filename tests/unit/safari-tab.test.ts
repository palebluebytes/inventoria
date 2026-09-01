/**
 * The two tests that decide whether a receive link is opened or handed over
 * (ADR-0082 §6, ADR-0074 §11).
 *
 * **A stubbed `navigator` proves the branch and not the platform.** That is the
 * same hole ADR-0074 §9 flagged about the asset router, and it is stated here
 * rather than left for a reader to discover: nothing below shows that a real
 * web clip reports `standalone === true`, which is an inference from a WebKit
 * preference default. [#287](https://github.com/palebluebytes/inventoria/issues/287)
 * owns the device half.
 *
 * What these do hold is the direction each test fails in, which is the property
 * the whole design rests on: **both fail closed toward handing over.**
 */
import { describe, it, expect } from "vitest";
import {
  isIosSafariTab,
  isTheInstalledCopy,
  isWebKitOnIos,
  type PlatformSignals,
} from "../../src/lib/p2p/safari-tab";

/** A `navigator` whose properties throw the moment anything reads them. */
function hostileSignals(): PlatformSignals {
  return {
    get platform(): string {
      throw new Error("blocked");
    },
    get maxTouchPoints(): number {
      throw new Error("blocked");
    },
    get standalone(): boolean {
      throw new Error("blocked");
    },
  };
}

describe("is this WebKit on iOS", () => {
  it("reads an iPhone by its platform", () => {
    expect(isWebKitOnIos({ platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
  });

  it("reads an iPod by its platform", () => {
    expect(isWebKitOnIos({ platform: "iPod touch", maxTouchPoints: 5 })).toBe(
      true
    );
  });

  it("catches the iPad, which reports a Mac and is told apart by touch", () => {
    expect(isWebKitOnIos({ platform: "MacIntel", maxTouchPoints: 5 })).toBe(
      true
    );
  });

  it("leaves an ordinary Mac alone, which has the platform but no touch", () => {
    expect(isWebKitOnIos({ platform: "MacIntel", maxTouchPoints: 0 })).toBe(
      false
    );
  });

  it("leaves Android and desktop alone: neither ever takes this path", () => {
    expect(isWebKitOnIos({ platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(
      false
    );
    expect(isWebKitOnIos({ platform: "Win32", maxTouchPoints: 0 })).toBe(false);
  });

  it("answers yes when it cannot read the signals at all", () => {
    // Fails closed toward "yes": a signal that cannot be read is the device
    // this test cannot see, and that is the one it must not wave through.
    expect(isWebKitOnIos(hostileSignals())).toBe(true);
  });

  it("answers no on an absent platform, which is not a device it cannot see", () => {
    expect(isWebKitOnIos({})).toBe(false);
  });
});

describe("am I the installed copy", () => {
  it("is the installed copy only on an exact true", () => {
    expect(isTheInstalledCopy({ standalone: true })).toBe(true);
  });

  it("reads false as not installed", () => {
    expect(isTheInstalledCopy({ standalone: false })).toBe(false);
  });

  it("reads an absent property as not installed", () => {
    expect(isTheInstalledCopy({})).toBe(false);
  });

  it("reads a property that throws as not installed", () => {
    expect(isTheInstalledCopy(hostileSignals())).toBe(false);
  });
});

describe("handing the code over takes both, and receiving normally takes either", () => {
  it("hands over in an iOS Safari tab", () => {
    expect(
      isIosSafariTab({
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: false,
      })
    ).toBe(true);
  });

  it("does not hand over inside the installed copy, which can open the meal", () => {
    expect(
      isIosSafariTab({
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: true,
      })
    ).toBe(false);
  });

  it("does not hand over off iOS, however the install test answers", () => {
    // Android and desktop are untouched and never take this path: a WebAPK
    // launches the host browser against the same profile and the same jar, so
    // there is no wrong-jar case there to defend against.
    expect(
      isIosSafariTab({ platform: "Linux armv8l", maxTouchPoints: 5 })
    ).toBe(false);
    expect(
      isIosSafariTab({ platform: "Win32", maxTouchPoints: 0, standalone: true })
    ).toBe(false);
  });

  it("hands over when nothing can be read, which is the safe direction", () => {
    expect(isIosSafariTab(hostileSignals())).toBe(true);
  });
});
