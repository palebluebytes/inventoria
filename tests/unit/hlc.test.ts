import { describe, it, expect } from "vitest";
import {
  createHlc,
  compareHlc,
  compareHlcMark,
  type HlcKey,
} from "../../src/lib/db/hlc";

describe("hybrid logical clock (ADR-0020)", () => {
  it("tracks wall time and resets the counter when it advances", () => {
    let wall = 1000;
    const hlc = createHlc("dev-a", { wallClock: () => wall });

    expect(hlc.now()).toMatchObject({ hlc_ms: 1000, hlc_ctr: 0 });
    wall = 1005;
    expect(hlc.now()).toMatchObject({ hlc_ms: 1005, hlc_ctr: 0 });
  });

  it("breaks same-millisecond ties by incrementing the counter", () => {
    const hlc = createHlc("dev-a", { wallClock: () => 1000 });
    expect(hlc.now()).toMatchObject({ hlc_ms: 1000, hlc_ctr: 0 });
    expect(hlc.now()).toMatchObject({ hlc_ms: 1000, hlc_ctr: 1 });
    expect(hlc.now()).toMatchObject({ hlc_ms: 1000, hlc_ctr: 2 });
  });

  it("never goes backwards when the wall clock does", () => {
    let wall = 5000;
    const hlc = createHlc("dev-a", { wallClock: () => wall });
    expect(hlc.now()).toMatchObject({ hlc_ms: 5000, hlc_ctr: 0 });
    wall = 4000; // clock jumps backwards
    expect(hlc.now()).toMatchObject({ hlc_ms: 5000, hlc_ctr: 1 });
  });

  it("carries the device id on every stamp", () => {
    const hlc = createHlc("dev-xyz", { wallClock: () => 1 });
    expect(hlc.now().device_id).toBe("dev-xyz");
  });

  it("preserves causality: a write after observing a remote edit orders after it", () => {
    // Device B's wall clock lags, but it has seen A's later stamp.
    let wallB = 900;
    const b = createHlc("dev-b", { wallClock: () => wallB });
    const remoteFromA = { hlc_ms: 1000, hlc_ctr: 3 };

    const afterReceive = b.update(remoteFromA);
    expect(afterReceive.hlc_ms).toBe(1000);
    expect(afterReceive.hlc_ctr).toBe(4); // ordered strictly after A's (1000,3)

    // A local write now still orders after the received remote edit. Stamps are
    // already in `HlcKey` shape, so they feed `compareHlc` without reshaping.
    const localAfter = b.now();
    expect(
      compareHlc({ ...remoteFromA, device_id: "dev-a" }, localAfter)
    ).toBeLessThan(0);
  });

  it("compareHlc totally orders by physical, then counter, then device id", () => {
    const a = { hlc_ms: 10, hlc_ctr: 0, device_id: "a" };
    const b = { hlc_ms: 10, hlc_ctr: 0, device_id: "b" };
    const c = { hlc_ms: 10, hlc_ctr: 1, device_id: "a" };
    const d = { hlc_ms: 11, hlc_ctr: 0, device_id: "a" };
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, c)).toBeLessThan(0);
    expect(compareHlc(c, d)).toBeLessThan(0);
    expect(compareHlc(a, a)).toBe(0);
  });

  it("compareHlcMark orders marks alone, calling two devices' stamps equal", () => {
    expect(
      compareHlcMark({ hlc_ms: 10, hlc_ctr: 0 }, { hlc_ms: 11, hlc_ctr: 0 })
    ).toBeLessThan(0);
    expect(
      compareHlcMark({ hlc_ms: 10, hlc_ctr: 1 }, { hlc_ms: 10, hlc_ctr: 0 })
    ).toBeGreaterThan(0);
    // Through `HlcKey`, which is what a caller actually holds: a stamp carries
    // a device, and the point of this case is that the comparison does not read
    // it. Passing bare literals would make the excess `device_id` an error and
    // lose the only case that says so.
    const stampedBy = (device_id: string): HlcKey => ({
      hlc_ms: 10,
      hlc_ctr: 0,
      device_id,
    });
    expect(compareHlcMark(stampedBy("a"), stampedBy("z"))).toBe(0);
  });
});
