# ADR 0070: The scraper proxy is part of the site it serves, not a Worker beside it

**Status:** Accepted  
**Date:** 2026-08-28  
**Implemented:** `wrangler.toml`, `worker/src/index.ts`, `tsconfig.worker.json`, `scripts/worker-closure-check.mjs`, `src/lib/stores/device-settings.ts`

## Context

[ADR-0007](0007-serverless-proxy-and-metadata-fallback.md) put the scrape behind a
Cloudflare Worker, and [ADR-0005](0005-cloudflare-workers-pwa-deployment.md) put the
site on Cloudflare's `[assets]` binding. Those were two records about two things, and
the implementation took them literally: `inventoria` served `dist/` with no script at
all, and `inventoria-proxy` was a second Worker in `worker/`, with its own
`package.json`, its own lockfile, its own pinned wrangler, and its own
`wrangler.toml`. It was deployed by hand.

On 2026-08-28 that arrangement was found not to work, and to have not worked for some
time. Three requests, all 404:

```
https://inventoria-proxy.palebluebytes.workers.dev/            404
https://inventoria-proxy.palebluebytes.workers.dev/?url=…      404
https://inventoria.palebluebytes.workers.dev/api/proxy         404
```

A deployed proxy cannot answer 404 on its own bare path; `worker/src/index.ts` returns
`400 Missing target URL` there. So the first two say the second Worker was not running,
and the third says the site had nothing to answer `/api/proxy` with, an assets-only
Worker having no script. Meanwhile `.env.example` had shipped
`VITE_SCRAPER_PROXY_URL=/api/proxy?url=` throughout: a **same-origin** path. The app
had been asking for a proxy at an address that never existed, and `fetchHtml` threw
"Scraper proxy URL is not configured" when it did not.

The question that surfaced this was narrower: how to redeploy the proxy automatically
when the proxy's code changes. Answering it turned out to require deciding what the
proxy is.

**The alternatives, and what ruled them out.**

1. _Keep two Workers; add a GitHub Actions job filtered to the proxy's paths._ Live,
   and rejected on two counts. It needs a `CLOUDFLARE_API_TOKEN` in repository
   secrets, which is a credential to hold and rotate for a Worker that need not be
   separate. And the path filter is a hand-maintained restatement of a fact the
   compiler already knows: the proxy's closure is four modules, only one of which is
   under `worker/`. A `paths: worker/**` filter silently skips a change to
   `src/lib/ingestion/url-guard.ts` — the SSRF guard — leaving the deployed proxy on
   old rules while the dev proxy gets the new ones. That is precisely the drift the
   shared modules were factored out to prevent.
2. _Keep two Workers; deploy the proxy on every push._ Removes the filter-rot risk and
   keeps the token cost. Still leaves `/api/proxy` unanswerable and the app pointed at
   an address that does not resolve.
3. _Chain the proxy deploy onto the Cloudflare build._ The build installs only the root
   dependencies, so `worker/` would need its own install on every site deploy, and
   whether the injected build credential may deploy a differently-named Worker is not
   answerable from the repository.

**Scope.** This record covers where the proxy runs, how the app addresses it, and what
the Worker is allowed to compile in. It does not revisit _why_ a proxy is needed, which
is ADR-0007's Context and stands unchanged: a browser still cannot read a cross-origin
scrape. It does not touch the SSRF guard, the 5 MB cap, the image allowlist or the HTML
cleaning, all of which are unchanged and still shared with the Vite dev middleware. It
rules on nothing about a native shell or an extension, which remain ADR-0007's listed
alternatives for local scraping.

## Decision

### 1. One Worker

The proxy is `main` in the root `wrangler.toml`. There is no second Worker, no second
`package.json`, no second lockfile and no second `wrangler.toml`. The Cloudflare build
that deploys the site deploys the proxy, in the same version, always.

This is what answers the original question. The proxy cannot lag the site because
there is nothing for it to lag, and the ingestion modules it shares with the dev proxy
cannot reach production in one half and not the other.

### 2. The path decides, because the origin is shared

Static assets are served before the Worker is invoked at all. The Worker therefore sees
only `/api/proxy` and whatever matched no asset, and it must distinguish them: any
other path is `404`, not a proxy request missing its `url`.

This is a constraint the old arrangement did not have. A Worker that owns a hostname may
treat every request as a proxy request, and `worker/src/index.ts` did. A Worker sharing
an origin with a static site may never do that.

`run_worker_first` stays off, and `[assets]` takes no `binding`: the Worker never serves
an asset itself.

