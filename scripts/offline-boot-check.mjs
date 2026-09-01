#!/usr/bin/env node
/**
 * Cold-offline-start check. Runs with `pnpm check:offline`; also chained onto
 * `pnpm build`, which is the only moment there is a dist/ to check.
 *
 * The invariant: with the network off and a healthy service worker, evaluating
 * the entry chunk must reach `mount(App)`. Issue #125 shipped a build where it
 * did not — loro-crdt's `browser` entry fetched its WASM with a synchronous
 * XMLHttpRequest, Chrome dispatches no service worker `fetch` event for one, and
 * the throw landed during module evaluation. `#app` stayed empty and every
 * screen was unreachable, not just the one that needed the CRDT.
 *
 * Nothing in the roster could see it: `pnpm build` passed, so did the three
 * local gates, and the Playwright suite runs online. tests/offline-boot.spec.ts
 * covers it in a real browser now, but only on CI and only after a ~15s build.
 * This is the same question asked in about a second, with no browser, so a build
 * that cannot start offline never reaches a deploy.
 *
 * HOW IT WORKS
 *
 * A stubbed browser, then `import()` of the real built entry chunk, with the
 * request layer modelling what a cold offline install actually has:
 *
 *   - dist/sw.js's precache manifest is the source of truth for what is cached.
 *     A request for anything outside it fails, exactly as it would offline.
 *   - `fetch` and *asynchronous* XMLHttpRequest are served from that manifest,
 *     because a service worker intercepts them.
 *   - *Synchronous* XMLHttpRequest always fails. Chrome dispatches no `fetch`
 *     event for one, so precaching cannot help it — the #125 mechanism.
 *
 * TWO ARMS, so the check can tell you which thing is broken. The online arm
 * serves everything and must reach mount; if it does not, this script's browser
 * stubs have fallen behind the app (a Svelte upgrade reaching for a new DOM
 * global, say) and the check needs updating rather than the app. Only when the
 * online arm passes and the offline arm fails is the app genuinely broken.
 *
 * Failures *inside* mount are where the stubs run out and are not interesting to
 * either arm — both hit the same wall, and reaching mount is the whole question.
 *
 * Exit 0 pass, 1 the app cannot start offline, 2 this check needs updating.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const RESULT = "__OFFLINE_BOOT_RESULT__";

// ─── the probe ─────────────────────────────────────────────────────────────
// Runs in a child process so that a browser global the bundle reaches for can be
// stubbed and the whole evaluation retried from clean module state.

if (process.env.__OFFLINE_BOOT_CHILD) {
  const online = process.env.__OFFLINE_BOOT_ONLINE === "1";

  // The chunk is found by its `type="module"` tag rather than by its name.
  // `assets/index-*.js` was that name only while there was one HTML entry: the
  // second one gave `build.rolldownOptions.input` named keys, so each entry
  // chunk is now named after its Facet and the root's is `assets/root-*.js`.
  // The old regex would have failed by *not matching* — reporting "could not
  // find the entry chunk" for a build that was fine (#301). This still names
  // `dist/index.html`, which is the larger half of the same defect and is
  // #309's: ADR-0083 §1 has this script enumerate the Facets from the registry
  // and run both arms once per entry, so **Rations' offline boot is unproven
  // until then**.
  const entry = readFileSync(join(DIST, "index.html"), "utf8").match(
    /<script[^>]+type="module"[^>]+src="\/?(assets\/[^"]+\.js)"/
  )?.[1];
  if (!entry) fail("could not find the entry chunk in dist/index.html");

  // Workbox writes the manifest into sw.js as `{url:"…",revision:"…"}` records.
  // Reading it rather than listing dist/ keeps this honest: a file present on
  // disk but absent from the manifest is not on a cold offline install.
  const precache = new Set(
    [
      ...readFileSync(join(DIST, "sw.js"), "utf8").matchAll(/url:"([^"]*)"/g),
    ].map((m) => m[1])
  );
  if (precache.size === 0) fail("no precache manifest found in dist/sw.js");

  /**
   * Reduce anything the bundle asks for to a key the manifest would use.
   *
   * Vite emits absolute base paths, so a `new URL("/assets/x", import.meta.url)`
   * in a chunk loaded from disk resolves to `file:///assets/x` — the origin is
   * empty, not the dist directory. Both that shape and a genuine
   * `file:///…/dist/assets/x` have to land on `assets/x`.
   */
  const manifestKey = (url) => {
    let path = String(url).split(/[?#]/)[0];
    path = path.replace(/^file:\/*/, "/").replace(/^https?:\/\/[^/]*/, "");
    const dist = path.lastIndexOf("/dist/");
    if (dist !== -1) path = path.slice(dist + "/dist/".length);
    return path.replace(/^\/+/, "");
  };

  /** Every request the pre-mount graph made, and what became of it. */
  const requests = [];

  const serve = (url, { sync }) => {
    const key = manifestKey(url);
    const record = { url: key, sync, served: false, reason: "" };
    requests.push(record);

    const onDisk = join(DIST, key);
    if (!existsSync(onDisk)) {
      record.reason = `no such file in dist/ (resolved '${url}' to '${key}')`;
      throw new Error(`NetworkError: '${key}' does not exist in the build`);
    }
    if (online) {
      record.served = true;
      return readFileSync(onDisk);
    }
    if (sync) {
      record.reason =
        "synchronous XMLHttpRequest — Chrome dispatches no service worker " +
        "fetch event for one, so precaching cannot serve it";
      throw new Error(`NetworkError: failed to load '${key}'`);
    }
    if (!precache.has(key)) {
      record.reason = "not in the dist/sw.js precache manifest";
      throw new Error(`NetworkError: '${key}' is not precached`);
    }
    record.served = true;
    return readFileSync(onDisk);
  };

  installBrowser(serve);

  let thrown = null;
  try {
    await import(pathToFileURL(join(DIST, entry)).href);
  } catch (e) {
    thrown = e;
  }

  const missing = String(thrown?.message ?? "").match(
    /(\w+) is not defined/
  )?.[1];
  process.stdout.write(
    RESULT +
      JSON.stringify({
        entry,
        precacheSize: precache.size,
        reachedMount: globalThis.__reachedMount === true,
        requests,
        error: thrown ? String(thrown.message).split("\n")[0] : null,
        missingGlobal: missing ?? null,
      })
  );
  process.exit(0);
}

// ─── the driver ────────────────────────────────────────────────────────────

if (!existsSync(join(DIST, "index.html")) || !existsSync(join(DIST, "sw.js"))) {
  console.error(
    "offline-boot-check: no dist/ to check. Run `pnpm build` first, or use\n" +
      "`pnpm check:offline`, which builds."
  );
  process.exit(2);
}

/** Run one arm, stubbing whatever browser global it dies on until it settles. */
const runArm = (online) => {
  const stubs = [];
  for (let round = 0; round <= 40; round++) {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url)],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          __OFFLINE_BOOT_CHILD: "1",
          __OFFLINE_BOOT_ONLINE: online ? "1" : "0",
          __OFFLINE_BOOT_STUBS: stubs.join(","),
        },
      }
    );
    const marker = child.stdout.indexOf(RESULT);
    if (marker === -1) {
      return {
        fatal: (child.stderr || child.stdout || "no output").trim().slice(-600),
        stubs,
      };
    }
    const result = JSON.parse(child.stdout.slice(marker + RESULT.length));
    // A missing global is this script's stubs running out, not a finding —
    // define it and retry from clean module state.
    if (result.missingGlobal && !stubs.includes(result.missingGlobal)) {
      stubs.push(result.missingGlobal);
      continue;
    }
    return { ...result, stubs };
  }
  return { fatal: "gave up stubbing browser globals after 40 rounds" };
};

