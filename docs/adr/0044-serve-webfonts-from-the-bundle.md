# ADR 0044: Serve webfonts from the bundle, never from a third-party origin

**Status:** Accepted  
**Date:** 2026-08-17  
**Implemented:** `2ffb95b`, `80ca2d4`

## Context

`src/app.css` opened with an `@import` against `fonts.googleapis.com` for
Epilogue, the interface typeface. That single line sat badly with three separate
things.

It contradicts what this project is. The README describes a local-first tracker
that "answers to no cloud" and installs as an offline PWA, and yet the interface
could not draw its own text without a round trip to Google. The failure is quiet
rather than loud: the browser falls back to a system face and the app looks
subtly wrong, which is worse than an error.

It made the visual baselines depend on the network. Playwright drives a fresh
profile with no font cache, so every catalog run refetched the font. Snapshots
therefore recorded whatever the network returned that run, and a slow or
rate-limited fetch would have quietly baselined the fallback face instead. The
ADR-0010 catalog is only as trustworthy as the determinism underneath it.

It also under-fetched. The import asked for `wght@300;400;500;600;700` while the
design system uses 400 through 900, so the 800 and 900 weights were synthesised
by the browser: an algorithmic smear of the 400 outline rather than the drawn
letterform. The one weight it did fetch and we never use was 300.

Two alternatives were live. Keeping the CDN and adding `<link rel="preload">`
narrows the latency window but changes nothing about offline behaviour or
determinism, which were the actual complaints. Self-hosting static weight files
was the other, and it costs more bytes than one variable file per subset for the
same coverage.

**Scope.** This record covers fonts the application serves to a browser. It does
not cover the system font set that Playwright's Chromium resolves through
fontconfig, which `flake.nix` pins separately so a CI runner and a workstation
rasterise alike; that pinning addresses fallback faces and emoji, not the
typeface the app ships. It rules on webfonts generally, not on Epilogue alone.

## Decision

**The application serves every webfont it uses from its own origin.** No
stylesheet, and no `@font-face` `src`, may reference a third-party font host. A
typeface the interface depends on is a build input, not a runtime fetch.

**Ship one variable file per unicode subset**, with the `unicode-range` the
subsetter produced. Static per-weight files are only justified where a variable
build does not exist.

**The declared `font-weight` range must match the file's real `wght` axis.**
Declaring a narrower range silently clamps anything outside it, which reads as a
CSS bug at the call site rather than a font declaration bug.

**The service worker precache pattern must cover the font extension.** A font
that is bundled but not precached still leaves a cold offline load rendering in
a fallback face, which is the original defect wearing different clothes.

**Each font ships its licence.** The notice and licence text travel with the
build at a stable path. Do not assume the binary carries them: a subsetter is
free to drop the licence field, and this one does.

## Consequences

The bundle grows by the fonts it ships. Epilogue's three subsets are 78KB
together, precached alongside the rest of the app, so the interface renders
correctly on a cold offline load. First paint no longer waits on a third party.

The catalog baselines become a property of the code rather than of the network.
This is what makes ADR-0010 meaningful on CI: with the font in the bundle and
fontconfig pinned, a runner and a workstation produce byte-identical screenshots
for screens that do not use the heavier weights.

Rendering changed when this landed. The 800 and 900 weights stopped being
synthesised and now render as drawn, which moved seven of the fourteen catalog
baselines; they were rebaselined on the runner in `73bebe5`.

Updating a font becomes a deliberate act. There is no CDN quietly serving a newer
build, which is the point, but it does mean a font fix reaches us only when
somebody fetches it. Nothing warns that a newer version exists.

> **Note (2026-08-17):** the paragraph above no longer holds. Epilogue now
> arrives as `@fontsource-variable/epilogue`, an npm package, so the version sits
> in the lockfile and `pnpm outdated` reports a stale typeface. The decision is
> unchanged — the files are still bundled and served from our own origin — only
> how they reach the repo. The package's subsets are byte-identical to the
> hand-copied v20 files, so nothing rendered differently. Its family name is
> "Epilogue Variable". It also ships italic variable subsets, which makes the
> deferral in the paragraph below a one-line import plus a rebaseline.

Italics are still synthesised. Eleven rules set `font-style: italic`, and the
upright variable file is all we ship, so the browser obliques it mechanically.
This is not a regression, since the CDN import requested no italic axis either
and the same synthesis was happening before. Epilogue does publish a true italic;
adding it means a second file per subset and another catalog rebaseline, and it
should be picked up the next time the baselines are being redrawn anyway.

> **Note (2026-08-17):** taken up, along with the rest of the families. The app
> now ships drawn italics for all three, so nothing is obliqued mechanically. The
> monospace and serif stacks that this record left alone are bundled too, behind
> `--font-mono` and `--font-serif`, so every family the CSS names is served from
> the bundle rather than resolved from the platform. Precaching is the one place
> that does not follow: Fontsource ships Cyrillic and Greek subsets this app
> never draws, and `globIgnores` in vite.config.ts keeps them out of the offline
> install while leaving them fetchable.

The licence obligation is now per-font and manual. Every font added under this
record carries its own notice into `public/fonts/`, and no gate checks that.
