import { writable } from "svelte/store";

/**
 * Secrets live in `localStorage`, never in the append-only EAVT ledger
 * (ADR-0034 §8). The ledger is undeletable and it syncs — the wrong home for a
 * password. This module is the **single read/write path** for every secret:
 * the user's Open Food Facts login (`off_user_id` / `off_password`, needed to
 * contribute in #61) plus the TMDB API key that used to live as a
 * `settings/tmdb_api_key` datom and moved here (no migration — pre-release; the
 * old datoms are simply abandoned).
 *
 * `localStorage` is per-device and unsynced — that is the point (a secret must
 * not sync), so the user re-enters these on a new device.
 *
 * The USDA key was a fourth secret until ADR-0047 §1 retired the FoodData
 * Central API behind it; {@link clearRetiredSecrets} is what takes an already
 * stored one off the device.
 *
 * **`model_route_key` is not like the other three.** They are third-party
 * credentials the user owns — their Open Food Facts login, their TMDB key. This
 * one is **ours**, held by the user only because they are the operator of the
 * deployment, which is why it is named for the route rather than for the model
 * or the vendor: it gates `/api/model`, not Workers AI, and that distinction
 * survives a provider pivot (ADR-0115 §4.3).
 */
export type SecretKey =
  | "off_user_id"
  | "off_password"
  | "tmdb_api_key"
  | "model_route_key";

// Namespaced `localStorage` keys, so a secret never collides with other app
// state (e.g. `inventoria_test_state`).
const LS_KEYS: Record<SecretKey, string> = {
  off_user_id: "inventoria_secret_off_user_id",
  off_password: "inventoria_secret_off_password",
  tmdb_api_key: "inventoria_secret_tmdb_api_key",
  model_route_key: "inventoria_secret_model_route_key",
};

// Dev-seeding fallback: an env var supplies the value when `localStorage` has
// no entry for that key, so a dev with a `.env` still gets a working key without
// re-typing it. Only the moved key has one; the OFF creds are user-only and
// never shipped in an env var.
//
// **`model_route_key` has no fallback, and never gets one** (ADR-0115 §4.3).
// "Be consistent with `tmdb_api_key`" is the obvious wrong move here and
// somebody will make it, so the reason is written where they will be standing:
// `import.meta.env.VITE_*` is **inlined into the bundle at build time**. A dev's
// own TMDB key in their own local build is harmless, because it is theirs. This
// one is a **shared operator secret**, and inlining it ships it to every visitor
// of the deployed site the first time that variable is set in any build
// environment — silently, totally, and with the Free plan's $0 ceiling no longer
// protecting anything, since a publicly readable key invites exactly the
// daily-request denial the gate exists to stop. This is the one secret where the
// fallback *is* the leak. Dev convenience costs one paste into Settings, which
// is the cost the OFF credentials already impose.
const ENV_FALLBACKS: Partial<Record<SecretKey, string>> = {
  tmdb_api_key: (import.meta.env?.VITE_TMDB_API_KEY as string) ?? "",
};

// `localStorage` is absent under the Node unit runner (and could throw in a
// privacy-locked browser), so every access is guarded — a missing store simply
// reads as unset and writes are no-ops.
function safeGet(lsKey: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(lsKey);
  } catch {
    return null;
  }
}

function safeSet(lsKey: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(lsKey, value);
  } catch {
    /* privacy-locked / quota-exceeded — the secret just doesn't persist */
  }
}

function safeRemove(lsKey: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(lsKey);
  } catch {
    /* privacy-locked — there was nothing readable to clear either */
  }
}

/**
 * Reads one secret: the stored `localStorage` value when present, else the env
 * fallback (only for the TMDB key), else `""`. A stored empty string counts
 * as set — an explicit clear overrides the env var, matching how a blank datom
 * used to override the env default.
 */
function readSecret(key: SecretKey): string {
  const stored = safeGet(LS_KEYS[key]);
  if (stored !== null) return stored;
  return ENV_FALLBACKS[key] ?? "";
}

export interface SecretsState {
  off_user_id: string;
  off_password: string;
  tmdb_api_key: string;
  model_route_key: string;
}

function snapshot(): SecretsState {
  return {
    off_user_id: readSecret("off_user_id"),
    off_password: readSecret("off_password"),
    tmdb_api_key: readSecret("tmdb_api_key"),
    model_route_key: readSecret("model_route_key"),
  };
}

// A reactive view of the secrets, so Svelte consumers (e.g. the TMDB-key gate in
// MediaIngestModal) re-render the moment a key is saved in Settings —
// `setSecret` re-snapshots and pushes the new value.
const store = writable<SecretsState>(snapshot());

/** Reactive secrets store — subscribe for gating UI on a key's presence. */
export const secretsStore = { subscribe: store.subscribe };

/** Reads the current value of one secret (localStorage → env → ""). */
export function getSecret(key: SecretKey): string {
  return readSecret(key);
}

/**
 * Writes one secret to `localStorage` and refreshes the reactive store. Appends
 * **no datom** — a secret never enters the ledger (ADR-0034 §8).
 */
export function setSecret(key: SecretKey, value: string): void {
  safeSet(LS_KEYS[key], value);
  store.set(snapshot());
}

// Secrets this app used to store and no longer reads. Only the namespaced key is
// named here, deliberately: the retired secret is gone from {@link SecretKey},
// so it cannot be read, written, or spelled anywhere else in the module.
const RETIRED_LS_KEYS = ["inventoria_secret_usda_api_key"];

/**
 * Removes every retired secret from this device, called once at startup
 * (ADR-0047 §1). A credential nothing reads is a liability rather than a
 * courtesy: left alone, a USDA key entered before the FoodData Central API was
 * retired would sit in `localStorage` indefinitely and survive every future
 * audit of what this app holds.
 *
 * It touches ONLY the keys named above — the OFF login and the TMDB key ride the
 * same accessor and are untouched — and it is idempotent, so running it on every
 * load costs nothing after the first.
 */
export function clearRetiredSecrets(): void {
  for (const lsKey of RETIRED_LS_KEYS) safeRemove(lsKey);
}
