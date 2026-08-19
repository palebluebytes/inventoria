import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// A minimal in-memory localStorage, so the Node unit runner (which has no
// localStorage) can exercise the real read/write path. Exposed `.store` lets a
// test assert exactly which keys were persisted.
function makeFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

// The secrets module snapshots localStorage + env at import time, so each test
// re-imports it fresh after stubbing the globals it will read.
async function loadSecrets() {
  vi.resetModules();
  return import("../../src/lib/stores/secrets");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("secrets accessor", () => {
  it("setSecret persists to localStorage and getSecret reads it back", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { getSecret, setSecret } = await loadSecrets();

    setSecret("off_password", "hunter2");
    expect(getSecret("off_password")).toBe("hunter2");
    // It landed in localStorage under a namespaced key — and nowhere else. The
    // module imports no db client, so there is no datom path for it to take.
    expect(ls.store.get("inventoria_secret_off_password")).toBe("hunter2");
  });

  it("stores each secret under its own namespaced localStorage key", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { setSecret } = await loadSecrets();

    setSecret("off_user_id", "tester");
    setSecret("off_password", "hunter2");
    setSecret("tmdb_api_key", "T");

    expect([...ls.store.keys()].sort()).toEqual([
      "inventoria_secret_off_password",
      "inventoria_secret_off_user_id",
      "inventoria_secret_tmdb_api_key",
    ]);
  });

  it("falls back to the env var for the API key when localStorage is unset", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret } = await loadSecrets();

    expect(getSecret("tmdb_api_key")).toBe("env-tmdb");
  });

  it("prefers the stored value over the env fallback once set", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret, setSecret } = await loadSecrets();

    setSecret("tmdb_api_key", "stored-tmdb");
    expect(getSecret("tmdb_api_key")).toBe("stored-tmdb");
  });

  it("treats a stored empty string as an explicit clear (overrides env)", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret, setSecret } = await loadSecrets();

    setSecret("tmdb_api_key", "");
    expect(getSecret("tmdb_api_key")).toBe("");
  });

  it("has no env fallback for the OFF credentials", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    // Even if these happen to be set in the environment, the OFF creds are
    // user-only — they never seed from an env var.
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret } = await loadSecrets();

    expect(getSecret("off_user_id")).toBe("");
    expect(getSecret("off_password")).toBe("");
  });

  it("returns an empty string when neither localStorage nor env has a value", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { getSecret } = await loadSecrets();

    expect(getSecret("tmdb_api_key")).toBe("");
  });

  it("degrades to empty reads when localStorage is unavailable", async () => {
    // No stubGlobal → localStorage is undefined under Node, as in a privacy-
    // locked browser. Reads return "" and writes are silent no-ops, never throw.
    const { getSecret, setSecret } = await loadSecrets();
    expect(() => setSecret("off_password", "x")).not.toThrow();
    expect(getSecret("off_password")).toBe("");
  });

  it("secretsStore reactively reflects a setSecret write", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { secretsStore, setSecret } = await loadSecrets();

    expect(get(secretsStore).tmdb_api_key).toBe("");
    setSecret("tmdb_api_key", "live-key");
    expect(get(secretsStore).tmdb_api_key).toBe("live-key");
  });
});

// The USDA key is retired with the FoodData Central API behind it (ADR-0047 §1).
// A credential nothing reads is a liability, so an already-stored one comes off
// the device — and only that one, since the OFF login and the TMDB key ride the
// same accessor.
describe("clearRetiredSecrets", () => {
  it("takes a stored USDA key off the device", async () => {
    const ls = makeFakeLocalStorage();
    ls.store.set("inventoria_secret_usda_api_key", "an-old-key");
    vi.stubGlobal("localStorage", ls);
    const { clearRetiredSecrets } = await loadSecrets();

    clearRetiredSecrets();

    expect(ls.store.has("inventoria_secret_usda_api_key")).toBe(false);
  });

  it("leaves the OFF login and the TMDB key exactly as they were", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { clearRetiredSecrets, getSecret, setSecret } = await loadSecrets();
    setSecret("off_user_id", "tester");
    setSecret("off_password", "hunter2");
    setSecret("tmdb_api_key", "T");
    ls.store.set("inventoria_secret_usda_api_key", "an-old-key");

    clearRetiredSecrets();

    expect(getSecret("off_user_id")).toBe("tester");
    expect(getSecret("off_password")).toBe("hunter2");
    expect(getSecret("tmdb_api_key")).toBe("T");
    expect([...ls.store.keys()].sort()).toEqual([
      "inventoria_secret_off_password",
      "inventoria_secret_off_user_id",
      "inventoria_secret_tmdb_api_key",
    ]);
  });

  it("is a no-op on a device that never stored one, and repeats harmlessly", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const { clearRetiredSecrets } = await loadSecrets();

    clearRetiredSecrets();
    clearRetiredSecrets();

    expect([...ls.store.keys()]).toEqual([]);
  });

  it("does not throw where localStorage is unavailable", async () => {
    // No stubGlobal → localStorage is undefined, as in a privacy-locked browser:
    // there was nothing readable to clear, and startup must not fail over it.
    const { clearRetiredSecrets } = await loadSecrets();

    expect(() => clearRetiredSecrets()).not.toThrow();
  });
});