const onlineArm = runArm(true);
const offlineArm = runArm(false);

const needsUpdating = (arm, label) => {
  if (arm.fatal) {
    console.error(
      `offline-boot-check: the ${label} arm could not run.\n${arm.fatal}`
    );
    return true;
  }
  return false;
};
if (
  needsUpdating(onlineArm, "online") ||
  needsUpdating(offlineArm, "offline")
) {
  process.exit(2);
}

if (!onlineArm.reachedMount) {
  console.error(
    "offline-boot-check: this check needs updating, not the app.\n" +
      "  The online arm did not reach mount() either, so the failure is in this\n" +
      "  script's browser stubs rather than in the build.\n" +
      `  It stopped at: ${onlineArm.error ?? "(no error)"}`
  );
  process.exit(2);
}

if (!offlineArm.reachedMount) {
  const blame = offlineArm.requests.filter((r) => !r.served);
  console.error(
    "offline-boot-check: FAIL — the app does not start with the network off.\n" +
      `  Evaluating ${offlineArm.entry} threw before mount(App) ran, so #app\n` +
      "  stays empty and every screen is unreachable, not just the one that\n" +
      "  needed whatever failed.\n" +
      `  It stopped at: ${offlineArm.error ?? "(no error)"}`
  );
  for (const r of blame) {
    console.error(`  unserved request: ${r.url}\n    ${r.reason}`);
  }
  console.error(
    "\n  Whatever the pre-mount graph reaches for has to be either precached and\n" +
      "  requested asynchronously, inlined into the bundle, or moved behind a\n" +
      "  dynamic import so it is not on the critical path. See issue #125."
  );
  process.exit(1);
}

