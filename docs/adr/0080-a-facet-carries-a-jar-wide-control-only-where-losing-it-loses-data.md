# ADR 0080: A Facet carries a jar-wide control only where losing it loses data, or where the Facet's own act made the thing

**Status:** Accepted  
**Date:** 2026-09-01  
**Amended by:** [ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md) §4 (§8's heading overreaches its own argument: the registry already holds a build half, and the rule is that it carries no field re-recording a conclusion whose reason is discarded)  
**Amended by:** [ADR-0084](0084-a-hand-off-belongs-to-the-facet-that-owns-what-it-carries.md) §6 (§9's reasoning reached _pairing_ and its conclusion wrote _p2p_: meal send and receive belong to Rations under that record's §1, and only own-device convergence stays root-only)  
**Amended by:** [ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §2 (§5's "two log-export consents, not one" dissolves into two device settings: neither entity recorded an act, so there is no consent to count per Facet)

## Context

[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) §5 made Settings a screen
of the root Facet, and then said a Facet additionally carries "the jar-wide controls a
standalone install cannot function without, narrowed to its own scope". That record's own
Consequences named the phrase as its weak joint and said that if
[#275](https://github.com/palebluebytes/inventoria/issues/275) could not turn it into a
defensible list, the fallback was to come back here rather than widen it silently.

[ADR-0078](0078-a-facet-contains-no-way-out.md) §7 then made the phrase load-bearing rather
than decorative. Rations has no route to root Settings, no escape hatch is coming, and that
record explicitly declined to record the absence as a gap to plug later: **anything a
standalone Rations user needs must be inside Rations.** So the list is not a convenience.
It is the whole of what a food-only user will ever be able to do to their own data.

[ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §6 arrived with one
entry already filled in — a Facet-scoped wipe requires a Facet-scoped export beside it —
and left the surface that carries them to this record.

**The phrase does not survive contact.** Read as written it is a usability test, and
usability is the wrong axis: Rations functions perfectly well with no export at all, right
up until the phone dies. Three tests were live.

1. _Function_ — can the user do the Facet's job without it. **Refused.** It admits nothing
   this ticket found, because every control at issue is one you need on the worst day and
   never on an ordinary one. A test that passes the app on every ordinary day and fails the
   user once, permanently, is measuring the wrong thing.
2. _Irreversibility_ — can its absence cost data that cannot be got back. Kept, as §1's
   first clause.
3. _Authorship_ — does the Facet's own act create the thing the control governs. Kept, as
   the second clause, because irreversibility alone leaves Rations writing a log channel it
   can never read, clear or export.

**Three facts measured on `main` while deciding, because two of them move the answer.**

- **There is exactly one registered log channel in the app, and it is food's.**
  `defineChannel({…})` appears once in `src/`: `search`, at `logs/search-log.ts:375`. The
  jar-wide _Local Logs_ card is generic machinery whose entire current content belongs to
  Rations, and [#207](https://github.com/palebluebytes/inventoria/issues/207) would add a
  second that is also food's.
- **The log export is already per-channel.** `buildLogExport(selected, …)`
  (`logs/log-facility.ts:415`) takes a channel list, so narrowing that surface to a Facet
  costs a filter and not a design.
- **`ensurePersistentStorage()` is called from `App.svelte:60`** — the root entry's
  component. A Rations entry that does not call it never asks the browser to keep the Jar,
  and the badge §2 gives Rations would report best-effort forever while telling the truth.

**Scope.** This record settles the test, the block-by-block split of today's Settings
screen, where a Facet's own settings live, whether Rations gets a named settings surface,
and whether the split is driven by the registry. It **amends ADR-0076 §5** in three places
and says so in §1, §3 and §4. It does not decide: the Facet-scoped wipe's shape
([ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md)); where the p2p
pairing UI lives beyond §8's rule, since none of that arc is on `main`; whether a setting is
a datom ([#288](https://github.com/palebluebytes/inventoria/issues/288)); or the
verification roster ([#277](https://github.com/palebluebytes/inventoria/issues/277)). It
builds nothing — the moves it decides are implementation tickets the parent map cuts.

## Decision

### 1. The test is two clauses, and neither is about function

A Facet carries a jar-wide control if and only if:

- **(a) Irreversibility.** Its absence can cost the user data they cannot get back. Or
- **(b) Authorship.** The Facet's own act creates the thing the control governs.

Everything else is an **inspection tool**, which ADR-0076 §5 already says does not follow a
Facet. This replaces §5's "the jar-wide controls a standalone install cannot function
without"; that phrasing is withdrawn, not narrowed.

Clause (a) is also why ADR-0079 §6 pairs an export with a wipe without needing its own
argument: both sit on the irreversible axis, and shipping one half of that pair into the one
Facet that cannot reach the other half is the worst available split.

### 2. The split, block by block

Nine blocks, applied. `—` means the block does not appear there.

| Block                              | Root                        | Rations           | Why                                                                                                  |
| ---------------------------------- | --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| API Credentials — TMDB key         | → the Media screen          | —                 | §4                                                                                                   |
| API Credentials — scraper proxy    | deleted                     | —                 | §4                                                                                                   |
| **API Credentials card**           | **dissolves**               | —                 | nothing is left in it                                                                                |
| Database Ledger (raw datom viewer) | stays                       | —                 | fails both clauses — inspection                                                                      |
| Wipe Database (jar-wide)           | stays                       | —                 | ADR-0079 §6                                                                                          |
| Facet-scoped wipe                  | wherever `FoodView` appears | ✓                 | ADR-0079 §6                                                                                          |
| Ledger export (jar-wide)           | stays                       | —                 |                                                                                                      |
| Facet-scoped export                | wherever `FoodView` appears | ✓                 | (a), and ADR-0079 §6 requires it beside the wipe                                                     |
| Ledger import                      | stays                       | ✓ **un-narrowed** | §3                                                                                                   |
| Storage — persistence badge        | stays                       | ✓                 | (a) — the only place the app says data may be evicted                                                |
| Storage — usage figure             | stays                       | —                 | inspection, and `estimate()` is per-origin, so in Rations it would report the root's bytes as food's |
| Local Logs — channel list          | every channel               | its own only      | (b)                                                                                                  |
| Local Logs — export consent        | its own                     | its own           | §5                                                                                                   |
| Local Logs — Review and Export     | jar-wide                    | its channels      | (b); `buildLogExport` already takes a selection                                                      |
| The `#142` verdict readout         | **deleted**                 | —                 | §6                                                                                                   |
| Developer Options                  | stays                       | —                 | fails both clauses                                                                                   |

The storage card is cut on a badge/figure line rather than a block line, and that is
deliberate. The badge answers _can this device throw my food away_, which is clause (a). The
figure answers _how much am I using_, which is inspection — and worse, it is inspection that
would lie, because the Storage standard's estimate covers the whole origin and a Rations
user reading it would attribute the root's bytes to their meals.

### 3. An import is carried whole, because it cannot be narrowed

Clause (a) carries the import into Rations: an export with no import is a file format rather
than a restore path, and a food-only user with a dead phone would otherwise have to know to
install a different app to get back in.

But **an import cannot be narrowed to a scope.** A file is whatever the user hands it. The
Facet imports it whole — foreign rows and all — and does not filter, drop or refuse on
ownership. Filtering would make Rations destroy rows the user is holding in their hand for
a symmetry nobody asked for; refusing would make a whole-Jar backup unrestorable from the
app that most needs restoring. The Jar is one Jar, ADR-0067 §1 merges rather than replaces,
and a whole-ledger import into Rations restores the user's entire ledger whether or not the
root is ever installed.

**This is ADR-0076 §5's second failure, distinct from the first.** "Narrowed to its own
scope" is not merely hard for some controls, it is undefined for them: the import is the
first, and a record that says a Facet narrows everything it carries is wrong rather than
optimistic. A Facet carries a jar-wide control **narrowed where narrowing is defined, and
whole where it is not.**

The residue, stated rather than hidden: Rations can then admit rows to the Jar that Rations
can neither show nor wipe. They came from the user's own export, and the root removes them
if it is ever installed.

### 4. A setting lives beside the thing it configures, not with its Facet

ADR-0076 §5 said settings belonging to an individual Facet move _to that Facet_, and cited
two instances. The roster is two ([ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) §2)
and both cited settings belong to root domains, so under a literal reading their Facet is
the root, Settings is the root's screen, and the rule moves nothing. That reading makes §5
cite two instances of a rule that does nothing, and makes `FoodSettingsSheet` — which moved
food config off Settings before Facets existed — an accident rather than the precedent it is.

**The rule is therefore about the thing configured, not about the Facet.** A setting lives
beside what it configures. A Facet inherits it as a consequence of holding that screen, not
as a rule of its own.

Applied to the two cited instances:

- **The TMDB key moves to the Media screen.** It is a user credential for a user feature.
  No settings affordance exists on `MediaView` today, so this commissions one: a gear on its
  header opening a sheet, mirroring `FoodView.svelte:644`.
- **The scraper proxy is deleted, not moved.** It stopped being a domain setting at
  [ADR-0070](0070-the-proxy-is-part-of-the-site-it-serves.md), which made the proxy part of
  the site it serves. `stores/device-settings.ts:109` already carries
  `BUILT_IN_PROXY_URL = "/api/proxy?url="` as the default and `:117` already lets a dev
  override it with `VITE_SCRAPER_PROXY_URL`. The Settings field overrides a working default
  for a reader who does not exist. **ADR-0076 §5 cited two instances of its rule and one of
  them had already dissolved when it was written** — recorded as an amendment at the foot of
  that record, since it is a false clause rather than a revised one.

Deleting the field also settles `ingestion/fetcher.ts:20`, which throws _"Scraper proxy URL
is not configured. Please set it in Settings."_ — pointing at a field that will not be
there, about a value that has had a working default since ADR-0070. That message is the
exact bug ADR-0070's Context was written about, still shipping.

### 5. A log-export consent follows its channel

[ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md) §4's export consent is one
setting on the root today, gating an export of the only channel that exists — which is
food's. On a Rations install that consent is permanently off with no surface saying why.

**One consent per Facet.** `consent:log_export` is the root's; Rations gets its own. This
is clause (b) exactly: Rations writes the channel, so Rations governs its egress. It keeps
[#289](https://github.com/palebluebytes/inventoria/issues/289)'s one-owner-per-entity
invariant intact — two entities, one owner each, no shared entity anywhere — and it keeps
ADR-0054 §4's off-by-default promise on both.

Rejected: leaving the consent at the root, which ships a facility that records a user's
searches and can never show them the file; and dissolving the consent into a per-act
confirmation at the export, which is tempting and is an ADR-0054 clause being overturned
from inside a settings record.

[#288](https://github.com/palebluebytes/inventoria/issues/288) is written against a single
`consent:log_export`; it inherits the second entity from here.

### 6. The `#142` readout is deleted, and the channel is not

`LogSettingsSection.svelte:138-154` renders a verdict about a corpus decision — _"6 of 47
settled empty searches carried a vocabulary word inside a longer phrase. Verdict: open."_
That is a maintainer reading a ticket over the user's shoulder, on the screen of an app they
installed to log lunch. ADR-0076 §5 would send it to Rations because it is food's; the rule
assumes the thing deserves a home in a shipped app, and it does not.

**The channel stays. The recording stays. The export stays.** What goes is the readout:
`readSearchChannelBar` / `recomputeSearchChannelBar` and the two reader paragraphs. The
verdict is derivable from the exported channel by the person who cares, whenever they care,
and [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md) §7's bar closes as
a settled no at forty settled-empty searches — a permanent readout of a question with an
ending is how the `#41` comments in `NutrientCard.svelte` went stale.

### 7. Rations settings is one named surface, and it takes no new term

Under §2 the food gear's surface acquires eight blocks: the OFF login, the OFF-contribution
consent, the nutrition-target editor, the Facet-scoped wipe, the Facet-scoped export, the
un-narrowed import, the persistence badge, and a log card with a consent of its own. That is
a settings screen wearing a bottom sheet.

ADR-0078 §2 forecloses the obvious answer: Rations has no tab bar, one Tracked Domain is one
screen, so there is nowhere for a second screen to go. The gear is the only chrome there is.

So the gear opens **one full-height surface titled with the Facet's display name** —
_Rations settings_ — grouped into three sections: **Food** (login, consent, targets),
**Your data** (export, import, wipe, persistence badge), **Local logs**. The title string
comes from the registry (§8), so a second Facet gets its own without a second decision.

Three things this settles that ADR-0076 §5 left open:

- **A Facet does earn a dedicated settings surface**, and this is the moment §5 said would
  come. The threshold was not a count of blocks; it was the arrival of a destructive action
  and a run that reports progress for minutes (ADR-0079 §5 counts before it speaks, ADR-0067
  §6 reports two counts through the run), loose in a container the user dismisses by
  swiping.
- **The title is qualified, and §5's ban survives.** §5 forbids a second screen called
  Settings. Inside Rations there is no other one to collide with, but the same surface opens
  from the root's Food tab, one tab away from the root's Settings — which is the collision
  the ban was written for. A qualified title is correct in both contexts with one string.
- **No new domain term.** _Rations settings_ is a qualified use of a word the project
  already has. `CONTEXT.md` gains nothing from this record.

### 8. The split is hand-wired, and the registry supplies identity only

`facets/registry.ts` (ADR-0076 §6) gives a settings surface everything it needs to be
generic: the display name for §7's title, the entity prefixes for the scoped wipe and scoped
export predicates, and the build-time Facet id.

**It must not gain a list of settings blocks per Facet.** That table would be a second
enumeration of the sixteen rows §2 decided by argument, and a field reading `import: true`
records the conclusion while throwing the reason away. The parent map's decision 5 requires
a second Facet to be an _application of the mechanism_ rather than a re-derivation, and §1's
two clauses are that mechanism. A rule is not required to be executable to be general.

The cost, named rather than hidden: **a block added to `SettingsView` is silently root-only
until someone applies §1 to it.** That failure defaults to the safe side — a control not
carried is a control not carried into the wrong place — and it is a candidate for
[#277](https://github.com/palebluebytes/inventoria/issues/277)'s roster if it ever earns a
check.

### 9. What is root-only, and what that costs a food-only user

Three things a Rations user will not have, stated plainly because ADR-0078 §7 means they
cannot go and find them.

- **The raw ledger view, the storage usage figure, and Developer Options.** Inspection. No
  loss that matters.
- **The p2p pairing UI.** It is not on `main` — there is no `src/lib/p2p/` and no
  ADR-0072–0075 in the tree — so placing it here would be designing a screen for machinery
  this branch has never seen. **§1 decides it when the arc lands, and the answer §1 gives
  today is root-only**: pairing creates convergence rather than preventing loss, so it fails
  clause (a), and pairing is the root's act, so it fails clause (b). **A food-only user
  therefore has no p2p at all.** That is a real cost of ADR-0078's forcing, and it is
  recorded as one rather than dressed up. The first p2p design to reach `main` may overturn
  it by arguing against §1 — it may not acquire the surface by not noticing this clause.
  This is the same shape as ADR-0079 §8's deletion protocol, and for the same reason.
- **The jar-wide wipe.** A Rations user can delete their food and cannot delete the Jar. If
  they want the Jar gone, the browser's own site-data control is the honest route, and it
  does not need an escape hatch in the app.

## Consequences

**What it costs.** This record repairs ADR-0076 §5 three times rather than applying it once,
which is more than an amendment usually carries and is the reason it is a record rather than
a trailer line. §5's remaining sentences are worth reading with that in mind: it was written
before any Facet existed and it is the clause of that record that has aged worst.

Two moves land outside Rations and outside this map's stated subject. The TMDB key
commissions a settings affordance on a screen that has never had one, and the scraper-proxy
field's deletion touches `SettingsView`, `device-settings.ts` and `fetcher.ts`. Both follow
from §4 and neither is Facet mechanism; a reader finding them in a Facet record should know
they were discovered here.

**The un-narrowed import is the clause most likely to be argued with.** It puts a control in
Rations that can write rows Rations cannot see, and the defence is that the alternative
destroys the user's own backup. If a later record wants to narrow it, the thing to overturn
is §3's claim that narrowing an import is undefined rather than merely awkward.

**What it makes easy.** ADR-0079 §6's export has a surface. #277's roster has a third
inheritance and now a fourth candidate check (§8). Anyone adding a control to Settings has a
two-clause test to apply instead of six words to interpret, and the answer for a second
Facet is an application of it rather than a fresh argument.

**What it forecloses.** A settings-block registry (§8), a Facet-scoped import filter (§3),
and any reading of ADR-0076 §5 under which a Facet narrows everything it carries.

**Deferred behind a seam.** The p2p pairing UI's placement, which §9 answers provisionally
and hands to the first convergence design on `main`. The `#142` readout's deletion assumes
ADR-0053 §7's bar can be re-derived from an export; if the channel is ever capped in a way
that loses the counts, that assumption needs re-checking.

**Defects this decision uncovered**, none of them fixed here because each belongs to an
implementation ticket: `fetcher.ts:20` tells the user to configure a proxy that has had a
working default since ADR-0070; `NutrientCard.svelte:4`, `NutrientCardGrid.svelte:5` and
`NutrientGroupHead.svelte:5,9` all still describe "the Settings target editor (#41)" as a
live second surface, which it has not been since the target editor moved to
`FoodSettingsSheet`; and `ensurePersistentStorage()` is called only from the root's
`App.svelte:60`, so a second entry point silently never asks.

## Amendment (2026-09-01): §8's heading claims more than §8's argument

§8 is titled "The split is hand-wired, and the registry supplies identity only". The second
half was already false when it was written. [ADR-0077](0077-a-facet-precaches-its-own-weight.md)
§2 puts each Facet's **static asset declarations** in the same registry and calls it "the
build half of that registry earning its keep" — one commit earlier on the same branch. The
registry has never supplied identity only.

The argument §8 actually makes is narrower and stands untouched: the registry must not gain a
field that **re-records a conclusion reached by argument while throwing the reason away**. A
per-Facet list of settings blocks is one, and it is still refused for exactly the reason given
here.

[ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md) §4 states the rule in
that form and applies it to two new fields: a per-Facet precache byte band, which passes
because a measurement is not a conclusion from argument, and a per-Facet list of view modules,
which **fails** — ADR-0078 §2 already fixes one screen per Tracked Domain, so writing the
views out per Facet re-records ADR-0078 §1's conclusion. The view module is attached to the
Tracked Domain instead, and a Facet's expected screens are computed from the domains it
already declares.

The heading is corrected here rather than rewritten in place, because the decision text is a
record of what was decided on 2026-09-01 and this is evidence that its own summary line was
broader than the reasoning under it. §8's refusal of a settings-block table is unaffected, and
ADR-0083 §10 declines the check it offered.
