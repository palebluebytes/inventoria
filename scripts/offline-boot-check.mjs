#!/usr/bin/env node
/**
 * Cold-offline-start check, once per Facet. Runs with `pnpm check:offline`; also
 * chained onto `pnpm build`, which is the only moment there is a dist/ to check.
 *
 * The invariant: with the network off and a healthy service worker, evaluating
 * a Facet's entry chunk must reach `mount(App)`. Issue #125 shipped a build where
 * it did not — loro-crdt's `browser` entry fetched its WASM with a synchronous
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
 * ONCE PER FACET, AND THE ROSTER SAYS WHICH (ADR-0083 §1, §2)
 *
 * This script named one entry point four times — `dist/index.html` twice,
 * `dist/sw.js`, and an entry-chunk regex that fails by *not matching* rather
 * than by not finding a file. With `/food/` in the build it would have reported
 * that the app starts offline while Rations could not start at all, silently,
 * which is precisely the #125 mechanism it was written to stop.
 *
 * So the Facets are enumerated from `src/lib/facets/registry.ts` and every path
 * is derived from a Facet's own scope. **One entry cannot stand for the other**:
 * ADR-0077 §2 makes the two precache manifests genuinely different sets —
 * Rations precaches `nutrient-store.json` and `zxing_reader.wasm` and the root
 * does not — so proving one boots offline says nothing about the other. Measured
 * at ~2.4s for one Facet's two arms against a 15.5s build, which is what prices
 * the wall-clock worry away.
 *
 * The entry chunk comes off the build's own metadata artifact
 * (`.facets/bundle-metadata.json`, ADR-0083 §6) rather than out of the emitted
 * HTML: it is the bundler's fact about which chunk an entry compiled to, where
 * the regex was a guess about a filename. The precache is still read from that
 * Facet's own `sw.js`, because that file is what the browser reads and a
 * manifest this script derived for itself would be a model of the install
 * rather than the install.
 *
 * HOW IT WORKS
 *
 * A stubbed browser, then `import()` of the real built entry chunk, with the
 * request layer modelling what a cold offline install actually has:
 *
 *   - that Facet's precache manifest is the source of truth for what is cached.
 *     A request for anything outside it fails, exactly as it would offline.
 *   - `fetch` and *asynchronous* XMLHttpRequest are served from that manifest,
 *     because a service worker intercepts them.
 *   - *Synchronous* XMLHttpRequest always fails. Chrome dispatches no `fetch`
 *     event for one, so precaching cannot help it — the #125 mechanism.
 *
 * TWO ARMS PER FACET, so the check can tell you which thing is broken. The
 * online arm serves everything and must reach mount; if it does not, this
 * script's browser stubs have fallen behind the app (a Svelte upgrade reaching
 * for a new DOM global, say) and the check needs updating rather than the app.
 * Only when the online arm passes and the offline arm fails is the app genuinely
 * broken.
 *
 * Both arms **per Facet**, never one shared online arm: a Facet's entry is a
 * different module graph, so the globals it reaches for at module scope are
 * discovered separately, and sharing the root's stub set would report a
 * Rations-specific stub gap as *the food app cannot start offline*. That false
 * alarm is how a gate gets switched off.
 *
 * Failures *inside* mount are where the stubs run out and are not interesting to
 * either arm — both hit the same wall, and reaching mount is the whole question.
 *
 * Exit 0 pass, 1 a Facet cannot start offline, 2 this check needs updating.
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
  // Which Facet, which chunk, which service worker: all three decided by the
  // driver off the roster and the build metadata, so nothing in the probe knows
  // a filename (ADR-0083 §1).
  const facetName = process.env.__OFFLINE_BOOT_FACET;
  const entry = process.env.__OFFLINE_BOOT_ENTRY;
  const swPath = process.env.__OFFLINE_BOOT_SW;

  // Workbox writes the manifest into sw.js as `{url:"…",revision:"…"}` records.
  // Reading it rather than listing dist/ keeps this honest: a file present on
  // disk but absent from the manifest is not on a cold offline install. And it
  // is **this Facet's** sw.js: the two manifests are different sets, so the
  // root's would report Rations booting offline on files Rations never cached.
  //
  // The leading slash comes off, so these keys are dist-relative like
  // `manifestKey`'s below. Every precache URL is absolute since #306 — workbox
  // resolves one against its own service worker's location, so `/food/sw.js`
  // would read `assets/x.js` as `/food/assets/x.js` — and a comparison against
  // relative request keys would silently match nothing and report an app that
  // cannot start offline.
  const precache = new Set(
    [
      ...readFileSync(join(DIST, swPath), "utf8").matchAll(/url:"([^"]*)"/g),
    ].map((m) => m[1].replace(/^\/+/, ""))
  );
  if (precache.size === 0) {
    fail(`no precache manifest found in ${swPath} (the ${facetName} Facet)`);
  }

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
//
// Below the probe, and reached only by the parent: a child process returns
// before here, so it never pays for the roster or the metadata artifact — and
// there are two child processes per arm per Facet.

const { FACETS, inScope, readBuildMetadata, stopper } =
  await import("./facet-build.mjs");

const cannotRun = stopper("offline-boot-check");
const { bundleOf } = readBuildMetadata(cannotRun);

/**
 * What one Facet's arms need, all of it derived rather than named.
 *
 * The service worker sits inside the scope it claims — `vite.config.ts` derives
 * its filename the same way — and the entry chunk is the bundler's own record of
 * which chunk that Facet's entry HTML compiled to.
 */
