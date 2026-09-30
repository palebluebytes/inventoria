# ADR 0114: The app is a set of faces, each reached from its own mark

**Status:** Accepted  
**Date:** 2026-09-27  
**Amends:** [ADR-0078](0078-a-facet-contains-no-way-out.md) (§2's "Rations has no tab bar" is overturned: Rations gains a switcher. §1's no-way-**out** rule is untouched, and §8's gate is what makes the switcher safe rather than what it has to survive)  
**Amends:** [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) (its split table relocates into the Settings face; the rule it states is unrevised, and §7's one named surface keeps its name and loses two sections)  
**Amends:** [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) (§2's floor is published by a surface that no longer exists; a ceiling replaces it, and §7's Back stack gains a stop that is not a `BottomSheet`)  
**Amends:** [ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md) (§8's closed page roster loses Recipes to a face; §5's rule that a shell says what it can hold is unrevised and is generalised, and so is its "the title is the way back" — the header that holds it is the shell's now, not the screen's)  
**Amends:** [ADR-0101](0101-the-ways-into-a-day-are-one-bar-anchored-where-the-hand-is.md) (§7's bar is no longer the only permanent pinned surface in Rations, and it is no longer the lowest thing the shell measures)  
**Amends:** [ADR-0102](0102-a-drop-shadow-is-reserved-where-a-box-must-contain-or-cover-it.md) (the pinned header is a box that covers, so it takes the shadow that record reserves; nothing else is added to the reservation)  
**Amends:** [ADR-0077](0077-a-facet-precaches-its-own-weight.md) §5 (the one USDA artifact that record kept in the root leaves with the premise that kept it; the root now precaches none of the three, and §4, §3 and §7 are unrevised)

## Context

The root Facet's navigation is six tabs in `src/lib/layout/Sidebar.svelte`, each an
emoji and a word, with the app's only wordmark above them and `display: none` on it
below 768px. Rations has no navigation at all, deliberately
([ADR-0078](0078-a-facet-contains-no-way-out.md) §2). The two Facets therefore look
like different applications, and the one that is finished is the one with no chrome.

[#526](https://github.com/palebluebytes/inventoria/issues/526) states the want: every
face of the app carries the same header with its own mark at the top left, and pressing
that mark reaches every other face. That is a switcher inside a Facet, and the record
whose title is _a Facet contains no way out_ is the first thing it meets.

**The collision is smaller than it looks, and the reason matters.** ADR-0078 §1 is a
_build_ rule: a Facet's entry mounts its own screens and nothing else, so a cross-Facet
link is not forbidden but **unexpressible**, because the screen it would point at is not
in the build. A switcher whose roster comes from what the running build holds cannot
name a face that is absent. The rule is the mechanism rather than the obstacle, and
`scripts/facet-checks.mjs` already proves the set it derives from (§8).

What genuinely falls is §2. Rations gets navigation, because Recipes stops being a page
behind a header icon and becomes a face beside it, and both live inside `/food/`.

**Scope.** This record decides what a face is and how it differs from a Facet, the
roster and its order, how a face is named, where the switcher lives and what opens it,
what the root's landing screen becomes, which settings travel and which do not, what
BETA claims and what removes it, where the marks come from, and what the root stops
precaching. It does **not** decide what the five unfinished faces do
([#533](https://github.com/palebluebytes/inventoria/issues/533) is their header and
nothing more), nor whether Recipes ever becomes installable (§4), nor the confirmations
on the two deletions ([#414](https://github.com/palebluebytes/inventoria/issues/414)).
It builds nothing.

## Decision

### 1. A face is a face onto one Tracked Domain, and it is not a Facet

A **face** is a named, mark-bearing face onto one Tracked Domain, addressable inside the
root's scope. A **Facet** is what
[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) §1 says it is, unchanged:
installability is definitional, and the roster is two.

The two words are kept apart because the costs are not comparable. A face is a name, a
mark, a maturity and a screen. A Facet is a manifest, a service worker, a precache
declaration with a measured byte band, an arm on the offline-boot gate, and — because a
precache `Cache` is named after `registration.scope` and no option changes that
(ADR-0077 §1) — an install that shares no bytes with its siblings. Collapsing them would
price every new name at nine megabytes.

"Facade" appears nowhere in the code. `CONTEXT.md` gains **face**, and the avoid-list
there already refuses _Surface_, _Tab_, _View_ and _Sub-app_ for the same reason this
record refuses a fourth noun: a vocabulary kept in two places drifts in one of them.

**A face is not one-to-one with a Tracked Domain, in either direction.** Agenda holds
two (Habits and Calendar events); Rations and Recipes both sit on `food`; Settings sits
on none at all, being jar-wide. So the roster is **authored** beside `FACETS` rather than
derived from the domain list, which is the reverse of how a Facet's prefix set is built
(ADR-0076 §6, ADR-0086 §1). The asymmetry is deliberate and worth stating: a Facet's
domains decide what it **owns**, and ownership must be derivable or it drifts; a face's
domain decides only what it **draws**, and drawing is a presentation choice that no gate
can infer.

### 2. The roster is seven, ordered once, and Settings is last

`Rations · Recipes · Media · Items · Agenda · Notes · Settings`.

Today's `Sidebar` order with Recipes inserted after Rations, because Recipes lives inside
Rations' scope and each Facet's roster is then a **prefix** of the root's — which is the
property §8 leans on. Settings is last, and the grid pins it to the last column rather
than trusting the roster to end there, so it holds the right edge at any count once §10's
hiding is in play.

The order is **fixed**. It is not the six domains: `Agenda` holds the Habits and Calendar
domains, which have no face of their own, and that is unchanged here.

### 3. A face is named once

One canonical name per face, in the roster, read by the tile, the header, the accessible
name and the `<h1>`. `src/lib/food/pages.ts` already takes this route with `pageLabel()`,
which reads Rations' name off the registry rather than spelling it.

Three titles are retired: `Media Tracker`, `Physical Digital Twins` and
`Notes & Checklist`. A switcher is the first surface that puts every name beside every
other, and until now the same face could be called three things — `Food` in a tab, `Food`
in an `<h1>`, `Rations` in a manifest. `AgendaView` has no header at all and gains one.

### 4. Recipes becomes a face, and promoting it is a domain split

Recipes leaves `PAGES` and becomes a face. It is **not** made a Facet, and the reason is
a gate rather than a preference: `recipe:` is owned by the `food` Tracked Domain
(`src/lib/facets/domains.ts`), and `pnpm check:facets` holds every Facet to reaching
_every_ screen of _every_ domain it holds
([ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md)). A
recipes-only Facet holding `food` is therefore unbuildable, and the honest way to one is
to move `recipe:` to a Tracked Domain of its own — a registry entry, an
`docs/eavt-vocabulary.md` row, and a re-reading of
[ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §1.

That door is left open and deliberately not walked through. §8's roster shape is what
keeps it cheap: a face declares whether it is installable, so promotion is that flag plus
the domain split plus the install's own costs, and no navigation code changes.

### 5. Every face has one pinned header, and the logo is the shell's control

Logo hard left, a gap, the title, its badge, then the face's own actions.

The gap is load-bearing. [ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md)
§5 made the title **the way back off a page** — "the title is the way back, and it is the
only way off a page" — so the top-left corner now holds two controls with different jobs.
They are separated, and the logo never changes meaning: the alternative, letting the logo
also mean "up one level" when a page is open, is the ambiguity §5 wrote its rule to avoid.

The header is **pinned**, because it carries the app's only navigation and navigation that
scrolls out of reach is not navigation. It publishes its **measured** height as
`--shell-ceiling`, for the reason `Sidebar` measured itself rather than restating a sum
(ADR-0089 §2): the height is a tap floor plus two paddings plus an inset the device picks.
`Sidebar` is deleted, `--shell-floor` goes to zero at every width, and every surface
pinned to the old floor re-measures in the same change.

The trigger is a `Disclosure` (`src/lib/ui/Disclosure.svelte`). That primitive owns the
trigger and not the region, which is this shape exactly, and it brings `aria-expanded`,
`aria-controls` and the drawn caret that says a mark opens something. A logo with no
affordance would be the app's only navigation with nothing to say so.

### 6. The panel drops from the top, on the dialog shell the app already has

It drops from the top at every width. Below 768 the card spans the viewport; at and above
it is width-capped and left-aligned under the logo. **Width changes, shape does not**, so
[ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md) §8's rule that a shape
change is a breakpoint has nothing to hold here.

It is built on `src/lib/ui/Modal.svelte` with a top-anchored card, and therefore adds **no
member to the `ui/` vocabulary**: [ADR-0100](0100-what-earns-a-member-of-the-ui-vocabulary.md)'s
gate is never engaged, because the card's position is the caller's and `Modal` is the shell
every overlay in the app already sits on. Escape, the backdrop and Back come with it.

It is **modal**, not light-dismiss. Switching faces is a navigation act rather than a peek,
and the dim is what says the app is waiting on a choice. `MealPicker`'s native
`popover="auto"` is the right answer for a picker that floats over a bar you are still
reading; it is the wrong one for a surface that replaces where you are.

`src/lib/ui/back-stack.ts`'s `sheet` stop is reworded to "an overlay Back dismisses". Its
documentation says `BottomSheet`, and a top-anchored panel makes that a lie about a stack
whose whole point is that Back is a single resource with one owner (ADR-0089 §7).

The panel is the triquetra and the wordmark, then the grid. Tapping the mark goes home to
§9's landing grid: it is the one mark that means the app rather than a face, so it gets the
one destination no face can offer.

### 7. The grid never re-sorts

A fixed four-column grid, names under the tiles, badges on them. The active face keeps its
declared position and is merely inverted, carrying `aria-current="page"` — the idiom the
food header's icons already use — and tapping it closes the panel.

Ordering by frequency of use was considered at length and **refused**. The app has a
frecency model already (`src/lib/food/frecency.ts`), and it is the wrong tool twice over.
Its first key is recency, so the order would move every time a meal was logged; and its own
header explains that it keeps no store because the ledger already holds every log, which a
face has no equivalent of — there is no datom for opening a screen, so ordering faces would
mean either a counter that module refuses to keep, or redefining "use" as "wrote something
in this domain". Both are answerable. Neither is worth it: seven destinations are learned by
position within a week, and a grid whose tiles move spends that and gives back adaptation
nobody asked for.

### 8. Each shell declares its own roster, and the gate proves it

A shell declares which faces it holds. The root declares seven; Rations declares Rations,
Recipes and Settings.

It is **not derived at runtime**. To discover that a face's module is present, the switcher
would have to reference it, which puts every face in every bundle and costs
[ADR-0077](0077-a-facet-precaches-its-own-weight.md) its 4.23 MB — the saving ADR-0076 §6
made Facet identity a build-time constant to protect. So the roster is a declaration, and
`scripts/facet-checks.mjs`'s existing view-containment claim is extended to hold it: a shell
cannot declare a face whose view modules its built entry does not reach.

This is where ADR-0078 §1 survives as the mechanism. A roster drawn from what the build
holds cannot offer a crossing, so nothing is suppressed at runtime, no `display-mode` test
appears anywhere (§5 of that record), and the one-directional scope asymmetry it describes
is never exercised: Rations' faces are all inside `/food/`, and the root's are all inside
`/`. The switcher is not a way out. §2 of that record falls; §1 does not.

### 9. The root's landing screen is the grid, with no header line

The root stops landing on food and lands on the face grid: the same grid component, rendered
inline, with nothing above it. There is no logo trigger there, because the grid **is** the
switcher and there is nothing for a trigger to open. `BottomSheet`'s `inline` prop already
turns a sheet into a page under Rations, which is the shape borrowed and the reason one
component serves both (ADR-0095: a shared look is reached by reference or it is not shared).

No tile is inverted there, because no face is current. It renders before the ledger opens and
must not subscribe to a ledger store, which is what makes the boot win real rather than
incidental.

DB status becomes an **error-only** badge at the top of the column, everywhere — what
`Rations.svelte` already does, and for the reason written beside it: a screen that silently
never becomes ready is the one failure a user cannot read off the page. `● DB Ready` and
`○ Connecting…` go with the `Sidebar` that carried them. A permanent green badge is a
developer's affordance charging the user for it, and the landing grid does not care whether
the ledger is open.

### 10. Settings is a face whose contents vary by Facet

Settings is a face: always last, never hideable, present in every Facet's roster, and
**varying in what it holds**.

[ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md)'s rule
is unrevised — a Facet carries a jar-wide control only where losing it loses data — and its
split table moves inside the face. What a person gains is a door in the same place
everywhere; what they do not gain is every control everywhere, because that would price a
second Facet at every jar-wide surface and put a ledger wipe one tap from a nutrition target.

**Moving in:** `PairedDevicesSection` and `LogSettingsSection`, which are drawn twice today
and are de-duplicated by the move; `StorageStatus`; `LedgerExport` and `LedgerImport`; the
visibility toggles below; and `FacetExit`, reworded to offer the install rather than to
"Open Rations" from inside a face called Rations. ADR-0078 §4's argument for that exit is
untouched — `beforeinstallprompt` binds to the current document, so an install decision
belongs in a browser — and only where the offer is made moves.

**Staying:** Rations' gear keeps the food-specific settings, and the jar-wide **Wipe
Database** stays root-only. A food-only person reaching it would destroy data for faces they
cannot see, and they already hold the sanctioned deletion for what they can
([ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md)). This one
exclusion is the clearest argument for a face whose contents vary.

**Hiding a face removes it from the switcher and nothing else.** It stays reachable, so a
deep link or a shared meal still lands, and the section says the data is untouched. Settings
is not toggleable, being where hiding is undone. Hiding the face you are standing on is
allowed and moves you nowhere.

The preference is **device-local**, one `localStorage` key under the existing
`inventoria_pref_*` scheme with its own getter and setter
([ADR-0085](0085-a-setting-is-never-a-datom-and-a-consent-is-not-a-setting.md), `src/lib/stores/device-settings.ts`). A
setting is never a datom, and this one is read on the first paint of a screen whose whole
content it decides, which is the case that record's second argument is about. Absent means
every face shows.

### 11. BETA is a declared maturity, and the record says what removes it

`maturity` is declared per face and never derived from an id. **Rations and Settings ship;
Media, Items, Agenda, Notes and Recipes are beta.**

Settings is exempt although it is not Rations, and that is a decision rather than an
oversight: its contents are the oldest surfaces in the app, and a badge that is visibly
wrong once teaches people to ignore it everywhere.

A face earns `shipped` when **its domain's screens do the whole job its name claims, and it
works with the network off.** Both halves are checkable, the second by the gate that already
exists. Without a stated criterion the badge is permanent by accident, which is the failure
mode of every beta label that outlives its product.

It draws twice from one component (ADR-0095): a horizontal band **directly under** the
switcher tile's mark, full tile width, ink ground and paper caps, above the face's name; and
the same `Badge` beside the title in the face's own header, where a band across a tap-sized
mark would be four illegible pixels.

**Under the mark, not across it, and that was decided by assembling it.** The band began as a
band _across the tile's lower third_, which is defensible against one mark and wrong against
the set: five of the seven faces carry it, so five of seven tiles would be marks with their
bottom third painted out — and the bottom third is where these particular drawings keep the
part that identifies them. Rendered, Media lost the phonograph's base and became an
unreadable shell, Recipes lost the mortar's bowl, Items lost the chest's body. A badge that
destroys the mark it is qualifying defeats the point of commissioning marks at all. Moving it
down one row costs 14 px of tile height and keeps every drawing whole, with no loss of
loudness: same rectangle, same ink ground, same caps.

### 12. The marks are one hand where they can be, and the app's mark is the exception

The house style is the anchovy tin's engraving. `docs/icon-provenance.md` holds each mark's
author, title, source and licence, and the cut is its recipe, unchanged.

Senkow's Noun Project portfolio was enumerated in full on 2026-09-27 — 260 icons, every one
`CREATIVECOMMONS` / `A_1` — and the engraved well is **fifteen foods and three gears**. Media,
storage, calendar and notes are absent from it entirely. So four of the seven come from other
hands, chosen by eye for the style rather than found by keyword. The roster, every licence
read per icon from `iconDetail` rather than inferred from a page:

| face        | mark              |      id | author         |
| ----------- | ----------------- | ------: | -------------- |
| Rations     | anchovy tin       | 7864233 | Michael Senkow |
| Recipes     | morter and pestle | 7864224 | Michael Senkow |
| Media       | phonograph        | 4152292 | Hey Rabbit     |
| Items       | chest             | 1071070 | James Smith    |
| Agenda      | desk calendar     | 1672371 | Maria Zamchy   |
| Notes       | Notebook          | 1672370 | Maria Zamchy   |
| Settings    | Worm Gear         |  172710 | Michael Senkow |
| _(the app)_ | Triquetra         |   73068 | Michael Senkow |

Agenda and Notes are the same author and consecutive ids, drawn as a pair, which is as close
to one hand as the subjects allow. Items is a chest rather than the basket that matched the
tin's weave best: the tile two places to its left is a sardine tin, and a picnic basket beside
one reads as more food. Notes is a notebook rather than the open book that was the best
engraving found, because the media domain owns `olid:` and tracks books, so the drawing would
have named the wrong face.

**Two measured properties of this set, recorded because neither is fixable by choosing
differently.** Every mark from another hand is lighter than the house pair — the tin and the
mortar hold 0.24 ink at tile size against the best stranger's 0.17, so the four read thinner
in the grid. And **all three gears fail the reachability cut**: their paper measures negative
and `spiral gear` encloses nothing at all, because the hatching never closes a region and a
flood fill from the canvas edge leaks through every stroke. That is fatal for an install icon,
which iOS composites onto `background_color`, and harmless for a switcher mark, which is drawn
on the app's own paper. `Worm Gear` is chosen over its two siblings on the opposite ground
from the numbers: it is the lightest of the three and the only one whose silhouette still
reads as a gear when small.

The root's mark is `triquetra` **73068** — the same author and the same licence as the tin,
verified against the API rather than inferred, ink fraction 0.1935 to the tin's 0.1978, 19
enclosed paper pockets to its 15, holding at 32px and degrading better than the tin at 16. It
is **flat rather than engraved**, measurably: a single unbroken stroke of mean width 13.6px in
one connected blob, against the tin's 7.9px in 35. That exception is deliberate. The triquetra
is the app's mark and not a face's, so it never sits in the row of tiles the eye compares.

It also closes a gap that page has named since #302: `public/favicon.svg` first appears in a
pre-commit-hooks commit with no author and no licence, and nothing in the repository can trace
it. A mark that is about to be the trigger on every screen cannot be the one mark nobody can
license.

**One file per non-installable face** — a 512 source under `docs/assets/`, one cut output for
the switcher. The five-file ladder is owed where something is installable, which is the root
and Rations. Seven free marks mean seven credits, which is the shape `public/food/icons/CREDITS.txt`
already has; the live terms, read 2026-09-27 and effective 2026-09-02, name **four** icon
licences where that page records three, and the correction is appended there.

### 13. The root stops precaching the search index

`usda/search-index.json` leaves the root's `precache`: 981,462 B, 31 URLs to 30. ADR-0077 §5
kept it there because food was the root's landing screen and "a cold offline install that
opened on a search box finding nothing would read as _no such food_ rather than _no data
yet_". §9 makes the landing screen a grid, so the sentence describes a screen nobody sees
first.

It is replaced by a `CacheFirst` runtime rule, warmed **on entering the Rations face** rather
than at boot, because the landing screen does not read the file and a ~960 KB fetch on the
path of a screen that never uses it is the cost this buys back. Online, the first search keeps
the file and every later one works offline. A cold offline install that has never been online
gets the "needs a network" message `src/lib/food/bundled-artifact.ts` gives the nutrient store
and the scanner (#307) — a third reader of an existing pattern rather than a new one.

Rations is untouched and keeps both USDA artifacts. Both Facets' `precacheBytes` are
re-measured in the commit that moves them, with the account of **why the root's floor fell**:
a manifest that got smaller is exactly the shape ADR-0083 §3's floor exists to make somebody
check, and a reader has to be able to tell a deliberate drop from a collapsed derivation.

### 14. Back means the shell's start destination, one rung at a time

**Back returns to the shell's start destination.** The root's is §9's landing grid; Rations'
is the Rations face on the day. Both are exactly where that shell's `start_url` opens, so
this is the manifest member read as a screen rather than a second concept, and neither shell
states a destination the other has to be told about.

_Home_ is a different thing and stays different. Under Rations _home_ is `/`, outside the
Facet, which is why `FaceSwitcher`'s `onHome` is optional and why a link there would be the
crossing [ADR-0078](0078-a-facet-contains-no-way-out.md) §1 makes unexpressible. That
asymmetry is about where `/` is; it says nothing about whether a face is somewhere you went,
and it is not inherited here.

Before this record a face was a tab you were born on and there was nothing behind it. §9 put
a landing grid behind every tile pick, so the gesture has somewhere to go for the first time
— and [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) §7's premise, that Back
is the gesture people reach for first and the failure is being thrown out of the app, now
reaches the shell as well as its sheets.

**Exactly one stop, never a stack.** Cross six tiles and a stack would take six presses
before the app let go, with nothing on screen saying how deep you are. So Back returns to the
start destination however many tiles were crossed.

**And it walks one rung per press**, because skipping a level is the same failure from the
other side: from the Reports page, one press landing on the grid crosses two rungs at once.
The one stop's `dismiss` is therefore "up one level", read off the `faceBack` the face already
publishes (§5) rather than pushed per page. A stop per page was the obvious spelling and is
wrong here: under Rations `standing === "settings"` is a page and a face at once, so it would
push two stops for one state.

**The predicate is "is there anywhere up from here", never "which face".** Face position alone
gets the Reports page wrong: it is standing _on_ the Rations face, the start destination, while
being a rung above it, so a rule reading the face would walk two rungs from a screen whose
title walks one — or none at all.

**Only Rations has a rung above a face**, and that is [ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md)
§5 rather than anything this record decides: pages are the shell's, the root passes no
`hasPages`, and so the food screen publishes a way back on Rations and nowhere else. The root
reaches its Settings and the recipe library as faces. So the rule is one sentence in both
shells and the root's spelling of it carries no way back to read — a branch that cannot run is
deleted rather than held open for a page the shell does not grow.

**A direct arrival pushes the stop too.** A Web Share Target open sets the Items face
synchronously at boot with no landing behind it, and Back there shows the grid: a screen that
person never saw, and the app's real start destination. Pushing only for a face entered in
this session is truthful to what was done and makes the rule unstateable — two people on one
screen would get different answers from one gesture, with nothing drawn that tells them
apart. Synthesising the stack up to the start destination is what the platform prescribes for
a deep link into a secondary destination.

**A third `BackStopKind`, `place`** — somewhere you went, that Back returns from. Not a
`sheet`: `topSheet` would name it and a `BottomSheet` would compare itself against a face to
decide whether it had been replaced. Not a `mode` either: a face has taken nothing away, the
mark and the title are both still drawn. Named for a shape rather than a component, which is
the rule that let `sheet` survive the panel being a top-anchored card.

**Two stops coexist and the ordering is right by construction.** Standing on a face with the
panel open is a `place` under a `sheet`, the face having been entered first, so Back closes
the panel only and nothing has to arbitrate. Dismissing the panel _and_ the face in one flush
leaves `reconcile` two entries to unwind, which it does one per pass, deliberately.

**A hidden start destination is still the destination.** Rations' own face is hideable and
hiding the face you stand on moves you nowhere (§10), so Back can land on a face that is not
in that switcher. That is §10 working: hiding takes a face out of the grid and never out of
reach.

**What this costs, in the open: the pushed entry outlives a reload and the face does not.**
No shell persists which face it is standing on, so reloading on a face reboots onto the start
destination with one orphaned history entry, and the first Back after that does nothing
visible before the next leaves the app. `ui/back-stack.ts` already carries that failure for
sheets; what changes is the frequency — a sheet open at reload is rare and a face open at
reload is every reload. Accepted rather than repaired, because the repair is URL state and
that file declines one by name: "that is a router, which this app deliberately does not
have." A hash would also make a face linkable, which is
[ADR-0078](0078-a-facet-contains-no-way-out.md)'s territory and not this record's.

## Consequences

**What it costs.** The app's only navigation moves to the top-left corner of the screen, which
on a phone is the furthest point from a thumb and a region the platform claims for its own
gestures. A bottom-anchored panel was recommended and refused; the trigger and the targets are
both in the top half by choice. If that proves wrong in use, the thing to change is the panel's
anchor, and §6 is written so that nothing but the card's position depends on it.

**Rations' bottom edge now has three claimants.** `WayInBar` is pinned there permanently
(ADR-0101 §7), `SelectionBar` takes the slot when a Selection is live
([ADR-0088](0088-a-selection-is-a-mode-with-its-own-verbs-and-its-own-way-out.md)), and the panel
covers both. The bar's own fold is deliberately **not** reused for this: `folded` means "a
Selection has taken my slot", and one state with two meanings is how that mechanism stops being
readable.

**The `--shell-floor` to `--shell-ceiling` move touches every pinned surface at once.** Nothing
in the tree currently reads a ceiling, and everything pinned low reads the floor, so the change
cannot be staged per surface without a window where one of them is measured against a bar that
is gone.

**A device with both installs pays the search index twice.** §13 takes it out of the root's
precache and puts it in a runtime cache; Rations still precaches it; a precache `Cache` is
scope-named. The install gets smaller and the device holds two copies once both have searched.
That is the same accounting ADR-0077 §1 accepted rather than mitigated.

**What it forecloses.** A runtime `display-mode` check, still, everywhere — §8's declaration is
what makes one unnecessary rather than merely discouraged. Ordering the grid by use, unless §7's
two objections are answered rather than reopened. And a second nav: the switcher is the app's
navigation at every width, so adding a rail or a tab bar beside it is a decision that has to
overturn this record.

**What was not verified, and has since been.** This record originally left §12's four strangers'
marks unfound, with the fallback named in case four honest matches did not exist. They were
found on [#531](https://github.com/palebluebytes/inventoria/issues/531): ~27,000 icons pooled
across the four subjects, scored on ink fraction and an edge-per-ink ratio that separates
hatching from a flat glyph, and inspected as contact sheets. **Agenda yielded exactly one
honest match out of ~4,400 calendar icons**, which is the thinnest the set gets and the place a
future reader should look first if the grid stops reading as one hand.

**What is still unverified.** Whether these seven read as one set _in the app_, at tile size,
against the app's own paper, on a phone. The grid was assembled and judged as a static page,
which is what moved the BETA band in §11 — and that is the same class of finding that only
appears once something is rendered. Expect at least one more.

**What this record does not know about, and should.** Whether a person who installs only Rations
ever wants the faces the root holds. §8 gives them Recipes and Settings and nothing else, on the
strength of ADR-0078 §7's forcing — anything a standalone Rations user needs must be inside
Rations — and that forcing has only ever been read as a constraint on _settings_. A Rations-only
person who starts keeping notes has no route to them and no signal that they exist, which is the
first question to ask when this ships.

## Amendment, 2026-09-27: four precisions from building the shell

[#529](https://github.com/palebluebytes/inventoria/issues/529) built §5's header, §6's panel
and §7's grid. Four things this record decided in the abstract came back different, and each
is written here rather than edited into the section above, because the argument is what
changed.

**1. The face marks needed neither a copy nor an inline, because the rule they were working
around does not exist.** §12 left the question open and `docs/icon-provenance.md` set out two
answers: copy Rations' three under `public/food/icons/faces/`, or inline the set so the module
graph precaches it. Both were answers to "a service worker scoped to `/food/` cannot precache
a URL above it", and **that premise is false**. Scope decides which _clients_ a worker
controls, not which URLs it may store or answer for. Rations' own precache at `2e6732b0` held
36 URLs and **25 of them sat above `/food/`** — every `assets/*` chunk, both USDA artifacts and
`fonts/OFL.txt` — and `pnpm check:offline` boots that install with the network off. The rule
had been contradicted by what ships since the second Facet existed. So each Facet names the
marks where they already are, `Face.mark` stays one served URL with one cut output behind it,
and no file is committed twice. The false reason stood in two places and both now carry the
real one: that page's section, and `Facet.icons`' doc comment, where an icon sits inside its
Facet's scope because a manifest describes an app whose scope is a prefix and because an OS
fetches an install icon with no controlled client in the picture at all.

**2. The triquetra is a control only where home is inside the shell's own scope.** §6 has
tapping it go home to §9's landing grid, "the one destination no face can offer". Under
Rations that destination is `/`, which is outside the Facet — a link there would eject an
install into a browser tab, which is exactly the crossing ADR-0078 §1 makes unexpressible and
§8 promises the switcher is not. So `FaceSwitcher`'s `onHome` is **optional**, and its absence
is the decision rather than an omission: Rations' masthead is a drawing. The root's is a
control, and [#530](https://github.com/palebluebytes/inventoria/issues/530) is what hands it a
destination, since the grid it goes home to is that ticket's.

**3. "The default caret kept" was not expressible, and the primitive gained a parameter rather
than a prop.** §5 asks for the face's mark _and_ `ui/Disclosure`'s drawn caret. That component
renders `mark` **or** its caret and then a string `title`, so a caller could have the logo or
the affordance and not both. Copying the caret's path into the switcher was the obvious way out
and is the failure ADR-0068 calls _the way a copy fails_. What shipped instead is one extra
argument: the `mark` snippet is handed the caret it is replacing, so a caller can still render
what the hole used to hold. ADR-0100 §3's brake is about _axes_ and no axis was added — every
existing caller declares one parameter and an argument a snippet does not name is inert.

**4. Two consequences of deleting the `Sidebar` that §5 did not price.** The root's shell
reserved three safe areas and handed the bottom to its nav (ADR-0089 §2); with no nav it
reserves all four, which is the reading Rations has always had, so the two shells now agree on
every edge. And §9's retired `● DB Ready` badge was load-bearing for the **suite**: fifteen
end-to-end specs waited on those words. Readiness is now `data-db` on each shell's own box — a
hook nobody sees, the same bargain `window.dbClient` already strikes — and `tests/support/shell.ts`
holds it, along with the switcher's two-step navigation, so the next change to either is one
file rather than fifteen.

## Amendment, 2026-09-27: the landing screen, as built

[#530](https://github.com/palebluebytes/inventoria/issues/530) built §9. The screen is what the
section describes — the grid the panel holds, rendered inline in the shell's own column, with no
header line above it and no tile inverted — and three things it did not say are settled here.

**1. An arrival is not the zero state, so it is read before the ledger rather than after it.**
§9 makes "no face" the state the app opens in, and the root has exactly one open that is not
that: a Web Share Target hand-off, which mints an acquisition twin on the Items face
(ADR-0084 §3, §4). That read sat after `await init`, where it was invisible while the landing
_was_ food and is a visible flash of the grid now. It moved to component initialisation, off the
same `window.location.search` the dev demo hatch already reads and behind the same guard, so a
shared URL opens on Items and nothing else does.

**2. The boot win is measurable, and the measurement is a comparison rather than a clock.**
§9 claims the grid "renders before the ledger opens and must not subscribe to a ledger store".
Both halves are now held by `tests/unit/landing-screen.test.ts`: `FaceGrid`'s whole import list
is the registry, which is a build-time constant (ADR-0076 §6), and the root's shell renders seven
tiles under a harness with no ledger in it at all — while the same harness on the share-target
URL renders **nothing**, because every face mounts a view that subscribes to one. A shell that
draws the grid and a shell that draws nothing is the sharpest available statement of what the
landing screen costs, and no timing was needed to get it.

**3. "Nothing above it" was taken literally, and the app's wordmark is now drawn in one place
only.** The panel is the triquetra and the wordmark, then the grid (§6); the landing screen is
the grid alone. So the app's own name appears nowhere on the screen the app opens on, and that
screen carries no `<h1>` — the header's title is the only one in the document and there is no
header here. This is the section's own sentence honoured rather than a preference, and it is
written down because it is the half of §9 somebody may want back: the masthead is already drawn
both ways for §6's sake, a control where home is in scope and a drawing where it is not, so
adding it above the landing grid would cost a component extraction and nothing else.

**What it cost the suite, which is the same shape #529 found.** The root's front door moved, so
sixty-two specs that opened on food now open on the grid. They go through one helper —
`openRootFace(page, name)` in `tests/support/shell.ts`, the goto, the tile and the readiness wait
in that order — and `goToFace` reads which host is up rather than assuming the panel, because a
reload puts a spec back on the landing. The ledger wait comes last on purpose: the face is reached
before the database answers, which is §9's claim stated as the order of two lines.

## Amendment, 2026-09-28: the Settings face, as built

[#532](https://github.com/palebluebytes/inventoria/issues/532) built §10, and it is the one
ticket in this arc that moved shipped code rather than adding chrome. The split is what the
section describes and ADR-0080 §2's table is unrevised, but §10's two lists read differently
once you try to move something, and four of the things it settles came out derived where the
section had written them down.

**1. "Moving in" moved less than it reads, and the real move was the exit.** Of §10's list,
`StorageStatus`, `LedgerExport` and `LedgerImport` were already on the surface that _became_ the
root's Settings face, and Rations already drew the import and the persistence badge in "Your
data". So that list is what the face **holds**, not a list of relocations. What actually moved is
the sanctioned exit: it hung under the root's Rations screen, where "Open Rations" offered a rival
copy of itself from inside the face that copy is of. It is on the Settings face now and reads
_Get Rations as its own app_, with ADR-0078 §4's sentence about the browser tab underneath it
unchanged.

**2. The de-duplication is one component, and "one door everywhere" is one predicate.**
`PairedDevicesSection` and `LogSettingsSection` each had two call sites whose whole difference was
a Facet id and one `{#if}`, so the pair was a component waiting to be named:
`views/settings/JarSettings.svelte`, drawn by the root's Settings screen and by Rations' settings
sheet. It takes **both** the Facet whose settings these are and the Facet whose document is
drawing them, because those differ exactly once — the root draws the whole of Rations' sheet
inside its Rations face — and their equality is the whole judgement:

> A surface scoped to the Facet you are standing in is that Facet's own settings door. The same
> surface scoped to another Facet, drawn inside your shell, is that Facet's **page**.

That one predicate settles what used to be a literal `shell === "food"` on the pairing card
(ADR-0108 §1: an act performed in the root's Rations face ran in the root) and it settles the
visibility toggles for the same reason, since a copy of them on a page belonging to another Facet
would offer to hide three tiles out of a grid of seven.

**3. The install offer is enumerated rather than gated, so no rule is written down against
`root`.** `FacetExit`'s own header has always said that only the root may draw it and that this
is a consequence of prefix matching (ADR-0078 §3) rather than a rule it enforces. The offer is now
read off `nestedFacetsOf()`, which is that consequence as data: only a Facet containing another can
link to it without leaving its own scope. The root offers Rations; Rations' own door and Rations'
sheet-inside-the-root both come back empty on their own. A third Facet costs no edit.

**4. A shared block still owed one adjacency, so it takes a slot.** ADR-0071 §6 puts Rations' scan
readout _directly above_ the log card its channel is listed in, so its Clear is one card away from
the numbers it zeroes — and a shared block holding both jar-wide cards in one order would have
spent that. `JarSettings` renders a caller's snippet between them instead. One caller passes one
thing, which is the right size for a slot: the alternative was re-deciding a placement that had
already been argued.

**5. The visibility toggles are on both shells, and ADR-0080 §4 is why — not §1.** Hiding is
reversible and takes nothing away, so §1's two clauses would leave it at the root; §4's rule is the
one that applies, because a setting lives beside the thing it configures and **each shell has a
switcher of its own**. Rations offers two rows where the root offers six, off the same one key. The
key is `inventoria_pref_hidden_faces`, and it is reached by **neither** wipe: no domain claims it,
so the Facet-scoped wipe does not match it, and the jar-wide wipe takes only what would otherwise
make the wipe a lie. A switcher somebody tidied is a preference, and a preference left behind is
not a resurrection.

**6. Two small things the primitives decided.** `ui/Checkbox` refuses an unnamed box on purpose,
and a row already carrying the face's name on the left has no room for the name again on the right
— so each row reads _Media … Show ☑_ and carries the fuller accessible name, which contains the
visible word and is therefore allowed to (WCAG 2.5.3). And the BETA badge is drawn from `ui/Badge`
in the row as well, which makes **three** sites where §11 counts two;
[#534](https://github.com/palebluebytes/inventoria/issues/534) folds it in when it builds the one
component. A row that said nothing about maturity would ask somebody to decide whether to keep
Media without telling them Media is unfinished.

## Amendment, 2026-09-28: the five faces' headers, as built

[#533](https://github.com/palebluebytes/inventoria/issues/533) built the rest of §3 and the
last clause of §5. The scope line above calls it "their header and nothing more", which held:
no face's contents changed. What it got wrong is arithmetic, and one sentence of §5 turned out
to have no way to be true.

**1. The five in the scope line and the five that had headers are different sets.** The scope
line means the five §11 calls unfinished — Media, Items, Agenda, Notes and Recipes. The five
that drew a title of their own are Media, Items, Notes, **Settings** and Agenda. Settings is
`shipped` and had a `.page-header` anyway, because it is the oldest surface in the app;
Recipes never had one, because it is `RecipeLibrarySheet` and its way in is
[#536](https://github.com/palebluebytes/inventoria/issues/536). Nothing follows from this
except that the two fives are not the same five, and the ticket's is the one that was built.

**2. `AgendaView` was not headerless, and §3's three retired titles were four.** §3 reads
"`AgendaView` has no header at all and gains one". That is true of the `.page-header` idiom and
false of the screen: `views/habits/AgendaHeader.svelte` drew **DAILY AGENDA** above the selected
date, inside an ASCII box with the day arrows. So the face had a name of its own, in a fourth
spelling, and the record missed it by looking for the shape the other four used. The title line
is gone and the box keeps the job it actually has, which is moving a day; the date takes the
weight the title was carrying.

**3. A face's controls cannot be handed down, so they are published up.** §5 ends "then the
face's own actions", and the header `#529` built took them as a snippet prop. That prop had no
honest caller. The header is a flex item **above** `.main` and every face mounts **inside** it,
so the only component that could have passed a snippet is the shell — and the shell is the
wrong owner: Media's gear opens a sheet over `MediaView`'s state, and the food screen's four
read a page, a date and a disclosure that exist nowhere else. Passing them from `App.svelte`
means moving a face's state into the box that holds all seven.

So the prop is deleted and `layout/face-actions.ts` replaces it: a face publishes a snippet, the
header draws whatever is published, and the publication is taken back when the face unmounts.
It is `layout/shell-ceiling.ts`'s shape — one box knows a thing the other box needs and neither
is the other's parent — with a snippet where that module has a measured number. The teardown
clears only what it published, so nothing depends on whether a departing face's cleanup runs
before or after an arriving face's effect.

**Svelte is what makes this cost nothing in styling.** The scope class is stamped at compile
time in the file the markup was written in, so the gear keeps `MediaView`'s rules while being
drawn inside the header. The button, its class, its id and its state all stay where they were;
only where it is drawn changed.

**4. The blurbs went with the titles, and that is §9's argument re-used.** Each of the four
`.page-header` rows carried a paragraph under the title saying what the screen was for —
"Track your movies, TV shows, and books", "A conflict-free scratchpad backed by a Loro CRDT".
A permanent paragraph explaining an unfinished screen is the same bargain §9 struck against
`● DB Ready`: a developer's affordance charging the user for the space. §11's band is the
honest statement that these faces are unfinished, and the food screen already keeps its own
blurb behind a disclosure rather than above the fold.

## Amendment, 2026-09-28: BETA as built, and the third place it is drawn

[#534](https://github.com/palebluebytes/inventoria/issues/534) built §11. The declaration was
already on the roster from [#528](https://github.com/palebluebytes/inventoria/issues/528), so
what this ticket added is the drawing — and the drawing turned out to cost no new look at all,
while the count of places that need it is one higher than §11 says.

**1. §11 counts two drawings and there are three.** The Settings face's face-visibility section
draws a row per face — mark, name, badge, checkbox — and a row where somebody decides whether to
keep Media must say that Media is unfinished, or it is asking for the decision blind. That row
arrived with [#532](https://github.com/palebluebytes/inventoria/issues/532), after §11 was
written, and it takes the **badge** shape rather than the band, which is §11's own argument for
the header: a band belongs across a tile and a badge belongs down a list. `FaceMaturity` is
therefore one component with three call sites and two shapes.

**2. The row's badge changed colour, which is the point of having a component.** #532 drew it
`variant="warning"` — amber — because there was nothing to reach for yet. §11's look is an ink
ground with paper caps, so adopting the component moved the row onto it. A face's maturity is now
one colour in all three places, and that is ADR-0095 §1's whole claim: the second drawing of a
look is the one that drifts.

**3. The band declares nothing, because `ui/Badge` already was one.** §11 says "ink ground, paper
caps, letterspaced", and `--radius` is `0` in this frame, so the primitive is already a square ink
rectangle with letterspaced paper caps. The band is that box plus `.w-full` and `.justify-center`,
the two utilities `src/app.css` already shares with the two shells' DB-error line. So no `ui/`
member is minted, ADR-0100's gate is never engaged, and `FaceMaturity` has no `<style>` block at
all: what it owns is a predicate and a word, and the look stays where the look lives.

**4. The band inverts with the tile, and §11 did not foresee needing it to.** ADR-0038's selected
mark swaps ink for paper, and five of the seven faces are beta — so "the face you are standing on
is a beta face" is the ordinary case, not an edge. Left alone, an ink band on an inverted ink
ground is the word with its box gone. It takes `filter: invert(1)`, the same one line the mark
above it already takes, rather than a sixth `ui/Badge` variant: `--ink` and `--paper` are `#000`
and `#fff` and there is no dark theme, so the filter lands on exactly the two tokens a variant
would have named and cannot drift from them.

**5. "Full tile width" is wider than the mark, and the wording is kept.** The mark is capped at
its natural 64 and centred, so on a roomy column the band is the wider of the two. That is what
§11 asked for and it reads correctly — a rectangle of solid ink gains nothing from a cap — but it
is worth saying, because §11's "directly under the mark" invites the reading that the two measure
the same. The **14 px** that clause costs is the estimate the earlier geometry was priced at and
this ticket did not re-measure it: the band's height is the primitive's own box, declared nowhere
in this arc, so there is no second number to keep in step.

## Amendment, 2026-09-28: the search index as built, and the second face that searches

[#535](https://github.com/palebluebytes/inventoria/issues/535) built §13. The file is out of
the root's precache, the `CacheFirst` rule is in its service worker, and the warm runs on
entering a face rather than at boot. Six precisions, and the first is the one a reader of §13
needs most.

**1. §13's 981,462 B was already stale, and the drop is 812,123 B.** The file weighs
**812,093 B**, not the figure §13 and the ticket both quote: that number came out of one
paragraph of `precacheBytes`'s comment in `src/lib/facets/registry.ts`, and another paragraph
of the same comment already recorded ADR-0103 and ADR-0104's consolidation taking it to
812,920 B before this arc was charted. The root goes from **8,889,122 B over 43 URLs to
8,076,999 B over 42** — not the "31 URLs to 30" §13 says, because #529 and #531 added eleven
icon URLs after that clause was written. Rations loses **30 B**, which is code and not an
artifact. Both figures are re-declared off one build, with the arithmetic that distinguishes
a deleted declaration from a collapsed derivation, which is what §13 asked for.

**2. The warm is two faces' and §13 counted one.** §13 warms "on entering the Rations face",
and that was right about the food screen and blind to the other one: on the root, Recipes is a
face of its own (§4), and a recipe reached through `AddIngredientSheet` mounts `FoodStager`,
which searches the corpus. A reader who opened Recipes and nothing else would have met a
~800 KB fetch inside their first ingredient search. So `warmUsdaCorpus()` is called from
`FoodView`'s `onMount` **and** `RecipeLibrarySheet`'s, and the general rule the clause wanted
is the one now written on the function: a face that can search food warms what it searches.
On Rations both fire, because the library is one of the food screen's pages, and the second
call costs nothing — the loads are memoised on success.

**3. The warm left the Jar's errand list, which is the first member ever to.**
`src/lib/facets/startup.ts` exists so a second entry point cannot miss an errand, and the
warm qualified only while food was the landing screen of both Facets. What the departure
leaves behind is the test of membership: an errand is the Jar's when a second entry point
missing it would be a silent defect, and a fetch nobody asked for is not one.

**4. A `urlPattern` function may close over nothing, and this shipped broken before it
shipped.** `workbox-build` serialises a string `urlPattern` through `JSON.stringify` and a
function one through `toString()`. Written the obvious way —
`({ url }) => url.pathname === SEARCH_INDEX_URL`, reading the constant the app fetches through
— it emitted a service worker whose route said `e.pathname===SEARCH_INDEX_URL` with that
identifier bound to nothing: a `ReferenceError` raised inside workbox's matcher on the first
request the router tried it against. The build was clean and every gate was green. It is a
string pattern now, which workbox matches as an exact `url.href` against
`new URL(pattern, location.href)`, so the leading slash is what makes one spelling right from
`/sw.js` and from `/food/sw.js`.

**5. The rule needed a gate, and the gate needed two readings.** §13's removal half is
watched from both sides already — the declaration is a reviewable diff and ADR-0083 §3's floor
fires on the weight, as it did here — and its replacement half was watched by nothing, with a
failure that is silent and expensive rather than loud: the app runs, every search pays the
origin, and offline search is gone. `pnpm check:facets` carries a fifth claim now
(`checkSearchIndexRoute`), derived from each Facet's own `precache` declaration rather than
named against the root. Its first form asserted the cache name alone and was **green over the
broken build in §4**, so it asserts the URL as a literal in the file as well — on the Facet
that gave the file up, since the other one carries it in its precache manifest and there it
would prove nothing.

**6. `maxAgeSeconds` is load-bearing, and the precache is why.** A precache entry carries a
revision, so a deploy that regenerated the corpus replaced it. A runtime cache on a stable URL
has no such mechanism: with no expiry, a device that cached the index once would hold those
rows for the life of the install however many times the corpus was rebuilt under it. Thirty
days is the ceiling the image cache already uses, and it bounds staleness rather than
predicting a release cadence.

**What was left alone.** A rule over `/usda/*.json` would have caught the Nutrient store too,
and the root gave that up at ADR-0077 §5 — but 4 MB in a runtime cache is its own decision
about what an install weighs after a week of use, and #307's sentence is the answer that
record chose. §13 is about one file.

## Amendment, 2026-09-28: Recipes' second door, as closed

[#536](https://github.com/palebluebytes/inventoria/issues/536) finished §4. Recipes was on the
face roster from [#528](https://github.com/palebluebytes/inventoria/issues/528) and had a
switcher tile from [#529](https://github.com/palebluebytes/inventoria/issues/529), but it was
still one of Rations' pages as well — so the recipe library had two controls, the tile and the
food header's mortar-and-pestle, and both drove one opening. `PAGES` closes at two, the pot is
gone, and both shells mount `RecipeLibrarySheet` with no props at all. Five precisions.

**1. The phone loses a sheet and gains a screen, and that is the trade §4 was making.** Below
the shell breakpoint there were never any pages: the pot opened the library as a `Modal`
sheet over the day, and the tile opens a face. So the library stops being something that
covers the day and becomes somewhere you went — no ✕, no Back stop, no dim. This is stated
rather than arrived at by deleting a button, because it is the visible half of the change and
it is a loss as well as a gain: a sheet is dismissed where it was opened and a face is not.
What buys it is ADR-0091 §1 satisfied rather than conceded — **one control at every width**,
where the pot was a page opener above 768 and a sheet opener below it — and the other four
beta faces already made the same trade, so the library is now the same kind of place they are.
What Back should mean on any of them is [#539](https://github.com/palebluebytes/inventoria/issues/539)
and is not answered here.

**2. The surface moved up to the shells, and it took the food screen's mount with it.** The
alternative was keeping the render inside `FoodView` off a state that was no longer a page,
which is a page by another name. `Rations.svelte` draws it beside the call `App.svelte`
already made, so the two shells are the same two lines — and the food screen is therefore
**unmounted** while the face is up, where a page left it mounted. Three consequences, all of
them the root's existing reading of a face arriving on Rations:

- Leaving Rations for Recipes **declines an arriving meal**. `FoodView`'s receiving surface
  already said this in as many words — "leaving is declining, by any route, including a tab
  change, which unmounts this whole screen under it" (ADR-0073 §10) — and a face change is
  now one of those routes on both shells.
- The **Selection is the day's, and the day is the Rations face's** (ADR-0088 §1). It survived
  the recipes page and does not survive the Recipes face. It still survives Reports and
  Settings, which are pages, so the rule is unrevised and its scope is now stated: every
  screen inside the face, none outside it.
- Coming back lands on **the day**, not on whatever page was last open, because the tile
  clears the opening.

**3. One widened variable, not a second flag.** Rations' shell held `Page | null` and derived
which face it was standing on from it, which worked while both of its non-day faces were pages.
Recipes is not one, so the state is `Page | "recipes" | null` and the food screen is handed its
half through a getter/setter pair (`bind:page={() => foodPage, (p) => (standing = p)}`). The
reason is §5's own, one level up: two states would be two things that can both say yes, and
the one that says it wrongly is the one nobody can see — the header would name a face the
screen was not showing.

**4. `selectedDate` was inert before this, and both shells were saying so.** The library takes
a date because `RecipeBuilder` does, and the two builder verbs that read one — `consolidate`
and `define` — are unreachable from this screen. The root already handed a fresh `new Date()`
with a comment admitting it; the food screen handed the day it was on, which nothing here could
spend. It is `INERT_DATE` inside the component now, beside the `INERT_MEAL` that had been
there all along, so the shape is satisfied in one place rather than threaded from two that both
had nothing honest to put in it. `inline` and `onClose` go the same way: a face is a screen at
every width, and nothing on it can close.

**5. The ticket was wrong about the tests, in the direction that costs coverage.** It expected
three end-to-end specs clicking `#food-recipes-btn` by name; **no spec names that string.**
Two of them (`tests/layout-invariants.spec.ts`, `tests/visual-catalog.spec.ts`) reach these
controls through `iconIdOf` inside a loop over `PAGES`, so removing a member made both stop
visiting the recipe library **with no edit and no failure** — and the catalogue's
`rations-recipes-page.png` was the library's only picture on either shell. A derived roster
notices a page that arrives and says nothing about one that leaves for somewhere the derivation
cannot see. Both now reach the face by name; the orphaned baseline is deleted; and the root
gains `recipes-face.png`, which is the capture the catalogue's own roster guard has claimed to
have since #529 — its name is _"the switcher offers exactly the screens this catalogue
photographs"_ and Recipes was the one it did not. Two specs in `tests/food-ui.spec.ts` did name
the control, by its accessible name rather than its id, and they leave by switching faces now
because there is no ✕ to press.

**What was left standing.** Rations' gear and the Settings tile open one surface between them,
which is the same two-doors shape on the same shell, and #536 did not close it:
[#550](https://github.com/palebluebytes/inventoria/issues/550) is the question. None of the
argument above reaches it — the pot went because the face is the same control at every width,
and the gear opens food-specific settings §10 deliberately leaves where they are, on a shell
where the same gear opens another Facet's page rather than that shell's own Settings face. It
is written down on the state it complicates rather than kept quiet.

## Amendment, 2026-09-29: the food screen's title row, and the fifth retired title

[#538](https://github.com/palebluebytes/inventoria/issues/538) finished §5 on the one face
§3 was written about. `FoodView` drew `FOOD` in a title row of its own directly under the
header's `RATIONS`, so from #529 until now the face this record names first was the only
face still spelled twice. Its four controls are published like Media's gear, and the word
itself — which is a control there, and nowhere else in the app — is published with them.

**1. The retired titles were five, not three and not four.** §3 names three by hand; the
#533 amendment above found `DAILY AGENDA` as a fourth, in a shape §3 was not looking for.
`FOOD` is the fifth, and it hid in the opposite way: not in a box the census did not
recognise, but in a screen the census was never pointed at. Both misses are the same one —
§3's list was written from the faces that looked unfinished, and the spelling has nothing
to do with whether a face is finished.

**2. The way back has two owners, so it is published as a pair.** ADR-0091 §5's accessible
name is the visible word plus the destination — "Food, back to the day" — and after the
move those halves live in different places: the word is the roster's one spelling (§3),
which only the header holds, and the destination is a fact about the food screen's own
day, which only the face knows. So `layout/face-actions.ts` carries `{ to, go }` rather
than a callback or a finished string, and the header composes `"Rations, back to the day"`.
A face that published the whole name would be spelling itself again, one indirection
further down.

**3. §5's rule is unrevised and its box moved, which is ADR-0091 §5 read the way the
record already reads its own.** "The title is the way back, and it is the only way off a
page" is untouched: the icons are still navigation, the current one still inverts, and
nothing else offers a way off. What changed is that the header holding all of it is the
shell's rather than the screen's — the generalisation this record made in §5, arriving at
the screen §5 quoted it from.

**4. The tap floor has to be said twice, to two readers.** The control's floor was
`min-height: var(--tap-min)` on the button when the button lived in the screen's own row.
In the shell's header that is not enough and not sufficient on its own: the word must sit
in the same line box whether or not it is a control, so the floor is a `line-height` on the
title, which the button inherits — and `tap-floor.test.ts` sweeps declared boxes off the
stylesheet and cannot see an inherited `line-height`, so it read the button as 21.6px and
convicted it. Both declarations name `--tap-min`. The sweep is right to be blind here: a
box whose floor is somewhere else is a box whose floor can be edited away from somewhere
else.

**5. The row keeps a box of its own inside the header's, and the amendment above is why.**
"Svelte is what makes this cost nothing in styling" holds for Media, whose one control is a
plain `<button>`. The food screen's ⓘ is a `ui/Disclosure`, and a class handed to a
component carries no scoping hash — so the rules that dress all four are `:global` anchored
on `.header-actions`, and that anchor has to be an element this file wrote. It costs one
`<div>` inside the header's own.

**6. The ⓘ and the panel it unfolds are in different components now**, with `aria-controls`
crossing the tree. That is legal — an IDREF reaches anywhere in the document — and it makes
`ui/Disclosure`'s founding argument literal: #316 refused to own the region because the two
boxes had different parents at four sites of five, and at this one they no longer have the
same component.

**7. Two things the row was carrying that nothing could have drawn.**
`.header-actions :global(.header-icon-btn .entry-icon)` sized a `WayInIcon` in the header,
and [#536](https://github.com/palebluebytes/inventoria/issues/536) took the recipe pot out
of that row — the rule has matched nothing since. And the deleted `.page-header`'s comment
said its tight phone spacing was restored by "the desktop query below", where `FoodView`
has no `@media` block at all and never had one. Moving a rule is when a reader finds out
what it was doing; neither of these came across.

**8. One reader for what the title says.** Three unit files matched the header's `<h1>` with
a regex against its bare shape, and all three broke on the block anchors Svelte stamps
inside an `{#if}` — the word was still there and none of them could see it.
`tests/unit/support/faces.ts` gains `headerTitle`, beside the `tileNames` that is there for
the same reason: what each file is asserting is the word, so the word is what they read.

## Amendment, 2026-09-30: the gear and the tile become two surfaces

[#550](https://github.com/palebluebytes/inventoria/issues/550) asked whether Rations' gear
and its Settings tile were one control too many, and
[#555](https://github.com/palebluebytes/inventoria/issues/555) built the answer. **Neither
control is deleted: the surface is.** The gear opens Rations' own settings and the tile
opens the jar's Settings face, so Rations reaches the state the root has always been in, and
§1's one-way-in rule is satisfied by the two surfaces differing rather than by a mark going
away.

**1. §10's "Moving in" list names `LogSettingsSection` as de-duplicated by the move, and it
is back to two call sites.** That list is a true record of what was believed when the face
was drawn, so it is amended here rather than edited there. The card follows the **Facet's
screens** and not the **shell's door** — a consent is a fact about egress from a Facet
rather than about the document the switch is drawn in, which is what the component itself
says — so it belongs wherever that Facet's own settings are. Under Rations that is the
gear's page; at the root it is the Settings face, because the root has no other door. The
rule, stated once: _a Facet's log door sits wherever that Facet's own settings live._

**2. The predicate that split them was a seam showing through.** `JarSettings` held two
surfaces, not one: three blocks belonging to the drawing shell's own door, and the log card,
which belonged to the Facet's screens. `ownDoor` marked the join and read as a rule. Cut
along it and there is nothing left to judge — every block in that component is the shell's
own now, and a face's shell is always its own Facet — so
[ADR-0108](0108-a-volume-food-is-weighed-by-the-class-you-say-it-is.md) §1's hazard
becomes **unexpressible rather than judged**, the same move §8 made for cross-Facet links.
`shell` leaves `JarSettings`, `FoodSettingsSheet` and `FoodView` together.

**3. The slot survives with a new tenant, which is what keeps the root's screen unchanged to
the pixel.** The scan readout rode a snippet slot to stay directly above the log card its
channel is listed in ([ADR-0071](0071-a-scan-session-is-recorded-locally-and-carries-no-barcode.md) §6); both
have moved to the gear's page, where that adjacency is two lines in a row. The root passes
its own log card into the vacated slot, so the order on that screen is the order it has
always been drawn in.

**4. ADR-0091 §1 governs the action, not the header's roster.** The tile is the shell's
control and the gear is the face's, published from opposite sides of the scroll container,
which is why `layout/face-actions.ts` exists at all. A reader cannot see which box a mark is
published from, and should not have to learn that two marks mean one thing. So the rule
reaches across that boundary, and what it convicts is a duplication whose two controls are
drawn by different components.
[ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md)
already holds this record's backlink, so no new one is owed.

**5. The face under Rations is two cards, and that is §10 being true.** `facesOf(food)` minus
the unhideable one gives two visibility rows, and nothing is nested inside `food`, so there
is no install offer. Accepted whole: filling it out with blocks lifted from "Your data" —
whose own paragraph argues for its four members' adjacency — would buy bulk and spend
meaning. "Contents vary by Facet" was written to allow exactly this.

**6. A face's own settings are named for the face; the jar's are named Settings.** Under
Rations the qualifier reads as _this app's_ settings while it is now the narrower half, and
the plain tile beside it is the broader one. The sentence above is what un-inverts them, and
it is `ownDoor` promoted from a predicate into the naming. ADR-0080 §8 already reads the
title off the registry, so a second Facet inherits it with no decision.

**7. The gear performed a face switch, and below the breakpoint that face was not a
screen.** Writing the tile's landing into the food screen's page meant `page = "settings"`
derived the face to Settings, so under the shell breakpoint the Settings face drew as a
modal sheet over the day, under a header saying Settings, with the day's own controls in it
and no way back. §4's argument for deleting Recipes' second door was that a face is the same
control at every width; this was the same defect one face along, and it is the cut that
removes it. The gear's surface keeps its sheet-below/page-above shape, because a **page** may
be a sheet and a **face** may not.

**8. "Leaving is declining" was asserted and not true.** The receive code is the shell's
state and nothing cleared it when the food screen unmounted, so a face switch killed the
socket and kept the code, and coming back re-opened the receiving surface — which
`leaveReceiving`'s own comment names as the thing that must not happen. It arrived with §4's
face and went unmet because one tile was a rare way out; this cut makes it two and the
ordinary one. The shell clears the code on every landing that is not Rations, so
[ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) §10's sentence
stands rather than being merely asserted. The cost taken in the open: a mis-tap on a tile
throws away a meal somebody is holding open, with no undo. The alternative invents a
resumable hand-off nobody has designed, by accident.

**9. The Back stop now reads two variables where it read one.** §14's predicate is "the face
**or** a way back", and Rations got away with reading only its own `standing` while the page
and the face were written on it. They are two variables in two files now, so on the Rations
face the shell says _start destination_ while the food screen publishes a rung above it.
Both are read. The branch §14's build deleted as unreachable stays deleted: there is no face
that is also a page any more, so nothing pushes two stops for one screen.

**10. The sweep that is derived from a roster missed the new surface, twice over.** The
layout-invariant loop is derived from `PAGES`, and the gear's page is still in it under the
name _Rations settings_ — so nothing would have gone red while the Settings **face**, a
different surface since this cut and the one that is a screen at every width, went unswept
entirely. It is the warning #536 wrote into that file arriving again: a derived roster
notices an arrival and says nothing about a departure, and this time the departure left a
same-named surface standing in its place. Both faces that are not pages have a line of their
own now.
