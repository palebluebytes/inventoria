# ADR 0078: A Facet contains no way out, and the root's way in is a browser tab

**Status:** Accepted  
**Date:** 2026-08-31  
**Amended by:** [ADR-0084](0084-a-hand-off-belongs-to-the-facet-that-owns-what-it-carries.md) (§6's count of the entry points is corrected at this record's foot; §6's exclusivity itself stands unrevised)  
**Amended by:** [ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md) §5 (one Tracked Domain stopped implying one screen; the no-way-_out_ rule is untouched)

## Context

[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) made a Facet an
installable face onto the Jar and left the roster at two: `root` (Inventoria, scope `/`)
and `food` (**Rations**, scope `/food/`). It explicitly deferred what a Facet does when
something asks it to leave itself. This record answers that.

The parent map ([#267](https://github.com/palebluebytes/inventoria/issues/267)) states the
concern as its decision 9: _a Facet never links out of itself_, because navigating out of
scope in a `display: standalone` install drops the user into a browser tab and breaks the
promise the install makes. Three things narrow that from a design problem to a small one.

**There is nothing to suppress.** The audit
([#270](https://github.com/palebluebytes/inventoria/issues/270)) counted the crossings and
found zero, structurally. There is no router: navigation is one `$state` in
`src/App.svelte:80`, bound only into `Sidebar` and set in exactly two places — `Sidebar.svelte:33`
(a tab press) and `App.svelte:70` (the Web Share Target). No food component receives it and
none could set it. Tabs have no URLs. So the crossing decision 9 defends against is not
currently expressible; it becomes expressible only when `/food/` is a separate entry point,
and at that moment every cross-Facet link would have to be **authored fresh**. The question
is what a Facet build is allowed to _grow_, not what it must lose.

**The structural answer was already bought.** ADR-0076 §6 requires a Facet's runtime
identity to be a build-time constant, not a `location.pathname` check, so that the bundler
can drop the other Facets' code — 4.23 MB of
[ADR-0077](0077-a-facet-precaches-its-own-weight.md)'s saving is `NotesView` never being
reachable from the Rations entry. A per-link runtime suppression would keep every Facet's
code in every Facet's bundle and cost ADR-0077 its entire result. The screens are absent
whether or not this record asks for them to be.

**Scope is a prefix match, so the rule is one-directional.** Rations' scope `/food/` is
_inside_ the root's `/`. A root install navigating to `/food/` never leaves its scope — no
browser tab, no broken promise. Decision 9 constrains Rations and is **vacuous for the
root**. The map states it as if it binds both. It does not, and that asymmetry is a fact
about prefix matching rather than an exception anyone chose, which is why §3 below writes
it down: someone will otherwise read it as an inconsistency and "fix" it.

**Scope.** This record decides how the no-links-out rule is expressed and enforced, what a
Rations shell contains, which direction the rule binds, how the root offers Rations at all,
what happens to a URL entry point aimed at the other Facet, and what a Facet does with a
foreign entity. It does **not** decide which settings a Facet carries
([#275](https://github.com/palebluebytes/inventoria/issues/275)), where the check in §8 runs
([#277](https://github.com/palebluebytes/inventoria/issues/277)), or which Facet owns the
Web Share Target ([#278](https://github.com/palebluebytes/inventoria/issues/278)). It builds
nothing.

## Decision

### 1. The rule is positive, and it is a build rule

A Facet's entry point mounts **its own screens and nothing else**. That is the whole rule.
It replaces the map's negative phrasing — _a Facet never links out of itself_ — because the
negative invites a runtime `display-mode: standalone` check that ADR-0076 §6 has already
ruled out on bundle-size grounds. A cross-Facet link is not forbidden; it is
**unexpressible**, because the screen it would point at is not in the build.

The rule binds **screens**, not modules. Rations will still import from the shared surface,
including whatever §7 and #275 leave it of the jar-wide controls that today live under
`SettingsView`. A shared component is not a crossing. A mounted foreign screen is.

### 2. Rations has no tab bar

The sharpest consequence of §1, and the one worth stating separately because the sidebar is
the only place a cross-Facet link would ever get authored. Rations is one Tracked Domain, so
it is one screen, and six tabs minus five is not a tab bar — it is a shell with no navigation
in it. The Rations chrome is the food screen itself and the gear it already carries
(`FoodView.svelte:644`), which is also where #275's list has somewhere to land without this
record deciding what is on it.

### 3. The rule binds Rations only

Because `/food/` is inside `/`, the root may link to Rations without leaving its own scope,
and §1 does not constrain it. This is asymmetric and that is correct: the constraint was
never "Facets do not link to each other", it was "an install does not eject its user into a
browser", and only one of the two scopes can do that to the other.

### 4. The root's way in is a labelled browser tab

`beforeinstallprompt` fires for the **current document's** manifest. There is no API by
which a page at `/` offers an install of `/food/` — to install Rations the user has to be
standing on a `/food/` document. So the root cannot advertise Rations with prose alone
without making the user retype a hostname, and it cannot navigate them there in place either:
they would land on Rations _inside_ the Inventoria install, and §1 has just guaranteed
Rations has no door back.

The root's Food screen therefore offers Rations as an `<a target="_blank">` to `/food/`,
**labelled as opening in the browser**. From a standalone root install that deliberately
steps outside the app. It is the single sanctioned exit in this record, and it is honest
rather than disguised: an install decision belongs in a browser, which is the only place the
user can act on it and the only place Back works.

Three alternatives were refused. Prose only — no trap, but it makes the root carry a hostname
the user must retype, which is worse than the trap it avoids. Navigate in place — the room
with no door. Give Rations one link back to `/` — one exception is how a rule dies, and it
would resurrect the `display-mode` check §1 exists to prevent.

The root's Food tab is otherwise **unchanged**: same screen, same components, no pointer.
Map decision 3 keeps Inventoria the everything-app, and ADR-0077 §5 kept
`usda/search-index.json` in the root's precache _specifically because_ food is the root's
landing screen (`App.svelte:80`). Turning that tab into a pointer would silently reopen that
argument.

### 5. One behaviour, installed or in a tab

The rule does not test `display-mode`. Structurally it could not — the code is absent either
way — and no affordance is added for the browser-tab visitor to compensate. Two behaviours
means two things to build and two for #277 to prove, and a visitor at `/food/` in a tab is
not stranded: they typed a URL and can type another. A "way out for tab users only" is
exactly the link §1 exists to prevent, wearing a condition.

### 6. A URL entry point belongs to exactly one Facet, and neither forwards

Links were never the mechanism by which a Facet gets asked to leave itself. **External
hand-offs are.** Today there are two — the Web Share Target (`App.svelte:70`) and
`ItemImportPanel`'s `?url=` — and the p2p receive fragment adds a third when that branch
lands. Each arrives as a URL at some scope.

A Facet that receives a hand-off aimed at the other **does not forward it**, in either
direction. #278 decides who owns the share target; this record decides that ownership is
exclusive. Forwarding root→Rations is scope-legal and Rations→root is the one crossing §1
forbids, so any forwarding rule could only be asymmetric — and an asymmetric forwarding rule
reads as a bug to whoever finds it next.

### 7. A foreign entity renders read-only in place, and nothing routes to Settings

Two forward rules for cases that do not exist yet.

The audit found food references no non-food entity anywhere. But `gtin:` is minted by both
Food and Items, and the inbound direction is already broken on `main`
([#280](https://github.com/palebluebytes/inventoria/issues/280)), so the case will arrive.
When it does: **render it read-only where it stands, never navigate to it.** It is the only
one of the three options compatible with §1, and writing it now costs a line and stops the
first person who hits the case from reaching for a link.

And because Rations cannot link out, a food-only user has no route to the root's Settings —
where ledger export, import, storage status and the log controls live. This record does not
offer an escape hatch and does not treat that as a gap to be plugged later: **anything a
standalone Rations user needs must be inside Rations.** That is the forcing. The list is
#275's, and it makes ADR-0076 §5's phrase — "the jar-wide controls a standalone install
cannot function without" — load-bearing rather than decorative, exactly as that record's own
Consequences warned.

### 8. The rule is machine-checked

A build rule with nothing checking it is a comment. The claim is falsifiable and named here:
**the built Rations entry contains no root-only view module.** It fails loudly the day
someone imports `ItemsView` into a food screen, which is the only way §1 can be broken.
Where the check runs and what it costs is #277's, which now inherits **three** claims rather
than the two ADR-0077 left it.

## Consequences

**What it costs.** §4 is a standalone install deliberately ejecting its user into a browser
— the precise move §1 exists to stop. Anyone who reads §1 without §3 will file it as a
violation. The defence is that §3 is not an exception but a consequence of prefix matching,
and that the exit is labelled rather than disguised. If a future reader wants to remove it,
the thing to re-derive is `beforeinstallprompt`'s binding to the current document, because
that is the constraint that produced it.

**#277 inherits a third claim.** ADR-0077 handed it a per-Facet offline boot proof and a
per-Facet size budget. §8 adds the containment check. All three are build-time and all three
fail silently if nobody writes them.

**#275 got smaller and harder.** §7 removes its escape-hatch option, so it can no longer
resolve anything by pointing at the root. Every control a food-only user needs has to be
named and moved.

**What it forecloses.** A runtime `display-mode` check anywhere in the Facet mechanism; per-
link suppression; and a router — §1 and §2 together mean Rations has no navigation state at
all, so introducing one is a decision that has to overturn this record rather than arrive as
a refactor.

**What was never verified, and where that has since gone wrong.** Whether a browser hands
`/food/` off to an installed Rations when §4's link opens it, or renders it in the tab.
Android WebAPK intent capture and desktop link capturing both exist and neither is controlled
from here. This record originally called that benign in both readings. **On iOS it is not**,
and the research commissioned below found why: Apple states that links _outside_ a Home Screen
web app's scope open in Safari View Controller, and links _within_ it stay in the web app
(WWDC23, quoted in `docs/research/286-ios-home-screen-storage-jar.md` §7). Rations' scope sits
inside the root's, so §4's link is an **in-scope** link, and the platform rule points at the
outcome §4 exists to refuse: navigating in place, into a Facet with no door back, with
`target="_blank"` possibly buying nothing. Whether it does is untested — it is probed by
[#287](https://github.com/palebluebytes/inventoria/issues/287), which also reads the jar from
inside a Safari View Controller, a thing no public source establishes.

§4's reasoning is untouched by this: `beforeinstallprompt` still binds to the current
document, so the root still cannot offer a Rations install, and the exit still belongs in a
browser. What is in doubt is whether iOS lets that exit happen at all, which is a mechanism
question for the implementation ticket rather than a decision to retake here.

**What this record does not know about, and should.** The map's foundation is _one origin,
one jar_. On iOS a Home Screen web app's storage is separated from Safari's; whether two Home
Screen apps from the same origin are also separated from **each other** is unestablished, and
if they are, installing both Inventoria and Rations yields two ledgers on that platform —
defeating map decision 2, which refused separate origins precisely to avoid a second jar, by
platform rather than by choice. Commissioned as
[#286](https://github.com/palebluebytes/inventoria/issues/286), **now answered: unbacked
rather than refuted.** Inside a WebKit website data store the storage key is the origin and
nothing else — no manifest, no `scope`, no `start_url`, no `id` reaches the storage layer, and
OPFS sits in the same per-origin bucket as its siblings — but whether iOS gives each web clip
its own data store is closed source. The evidence leans toward one shared jar and does not
prove it. [#287](https://github.com/palebluebytes/inventoria/issues/287) is the device probe
that closes it. Nothing in this record changes on either answer; map decision 2 and
[#274](https://github.com/palebluebytes/inventoria/issues/274) are the exposures.

**A correction to the parent map.** Its decision 9 is written symmetrically — "a Facet never
links out of itself" — and §3 shows it can only ever bind Rations. The map's wording stands
as the intent; this record is where its reach is fixed.

## Amendment (2026-09-01): §6 counted two entry points where there is one

§6 says _"today there are two — the Web Share Target (`App.svelte:70`) and `ItemImportPanel`'s
`?url=`."_ **Those are one entry point with two readers.**

The root manifest declares `share_target` with `action: "/"`, `method: "GET"` and the params
`title`/`text`/`url` (`vite.config.ts:142`). A share therefore navigates to `/?url=…`, and
`App.svelte:68` and `ItemImportPanel.svelte:22` then read _the same_ `window.location.search`
for _the same_ two params in _the same_ fallback order — `url` first, `text` second. The
share sheet is what produces the URL; it is not a second URL. Typing or pasting the same
query string reaches both readers identically.

The real inventory is two, and the second one moves.
[ADR-0084](0084-a-hand-off-belongs-to-the-facet-that-owns-what-it-carries.md) §5 mints the
p2p receive link at `/food/` rather than `/`, so the pair is **`/?url=` at the root** and
**the receive fragment at Rations**.

The count is corrected here rather than in place because the map had been sizing #278 by
counting entry points, and §6's own sentence — _a URL entry point belongs to exactly one
Facet, and neither forwards_ — is unaffected and stands. ADR-0084 §1 supplies the ownership
test §6 deferred, and its §2 adds the case §6 did not reach: a hand-off spanning more than
one Facet has no owner at all.