### 3. The proxy's address is the app's own default

`/api/proxy?url=` is the built-in default in `device-settings.ts`, not a value someone
must configure. It is correct in both environments without configuration, because
`vite.config.ts` serves that path in development and this Worker serves it in
production.

Precedence is three layers, most specific first: a stored device value, then
`VITE_SCRAPER_PROXY_URL`, then the built-in. A stored empty string still counts as set
and still means "no proxy" — [ADR-0063](0063-a-setting-is-a-datom-only-if-its-past-matters.md)'s
rule for this setting is unchanged. What changes is only the bottom layer, which used to
be `""` and therefore a thrown error.

Same-origin is load-bearing beyond convenience. The app is served `COEP: require-corp`
per ADR-0005, and a same-origin response needs no cross-origin resource policy to be
readable, which is why proxied images render.

### 4. What the Worker may compile in is pinned, not reviewed

Everything `worker/src/index.ts` imports transitively is bundled to workerd, a runtime
with no DOM. Two checks, because one does not cover it:

- `tsconfig.worker.json` types the Worker against `@cloudflare/workers-types` with a
  bare `ES2022` lib. An imported `window` or `localStorage` is a compile error. This
  project exists because `tsconfig.tests.json` also reaches the Worker but types it
  against Node's lib, which is the wrong runtime in both directions.
- `scripts/worker-closure-check.mjs` reads the closure from `tsc --listFiles` and
  fails if any module falls outside `worker/src/` and `src/lib/ingestion/`.

The second is not redundant. App code that happens to be DOM-free typechecks against
workerd perfectly well and still has no business at the edge, and once one such module
is in, the next import is judged against a boundary that has already moved.
`src/lib/ingestion/` is allowed as a directory, because sharing a fourth module with the
dev proxy is ordinary; `src/lib/stores/` and `src/lib/views/` are not.

## Consequences

The scrape works in production for the first time in the deployment's life, and a fresh
install gets it with nothing configured. `/api/proxy` resolves, so `.env.example`'s
long-standing instruction becomes true rather than aspirational.

`wrangler dev` now serves the whole application — assets and proxy together — which was
impossible while the deploy had no script. That is a real gain for exercising the thing
end to end, and it immediately exposed a NixOS trap: workerd finds no CA bundle there
and fails every outbound HTTPS fetch with `unable to get local issuer certificate`,
which the proxy catches and reports as a bare 500 naming nothing about TLS. The dev
shell now exports `SSL_CERT_FILE`.

The costs are real and worth stating.

The proxy's traffic is now billed and rate-limited as the site's. A scrape and a page
load draw on the same Worker limits, where two deployments would have failed
independently. At this project's volume that is theoretical, but it is the thing to look
at first if the site starts shedding requests.

Every request that matches no static asset now invokes a Worker, where before Cloudflare
answered 404 at the edge for free. The app has no client-side routing, so this is
essentially crawler traffic and typos, but it is not nothing.

The Worker is no longer independently deployable. Shipping a proxy fix means shipping
whatever else is on `main`, and rolling the proxy back means rolling the site back. This
is the direct cost of the guarantee in §1 and is accepted as such: a proxy that cannot
drift from its site is worth more here than one that can be deployed alone.

`worker/` keeps its directory but is no longer a project. Anything that assumed a
`worker/package.json` — an editor, a CI step, a habit of running `pnpm deploy` from
inside it — will not find one.

## Amendments to earlier records

This record **amends [ADR-0005](0005-cloudflare-workers-pwa-deployment.md) §1**. The
hosting layer is no longer the `[assets]` binding alone; it is `[assets]` plus a `main`
script. ADR-0005's COOP/COEP decision is untouched and was verified still in force
against the live deployment and under `wrangler dev`: `_headers` is honoured by Workers
static assets, and `/_headers` itself is not served.

This record **amends [ADR-0007](0007-serverless-proxy-and-metadata-fallback.md) §1 and
§3**. §1's "lightweight Cloudflare Worker proxy" is no longer a separate deployment.

§3 additionally carries a claim that is now false. It gives as a reason for the Vite
middleware that "under NixOS Wrangler's precompiled `workerd` binary fails to run due to
dynamic linking issues". On 2026-08-28 `wrangler dev` ran on NixOS from this repository's
Nix shell and served both assets and the proxy, including a live scrape returning 200.
Whatever was true when ADR-0007 was written is not true now. The dev middleware is kept
regardless, on its remaining and sufficient grounds: `pnpm dev` should not require a
second process, and the middleware is what lets development and production share one
`/api/proxy` path.
