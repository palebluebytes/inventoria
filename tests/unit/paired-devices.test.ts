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
import { UNPAIRING_WORDS } from "../../src/lib/p2p/unpair";
import { WHOLE_JAR } from "../../src/lib/p2p/lane-scope";
import { TRACKED_DOMAINS } from "../../src/lib/facets/registry";
import { listOf } from "../../src/lib/ui/words";

/**
 * A jar holding one completed pairing, seeded the way one lands.
 *
 * The lane states are a real 32 bytes each, because the record's guard decodes
 * them: a row whose state is not a chain state is not a pairing.
 */
const PAIRING = {
  device_id: "dev_b0c1d2e3f4",
  name: null as string | null,
  deposit: {
    direction: "a2b",
    state: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    index: 0,
  },
  collect: {
    direction: "b2a",
    state: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
    index: 0,
  },
  peer_vector: {},
};

const A_PAIRING = JSON.stringify([PAIRING]);

/**
 * The section, re-imported so its store reads the jar seeded here.
 *
 * `svelte/server` is re-imported with it: a reset module graph gives the
 * component a different Svelte instance from the one this file imported, and
 * rendering across the two leaves the SSR context empty.
 *
 * One helper rather than one per `describe`. Five had grown, identical but for
 * which of two argument shapes they took, and {@link sectionWithRow} is that
 * second shape expressed as a caller rather than as a fourth copy.
 */
async function sectionWithJar(seed?: string, facetId = "root") {
  stubLocalStorage(seed ? { seed: { inventoria_paired_devices: seed } } : {});
  vi.resetModules();
  const [{ render: renderFresh }, Section] = await Promise.all([
    import("svelte/server"),
    import("../../src/lib/views/pairing/PairedDevicesSection.svelte"),
  ]);
  return renderFresh(Section.default, { props: { facetId } }).body;
}

/** A jar holding {@link PAIRING} with these fields overridden. */
const sectionWithRow = (over: Record<string, unknown>, facetId = "root") =>
  sectionWithJar(JSON.stringify([{ ...PAIRING, ...over }]), facetId);

describe("the section expands in place, and offers both ways in", () => {
  it("offers showing and reading, and neither opens a second surface", () => {
    const { body } = render(PairedDevicesSection, {
      props: { facetId: "root" },
    });
    expect(body).toContain("Show a code");
    expect(body).toContain("Read a code");
    // ADR-0075 §4's Devices screen went with ADR-0096. There is no route out
    // of Settings here, and nothing on this card is a link.
    expect(body).not.toContain("<a ");
  });

  it("draws no paired row, because a pairing writes nothing down until it completes", () => {
    const { body } = render(PairedDevicesSection, {
      props: { facetId: "root" },
    });
    expect(body).toContain("No devices are paired.");
  });
});

describe("a completed pairing has a row, and an incomplete one has none", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads by short device id until somebody names it", async () => {
    const body = await sectionWithJar(A_PAIRING);
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
    const body = await sectionWithJar(A_PAIRING);
    expect(body).toContain("Show a code");
    expect(body).toContain("Read a code");
  });

  it("offers the name and the unpair a pairing's own device holds", async () => {
    const body = await sectionWithJar(A_PAIRING);
    expect(body).toContain("Rename");
    expect(body).toContain("Unpair");
  });

  it("draws nothing for a record that is not a pairing", async () => {
    const body = await sectionWithJar(JSON.stringify([{ device_id: "dev_b" }]));
    expect(body).toContain("No devices are paired.");
  });
});

describe("the last-met date and the one-sided state (ADR-0096 §11)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says when the two devices last met, coarsened to the day", async () => {
    const body = await sectionWithRow({ last_met: "2026-09-13" });

    // The only thing this design ever says about staleness, on the only screen
    // it says it: no spinner, no toast and no badge anywhere else.
    expect(body).toContain("Last met 13/09/2026.");
  });

  it("says nothing where a record was written before the date existed", async () => {
    const body = await sectionWithRow({ last_met: null });

    // An absent date is not a claim that the devices have never met.
    expect(body).not.toContain("Last met");
  });

  it("shows the one-sided state once a pairing has stopped", async () => {
    const body = await sectionWithRow({ unproductive_wakes: 200 });

    // ADR-0075 §12's two pieces of news, of which only one is actionable — and
    // the two actions are the two that exist.
    expect(body).toContain("one-sided");
    expect(body).toContain("Unpair it here");
    expect(body).not.toContain("network");
  });

  it("shows nothing of the kind while a pairing is still being served", async () => {
    const body = await sectionWithRow({ unproductive_wakes: 199 });
    expect(body).not.toContain("one-sided");
  });

  it("keeps the row, because hitting K never unpairs", async () => {
    const body = await sectionWithRow({ unproductive_wakes: 200 });

    expect(body).toContain("dev_b0c1");
    expect(body).toContain("Rename");
    expect(body).toContain("Unpair");
    expect(body).not.toContain("No devices are paired.");
  });
});

describe("what an unpair claims, and the pending state it carries (§11)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries the pending state until the deletes land", async () => {
    const body = await sectionWithRow({ revoked: true });

    // The mark is local and immediate and the withdrawal is two round trips,
    // so without this line the claim is a lie in exactly the window that
    // matters — a device that was offline when the user tapped.
    expect(body).toContain(UNPAIRING_WORDS);
  });

  it("offers neither action on a pairing already on its way out", async () => {
    const body = await sectionWithRow({ revoked: true });

    // Renaming a row on its way out is busywork, and a second Unpair on a
    // withdrawal already under way would promise a second act where there is
    // only one. The row itself stays, because the withdrawal needs it.
    expect(body).not.toContain("row-actions");
    expect(body).not.toContain("Rename");
    expect(body).toContain("dev_b0c1");
  });

  it("says nothing of the kind on a pairing nobody has severed", async () => {
    const body = await sectionWithRow({});

    expect(body).not.toContain(UNPAIRING_WORDS);
    expect(body).toContain("row-actions");
    expect(body).toContain("Rename");
  });
});

