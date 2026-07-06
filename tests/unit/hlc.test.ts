import { describe, it, expect } from "vitest";
import { createHlc, compareHlc } from "../../src/lib/db/hlc";

describe("hybrid logical clock (ADR-0020)", () => {
  it("tracks wall time and resets the counter when it advances", () => {
    let wall = 1000;
    const hlc = createHlc("dev-a", { wallClock: () => wall });

    expect(hlc.now()).toMatchObject({ physical: 1000, counter: 0 });
    wall = 1005;
    expect(hlc.now()).toMatchObject({ physical: 1005, counter: 0 });
  });

  it("breaks same-millisecond ties by incrementing the counter", () => {
    const hlc = createHlc("dev-a", { wallClock: () => 1000 });
    expect(hlc.now()).toMatchObject({ physical: 1000, counter: 0 });
    expect(hlc.now()).toMatchObject({ physical: 1000, counter: 1 });
    expect(hlc.now()).toMatchObject({ physical: 1000, counter: 2 });
  });

  it("never goes backwards when the wall clock does", () => {
    let wall = 5000;
    const hlc = createHlc("dev-a", { wallClock: () => wall });
    expect(hlc.now()).toMatchObject({ physical: 5000, counter: 0 });
    wall = 4000; // clock jumps backwards
    expect(hlc.now()).toMatchObject({ physical: 5000, counter: 1 });
  });

  it("carries the device id on every stamp", () => {
    const hlc = createHlc("dev-xyz", { wallClock: () => 1 });
    expect(hlc.now().deviceId).toBe("dev-xyz");
  });

  it("preserves causality: a write after observing a remote edit orders after it", () => {
    // Device B's wall clock lags, but it has seen A's later stamp.
    let wallB = 900;
    const b = createHlc("dev-b", { wallClock: () => wallB });
    const remoteFromA = { physical: 1000, counter: 3 };

    const afterReceive = b.update(remoteFromA);
    expect(afterReceive.physical).toBe(1000);
    expect(afterReceive.counter).toBe(4); // ordered strictly after A's (1000,3)

    // A local write now still orders after the received remote edit.
    const localAfter = b.now();
    expect(
      compareHlc(
        {
          hlc_ms: remoteFromA.physical,
          hlc_ctr: remoteFromA.counter,
          device_id: "dev-a",
        },
        {
          hlc_ms: localAfter.physical,
          hlc_ctr: localAfter.counter,
          device_id: localAfter.deviceId,
        }
      )
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
});
