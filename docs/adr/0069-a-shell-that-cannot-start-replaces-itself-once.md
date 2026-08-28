# ADR 0069: A shell that cannot start replaces itself, once

**Status:** Accepted  
**Date:** 2026-08-28  
**Implemented:** `src/lib/boot-recovery.ts`, `src/boot-guard.ts`, `src/main.ts`

## Context

The deployed app was reported broken on 2026-08-28. It was not: the server was
serving a healthy build, and the browser was running an old one out of its own
precache.

Measured against the live deployment that afternoon:

| Check                                                   | Result                                        |
| ------------------------------------------------------- | --------------------------------------------- |
| `index.html` on the server references                   | `assets/index-CM1j1Z8v.js`                    |
| That chunk                                              | 200, and contains no `loro_wasm_bg` reference |
| The chunk the browser was executing                     | **404 on the server**                         |
| `assets/loro_wasm_bg-DYe6i_BH.wasm`, which it asked for | **404 on the server**                         |

A chunk the server does not have cannot have come from the server. The client
was running a pre-#125-fix install whose `loro-crdt` still loaded its WASM from
a URL (#125), and that file no longer exists in any current build, because the
fix inlines those bytes instead. So the old shell threw during module
evaluation, `#app` stayed empty, and nothing rendered.

**What made that unrecoverable is the update strategy, not the missing file.**
`vite.config.ts` sets `registerType: "prompt"`, with no `skipWaiting` and no
`clientsClaim`, so a new service worker installs and then waits. The only thing
that promotes it is `updateServiceWorker(true)`, wired to a button inside
`ReloadPrompt.svelte` — which is inside the app that cannot start. Every browser
holding a pre-fix install was therefore stuck for good, with the escape hatch
locked inside the broken thing. That is strictly worse than #125 itself, which
only bit an offline start.

Two alternatives were live:

- **`skipWaiting: true` + `clientsClaim: true`**, or equivalently
  `registerType: "autoUpdate"`. It makes stuck clients impossible and is one
  line. It also throws away the reason `prompt` was chosen: a worker that claims
  clients on install can swap the app under someone mid-session, and this app
  holds unsaved editor state. Rejected as paying for a rare failure with a
  permanent behaviour change on every ordinary update.
- **A `try`/`catch` around `mount(App)`.** Rejected because it does not work:
  the observed failure throws while the `App` module graph evaluates, before
  `mount` is ever called. A guard that only wraps `mount` would have watched
  this exact bug sail past.

**Scope.** This record covers what happens when the shell fails to start. It
does not change the update strategy for a working app — `prompt` stays, and
`ReloadPrompt` remains the only thing that promotes a waiting worker under
normal conditions.

## Decision

**The shell watches itself boot, and a shell that does not start drops its
service worker and reloads once.**

### 1. The guard is installed before the app graph, not around `mount`

`src/boot-guard.ts` installs the guard as a side effect of being imported, and
`main.ts` imports it **first** — ahead of `./App.svelte`. That ordering is the
whole mechanism: it is what puts the listener in place before the code that
throws. A comment at each end says so, because an import sorter or a tidy-up
that moves that line silently disables this record.

The guard fires on either of two signals: an uncaught `error` or
`unhandledrejection` from the shell, or a grace period of 10 s elapsing with no
mount. The second covers a shell that never arrives at all, not merely one that
throws. `main.ts` calls `markMounted()` after `mount(App)` returns, which stands
the guard down; an error after that point is an ordinary runtime error and the
guard ignores it.

### 2. Recovery is unregister, delete caches, reload — and it happens once

Unregistering stops the old worker answering fetches; deleting the caches stops
the next load being served the same broken shell out of the precache. Both are
needed. The reload then lands on the network, and therefore on whatever is
actually deployed.

**Once per session, enforced by `sessionStorage`.** A second failure is the
recovery itself failing, and reloading again would spin forever, so the page
says what happened and stops. Where session storage is unavailable the guard
reports "already recovered" and never reloads: a recovery that cannot remember
it happened is a reload loop, so it fails closed.

### 3. The logic is injected and tested; only the wiring touches the browser

`src/lib/boot-recovery.ts` takes every capability it uses as a parameter, so the
contract is pinned in `tests/unit/boot-recovery.test.ts` with no DOM: it
recovers on a throw, recovers on a silent timeout, stands down once mounted,
recovers at most once however many errors arrive, and says so rather than
looping when a recovered shell fails again. `src/boot-guard.ts` is the only
place a real browser appears.

## Consequences

- **Clients already stuck are not reached by this.** Nothing shipped from the
  server can run inside a shell that will not execute. They need one manual hard
  reload (which bypasses the worker for the navigation) or a site-data clear;
  after that they are on a build that carries the guard, and this class of
  failure cannot strand them again.
- **A false positive costs a cache wipe and a reload.** A device slow enough to
  take 10 s between module evaluation and `mount` gets its offline copy dropped
  and rebuilt on the next successful load. Mount follows evaluation by
  microseconds in every measured build, so the margin is for a device finishing
  work already in hand, not a network budget.
- **The offline gate needed a new stub.** `scripts/offline-boot-check.mjs` now
  stubs `window.addEventListener`, because the guard registers before mount.
  This is the sanctioned case AGENTS.md §1 describes: the check reported that
  the check needed updating, and it was right.
- **It does not make the app crash-proof.** If the entry chunk itself 404s or
  fails to parse, nothing in the chunk can run, guard included. What it covers
  is the observed and likely case: the chunk runs and something inside it dies.
- **Relationship to prior ADRs:** none is revised here. ADR-0006 governs
  runtime image caching rather than the update strategy, and nothing in it
  moves. What this closes is the gap #125's fix left open — that fix made new installs boot offline, and this makes
  an install that cannot boot replaceable.
