import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// Declared via vi.hoisted so the hoisted vi.mock factories can reference them.
const { datomsWritable, appendMock } = vi.hoisted(() => {
  const { writable } = require("svelte/store");
  return {
    datomsWritable: writable([] as any[]),
    appendMock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/lib/stores/datoms.store", () => ({
  createQueryStore: () => datomsWritable,
}));

vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: { append: appendMock },
}));

import {
  settingsStore,
  saveSettings,
} from "../../src/lib/stores/settings.store";

beforeEach(() => {
  datomsWritable.set([]);
  appendMock.mockClear();
});

describe("settingsStore (latest-datom-wins collapse)", () => {
  it("exposes the three settings keys as strings when empty", () => {
    const s = get(settingsStore);
    expect(typeof s.usda_api_key).toBe("string");
    expect(typeof s.tmdb_api_key).toBe("string");
    expect(typeof s.scraper_proxy_url).toBe("string");
  });

  it("collapses datoms to the latest value per attribute", () => {
    datomsWritable.set([
      { attribute: "settings/usda_api_key", value: "old", time: 1 },
      { attribute: "settings/usda_api_key", value: "new", time: 2 },
      {
        attribute: "settings/scraper_proxy_url",
        value: "https://p/?url=",
        time: 3,
      },
    ]);
    const s = get(settingsStore);
    expect(s.usda_api_key).toBe("new");
    expect(s.scraper_proxy_url).toBe("https://p/?url=");
  });

  it("strips the JSON encoding the ledger stores values with", () => {
    // db.core persists every value as JSON.stringify(value), so the raw column
    // holds a quote-wrapped string. The store must decode it, or the key gets
    // sent to USDA/TMDB as `"key"` (with quotes) and the request 403s.
    datomsWritable.set([
      {
        attribute: "settings/usda_api_key",
        value: JSON.stringify("c5VBKl3eEuiPmtgaJfpcDS60QMBZ7t7gGDNspXt2"),
        time: 1,
      },
      {
        attribute: "settings/scraper_proxy_url",
        value: JSON.stringify("/api/proxy?url="),
        time: 2,
      },
    ]);
    const s = get(settingsStore);
    expect(s.usda_api_key).toBe("c5VBKl3eEuiPmtgaJfpcDS60QMBZ7t7gGDNspXt2");
    expect(s.scraper_proxy_url).toBe("/api/proxy?url=");
  });

  it("keeps an all-digit key as a string rather than coercing to a number", () => {
    datomsWritable.set([
      {
        attribute: "settings/tmdb_api_key",
        value: JSON.stringify("0123456789"),
        time: 1,
      },
    ]);
    const s = get(settingsStore);
    expect(s.tmdb_api_key).toBe("0123456789");
  });

  it("reflects reactive updates to the underlying datoms", () => {
    datomsWritable.set([
      { attribute: "settings/tmdb_api_key", value: "k1", time: 1 },
    ]);
    expect(get(settingsStore).tmdb_api_key).toBe("k1");
    datomsWritable.set([
      { attribute: "settings/tmdb_api_key", value: "k2", time: 2 },
    ]);
    expect(get(settingsStore).tmdb_api_key).toBe("k2");
  });
});

describe("saveSettings", () => {
  it("appends one datom per settings attribute to settings:global", async () => {
    await saveSettings({
      usda_api_key: "U",
      tmdb_api_key: "T",
      scraper_proxy_url: "P",
    });
    expect(appendMock).toHaveBeenCalledTimes(1);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms.every((d) => d.entity === "settings:global")).toBe(true);
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    expect(byAttr["settings/usda_api_key"]).toBe("U");
    expect(byAttr["settings/tmdb_api_key"]).toBe("T");
    expect(byAttr["settings/scraper_proxy_url"]).toBe("P");
  });
});
