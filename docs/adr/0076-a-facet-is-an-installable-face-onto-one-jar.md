# ADR 0076: A Facet is an installable face onto one jar, and Inventoria is the first one

**Status:** Accepted  
**Date:** 2026-08-31  
**Amended by:** [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) §1, §3 and §4 (§5's "cannot function without" phrase is replaced by a two-clause test; "narrowed to its own scope" does not hold for an import; a setting lives beside what it configures rather than with its Facet)  
**Amended by:** [ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §1 (§4's ownership is named at the **Tracked Domain**, and a Facet's prefix set is derived from the domains it holds rather than declared beside them)

## Context

The food half of Inventoria has outgrown being one tab of somebody's personal
tracker. It is the part you would send someone a link to, and it wants a name and an
icon of its own on a home screen. Nothing in the app has a word for that: `CONTEXT.md`
had **Digital Twin**, **Projection** and **Ledger**, and then jumped straight to
interface primitives, with nothing in between for _the thing you install_.

The obvious words were all taken or wrong. **App** already means Inventoria-the-PWA,
and every page that discussed both would have to disambiguate. **Edition** implies the
same content packaged differently, which is backwards — these show different content.
**Tracked domain** is taken by [how-to-add-a-tracked-domain.md](../how-to-add-a-tracked-domain.md)
and does not fit: the sidebar's Agenda tab spans the habit and calendar-event domains,
its Items tab spans `twin:` and acquisition, and Settings is no domain at all. **Surface**
says nothing. So the word is new, and this record fixes what it means.

The live alternative was not a different word but a different _definition_. If a Facet
were merely "a named face onto the ledger", the roster would be the six sidebar tabs and
the word would be a synonym for **tab** — same count, same names, same icons — and the
`_Avoid_` line that `CONTEXT.md` requires of every term could not be written, because
you cannot tell someone to avoid the word your term means. That reading was rejected on
exactly that test.

Two facts measured while scoping the parent map ([#267](https://github.com/palebluebytes/inventoria/issues/267))
bound this decision, and are not re-derived here. First, **payload is not the driver**:
splitting food out sheds it about 4 MB of a 14 MB precache, and installing both a food
app and a food-less root costs _more_ than installing everything does today
([#269](https://github.com/palebluebytes/inventoria/issues/269), `docs/research/269-two-installable-apps-one-origin.md`).
Identity is the driver. Second, **the food ledger slice is disjoint at the entity level**,
so a separate origin would fork no data model — its only real cost is that the root
Inventoria could then never show food at all. That is why Facets are scopes on one origin
rather than origins of their own.

**Scope.** This record settles what a Facet is, what the roster is, how a Facet relates
to a Tracked Domain, what a Facet owns in the ledger, whether Settings is one, and how a
Facet declares itself. It does **not** decide: what the Food Facet is called or what its
icon looks like ([#271](https://github.com/palebluebytes/inventoria/issues/271)); whether
an installed Facet precaches only its own weight ([#272](https://github.com/palebluebytes/inventoria/issues/272));
what a Facet does when asked to leave itself ([#273](https://github.com/palebluebytes/inventoria/issues/273));
how a Facet-scoped wipe works or how it widens `AGENTS.md` §3
([#274](https://github.com/palebluebytes/inventoria/issues/274)); which settings a Facet
carries and which stay at the root ([#275](https://github.com/palebluebytes/inventoria/issues/275));
the vanity host ([#276](https://github.com/palebluebytes/inventoria/issues/276)); the
verification roster ([#277](https://github.com/palebluebytes/inventoria/issues/277)); or
which Facet owns the Web Share Target ([#278](https://github.com/palebluebytes/inventoria/issues/278)).
It also builds nothing: the registry module named below does not exist yet, and writing it
with an entry pointing at an entry point that has not been built would be a lie in code.

## Decision

### 1. Installability is definitional

A **Facet** is a named, icon-bearing face onto the Jar that can be installed on its own,
carrying its own manifest, name, icon, scope and start URL. A face that nobody can install
is a tab. This is a rule about the roster, not about ambition: a grouping joins the roster
when it has an entry point, not when someone would like it to have one.

### 2. The roster is two, and the root is one of them

| Id     | Name              | Scope    | Tracked Domains | Status             |
| ------ | ----------------- | -------- | --------------- | ------------------ |
| `root` | Inventoria        | `/`      | all six         | built              |
| `food` | _decided by #271_ | `/food/` | food            | decided, not built |

The root is a Facet rather than the app that Facets are carved out of. It already has a
manifest, a name, an icon and a scope; treating it as one more entry means the registry,
the no-links-out rule and the scoped wipe each have a general case and an empty list of
exceptions, instead of a case plus "and also the root".

A Facet id is **build vocabulary, not ledger vocabulary**. It appears in the registry and
in the per-entry-point build constant; it is never written to a datom, so it is not bound
by the snake_case ledger rule and it is not stable identity in the sense a `gtin:` prefix
is. It is also not the display name, which is a separate field.

### 3. A Facet is a whole number of Tracked Domains

Never a fraction of one. A Facet that held part of a domain would leave a scoped wipe with
no prefix to scope by, and would make "the food slice is disjoint" a claim about nothing.

**Facets overlap; they do not partition the Jar.** Inventoria holds every domain, including
the ones another Facet also holds. A reader who assumes Facets carve the ledger into disjoint
pieces will get the scoped wipe wrong.

There are **six** Tracked Domains, not the five [how-to-add-a-tracked-domain.md](../how-to-add-a-tracked-domain.md)
used to name: food, media, physical items, habits, calendar events, **and notes and
checklists**. Notes keeps no Projection — it is a Loro op-log under the single entity
`notes:doc`, read by a direct SELECT (ADR-0018). The roster now lives in `CONTEXT.md` and
the how-to points at it, so there is one place for it to go stale.

A new Tracked Domain joins the **root** Facet by default. Giving one a Facet of its own is a
separate decision and takes an ADR; it is not a step in the route for adding a domain.

### 4. A Facet owns entities, never attribute namespaces

The registry records the **entity prefixes** a Facet's domains own — food is `fdc:`, `gtin:`,
`food:custom_`, `recipe:` and `event:consume_`. It records no attribute namespaces, and
nothing that scopes by a Facet may scope by one.

This is forced rather than tidy. `twin/` is documented as "physical item twins" but every
food twin writes `twin/raw_provenance`, and Open Food Facts twins write `twin/brand`; `event/`
is written by every domain that logs an event. A wipe or an export scoped by `twin/%` would
take a physical item along with the food. Scoping by entity is exactly right instead: the
provenance blob on `fdc:1234` goes because that entity goes, and the identical attribute on
`twin:guitar` stays because that entity stays.

`projections.ts` scopes two of its five reads by attribute namespace (`MEDIA_LIBRARY` and
`ACQUISITION_LIBRARY` both select the whole of `event/%`, and `ACQUISITION_LIBRARY` selects
the whole of `twin/%`). That is a deliberate read convenience for heterogeneously-named
entities, documented in that file, and **a Facet-scoped operation must not copy it**.

### 5. Settings is a screen of the root Facet

It is not a Facet — a Facet is a whole number of Tracked Domains and Settings is zero of
them — and it is not a screen every Facet carries. Settings that belong to an individual
Facet move to that Facet, to wherever the thing they configure already lives. Two such
settings exist today inside the root Settings screen: the TMDB API key and scraper proxy
under _API Credentials_, which belong to the media and physical-item domains, and the
`#142` search-log reader nested inside the jar-wide _Local Logs_ card, which is food's.

A Facet additionally carries the **jar-wide controls a standalone install cannot function
without**, narrowed to its own scope; inspection tools do not follow it. Which controls those
are is [#275](https://github.com/palebluebytes/inventoria/issues/275)'s to settle, and it is
the phrase in this clause that most needs turning into a list.

A Facet's own settings get **no new term**. They are not a second screen called Settings;
they are controls living beside what they configure. If a Facet ever earns a dedicated
settings surface, that is the moment to name it.

### 6. One registry, read by the build and by the runtime

Facet scope, name, icon, start URL, tracked domains and entity prefixes are declared **once**,
in `src/lib/facets/registry.ts`, with one entry per Facet. Six independent configurations are
refused: the parent map requires that a second Facet be an application of the mechanism rather
than a re-derivation of it, and six configurations is the re-derivation.

The build reads it to generate the manifests, entry points, service-worker scopes and
navigation fallback denylists. The runtime reads it to know which Facet it is — for the
settings split above, for the no-links-out rule, and for the scoped wipe.

**A Facet's runtime identity is a build-time constant, one per entry point** — not a
`location.pathname` check against the registry's scopes. A Facet is a build target, so its
identity is known at compile time, and only a compile-time constant lets the bundler drop the
other Facets' code. That is not a preference: of the ~4.55 MB a Food install would save,
4.23 MB is `NotesView`, and a runtime path check would keep every Facet's code in every
Facet's bundle and cost #272 its entire result.

## Consequences

**What it costs.** The gap between what the word promises and what exists is real: this
record defines a term with a two-entry roster of which one entry is unbuilt. `CONTEXT.md`
therefore names only Inventoria, and this record carries the roster with its status, because
the ubiquitous language should say what words mean now and an ADR is where a decided-but-
unbuilt thing belongs. #271 amends this record when the Food Facet is named.

**The weak joint is clause 5's phrase.** "The jar-wide controls a standalone install cannot
function without" is doing a great deal of work for six words. If #275 cannot turn it into a
defensible list, the fallback is not to widen it silently but to come back here.

**The second weak joint is clause 4's completeness.** A Facet-scoped wipe is only correct if
the entity prefixes listed for a domain are _all_ of them. If any food data hangs off an
entity outside `fdc:`, `gtin:`, `food:custom_`, `recipe:` and `event:consume_`, a scoped wipe
misses it and the user is told their food is gone when it is not. #274 must prove the list is
exhaustive rather than inherit it from here.

**What it makes easy.** #274, #275 and #278 were blocked on the roster and are now unblocked.
Every later ticket has one place to ask what a Facet is, and the registry gives #272, #273 and
#274 a shared source for scope, prefixes and identity instead of three private ones.

**What it forecloses.** Separate origins per Facet. Not because they would fork the data model
— they would not — but because a second jar makes the root Inventoria an everything-_minus_-food
app whose Ledger export no longer contains your meals. Overturning that is a redrawn map, not a
side effect of preferring subdomains.

**Numbering.** This is 0076 rather than 0072 because ADR-0072 to ADR-0075 are claimed by the
unmerged p2p branch and are not on `main`. The gap closes when that branch lands. The repo has
already lost a number to this collision once.

**Defects this decision uncovered**, each fixed in the same change rather than left as
follow-ups: the five-domain roster in the how-to; the missing `notes:` entry prefix in
[eavt-vocabulary.md](../eavt-vocabulary.md); that file's claim that projections scope their
reads by entity prefix, which two of five do not; and the word _jar_, used throughout the
parent map and defined nowhere.

## Amendment (2026-09-01): §5 cited two instances of its rule, and one had already dissolved

§5 named the TMDB API key and the scraper proxy URL as the two settings sitting in the root
Settings screen that belong to a Facet and must move to it. The TMDB key is one. **The
scraper proxy was not, and had not been since [ADR-0070](0070-the-proxy-is-part-of-the-site-it-serves.md).**

That record made the proxy part of the site it serves, and `stores/device-settings.ts:109`
has carried `BUILT_IN_PROXY_URL = "/api/proxy?url="` as the working default ever since, with
`:117` letting a dev override it through `VITE_SCRAPER_PROXY_URL`. The Settings field
overrides a default that already works, for a reader who does not exist. It configures no
user-facing thing and therefore belongs to no domain and no Facet.

[ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) §4
deletes the field rather than moving it, and rereads §5's rule as being about the thing
configured rather than about the Facet — under the literal reading, both cited settings
belong to root domains, so their Facet is the root, Settings is the root's screen, and the
rule moves nothing.

The clause is corrected here rather than in place because the decision text is a record of
what was decided on 2026-08-31, and this is evidence that one of its two worked examples was
false when written.
