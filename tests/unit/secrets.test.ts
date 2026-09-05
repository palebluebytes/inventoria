import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  freshModule,
  freshModuleWithStorage,
  stubLocalStorage,
  stubNoLocalStorage,
} from "./support/local-storage";

// The secrets module snapshots localStorage + env at import time, so each test
// re-imports it fresh after stubbing the globals it will read. The in-memory
// store comes from the shared adapter (#222), so the guarded read/write path is
// exercised rather than mocked away — the Node runner has no localStorage of
// its own.
const loadSecrets = () => import("../../src/lib/stores/secrets");

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
    const [{ getSecret, setSecret }, ls] =
      await freshModuleWithStorage(loadSecrets);

    setSecret("off_password", "hunter2");
    expect(getSecret("off_password")).toBe("hunter2");
    // It landed in localStorage under a namespaced key — and nowhere else. The
    // module imports no db client, so there is no datom path for it to take.
    expect(ls.store.get("inventoria_secret_off_password")).toBe("hunter2");
  });

  it("stores each secret under its own namespaced localStorage key", async () => {
    const [{ setSecret }, ls] = await freshModuleWithStorage(loadSecrets);

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
    stubLocalStorage();
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret } = await freshModule(loadSecrets);

    expect(getSecret("tmdb_api_key")).toBe("env-tmdb");
  });

  it("prefers the stored value over the env fallback once set", async () => {
    stubLocalStorage();
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret, setSecret } = await freshModule(loadSecrets);

    setSecret("tmdb_api_key", "stored-tmdb");
    expect(getSecret("tmdb_api_key")).toBe("stored-tmdb");
  });

  it("treats a stored empty string as an explicit clear (overrides env)", async () => {
    stubLocalStorage();
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret, setSecret } = await freshModule(loadSecrets);

    setSecret("tmdb_api_key", "");
    expect(getSecret("tmdb_api_key")).toBe("");
  });

  it("has no env fallback for the OFF credentials", async () => {
    stubLocalStorage();
    // Even if these happen to be set in the environment, the OFF creds are
    // user-only — they never seed from an env var.
    vi.stubEnv("VITE_TMDB_API_KEY", "env-tmdb");
    const { getSecret } = await freshModule(loadSecrets);

    expect(getSecret("off_user_id")).toBe("");
    expect(getSecret("off_password")).toBe("");
  });

  it("returns an empty string when neither localStorage nor env has a value", async () => {
    const [{ getSecret }] = await freshModuleWithStorage(loadSecrets);

    expect(getSecret("tmdb_api_key")).toBe("");
  });

  it("degrades to empty reads when localStorage is unavailable", async () => {
    // Reads return "" and writes are silent no-ops, never throw.
    stubNoLocalStorage();
    const { getSecret, setSecret } = await freshModule(loadSecrets);
    expect(() => setSecret("off_password", "x")).not.toThrow();
    expect(getSecret("off_password")).toBe("");
  });

  it("secretsStore reactively reflects a setSecret write", async () => {
    const [{ secretsStore, setSecret }] =
      await freshModuleWithStorage(loadSecrets);

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
    const [{ clearRetiredSecrets }, ls] = await freshModuleWithStorage(
      loadSecrets,
      { seed: { inventoria_secret_usda_api_key: "an-old-key" } }
    );

    clearRetiredSecrets();

    expect(ls.store.has("inventoria_secret_usda_api_key")).toBe(false);
  });

  it("leaves the OFF login and the TMDB key exactly as they were", async () => {
    const [{ clearRetiredSecrets, getSecret, setSecret }, ls] =
      await freshModuleWithStorage(loadSecrets);
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
    const [{ clearRetiredSecrets }, ls] =
      await freshModuleWithStorage(loadSecrets);

    clearRetiredSecrets();
    clearRetiredSecrets();

    expect([...ls.store.keys()]).toEqual([]);
  });

  it("does not throw where localStorage is unavailable", async () => {
    // There was nothing readable to clear, and startup must not fail over it.
    stubNoLocalStorage();
    const { clearRetiredSecrets } = await freshModule(loadSecrets);

    expect(() => clearRetiredSecrets()).not.toThrow();
  });
});
