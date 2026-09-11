/**
 * The Paired devices section, on the root's Settings (ADR-0096 §8).
 *
 * Rendered through Svelte's SSR path, which reaches everything that matters
 * here: what is offered before an act starts, and what a code looks like on the
 * screen showing it. The camera and the room are the two things SSR cannot
 * reach, and both have their own suites — `pairing-act.test.ts` puts two real
 * clients either side of the real Relay.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render } from "svelte/server";
import { stubLocalStorage } from "./support/local-storage";
import PairedDevicesSection from "../../src/lib/views/pairing/PairedDevicesSection.svelte";
import ReadPairingCode from "../../src/lib/views/pairing/ReadPairingCode.svelte";
import ShowPairingCode from "../../src/lib/views/pairing/ShowPairingCode.svelte";
import { writePairingCode } from "../../src/lib/p2p/pairing-code";
import { mintRoomCode } from "../../src/lib/p2p/room-code";

/** A jar holding one completed pairing, seeded the way one lands. */
const A_PAIRING = JSON.stringify([
  {
    device_id: "dev_b0c1d2e3f4",
    name: null,
    deposit: { direction: "a2b", state: "AAAA", index: 0 },
    collect: { direction: "b2a", state: "BBBB", index: 0 },
    peer_vector: {},
  },
]);

describe("the section expands in place, and offers both ways in", () => {
  it("offers showing and reading, and neither opens a second surface", () => {
    const { body } = render(PairedDevicesSection, { props: {} });
    expect(body).toContain("Show a code");
    expect(body).toContain("Read a code");
    // ADR-0075 §4's Devices screen went with ADR-0096. There is no route out
    // of Settings here, and nothing on this card is a link.
    expect(body).not.toContain("<a ");
  });

  it("draws no paired row, because a pairing writes nothing down until it completes", () => {
    const { body } = render(PairedDevicesSection, { props: {} });
    expect(body).toContain("No devices are paired.");
  });
});

describe("a completed pairing has a row, and an incomplete one has none", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * The section, re-imported so its store reads the jar seeded here.
   *
   * `svelte/server` is re-imported with it: a reset module graph gives the
   * component a different Svelte instance from the one this file imported, and
   * rendering across the two leaves the SSR context empty.
   */
  const withJar = async (seed?: string) => {
    stubLocalStorage(seed ? { seed: { inventoria_paired_devices: seed } } : {});
    vi.resetModules();
    const [{ render: renderFresh }, Section] = await Promise.all([
      import("svelte/server"),
      import("../../src/lib/views/pairing/PairedDevicesSection.svelte"),
    ]);
    return renderFresh(Section.default, { props: {} }).body;
  };

  it("reads by short device id until somebody names it", async () => {
    const body = await withJar(A_PAIRING);
    expect(body).toContain("dev_b0c1");
    expect(body).not.toContain("No devices are paired.");
    // The whole id is not the row's heading: eight characters is what a person
    // tells two of their own devices apart by.
    expect(body).not.toContain("dev_b0c1d2e3f4</");
  });

  it("still offers a way to pair, because a row is not the only reason to", async () => {
    // ADR-0096 §8: "Pair a device" must work with no row present *and* with
    // one, because pairing again is the repair path for the side that
    // committed alone.
    const body = await withJar(A_PAIRING);
    expect(body).toContain("Show a code");
    expect(body).toContain("Read a code");
  });

  it("offers the name and the unpair a pairing's own device holds", async () => {
    const body = await withJar(A_PAIRING);
    expect(body).toContain("Rename");
    expect(body).toContain("Unpair");
  });

  it("draws nothing for a record that is not a pairing", async () => {
    const body = await withJar(JSON.stringify([{ device_id: "dev_b" }]));
    expect(body).toContain("No devices are paired.");
  });
});

describe("the code on the screen showing it", () => {
  const shown = () => {
    const code = mintRoomCode();
    return { code, body: render(ShowPairingCode, { props: { code } }).body };
  };

  it("shows the same string it draws, in writing and as a symbol", () => {
    const { code, body } = shown();
    expect(body).toContain(writePairingCode(code));
    expect(body).toContain('data-testid="code-symbol"');
  });

  it("says it is not a link, and is not one", () => {
    const { code, body } = shown();
    expect(body).toContain("not a link");
    expect(() => new URL(writePairingCode(code))).toThrow();
  });
});

describe("the reader offers both carriers, and capability decides only one", () => {
  interface Detectable {
    BarcodeDetector?: unknown;
  }
  const platform = globalThis as Detectable;

  afterEach(() => {
    delete platform.BarcodeDetector;
  });

  const reader = () =>
    render(ReadPairingCode, { props: { oncode: () => {} } }).body;

  it("offers the field with no camera at all", () => {
    // There is no `BarcodeDetector` in this process, as there is none on any
    // iPhone. The paste carrier is a whole carrier rather than a fallback for a
    // failure, so it is here either way.
    const body = reader();
    expect(body).toContain("Or paste the code");
    expect(body).not.toContain("<video");
  });

  it("offers the camera as well where the platform has a detector", () => {
    platform.BarcodeDetector = class {
      detect() {
        return Promise.resolve([]);
      }
    };
    const body = reader();
    expect(body).toContain("<video");
    expect(body).toContain("Or paste the code");
  });
});