const served = offlineArm.requests.length;
console.log(
  `  ok  the app starts offline (${offlineArm.entry}, ` +
    `${offlineArm.precacheSize} precached URLs, ` +
    `${served} pre-mount request${served === 1 ? "" : "s"})`
);

// ─── the stubbed browser ───────────────────────────────────────────────────

function fail(message) {
  console.error(`offline-boot-check: ${message}`);
  process.exit(2);
}

/**
 * Enough of a browser for a Svelte bundle to evaluate. Deliberately shallow:
 * the question is whether evaluation reaches mount(), and everything mount()
 * itself touches is past the point this check cares about.
 */
function installBrowser(serve) {
  const noop = () => {};
  const define = (k, v) =>
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });

  const el = () => ({
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop,
    getAttribute: () => null,
    removeAttribute: noop,
    appendChild: noop,
    insertBefore: noop,
    remove: noop,
    cloneNode: () => el(),
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    content: { cloneNode: () => el() },
    firstChild: null,
    childNodes: [],
  });

  globalThis.window = globalThis;
  globalThis.self = globalThis;

  // The boot guard listens for an uncaught shell error on `window` before the
  // app graph evaluates, so the stub needs the listener pair the real thing
  // has. Nothing here fires them: this arm asserts the app reaches mount, and
  // reaching mount is precisely the case where the guard never acts.
  globalThis.addEventListener = noop;
  globalThis.removeEventListener = noop;

  globalThis.__reachedMount = false;
  globalThis.document = {
    documentElement: el(),
    head: el(),
    body: el(),
    createElement: el,
    createElementNS: el,
    createTextNode: el,
    createComment: el,
    createDocumentFragment: el,
    querySelector: () => el(),
    querySelectorAll: () => [],
    // Every entry ends in mountFacet(), whose one `getElementById("app")` is
    // looked up exactly once in the whole graph, so the lookup is a precise
    // marker for "evaluation got as far as mounting".
    getElementById: (id) => {
      if (id === "app") globalThis.__reachedMount = true;
      return el();
    },
    addEventListener: noop,
    removeEventListener: noop,
    title: "",
    visibilityState: "visible",
    cookie: "",
  };

  define("navigator", {
    userAgent: "offline-boot-check",
    language: "en-GB",
    languages: ["en-GB"],
    onLine: false,
    serviceWorker: {
      controller: {},
      register: async () => ({}),
      addEventListener: noop,
      ready: new Promise(noop),
    },
    storage: { estimate: async () => ({}), persisted: async () => true },
  });
  define("location", new URL("http://localhost/"));

  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
  define("localStorage", storage);
  define("sessionStorage", storage);

  globalThis.XMLHttpRequest = class {
    open(_method, url, isAsync = true) {
      this._url = url;
      this._sync = isAsync === false;
    }
    overrideMimeType() {}
    setRequestHeader() {}
    send() {
      const bytes = serve(this._url, { sync: this._sync });
      this.status = 200;
      this.response = bytes;
      this.responseText = bytes.toString("latin1");
    }
  };

  globalThis.fetch = async (input) => {
    const url =
      typeof input === "string" ? input : (input?.url ?? String(input));
    return new Response(serve(url, { sync: false }), { status: 200 });
  };

  globalThis.matchMedia = () => ({
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
  });
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.Worker = class {
    postMessage() {}
    addEventListener() {}
    terminate() {}
  };
  globalThis.CSS = { supports: () => false, escape: (s) => s };
  globalThis.customElements = { define: noop, get: () => undefined };
  globalThis.crossOriginIsolated = true;

  // Anything else the bundle reaches for at module scope. The driver feeds these
  // in one at a time as it discovers them, so the list stays honest about what
  // is actually needed rather than guessing up front.
  const permissive = (name) =>
    new Proxy(function () {}, {
      get: (_t, k) =>
        k === Symbol.toPrimitive || k === "toString"
          ? () => name
          : permissive(name),
      apply: () => permissive(name),
      construct: () => permissive(name),
      has: () => true,
    });
  for (const name of (process.env.__OFFLINE_BOOT_STUBS ?? "")
    .split(",")
    .filter(Boolean)) {
    if (!(name in globalThis)) define(name, permissive(name));
  }
}
