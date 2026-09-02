import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The visible band, published as three custom properties (ADR-0089 §1).
 *
 * Every assertion here is geometric rather than pixel-exact-by-luck: the
 * numbers are the real signature of an Android phone with a software keyboard
 * raised — a layout viewport of 660, a large viewport of 727, and a visual
 * viewport that falls to 377. They diverge on purpose, because the whole point
 * of the record is that reading the wrong one leaves a pinned surface short of
 * the keyboard.
 *
 * What this file cannot prove is that any browser emits the events at all;
 * ADR-0089 §9 says so in as many words and leaves that half to a device check.
 */

type Listener = () => void;

/** A `visualViewport` that can be driven, and counted. */
function fakeBand(height: number) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    height,
    offsetTop: 0,
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    listening(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** The `<html>` element's style declaration, remembered rather than applied. */
function fakeDocument(clientHeight: number) {
  const published = new Map<string, string>();
  return {
    published,
    documentElement: {
      clientHeight,
      style: {
        setProperty: (name: string, value: string) =>
          published.set(name, value),
      },
    },
  };
}

function fakeWindow(
  innerHeight: number,
  visualViewport: ReturnType<typeof fakeBand> | undefined
) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    innerHeight,
    visualViewport,
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    listening(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** A phone with the keyboard down: the band is the whole layout viewport. */
function phone({
  layout = 660,
  large = 727,
  band = 660,
}: { layout?: number; large?: number; band?: number } = {}) {
  const vv = fakeBand(band);
  const doc = fakeDocument(layout);
  const win = fakeWindow(large, vv);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  return { vv, doc, win };
}

/** The module keeps its disposer at module scope, so each test gets a fresh one. */
async function loadViewportInset() {
  vi.resetModules();
  return import("../../src/lib/ui/viewport-inset");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the visible band (ADR-0089 §1)", () => {
  it("publishes the band before any event fires", async () => {
    const { doc } = phone();
    const { startViewportInset } = await loadViewportInset();

    startViewportInset();

    expect(doc.published.get("--vv-h")).toBe("660px");
    expect(doc.published.get("--vv-top")).toBe("0px");
    expect(doc.published.get("--vv-bottom")).toBe("0px");
  });

  it("measures the gap below the band against the layout viewport, never the large one", async () => {
    // 660 is what a `position: fixed` box resolves `bottom` against; 727 is the
    // height the page would have with the browser's chrome collapsed. Reading
    // the second leaves a surface 67px short of the keyboard.
    const { vv, doc } = phone({ layout: 660, large: 727, band: 660 });
    const { startViewportInset } = await loadViewportInset();
    startViewportInset();

    vv.height = 377;
    vv.emit("resize");

    expect(doc.published.get("--vv-h")).toBe("377px");
    expect(doc.published.get("--vv-bottom")).toBe("283px");
  });

  it("follows the band when the browser scrolls it to reveal a focused field", async () => {
    // The signature `resize` alone misses: the height does not move, the top
    // edge does, and a surface reading only `resize` is the right size in the
    // wrong place.
    const { vv, doc } = phone({ layout: 660, band: 377 });
    const { startViewportInset } = await loadViewportInset();
    startViewportInset();

    vv.offsetTop = 120;
    vv.emit("scroll");

    expect(doc.published.get("--vv-top")).toBe("120px");
    expect(doc.published.get("--vv-h")).toBe("377px");
    expect(doc.published.get("--vv-bottom")).toBe("163px");
  });

  it("restores the pre-keyboard band exactly when the keyboard closes", async () => {
    const { vv, doc } = phone({ layout: 660, band: 660 });
    const { startViewportInset } = await loadViewportInset();
    startViewportInset();

    vv.height = 377;
    vv.offsetTop = 120;
    vv.emit("resize");
    vv.height = 660;
    vv.offsetTop = 0;
    vv.emit("resize");

    expect(doc.published.get("--vv-h")).toBe("660px");
    expect(doc.published.get("--vv-top")).toBe("0px");
    expect(doc.published.get("--vv-bottom")).toBe("0px");
  });

  it("never reports a negative gap below the band", async () => {
    // A browser may report a band taller than the layout viewport while its
    // collapsible chrome is retracting. The failure direction the record
    // requires is a surface that is too short, never one pushed off the screen.
    const { vv, doc } = phone({ layout: 660, band: 660 });
    const { startViewportInset } = await loadViewportInset();
    startViewportInset();

    vv.height = 727;
    vv.emit("resize");

    expect(doc.published.get("--vv-bottom")).toBe("0px");
  });

  it("republishes on an orientation change", async () => {
    const { vv, win, doc } = phone({ layout: 660, band: 660 });
    const { startViewportInset } = await loadViewportInset();
    startViewportInset();

    doc.documentElement.clientHeight = 360;
    vv.height = 360;
    win.emit("orientationchange");

    expect(doc.published.get("--vv-h")).toBe("360px");
  });

  it("is idempotent, so a second caller adds no second listener", async () => {
    const { vv } = phone();
    const { startViewportInset } = await loadViewportInset();

    const first = startViewportInset();
    const second = startViewportInset();

    expect(second).toBe(first);
    expect(vv.listening("resize")).toBe(1);
    expect(vv.listening("scroll")).toBe(1);
  });

  it("stops when disposed, and can be started again", async () => {
    const { vv, win, doc } = phone({ layout: 660, band: 660 });
    const { startViewportInset } = await loadViewportInset();

    const dispose = startViewportInset();
    dispose();

    expect(vv.listening("resize")).toBe(0);
    expect(vv.listening("scroll")).toBe(0);
    expect(win.listening("orientationchange")).toBe(0);

    vv.height = 377;
    vv.emit("resize");
    expect(doc.published.get("--vv-h")).toBe("660px");

    startViewportInset();
    expect(vv.listening("resize")).toBe(1);
  });

  it("publishes the layout viewport as the band where there is no visualViewport", async () => {
    // No browser this app targets, but the properties stay defined so no
    // consumer needs a second code path.
    const doc = fakeDocument(660);
    const win = fakeWindow(727, undefined);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);

    const { startViewportInset } = await loadViewportInset();
    startViewportInset();

    expect(doc.published.get("--vv-h")).toBe("660px");
    expect(doc.published.get("--vv-bottom")).toBe("0px");
    expect(win.listening("resize")).toBe(1);
  });

  it("is a no-op without a DOM", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);

    const { startViewportInset } = await loadViewportInset();

    expect(() => startViewportInset()()).not.toThrow();
  });
});
