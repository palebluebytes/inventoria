# ADR 0114: The app is a set of faces, each reached from its own mark

**Status:** Accepted  
**Date:** 2026-09-27  
**Amends:** [ADR-0078](0078-a-facet-contains-no-way-out.md) (§2's "Rations has no tab bar" is overturned: Rations gains a switcher. §1's no-way-**out** rule is untouched, and §8's gate is what makes the switcher safe rather than what it has to survive)  
**Amends:** [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) (its split table relocates into the Settings face; the rule it states is unrevised, and §7's one named surface keeps its name and loses two sections)  
**Amends:** [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md) (§2's floor is published by a surface that no longer exists; a ceiling replaces it, and §7's Back stack gains a stop that is not a `BottomSheet`)  
**Amends:** [ADR-0091](0091-rations-widens-into-two-regions-and-grows-pages.md) (§8's closed page roster loses Recipes to a face; §5's rule that a shell says what it can hold is unrevised and is generalised)  
**Amends:** [ADR-0101](0101-the-ways-into-a-day-are-one-bar-anchored-where-the-hand-is.md) (§7's bar is no longer the only permanent pinned surface in Rations, and it is no longer the lowest thing the shell measures)  
**Amends:** [ADR-0102](0102-a-drop-shadow-is-reserved-where-a-box-must-contain-or-cover-it.md) (the pinned header is a box that covers, so it takes the shadow that record reserves; nothing else is added to the reservation)

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

It draws twice from one component (ADR-0095): a horizontal band across the lower third of the
switcher tile, ink ground and paper caps; and the same `Badge` beside the title in the face's
own header, where a band across a tap-sized mark would be four illegible pixels.

### 12. The marks are one hand where they can be, and the app's mark is the exception

The house style is the anchovy tin's engraving. `docs/icon-provenance.md` holds each mark's
author, title, source and licence, and the cut is its recipe, unchanged.

Senkow's Noun Project portfolio was enumerated in full on 2026-09-27 — 260 icons, every one
`CREATIVECOMMONS` / `A_1` — and the engraved well is **fifteen foods and three gears**. Media,
storage, calendar and notes are absent from it entirely. So: Recipes takes
`morter and pestle` **7864224**; Settings takes one of the 2015 gears, **172708 / 172709 /
172710**, after a 32px check, because they measure 0.10–0.13 ink against the tin's 0.198; and
Media, Items, Agenda and Notes come from other hands, chosen by eye for the style rather than
found by keyword.

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

**What was not verified.** Whether the four strangers' marks in §12 can be found at all in the
tin's style is unknown at the time of writing; the contact sheet is
[#531](https://github.com/palebluebytes/inventoria/issues/531)'s, and if four honest matches do
not exist, the fallback is the one §12 already names as the alternative house style rather than
four near-misses. And the three engraved gears' legibility at 32px is measured as a risk, not as
a failure: the tin is already recorded as collapsing at 16, and the gears carry finer hatching
per stroke with less ink.

**What this record does not know about, and should.** Whether a person who installs only Rations
ever wants the faces the root holds. §8 gives them Recipes and Settings and nothing else, on the
strength of ADR-0078 §7's forcing — anything a standalone Rations user needs must be inside
Rations — and that forcing has only ever been read as a constraint on _settings_. A Rations-only
person who starts keeping notes has no route to them and no signal that they exist, which is the
first question to ask when this ships.
