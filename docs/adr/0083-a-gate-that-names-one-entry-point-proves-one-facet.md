# ADR 0083: A gate that names one entry point proves one Facet, so every gate reads the roster

**Status:** Accepted  
**Date:** 2026-09-01

## Context

`AGENTS.md` §1 fixes what verification means here: a change is verified when `pnpm check`,
`pnpm test:unit` and `pnpm lint:css` are clean, with a cold-offline-start gate running at
build time because it needs a `dist/`. That paragraph is load-bearing in a way most
documentation is not — it is what tells every agent to trust the roster _instead of_ running
Playwright locally. Every gate in it knows exactly one app, at one URL, with one shell.

[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) put a second entry point in
the roster's way, and the research commissioned by
[#269](https://github.com/palebluebytes/inventoria/issues/269)
(`docs/research/269-two-installable-apps-one-origin.md`) found the first concrete failure.
It is the bad kind: a gate that goes green over the thing it exists to catch.

**`scripts/offline-boot-check.mjs` names one entry point four times.** `dist/index.html` at
line 58 and again in the driver's existence guard at line 137, `dist/sw.js` at line 66, and
— least visibly — the entry chunk is pulled out of the HTML with
`/src="\/?(assets\/index-[^"]+\.js)"/`, a pattern that would not match a second entry's chunk
at all. With `/food/` in the build, that script would report the app starts offline while
Rations could not start at all, silently, which is precisely the
[#125](https://github.com/palebluebytes/inventoria/issues/125) mechanism it was written to
stop.

**It is a species, not an instance.** `scripts/docs-check.mjs` builds its corpus from
`git ls-files "*.md"`, so a brand-new untracked record passes every structural check by not
being looked at — ADR-0076 had to be staged before the gate counted it at all (105 files /
72 ADRs staged, 104 / 71 unstaged). Different fixed name, same failure: a verifier whose
roster is narrower than the thing it claims to verify, reporting success over the gap.

Three records delegate their own falsifiability to this one, by name:

- [ADR-0077](0077-a-facet-precaches-its-own-weight.md) §2 derives each Facet's precache
  manifest from its entry rather than globbing `dist/`, and §3 has each Facet declare a
  complete set. Both are claims about an artifact and neither is checked. §2's derived half
  is self-maintaining for code; §3's static declarations are hand-written, and a stray
  `usda/**` re-entering the root's declaration puts 4 MB back with every gate green.
- [ADR-0078](0078-a-facet-contains-no-way-out.md) §8 states the claim outright — _the built
  Rations entry contains no root-only view module_ — and says explicitly that where the check
  runs and what it costs is this record's.
- [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) §8
  offers a fourth as a _candidate_ rather than an inheritance, with two reasons it may not
  deserve one. §10 below takes those reasons and declines it.

**Measured for this record on 2026-09-01, at `07bc899`.** `pnpm build` is 15.5s end to end;
`pnpm check:offline` against an existing `dist/` is **2.4s for both arms**, which is what
prices the ticket's own worry about "two headless boots per build". The precache is 31
entries and **13,383.17 KiB**, against the **13,401.9 KiB** #272 measured on 2026-08-31 —
**18.7 KiB, 0.14%**, a day of commits apart. And `dist/.vite/manifest.json` does not exist,
because `build.manifest` is off: the artifact today is seven hashed chunk names carrying no
source-module identity at all.

Five alternatives were live and each is ruled out below rather than in silence: one Facet's
entry standing in for the other (§2), a ceiling instead of a band (§3), a static
source-level import walk for containment (§5), matching chunk filenames instead of bundle
metadata (§6), and `pnpm build` joining the roster outright (§8).

**Scope.** This record decides what each gate must prove once there are two entry points,
what artifact each reads, and where each runs — including what `AGENTS.md` §1 must say
afterwards. It **builds none of it**: the parent map's decision 12 ends at decided records
plus cut implementation tickets, and the registry module ADR-0076 §6 names still does not
exist. It does not decide the shape of those tickets, does not revisit what a Facet
precaches (ADR-0077) or what it may link to (ADR-0078), and it deliberately declines one
check rather than leaving it unmentioned (§10).

## Decision

### 1. A gate that names an entry point reads the roster instead

Any gate whose correctness depends on which entry points exist enumerates them from
`src/lib/facets/registry.ts` (ADR-0076 §6). No gate hard-codes a filename under `dist/`, and
no gate hard-codes the number two.

This is the general rule the rest of this record applies, and it is stated first because the
specific fixes below are worth less than it: the hole #269 found was not _`index.html` is the
wrong name_, it was _a gate decided for itself what the app is_. A third Facet must cost
nothing here, and under the parent map's decision 5 the mechanism has to make a second Facet
an application rather than a re-derivation.

Every failure message names the Facet it is about. A gate that reports "the app does not
start offline" when it means Rations sends the reader to the wrong build.

### 2. The offline gate proves every Facet, with both arms

`scripts/offline-boot-check.mjs` runs its full two-arm probe once per Facet: each Facet's own
entry HTML, its own service worker, its own precache manifest, its own entry chunk.

**One entry standing for the other is not available.** ADR-0077 §2 makes the two manifests
genuinely different sets — Rations precaches `nutrient-store.json` and `zxing_reader.wasm`,
the root does not (§5 of that record) — so proving one boots offline says nothing about the
other. This is the clause that would have been tempting to trade for wall-clock, and the
measurement removes the temptation: 2.4s becomes roughly 5s against a 15.5s build.

**Both arms, per Facet, not one shared online arm.** The online arm exists only to
distinguish _this check's browser stubs have fallen behind the app_ from _the app is broken_
— it is why the script has three exit codes rather than two. A Facet's entry is a different
module graph, so the browser globals it reaches for at module scope are discovered separately;
sharing the root's stub set means a Rations-specific stub gap reports as **the food app
cannot start offline**. That false alarm is how a gate gets switched off.

### 3. The precache budget is a band, not a ceiling

Each Facet declares a floor and a ceiling on its total precache bytes, and the build fails
outside either.

A ceiling alone catches the regression ADR-0077 §2 names — a hand-written static declaration
re-inflating a Facet — and passes a manifest that has **collapsed**. The derived half failing
open, deriving an empty or truncated set, ships a Facet that installs and then cannot work.
The offline gate in §2 would catch a _totally_ empty manifest, because nothing would be
servable; it would not catch one that dropped the USDA statics, which are read after
`mount()` and are exactly what ADR-0047 §11 binds Rations to precache. A floor is the only
thing looking at that.

**Width is ±5%**, which is about 450 KB at the 8–9 MiB the two Facets sit at. Measured drift
over a day of ordinary commits is 0.14%, so the band has roughly thirty times the slack
real movement needs, while a 4 MB regression clears it by an order of magnitude. Both edges
hard-fail, printing the measured bytes, the band, and which side it fell out of.

### 4. The band and the view set go in the registry, and a view module belongs to a domain

**This amends ADR-0080 §8**, whose heading reads _"the registry supplies identity only"_.
That was already false when written: ADR-0077 §2 puts each Facet's static asset declarations
in the same registry and calls it "the build half of that registry earning its keep", one
commit earlier on the same branch. `docs-check` cannot see a contradiction of that kind — it
cross-links declared supersessions, and a heading disagreeing with a sibling record is not
one.

§8's _argument_ is narrower than its heading and survives whole: the registry must not gain a
field that **re-records a conclusion reached by argument while discarding the reason**. A
field reading `import: true` is the example; a second enumeration of sixteen rows decided by
§2 of that record is the harm.

Under that rule:

- **The band passes.** A measured byte range is not a conclusion from argument, and it belongs
  beside the declarations whose editing moves it. A reviewer changing one is looking at the
  other.
- **A per-Facet list of view modules fails.** ADR-0078 §2 already fixes one screen per Tracked
  Domain, and the registry already carries each Facet's domains. Writing the views out again
  per Facet records ADR-0078 §1's conclusion and throws its reason away — §8's objection, one
  field over.

So **the view module is attached to the Tracked Domain, not to the Facet**, and a Facet's
expected view set is _computed_ from the domains it declares. No per-Facet enumeration exists
to rot. Which module is a domain's screen is a fact about the codebase rather than a decision
anyone argued, which is what makes it declarable at all.

The gain is not tidiness. A domain moving between Facets then updates the scoped-wipe
predicate ([ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §3), the
settings split (ADR-0080 §8) and this check from one edit, because all three read the same
declaration.

### 5. Containment compares the built entry against the domains its Facet declares

The check asserts that the set of modules under `src/lib/views/` reachable from a Facet's
**built** entry is **equal** to the set its declared domains imply.

**Equality, not subset.** A crossing — `ItemsView` reachable from Rations — is the failure
ADR-0078 §8 names, and it is caught either way. A _missing_ view is the other failure: a
Rations build whose food screen tree-shook away is caught by nothing else in the roster, and
it fails as an installed app that opens on nothing.

**Against the built entry, never a source-level import walk.** A walk over `import`
statements from `src/food-main.ts` would be cheaper, would need no `dist/`, and would fail
seconds after the bad import was written rather than after a build — and it would be wrong.
ADR-0076 §6 makes a Facet's identity a build-time constant _precisely so the bundler can drop
the other Facets' code_; 4.23 MB of ADR-0077's saving is `NotesView` becoming unreachable
after dead-branch elimination. A source walk sees every module behind every dropped branch
and reports crossings that do not exist in the artifact. ADR-0078 §8's claim is about what
ships, and only what shipped can answer it.

### 6. One build-time metadata artifact, read by all three checks

The build emits a single artifact recording, per Facet, the source modules and emitted chunks
reachable from that Facet's entry, together with their byte sizes. §3, §5 and ADR-0077 §2's
manifest derivation all read it. It is written from the bundler's own `generateBundle`
metadata, where the complete module set per chunk is already in hand.

**Not chunk filenames.** They carry the source basename before the hash —
`NotesView-BSxqcTYc.js` — which makes filename matching look sufficient and is the trap
dressed as the cheap option. It works only for modules that happen to become their own chunk;
the moment `ItemsView` is inlined into a shared chunk the containment check goes green on the
exact crossing it exists to catch. ADR-0077 §2 already made this point in the other
direction: "Nothing about `NotesView-BcUEn7sh.js` says root-only."

**Not `build.manifest: true`.** It would emit `dist/.vite/manifest.json` as a public build
output to serve a private need, and it maps entry-ish modules rather than the full graph
containment requires.

One artifact rather than three walks is §5's corollary as much as a convenience: three
readers computing "reachable" separately would drift, and the whole point of a band is that
it and the containment check are two readings of one number.

### 7. A fourth claim: the root's outdated-cache cleanup stays off

The build asserts that the emitted root service worker contains no outdated-cache cleanup and
that the Rations one does.

ADR-0077 §1 records why: `workbox-precaching@7.4.1`'s `deleteOutdatedCaches` filters cache
names with `cacheName.includes(self.registration.scope)`, a substring test, and the root's
scope `https://host/` is a substring of `workbox-precache-v2-https://host/food/`. With the
option on, **the root service worker deletes the entire Rations offline install on every
activation**.

This was not one of the three inherited claims and it is arguably the most dangerous of the
four. Re-enabling it is a one-word config edit; a workbox major changing the default needs no
edit at all. Nothing else here sees it: the band is unmoved, the manifests are correct, the
offline gate models a healthy service worker rather than an activation, and the Playwright
assertion in §9 would only catch it if the root registration happened to activate _after_
Rations' precache was populated, which is an accident of test ordering rather than a property
of the test. The user finds out offline.

It is a string test over an emitted file, the cheapest of the four, and the only one a
dependency upgrade can break with no source change.

### 8. The gates run at build time behind `pnpm check:facets`, and `AGENTS.md` §1 says so

All three new checks — the band, containment, and §7's assertion — need a `dist/`. They chain
onto `pnpm build` and are runnable alone against an existing build as `pnpm check:facets`,
mirroring `pnpm check:offline` exactly rather than inventing a second convention.

**`pnpm build` does not join the roster.** 15.5s in every verification loop reverses a choice
#125 made deliberately, and the three-command roster is fast because that is what makes an
agent actually run it.

**But `AGENTS.md` §1 must stop implying the roster proves the app.** It gains a named list of
the build-time gates and an explicit sentence: the roster proves the code, and the build
proves the Facets. Leaving §1 as it stands is this record's own complaint one level up — a
document that tells every agent what to trust, silently having stopped covering a whole
Facet.

**§1 is not edited by this record.** It would then describe gates that do not exist, which is
the same lie in the other direction. It is edited in the change that builds them, and that is
an acceptance condition on the implementation ticket rather than a follow-up.

### 9. Playwright gains one spec and one arm, not a second suite

**The root suite is untouched, and keeps covering food.** The parent map's decision 3 keeps
all six tabs in the root, so moving the 45 `page.goto("/?mem=1")` calls in `food-ui.spec.ts`
to `/food/` would stop proving the root. Running them against both URLs duplicates 34 tests
and five screens across two devices to exercise the same components at a different path, and
the visual catalog aborts at the first failing screenshot, so every baseline is a serial cost
on every red run.

**One new spec, no config change.** `food/index.html` sits at the repo root (#269's build B),
so the dev server the suite already starts serves `/food/`, and `baseURL` is only a prefix —
a spec navigating to `/food/?mem=1` is collected by the existing `chromium` and
`Mobile Chrome` projects and gets both device profiles for nothing. It proves what is true
only at `/food/`: the shell boots, there is no `.nav-item` sidebar (ADR-0078 §2 as a test
rather than only a build rule), the gear opens _Rations settings_ rather than the root's
Settings, and no anchor in the rendered tree points outside `/food/`. Its two baselines land
in its own snapshot directory, so the catalog's abort behaviour is unchanged.

A second Playwright config is refused: `playwright.offline.config.ts` exists because it needs
a _production build_, a genuinely different server. Rations needs the same server at a
different path.

**`offline-boot.spec.ts` gains a Rations arm** in that offline config, which already pays for
a production build behind a real service worker. It loads `/food/`, goes offline, reloads, and
asserts the page renders, that `navigator.serviceWorker.controller` resolves to the Rations
registration, and that `caches.keys()` holds both precache names. This is the only place
ADR-0077 §1's per-scope registration is observed rather than reasoned about.

### 10. The roster does not take the settings-block check

ADR-0080 §8 named the gap: _a block added to `SettingsView` is silently root-only until
someone applies §1's two-clause test to it_, and offered it here as a candidate. It is
declined, and recorded as declined rather than omitted.

Both of §8's own reasons hold. It fails to the safe side — a control not carried is a control
not carried into the wrong place, where ADR-0078 §8's failure is a shipped Facet that ejects
its user into a browser. And it is not mechanically decidable: the other four claims are
falsifiable against a build artifact, while _should this block have been carried_ is §1's test
applied by a person. The best a check could manage is asserting every block appears in some
Facet's decision, which needs the enumeration §8 refused.

§4 sharpens the second reason. The registry now has a stated rule about what it may carry, and
a settings-block table fails it for the same reason it failed §8. A gate that half-checks a
judgement is worse than a stated gap, because it reads as covered.

### 11. `docs-check` reads what is there, not what is tracked

The documentation gate's corpus becomes the working tree's markdown — tracked files plus
untracked ones that are not ignored — rather than `git ls-files` alone.

This is not about two entry points, and it is here because it is the same species and because
it is live right now: every record in this map's arc was written unstaged before it was
staged, and each was invisible to the gate for exactly that window. It is a defect fix rather
than a Facet decision, and it ships with this record's change rather than waiting on an
implementation ticket.

## Consequences

**What it costs.** Three new build-time checks and a metadata artifact nothing needed before,
plus roughly 2.5s of gate time for the second Facet's offline arms. `pnpm build` becomes the
only place four of the arc's claims are proved, so a developer who runs the roster and pushes
is relying on CI for the Facet split — acceptable because the e2e workflow runs on every
push, and named here because it is a real narrowing of what a local green means.

**The registry now has a build half by design**, not by accretion. §4 states the rule that
lets it grow without becoming the settings table ADR-0080 §8 refused, and that rule is the
thing to argue with if a later field looks borderline: does it record a conclusion whose
reason is thrown away?

**The band's width is the weak joint.** ±5% is a judgement calibrated against one day of
measured drift, and a dependency bump could legitimately move more than 450 KB — a font
family, a WASM upgrade. The response is to widen the band in the same commit as the change
that moved it, with the new number as a reviewable diff. There is deliberately **no
`--update` flag**: the visual baselines earn theirs because a font rendering difference is not
a decision, and 450 KB of precache always is. If the band is ever felt to be noise, the thing
to overturn is §3's claim that a floor is worth having, not the review step.

**What stays unobserved, and is recorded rather than quietly assumed.** ADR-0077 §6's
consequence — that a device with Inventoria and not Rations has a dead `/food/` offline,
via the root's `navigateFallbackDenylist` — is not proved. Arranging it means unregistering a
service worker mid-spec, so the assertion would be about a state the test itself constructed;
and the behaviour is a deliberate absence, which is the least dangerous thing to leave
unmeasured. Whether Cloudflare's `[assets]` serves `dist/food/index.html` for `/food/` is
also unproved: it is a deploy fact, and a local gate would model it rather than observe it,
which is this record's own failure mode with the blast radius of a live site. It belongs on
the implementation ticket as an acceptance condition — a real request, checked once.

**What it makes easy.** ADR-0077 §2 and §3, ADR-0078 §8 and §1 all become falsifiable, which
they were not. A third Facet costs one registry entry rather than an audit of the gates. And
`AGENTS.md` §1 stops being a document whose accuracy depends on nobody having added an entry
point.

**What it forecloses.** Checking a Facet's manifest as a _subset_ of the root's — §5's
equality and ADR-0077 §3's complete-set rule both say a Facet is not defined by what the root
also has. And any future gate that reads a fixed name under `dist/`: §1 is a rule about gates,
not a fix to one script.

**Defects this decision uncovered**, each belonging to the implementation ticket rather than
fixed here, except the last: `offline-boot-check.mjs`'s entry-chunk regex
(`assets/index-[^"]+\.js`) is a fourth hard-coded name and the least visible of the four,
since it fails by not matching rather than by not finding a file; ADR-0080 §8's heading
overreaches its own argument and is corrected there by §4 above; and `docs-check.mjs`'s
tracked-only corpus, which §11 fixes in this change because it is live on `main` today.