describe("what a device says it is paired with is a list you go and look at", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The two rows of a three-device household, as their jar holds them. */
  const household = (peer_roster: unknown, name: string | null = null) =>
    JSON.stringify([
      { ...PAIRING, name, peer_roster },
      { ...PAIRING, device_id: "dev_c9f8e7d6", name: "The laptop" },
    ]);

  it("says nothing at all about a peer that has not deposited yet", async () => {
    const body = await sectionWithJar(household(null));

    // A first sync crosses no deposit, so there is nothing to report — and
    // *nothing stated* must not read as *paired with nobody*.
    expect(body).not.toContain("Also paired with");
    expect(body).not.toContain("Paired with no other device");
  });

  it("names a stated device by what this device calls it", async () => {
    const body = await sectionWithJar(household(["dev_c9f8e7d6"]));

    // The typed name never crossed: the id did, and it resolved here.
    expect(body).toContain("Also paired with The laptop.");
  });

  it("names nobody for an id it cannot place, and shows no raw id", async () => {
    const body = await sectionWithJar(household(["dev_stranger01"]));

    expect(body).toContain(
      "Also paired with one device you are not paired with."
    );
    expect(body).not.toContain("dev_stranger01");
    expect(body).not.toContain("dev_stra");
  });

  it("counts the ones it cannot place beside the ones it can", async () => {
    const body = await sectionWithJar(
      household(["dev_c9f8e7d6", "dev_stranger01", "dev_stranger02"])
    );

    expect(body).toContain(
      "Also paired with The laptop and 2 devices you are not paired with."
    );
  });

  it("says a household of two out loud, because it is a statement", async () => {
    const body = await sectionWithJar(household([]));

    expect(body).toContain("Paired with no other device.");
  });

  it("is a list and never an event, so nothing here announces itself", async () => {
    const body = await sectionWithJar(household(["dev_c9f8e7d6"]));

    // Surfacing the roster as a notification would deliver by observation the
    // very thing ADR-0075 §14.6 refuses to deliver by message.
    expect(body).not.toContain('role="alert"');
    expect(body).not.toContain('role="status"');
    // And it is automatic: the peer is you, so a switch would be asking your
    // own permission to tell yourself something (§6). The two controls a
    // consent would be drawn with are both absent.
    expect(body).not.toContain('role="switch"');
    expect(body).not.toContain('type="checkbox"');
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

describe("every Devices row names what its lane carries (ADR-0103 §10)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** What the whole Jar reads as, built from the roster rather than typed. */
  const everyDomain = listOf(TRACKED_DOMAINS.map((domain) => domain.name));

  it("names food alone on a lane a Rations act scoped", async () => {
    const body = await sectionWithRow({ scope: ["food"] }, "food");

    // The only place the app can explain an absence the user would otherwise
    // read as a sync failure: a food lane to the phone, a jar-wide one to the
    // laptop, and no films on the phone.
    expect(body).toContain("Carries Food.");
  });

  it("names every domain on a lane the root's act scoped", async () => {
    const body = await sectionWithRow({ scope: WHOLE_JAR });
    expect(body).toContain(`Carries ${everyDomain}.`);
  });

  it("reads a record written before the field as the whole Jar", async () => {
    // `filled` is what turns the absence into the field, and the reading is the
    // sound one: such a record predates the pairing surface leaving the root.
    const body = await sectionWithRow({});
    expect(body).toContain(`Carries ${everyDomain}.`);
  });

  it("takes the words from the Tracked Domains and not a second vocabulary", async () => {
    // §10: the same words `FoodDataSection` prints in its *what stays* line.
    // The expectation is built from the registry, so a hand-typed list in the
    // markup fails the moment a domain is renamed there.
    const body = await sectionWithRow({ scope: ["food", "media", "jar"] });
    const named = TRACKED_DOMAINS.filter((domain) =>
      ["food", "media", "jar"].includes(domain.id)
    ).map((domain) => domain.name);
    expect(body).toContain(`Carries ${listOf(named)}.`);
  });

  it("says so on a Rations row as loudly as on the root's", async () => {
    // The section is one module and the line is not the caller's, so the Facet
    // drawing it changes nothing about what a row says its lane carries.
    const rations = await sectionWithRow({ scope: ["food"] }, "food");
    const root = await sectionWithRow({ scope: ["food"] }, "root");
    expect(rations).toContain("Carries Food.");
    expect(root).toContain("Carries Food.");
  });

  it("claims nothing for a severed pairing, which carries nothing", async () => {
    // A pending revocation has stopped both lanes, so a line saying what the
    // lane carries would be a claim about a lane that is already shut.
    const body = await sectionWithRow({ scope: ["food"], revoked: true });
    expect(body).toContain(UNPAIRING_WORDS);
    expect(body).not.toContain("Carries");
  });

  it("names nothing where the two ends agreed on nothing", async () => {
    // An empty scope is a claim rather than an absence, and the honest reading
    // of it is that this lane carries no rows at all.
    const body = await sectionWithRow({ scope: [] });
    expect(body).toContain("Carries nothing.");
  });
});
