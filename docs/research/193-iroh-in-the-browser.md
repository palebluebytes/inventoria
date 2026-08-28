# Research: can iroh reach a browser, and what would carrying it cost? (#193)

**Parent map:** [#185](https://github.com/palebluebytes/inventoria/issues/185) — send a meal to another person, and let your own devices converge.
**Grounds:** map decision 2 ("iroh is a candidate, not the choice"), decision 4 ("a server may exist but must never read"), decision 5 ("browser-only stays the constraint"), and the Out-of-scope entry that rules a native companion out.
**Date:** 2026-08-28. **Status:** research only — no code, no dependency added.
**Sources:** iroh's own docs (`docs.iroh.computer`), the `n0-computer` repositories at `main`, crates.io, and the deployed browser demos. Every size number below was measured by HTTP `HEAD`/`GET` against n0's own published artifacts on 2026-08-28; nothing is quoted from a blog summary.

---

## TL;DR — the verdict

**Yes, iroh runs inside a browser page today, on a released 1.x crate — but relay-only, with hole-punching structurally impossible there.** This is not a branch, not a feature flag, not an unreleased crate: `iroh` 1.1.0 (2026-08-25) compiles to `wasm32-unknown-unknown`, n0's compatibility matrix lists "WebAssembly (browser): Yes", and two of n0's own demos run in a page right now.

So the ticket's feared verdict — "browser cannot, native can" — is **wrong on the first half**. iroh does not need a native companion to reach a browser. What it _does_ need is a relay for **every byte of every browser connection, forever**, because the browser sandbox has no UDP and n0 say plainly they cannot port their hole-punching to it.

The cost is where it hurts:

1. **Weight.** The smallest published browser build (iroh + a hand-written echo protocol, release + `wasm-opt -Os`) is **2,608,331 bytes** of WASM. iroh + gossip is **3,204,548**. iroh + blobs is **4,645,571**. The app's current heaviest WASM asset, `loro-crdt`, is **3,112,556**. So iroh in the browser is a **second loro**, at best.
2. **Build system.** There is **no npm package** for the browser build. n0 say so in as many words. Carrying iroh means adding a Rust crate, `wasm32-unknown-unknown`, a pinned `wasm-bindgen` CLI, `wasm-opt`, and a `RUSTFLAGS` incantation to a repo whose entire toolchain is today pnpm + Vite.
3. **Infrastructure.** A relay must exist. It **cannot** be the Cloudflare Worker this repo already deploys — `iroh-relay` is a Rust process that binds a listening socket, and Workers cannot accept inbound TCP. The choice is n0's public relays (explicitly "development and hobby use only", rate-limited, no SLA) or a real always-on host.

Decision 4 ("a server may exist but must never read") is **satisfied** — relay traffic is end-to-end encrypted and n0 state the relay cannot decrypt it. Decision 5 ("browser-only") is **satisfied**. What iroh cannot give this map is the **zero-infrastructure path** that map decision 4 makes a first-class ticket: in a browser there is no such path, ever, by construction.

---

## 1. Does iroh run inside a browser page today?

**Yes.** Three independent primary confirmations:

**The compatibility matrix.** ([compatibility](https://docs.iroh.computer/compatibility))

| OS                    | Supported |
| --------------------- | --------- |
| …                     |           |
| WebAssembly (browser) | **Yes**   |

**The dedicated docs page.** [WebAssembly and Browsers](https://docs.iroh.computer/languages/wasm-browser), verbatim: _"Iroh can be compiled to WebAssembly for use in browsers!"_ and _"Add `iroh` to your browser project's dependencies and keep building it using [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen/)."_

**Two demos that are live right now**, deployed from [`n0-computer/iroh-examples`](https://github.com/n0-computer/iroh-examples) and served from GitHub Pages:

- [browser-echo](https://n0-computer.github.io/iroh-examples/main/browser-echo/index.html) — dials out _and_ accepts incoming connections; a browser endpoint and a CLI endpoint interoperate ([source](https://github.com/n0-computer/iroh-examples/tree/main/browser-echo)).
- [browser-chat](https://n0-computer.github.io/iroh-examples/main/browser-chat/index.html) — browser-to-browser gossip ([source](https://github.com/n0-computer/iroh-examples/tree/main/browser-chat)).

**On a released version, not a branch.** `browser-echo/Cargo.toml` pins `iroh = { version = "1.0.0", default-features = false, features = ["tls-ring"] }` ([Cargo.toml](https://github.com/n0-computer/iroh-examples/blob/main/browser-echo/Cargo.toml)). The published crate is at **1.1.0, released 2026-08-25**; 1.0.0 landed 2026-06-15 (crates.io API for [`iroh`](https://crates.io/crates/iroh)).

**It is a supported target, not a happy accident.** The `iroh` CI has a first-class `wasm_test` job ([`.github/workflows/ci.yml`](https://github.com/n0-computer/iroh/blob/main/.github/workflows/ci.yml)) that builds `iroh-base`, `iroh-relay` and `iroh` for `wasm32-unknown-unknown`, asserts the output contains no `import "env"` declarations (their tripwire for non-WASM-compatible code sneaking in), and runs the integration test suite under the wasm target. The 1.0 announcement says the same in prose: _"We built & continually check that iroh can compile to WASM & run in the browser"_ ([Iroh 1.0 — Dial Keys, not IPs](https://www.iroh.computer/blog/v1), 2026-06-15).

> **One honest nuance about "continually check".** That CI job runs the wasm tests under **Node 22.5**, chosen — per the step's own comment — because it has _"browser-like websocket API support in node.js"_. It is a `wasm32` build exercised in a browser-shaped runtime, not a headless Chrome. The _browser_ evidence is the deployed demos, which is strong but is a manual artifact rather than a per-commit gate.

The internal switch is a cfg alias, so browser behaviour is target-derived rather than opt-in ([`iroh/build.rs`](https://github.com/n0-computer/iroh/blob/main/iroh/build.rs)):

```rust
cfg_aliases! {
    wasm_browser: { all(target_family = "wasm", target_os = "unknown") },
    with_crypto_provider: { any(feature = "tls-ring", feature = "tls-aws-lc-rs") }
}
```

---

## 2. Which transport does the browser endpoint use, and is hole-punching available?

**WebSocket to a relay. Hole-punching is not available and n0 say it cannot be.**

From [WebAssembly and Browsers](https://docs.iroh.computer/languages/wasm-browser), verbatim and unabridged:

> **All connections from browsers to somewhere else need to flow via a relay server**.
> This is because we can't port our hole-punching logic in iroh to browsers: They don't support sending UDP packets to IP addresses from inside the browser sandbox.

> Keep in mind that _connections are end-to-end encrypted_, as always with iroh.
> So even though traffic from browsers is always relayed, it can't be decrypted by the relay.

> There are other ways of getting direct connections going, such as WebTransport with `serverCertificateHashes`, or WebRTC. We **may** expand iroh's browser support to make use of these to try to generate direct connections even when a browser node is involved in the connection.

That last paragraph is a _maybe_, not a roadmap item with a version on it. Treat browser-relay-only as the standing state.

**Confirmed in the source, not just the prose.** `iroh-relay`'s client has two `connect()` implementations. The native one dials TCP, negotiates TLS and upgrades via `tokio_websockets`. The browser one ([`iroh-relay/src/client.rs`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/src/client.rs)) is:

```rust
/// Establishes a new connection to the relay server.
#[cfg(wasm_browser)]
pub async fn connect(&self) -> Result<Client, ConnectError> {
    // …rewrites http→ws / https→wss…
    let (ws_meta, ws_stream) = ws_stream_wasm::WsMeta::connect(
        dial_url.as_str(),
        Some(ProtocolVersion::all().collect()),
    ).await.anyerr()?;
    // …
    Ok(Client { conn, local_addr: None })
}
```

`ws_stream_wasm` is a thin wrapper over the browser's own `WebSocket` object, and `local_addr: None` is the tell — a browser endpoint has no socket address of its own to report. Two further browser-shaped concessions in the same file:

- Auth tokens move from an `Authorization: Bearer` header to a `?token=` query parameter, because a browser cannot set headers on a WebSocket handshake.
- `dns_resolver` and the whole `iroh_dns` import are `#[cfg(not(wasm_browser))]`.

**Address lookup degrades too.** `iroh/src/address_lookup.rs` gates the DNS lookup out entirely — `#[cfg(not(wasm_browser))] pub mod dns;` — leaving `pkarr` (published over HTTP, so it survives) and `memory`. For this map that is mostly moot: an ephemeral hand-typed code carries the peer's address out of band anyway, so a browser endpoint never needs DNS discovery.

**Dependency evidence in the manifest** ([`iroh/Cargo.toml`](https://github.com/n0-computer/iroh/blob/main/iroh/Cargo.toml)): `hickory-resolver`, `portmapper`, and the tokio `net`/`fs` features are all under `[target.'cfg(not(all(target_family = "wasm", target_os = "unknown")))'.dependencies]`. The wasm target instead pulls `wasm-bindgen-futures`, `time` with `wasm-bindgen`, and `getrandom` with `wasm_js`.

**What this means concretely for the map.** Two browsers exchanging a meal are _always_ relayed — there is no lucky-network case where the relay drops out. Every datom of the reference closure crosses somebody's relay. The relay cannot read it (E2E encrypted), so map decision 4's "must never read" holds, but decision 4's companion ambition — "proving how far a **zero-infrastructure** path gets is a first-class ticket" — has no answer inside iroh. The answer is: zero metres.

---

## 3. What do the JavaScript bindings target?

**Node-native (NAPI). They are explicitly not for the browser.**

From [JavaScript](https://docs.iroh.computer/languages/javascript): the bindings ship as [`@number0/iroh`](https://www.npmjs.com/package/@number0/iroh) from [`n0-computer/iroh-ffi`](https://github.com/n0-computer/iroh-ffi), _"built with [napi-rs](https://napi.rs/), so the package distributes prebuilt native binaries. No Rust toolchain or local compilation is needed."_ Prebuilt N-API binaries are published for macOS `arm64`; Linux `x86_64`/`aarch64` (glibc + musl) and `armv7`; Windows `x86_64`/`aarch64`; Android `aarch64`/`armv7`. **Requires Node.js 20.3.0 or newer.** There is no browser entry, and no browser build.

The wasm-browser page draws the line itself:

> Our [JavaScript bindings](https://docs.iroh.computer/languages/javascript) are built on [NAPI](https://napi.rs) and wrap native iroh, so you get the full iroh environment, including direct connections and hole punching, **rather than the relay-only subset the browser build is limited to**.

So the two artefacts are disjoint. `@number0/iroh` is irrelevant to this map — it would only be reachable via the native companion the map rules out.

**And the browser build has no npm package at all.** Verbatim, same page:

> Currently we don't bundle iroh's Wasm build as an NPM package.
> There is no technical limitation for this: You could build this today!
> Should you need javascript APIs, we recommend that you write an application-specific rust wrapper crate that depends on iroh and exposes whatever the javascript side needs via [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen/).

This is the single largest hidden cost in the whole ticket. See §4.2.

---

## 4. What would it weigh?

### 4.1 Measured payloads

All figures are `content-length` on n0's own deployed demos, fetched 2026-08-28. These are **release builds with `wasm-opt`**, not debug: the deploy workflow runs `cargo make deploy`, whose per-example task is `npm run build:release` for echo (`cargo build --release` → `wasm-bindgen` → `wasm-opt -Os`) and `npm run build:wasm:release` for chat ([`Makefile.toml`](https://github.com/n0-computer/iroh-examples/blob/main/Makefile.toml), [`browser-echo/package.json`](https://github.com/n0-computer/iroh-examples/blob/main/browser-echo/package.json)). The `browser-echo` crate additionally sets `opt-level = "z"`, `lto = true`, `strip = "symbols"`, `panic = "abort"`. Artifacts are dated `Wed, 24 Jun 2026`.

| Demo                                                | Crates in the build               | `.wasm` raw   | `.wasm` gzip | JS glue |
| --------------------------------------------------- | --------------------------------- | ------------- | ------------ | ------- |
| `browser-echo` — iroh + a custom ALPN, nothing else | `iroh` 1.0.0                      | **2,608,331** | 1,105,576    | 49,611  |
| `browser-chat` — iroh + gossip broadcast            | `iroh` 1.0.0, `iroh-gossip` 0.101 | **3,204,548** | 1,173,967    | 42,002  |
| `browser-blobs` — iroh + content-addressed blobs    | `iroh` 1.0.0, `iroh-blobs` 0.103  | **4,645,571** | 1,801,795    | —       |

(Bytes. Sources: `https://n0-computer.github.io/iroh-examples/main/{browser-echo/wasm/browser_echo_bg.wasm, browser-chat/assets/chat_browser_bg-CZ2ikIRp.wasm, browser-blobs/wasm/blobs_wasm_bg.wasm}`. GitHub Pages served no brotli, so the gzip column is the realistic transfer size.)

**The 2.6 MB floor is the honest number for this map.** The wire shape is already decided (ADR-0064 NDJSON, one reader), so a send would ride a custom ALPN over a plain bidirectional QUIC stream — architecturally the `browser-echo` case, not blobs. Gossip is only needed if own-device convergence wants a broadcast overlay rather than pairwise streams; that would put it at ~3.2 MB.

### 4.2 The build-system cost, which is the real one

There is no `pnpm add`. Carrying iroh means this repo grows a Rust build:

- a new Rust crate in-tree wrapping `iroh` and exposing a `wasm-bindgen` surface — n0's own recommended shape (§3);
- `rustup target add wasm32-unknown-unknown`, on a crate whose MSRV is **Rust 1.91** ([`iroh/Cargo.toml`](https://github.com/n0-computer/iroh/blob/main/iroh/Cargo.toml));
- a **version-pinned** `wasm-bindgen-cli` — n0's CI pins `wasm-bindgen-cli@0.2.122` with the comment _"Match the version of wasm-bindgen used in Cargo.lock"_, and the examples pin `wasm-bindgen = "=0.2.122"` with the `=`. A mismatch between the CLI and the crate is a hard failure;
- `wasm-opt` (binaryen), with the demos passing `--enable-nontrapping-float-to-int --enable-bulk-memory`;
- `RUSTFLAGS='--cfg getrandom_backend="wasm_js"'` plus `getrandom = { features = ["wasm_js"] }` — required, not optional; without it the build fails with _"The wasm32-unknown-unknown targets are not supported by default"_;
- `iroh = { version = "1", default-features = false }` — mandatory, since the defaults (`metrics`, `fast-apple-datapath`, `portmapper`, `tls-ring`) drag in `mio`/`portmapper` and will not build. Note this also drops `tls-ring`, so it has to be re-enabled by hand, exactly as the examples do;
- an LLVM-based clang for `ring`, and a 32-bit clang; Apple Clang does not work.

Sources: [Common Wasm/browser Troubleshooting](https://github.com/n0-computer/iroh/discussions/3200), the wasm-browser docs page, [`ci.yml`](https://github.com/n0-computer/iroh/blob/main/.github/workflows/ci.yml), the example manifests.

Against a repo whose current build is `vite build && node scripts/offline-boot-check.mjs`, that is a category change: CI gains a Rust toolchain, contributors gain a Rust toolchain, and the reproducibility of `pnpm build` now depends on a pinned CLI outside the lockfile.

### 4.3 Against this repo's existing WASM budget

Measured in `node_modules` on 2026-08-28:

| Asset                                     | Bytes          |
| ----------------------------------------- | -------------- |
| `loro-crdt` (bundler) `loro_wasm_bg.wasm` | 3,112,556      |
| `zxing-wasm` `zxing_reader.wasm`          | 1,065,634      |
| `@sqlite.org/sqlite-wasm` `sqlite3.wasm`  | 864,752        |
| **an iroh echo-shaped browser build**     | **~2,608,331** |

iroh would become the app's **second-heaviest WASM module**, within 16% of loro. Against `vite.config.ts`'s own accounting, the workbox precache would grow by ~2.6 MB on top of the existing loro (~3.1 MB) and the USDA store (4.03 MiB as measured 2026-08-19).

### 4.4 The #125 offline-boot gate — passable, with two conditions

This was the ticket's specific worry, and it is **not** a repeat of #125. Reading the actual glue that n0 deploy (`browser_echo.js`, `--target=web`):

```js
module_or_path = new URL("browser_echo_bg.wasm", import.meta.url);
// …
module_or_path = fetch(module_or_path);
// …
if (typeof WebAssembly.instantiateStreaming === "function") {
  return await WebAssembly.instantiateStreaming(module, imports);
}
```

That is asynchronous `fetch` + `instantiateStreaming`, with a documented fallback to `WebAssembly.instantiate` when the MIME type is wrong. **No synchronous `XMLHttpRequest` anywhere** — which is precisely the mechanism `scripts/offline-boot-check.mjs` exists to catch (its header: _"loro-crdt's `browser` entry fetched its WASM with a synchronous XMLHttpRequest, Chrome dispatches no service worker `fetch` event for one"_). The gate's request model serves `fetch` and _async_ XHR from the precache manifest, so a `wasm-bindgen --target=web` module is exactly the shape it is built to let through.

Two conditions have to hold:

1. **The `.wasm` must be precached.** `vite.config.ts` already lists `wasm` in `globPatterns` and sets `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024`, so a 2.6 MB (or a 3.2 MB) module lands in the manifest. A blobs-shaped 4.43 MiB build would still fit — but only just, and the config comment is explicit that _"the headroom is for a mirror refresh growing it, not for a second asset this size."_ That comment would need rewriting, knowingly.
2. **`init()` must not run during entry-chunk evaluation.** n0's demo does `import init … ; await init();` at module top level. In this app that would make the whole boot wait on a 2.6 MB instantiation, and any failure would land during module evaluation — the exact #125 blast radius, where `#app` stays empty and _every_ screen is unreachable. Iroh has to be dynamically imported behind the send/sync feature, not eagerly.

Two smaller notes: the demos are served from GitHub Pages, which sets **no COOP/COEP headers**, so the browser build needs no cross-origin isolation and no `SharedArrayBuffer`. And the app itself sets no CSP today (`HTML_CSP` in `src/lib/ingestion/proxy-policy.ts` applies only to proxied third-party HTML), so `wasm-unsafe-eval` and a `connect-src` for the relay are not a blocker — but would become one the day an app-level CSP is added.

---

## 5. Can a relay be self-hosted, and could it live on the Cloudflare Worker?

**Self-hosted: yes, straightforwardly. On a Cloudflare Worker: no.**

### 5.1 What a relay actually is

`iroh-relay` is a crate in the main repo, built as a binary with the `server` feature ([`iroh-relay/README.md`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/README.md)):

```
cargo build --profile optimized-release --package iroh-relay --features server
```

It provides _"a fully-fledged iroh-relay server over HTTP or HTTPS. Optionally will also expose a QAD endpoint and metrics."_ Its `ServerConfig` ([`iroh-relay/src/server.rs`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/src/server.rs)) carries a `RelayConfig` with an `http_bind_addr` plus TLS, and a separately-optional QUIC server config.

Access control is built in, config-file driven: `everyone` (default), `allowlist`/`denylist` by endpoint ID, a `shared_token` checked as `Authorization: Bearer` **or** `?token=` (the browser-compatible form), or an HTTP callout to your own auth service.

### 5.2 What it needs from the network

From [Deploying to enterprise networks](https://docs.iroh.computer/configuring-networks), verbatim:

> **Relay connections.** Each device opens one or a few long-lived encrypted connections to _relay servers_ on TCP port 443, as HTTPS requests that upgrade to a WebSocket. … It is always used, at minimum for the introduction.

> **Opening TCP 443 is not always enough on its own.** … Allow the relay hostnames as a WebSocket destination, not just as an HTTPS one.

UDP 7842 to the relay is listed under **Recommended**, not Required — it is QUIC Address Discovery, the STUN-equivalent that lets a _native_ device learn its own public address. A browser-only deployment does not need it. So a relay serving browsers is, in network terms, **an ordinary TLS WebSocket server on 443** — it does not need a UDP-capable host at all.

### 5.3 Why not the Cloudflare Worker

The Worker in this repo is a request handler, not a host. Two independent blockers, from Cloudflare's own docs:

- **No inbound TCP.** [TCP Sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/): _"Support for handling inbound TCP connections is coming soon. Currently, it is not possible to make an inbound TCP connection to your Worker."_ `connect()` is outbound-only and TCP-only; no UDP API is offered.
- **No native binaries, no listening sockets.** Workers run JS/WASM in a V8 isolate and receive HTTP/WebSocket requests; there is no way to run the `iroh-relay` Rust binary or have it bind `http_bind_addr`. ([Limits](https://developers.cloudflare.com/workers/platform/limits/) documents outbound `fetch()`, outbound WebSockets, and `connect()` as the network surface.)

A Worker + Durable Object _could_ in principle speak the relay's WebSocket wire protocol — the handshake is a signed proof of the client's Ed25519 key, and forwarding is by endpoint ID — but that is a **from-scratch reimplementation of an unversioned internal protocol**, tracking n0's `ProtocolVersion` negotiation forever. It is not "deploy iroh-relay to the edge."

So the realistic options are: **n0's public relays**, or **a small always-on VPS/container with TLS on 443**.

### 5.4 What the public relays commit to

From [Public Relays](https://docs.iroh.computer/iroh-services/relays/public), verbatim:

> Public relays are suitable for **development and hobby use only**. For production, use managed relays.

> - No SLA or uptime guarantee
> - Only the latest stable release of iroh is officially supported … n0.computer reserves the right to remove support for older iroh versions at any time
> - Traffic is rate-limited to prevent abuse

> All traffic through the public relays is end-to-end encrypted. The relays cannot read any of the traffic they forward.
> However, the relays can see connection metadata: source and destination IP addresses, connection times, and the amount of data transferred. **We recommend against using public relays for sensitive or confidential data.**

And from the [Release & Support Policies](https://docs.iroh.computer/about/release-policy): _"Number 0 runs public relays for the latest major version of iroh."_

Read that against map decision 4 and decision 10 (the map owns the confidentiality bar). **Content confidentiality is fine** — the relay cannot decrypt, so "never reads" holds. **Metadata confidentiality is not free**: n0 would see which IP talked to which IP, when, and how many bytes of meal moved. For a personal food ledger that is probably tolerable; it is a property the map must state rather than inherit, which is exactly what decision 10 asks for.

The harder operational fact is the second bullet: _only the latest stable major is supported on the public relays, and support can be removed at any time._ An app that pinned iroh 1.x and then went untouched for two years could find its transport quietly stops working — for a local-first app whose whole promise is that it keeps working, that is a real liability, and the mitigation is a self-hosted relay, i.e. infrastructure.

---

## 6. Licence, maturity, and what "v1.0" commits to

**Licence: `MIT OR Apache-2.0`**, dual, at the user's option — for `iroh`, `iroh-relay`, `iroh-gossip` and the examples alike (crates.io metadata for [`iroh`](https://crates.io/crates/iroh); [`iroh-relay/README.md`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/README.md); [`iroh-gossip`](https://crates.io/crates/iroh-gossip)). No copyleft, no CLA obstacle, no field-of-use restriction. Copyright "N0, INC."

**Versions and dates** (crates.io API, 2026-08-28):

| Version    | Released       |
| ---------- | -------------- |
| 1.1.0      | 2026-08-25     |
| 1.0.3      | 2026-07-20     |
| 1.0.2      | 2026-07-06     |
| 1.0.1      | 2026-06-29     |
| **1.0.0**  | **2026-06-15** |
| 1.0.0-rc.1 | 2026-05-27     |

**What 1.0 commits to** ([Iroh 1.0](https://www.iroh.computer/blog/v1)), verbatim:

> Iroh version 1.0 asserts stability for both the wire protocol and language APIs: an iroh v1 endpoint will be able to communicate with another iroh v1 endpoint, regardless of minor version or language.

> Any change that affects the wire stability of iroh will always coincide with a major release.

And the formal policy ([Release & Support Policies](https://docs.iroh.computer/about/release-policy)): a major gets **1 year of Full Support** then 1–3 years of Maintenance Mode; a _minor_ gets only **3 months** of Full Support. `2.x`'s wire protocol must stay backward-compatible with `1.x`. Majors are ≥6 months apart, minors ≥4 weeks.

**The maturity caveat that matters.** The `iroh` core is 1.x. **The off-the-shelf protocols are not**: `iroh-gossip` is at **0.101.0** (2026-06-15) and `iroh-blobs` at **0.103** — pre-1.0 crates with no wire-stability promise attached. The wasm-browser docs page frames browser support for protocols as ongoing work: _"We're expanding browser support from the iroh crate to our off-the-shelf protocols. iroh-gossip already supports being built for browsers starting with version 0.33."_

For this map that is mostly a non-issue, because map decision 6 already fixes the unit that leaves as ADR-0064 NDJSON over one reader — a **custom ALPN over a plain QUIC stream**, the `browser-echo` shape, which lives entirely inside the 1.x-stable `iroh` crate. Reaching for gossip (a plausible instinct for own-device convergence) would drag a 0.x crate into the stack and add ~600 KB of WASM.

The WASM tracking issue, [#2799](https://github.com/n0-computer/iroh/issues/2799), is **closed** — the work it tracked is done, not pending.

---

## 7. The verdict for map #185

**iroh is not ruled out by the browser constraint.** The ticket anticipated "browser cannot, native can"; the sources say the opposite. A browser page can be a full iroh endpoint — it can dial, it can accept, it can talk to another browser or to a CLI, on a released 1.x crate that n0 test on every commit. Map decision 5 survives; no native companion is required; the Out-of-scope entry is not triggered.

**What iroh cannot do is be free of a relay.** Not "usually relayed", not "relayed on bad networks" — _always_, for every browser connection, by a limitation of the platform that n0 state they cannot work around. That is the fact the map has to price:

| Map decision                                                                      | Verdict                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 — "a server may exist but must never read"                                      | **Held.** The relay is E2E-encrypted and cannot decrypt. But it does see connection metadata (IPs, times, byte counts), and n0 advise against public relays for sensitive data. State this in the ADR; don't inherit it.                                   |
| 4 — "proving how far a **zero-infrastructure** path gets is a first-class ticket" | **Unanswerable via iroh.** In a browser, zero infrastructure means zero connectivity. If that ticket is load-bearing, iroh cannot be the whole answer to it.                                                                                               |
| 5 — "browser-only stays the constraint"                                           | **Held.** No native shell needed.                                                                                                                                                                                                                          |
| 6 — "the unit that leaves is the reference closure, ADR-0064 NDJSON"              | **Fits well.** A custom ALPN over one bidirectional stream is the `browser-echo` shape, inside the 1.x-stable core. No 0.x protocol crate required.                                                                                                        |
| 9 — "ephemeral per-send code for people"                                          | **Fits.** An iroh `EndpointTicket` is exactly a self-contained, out-of-band-carried address. Whether an Ed25519-key-bearing ticket can be squeezed into a _human-typeable_ code, versus only a QR, is a separate open question this ticket did not answer. |

**The three costs, ranked by how much they should weigh on the decision:**

1. **A Rust toolchain enters `pnpm build`.** There is no npm package for the browser build and n0 do not plan one; the recommended path is an in-tree Rust wrapper crate plus a pinned `wasm-bindgen` CLI, `wasm-opt`, a `RUSTFLAGS` cfg, and a specific clang. This is the change with the largest blast radius on how this repo is built, tested and contributed to — larger, arguably, than the transport decision itself.
2. **~2.6 MB of WASM**, a second loro, pushing the offline precache up by roughly a third. The #125 gate would pass (async `fetch`, not sync XHR) provided iroh is dynamically imported behind the feature rather than awaited at entry-chunk evaluation.
3. **A relay must be run or borrowed.** Not on the existing Cloudflare Worker — Workers cannot accept inbound TCP or run a Rust binary. Either n0's public relays (explicitly hobby-tier, rate-limited, latest-major-only, no SLA) or an always-on TLS host. Notably it does **not** need to be UDP-capable if only browsers use it.

**Recommendation for the next map decision, not made here:** the question iroh now poses is no longer "can it reach a browser" but "is a 2.6 MB WASM module plus a Rust build plus a relay the right price for a channel whose job is to move one meal, when a raw WebSocket relay speaking the same ADR-0064 NDJSON would need none of the three?" What iroh buys for that price is the part that is genuinely hard to get right — Ed25519-keyed endpoint identity, E2E encryption the relay cannot break, ticket-based addressing, and a wire protocol with a stability promise — none of which a hand-rolled relay gets for free. That trade is a decision for the map, and it is now a decision about **cost**, not about **feasibility**.

---

## Sources

**iroh documentation** — [WebAssembly and Browsers](https://docs.iroh.computer/languages/wasm-browser) · [JavaScript](https://docs.iroh.computer/languages/javascript) · [Compatibility](https://docs.iroh.computer/compatibility) · [Relays](https://docs.iroh.computer/concepts/relays) · [Public Relays](https://docs.iroh.computer/iroh-services/relays/public) · [Use your own relay](https://docs.iroh.computer/add-a-relay) · [Dedicated Infrastructure](https://docs.iroh.computer/deployment/dedicated-infrastructure) · [Deploying to enterprise networks](https://docs.iroh.computer/configuring-networks) · [Release & Support Policies](https://docs.iroh.computer/about/release-policy)

**Source & repositories** — [`n0-computer/iroh`](https://github.com/n0-computer/iroh) ([`iroh/Cargo.toml`](https://github.com/n0-computer/iroh/blob/main/iroh/Cargo.toml), [`iroh/build.rs`](https://github.com/n0-computer/iroh/blob/main/iroh/build.rs), [`iroh/src/address_lookup.rs`](https://github.com/n0-computer/iroh/blob/main/iroh/src/address_lookup.rs), [`iroh-relay/src/client.rs`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/src/client.rs), [`iroh-relay/src/server.rs`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/src/server.rs), [`iroh-relay/README.md`](https://github.com/n0-computer/iroh/blob/main/iroh-relay/README.md), [`.github/workflows/ci.yml`](https://github.com/n0-computer/iroh/blob/main/.github/workflows/ci.yml)) · [`n0-computer/iroh-examples`](https://github.com/n0-computer/iroh-examples) · [`n0-computer/iroh-ffi`](https://github.com/n0-computer/iroh-ffi) · [issue #2799](https://github.com/n0-computer/iroh/issues/2799) · [discussion #3200](https://github.com/n0-computer/iroh/discussions/3200)

**Registries & releases** — [crates.io/crates/iroh](https://crates.io/crates/iroh) · [crates.io/crates/iroh-gossip](https://crates.io/crates/iroh-gossip) · [npm `@number0/iroh`](https://www.npmjs.com/package/@number0/iroh) · [Iroh 1.0 announcement](https://www.iroh.computer/blog/v1) · [iroh 0.33.0 release post](https://www.iroh.computer/blog/iroh-0-33-0-browsers-and-discovery-and-0-RTT-oh-my)

**Deployed artifacts measured 2026-08-28** — [browser-echo](https://n0-computer.github.io/iroh-examples/main/browser-echo/index.html) · [browser-chat](https://n0-computer.github.io/iroh-examples/main/browser-chat/index.html) · [browser-blobs](https://n0-computer.github.io/iroh-examples/main/browser-blobs/index.html)

**Cloudflare** — [Workers TCP Sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) · [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)

**This repo** — `vite.config.ts` (workbox `maximumFileSizeToCacheInBytes`, `globPatterns`), `scripts/offline-boot-check.mjs` (#125 gate), `package.json`, `src/lib/ingestion/proxy-policy.ts`