const targetOf = (facet) => {
  const bundle = bundleOf(facet);
  if (!bundle?.entryChunk) {
    cannotRun(
      `the build recorded no entry chunk for the ${facet.name} Facet.\n` +
        "  Either it is not in this build or the metadata artifact is stale;\n" +
        "  `pnpm build` writes dist/ and the artifact together."
    );
  }
  const sw = inScope(facet, "sw.js");
  for (const [path, what] of [
    [bundle.entryChunk, "entry chunk"],
    [sw, "service worker"],
  ]) {
    if (!existsSync(join(DIST, path))) {
      cannotRun(
        `the ${facet.name} Facet has no ${what} at dist/${path}.\n` +
          "  The metadata artifact is from a different build than dist/ is;\n" +
          "  re-run `pnpm build`."
      );
    }
  }
  return { entry: bundle.entryChunk, sw };
};

/** Run one arm, stubbing whatever browser global it dies on until it settles. */
const runArm = (facet, target, online) => {
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
          __OFFLINE_BOOT_FACET: facet.name,
          __OFFLINE_BOOT_ENTRY: target.entry,
          __OFFLINE_BOOT_SW: target.sw,
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

/**
 * Prove one Facet, and report in that Facet's name.
 *
 * A message saying "the app does not start offline" when it means Rations sends
 * the reader to the wrong build (ADR-0083 §1), and the online arm is what keeps
 * "this check needs updating" separable from "this Facet is broken" — separately
 * per Facet, because the two entries are different module graphs and reach for
 * different globals at module scope.
 */
const proveFacet = (facet) => {
  const target = targetOf(facet);
  const onlineArm = runArm(facet, target, true);
  const offlineArm = runArm(facet, target, false);

  for (const [arm, label] of [
    [onlineArm, "online"],
    [offlineArm, "offline"],
  ]) {
    if (arm.fatal) {
      cannotRun(
        `the ${facet.name} Facet's ${label} arm could not run.\n${arm.fatal}`
      );
    }
  }

  if (!onlineArm.reachedMount) {
    cannotRun(
      `this check needs updating, not the ${facet.name} Facet.\n` +
        "  Its online arm did not reach mount() either, so the failure is in\n" +
        "  this script's browser stubs rather than in the build.\n" +
        `  It stopped at: ${onlineArm.error ?? "(no error)"}`
    );
  }

  if (!offlineArm.reachedMount) {
    console.error(
      `offline-boot-check: FAIL — the ${facet.name} Facet does not start with ` +
        "the network off.\n" +
        `  Evaluating ${target.entry} threw before mount() ran, so #app stays ` +
        `empty\n  at ${facet.scope} and every screen there is unreachable, ` +
        "not just the one that\n  needed whatever failed.\n" +
        `  It stopped at: ${offlineArm.error ?? "(no error)"}`
    );
    for (const request of offlineArm.requests.filter((r) => !r.served)) {
      console.error(
        `  unserved request: ${request.url}\n    ${request.reason}`
      );
    }
    console.error(
      "\n  Whatever the pre-mount graph reaches for has to be either precached\n" +
        "  and requested asynchronously, inlined into the bundle, or moved\n" +
        "  behind a dynamic import so it is not on the critical path. Note that\n" +
        `  the ${facet.name} Facet's **own** service worker (dist/${target.sw})\n` +
        "  is what has to precache it: the manifests are different sets, so the\n" +
        "  other Facet having the file is not this one having it. See #125."
    );
    return false;
  }

  const served = offlineArm.requests.length;
  console.log(
    `  ok  ${facet.name} starts offline (${target.entry}, ` +
      `${offlineArm.precacheSize} precached URLs, ` +
      `${served} pre-mount request${served === 1 ? "" : "s"})`
  );
  return true;
};

// Every Facet on the roster, and the number two appears nowhere: a third costs
// one registry entry and no edit here (ADR-0083 §1).
let broken = 0;
for (const facet of FACETS) {
  if (!proveFacet(facet)) broken++;
}
if (broken > 0) process.exit(1);

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
