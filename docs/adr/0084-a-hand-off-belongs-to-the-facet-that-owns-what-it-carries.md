# ADR 0084: A hand-off belongs to the Facet that owns what it carries

**Status:** Accepted  
**Date:** 2026-09-01  
**Amends:** [ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md) (§8's link moves from `/` to `/food/` and the root's reader is deleted; §9's asset-router rule survives the move and is now carried by Rations' own entry)  
**Implemented:** §8 by [#309](https://github.com/palebluebytes/inventoria/issues/309) — `checkShareTargets` in `src/lib/facets/checks.ts`, over the manifests the roster enumerates and with no registry field added. §5 and §6 by [#313](https://github.com/palebluebytes/inventoria/issues/313) — `sendCodeLink` in `src/lib/p2p/send-code.ts` mints against the roster's `/food/`, and both readings of the link move to `src/Rations.svelte` while `src/App.svelte`'s are deleted.

## Context

[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) left the roster at two —
`root` (Inventoria, scope `/`) and `food` (**Rations**, scope `/food/`) — and deferred
which Facet owns the Web Share Target
([#278](https://github.com/palebluebytes/inventoria/issues/278)).
[ADR-0077](0077-a-facet-precaches-its-own-weight.md) deferred it again.
[ADR-0078](0078-a-facet-contains-no-way-out.md) §6 decided the half that is not about
ownership: **a URL entry point belongs to exactly one Facet, and neither forwards.**
Forwarding root→Rations is scope-legal and Rations→root is the crossing §1 forbids, so a
forwarding rule could only ever be asymmetric.

That left #278 looking like a zero-sum pick with a real loser. It is not, and two things
had to be established before that was visible.

**Exclusivity was inherited wording, not a constraint.** §6 forbids forwarding, not
co-existence. Two manifests declaring two share targets at two scopes forward nothing, and
§6's sentence is satisfied by two entry points each belonging to one Facet. The Web Share
Target spec confines each manifest's `action` to its own `scope`, so `/food/` cannot claim
`/` and `/` cannot claim `/food/`; the targets are structurally forced disjoint rather than
made to compete. Whether a Chromium share sheet would then show two entries is the thing
[#269](https://github.com/palebluebytes/inventoria/issues/269)'s research left `[unverified]`,
naming this ticket as the one that must check it on a real Android install before depending
on it.

**There is no second thing to own.** The share target's only consumer is `ItemImportPanel`:
`fetchHtml` and `extractJsonLd` are imported by exactly one component in the whole tree, and
[#270](https://github.com/palebluebytes/inventoria/issues/270)'s audit reached the same
result from the food side — food imports no URL and reaches no scraper. Rations has four
`image/*` file inputs (`FoodStager` twice, `ManualEntryFlow`, `RecipeBuilder`), so a _files_
share target is the only shape that would carry it anything, and nothing in the app declares
one today.

Alternatives that were live. **Root keeps it and Rations gets an invented image share**:
plausible, and refused because inventing a door is not splitting an app, and building it
would import #269's unverified share-sheet fact into a map that can otherwise avoid it
entirely. **Rations takes it and root loses it**: refused because a shared product URL mints
an acquisition twin, which is not Rations' to mint. **A tie-break where root wins**: refused
because it invents the hierarchy ADR-0076 spent a ticket refusing, where Facets overlap
rather than nest.

The question turned out to be general rather than about one manifest. There are three
hand-offs in play, not one, and the third is
[#293](https://github.com/palebluebytes/inventoria/issues/293) — an un-parented ticket whose
own body says the question "belongs to the map rather than to a p2p record."

**Scope.** This record states the ownership rule for hand-offs, applies it to the three that
exist or are designed, and says what each Facet declares. It does **not** design a Rations
share target, decide the Web Share Target's parameter list, or edit the unmerged p2p branch;
§10 records the debt that branch inherits instead. It builds nothing.

## Decision

### 1. A hand-off belongs to the Facet that owns what it carries

**A hand-off belongs to the Facet that owns the entities it carries or would mint.**

This is not a new key. [ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) §4
already makes a Facet own **entities** and never attribute namespaces, and
[ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) uses the same key
for the wipe's closure. Reusing it means the map gains no second vocabulary for a question
it has already paid to answer once.

The rule covers both directions deliberately. _Mints_ alone would cover arrivals and leave a
departure — sending a meal mints nothing, it carries one — as an unargued assumption, which
is what put the send surface on the meal panel with nobody stating why.

### 2. A hand-off spanning more than one Facet has no owner, and is not offered

Where a hand-off would carry or mint rows in more than one Facet, **it has no owner, and no
Facet declares it as a share target.**

The instance is the Ledger import. [ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md)
§5's repair has both Facets carry it **whole**, foreign rows and all, so a shared
`application/json` file would mint into both and the share sheet would show two
indistinguishable entries for one file.

"No owner" is an answer, not a gap: the rule stays total. And it says the true thing about a
restore, which is not a hand-off of a _thing_ but a replacement of the Jar — which is why
ADR-0080 already made it a control rather than an ingestion door. It remains a file picker
the user drove, in both Facets.

### 3. The three hand-offs, decided

| Hand-off                        | Carries / mints                  | Owner       |
| ------------------------------- | -------------------------------- | ----------- |
| `?url=` at `/` (share or typed) | an acquisition twin              | **root**    |
| A meal link, either direction   | `event:consume_*` and food twins | **Rations** |
| A Ledger file                   | the whole Jar                    | **nobody**  |

### 4. The Web Share Target is the root's, and Rations declares none

The root manifest's `share_target` is unchanged: `action: "/"`, GET, `title`/`text`/`url`.
**Rations' manifest declares no `share_target` at all.**

A Rations-only user therefore has no share target. That is the real cost #278 predicted, and
it is accepted rather than engineered around, because the alternative is building a door for
an arrival nothing in Rations mints from today.

**A Rations image share is admissible under §1 and is not built.** All three reasons are
recorded here rather than compressed into a registry field, because a field that records a
conclusion and discards its reason is what ADR-0083 §4's surviving rule forbids: the rule
permits it; nothing in Rations mints from a hand-off today; and building it would import
#269's `[unverified]` share-sheet fact, which not building it keeps out of the map entirely.

### 5. The receive link is minted at `/food/`, and there is one door

A meal is `event:consume_*` and food twins, which ADR-0076 §4 gives to Rations. So the
receive link is minted at **`/food/`**, and **the root's `/#r=` reader is deleted rather
than kept as a fallback.**

Two arguments converge and neither is the other's restatement. §1 gives the answer from
ownership. #293's own analysis gives it from scope: prefix matching is one-directional
([ADR-0078](0078-a-facet-contains-no-way-out.md) §3), so a link at `/food/` opened by
someone who installed only the root is still **inside** their scope and lands, while a link
at `/` opened by someone who installed only Rations is **outside** theirs and opens a browser
tab. The two directions do not cost the same, and the cheaper one is the one §1 already
chose.

Keeping a second reader at `/` is refused as the inverse of §2: one arrival with two doors.
It also cannot be decided per-recipient, because ADR-0072 §7 stops the sender learning
anything about the recipient's device, including their install roster.

A root user opening the link lands on Rations' entry inside their own app window and returns
with Back. That is the cost ADR-0078 §4 already priced and accepted when it refused
navigate-in-place for the install offer. No compatibility is owed
([#267](https://github.com/palebluebytes/inventoria/issues/267) decision 8) and the arc is
not on `main`.

### 6. Meal send and receive are Rations'; convergence stays the root's

[ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md) §9
states: _"A food-only user therefore has no p2p at all."_ **That is narrowed here, by the
route §9 itself sanctioned.**

§9's argument is sound and every word of it is about **pairing**: pairing creates
convergence rather than preventing loss, so it fails clause (a), and pairing is the root's
act, so it fails clause (b). Meal-send between people is not pairing. It needs no paired
device, no Settings surface and no convergence — ADR-0074's send is a meal's own numbers and
a spoken code. §9's reasoning reached _pairing_ and its conclusion wrote _p2p_.

So: **meal send and receive belong to Rations**, both carrying a meal under §1, and
**own-device convergence stays the root's**, carrying the Jar and therefore unowned under §2
before the carry test is even reached. A food-only user gets to send and receive meals and
does not get convergence.

§9 wrote the condition this satisfies: _"The first p2p design to reach `main` may overturn it
by arguing against §1 — it may not acquire the surface by not noticing this clause."_ This
is that argument, made from the Facet side, before any surface was acquired.

### 7. ADR-0078 §6 counted two entry points where there is one

§6 says _"today there are two — the Web Share Target (`App.svelte:70`) and
`ItemImportPanel`'s `?url=`."_ Those are **one** entry point with two readers. The root
manifest's `action` is `/` with GET params, so the share sheet navigates to `/?url=…`;
`App.svelte:68` and `ItemImportPanel.svelte:22` then read _the same_ `window.location.search`
for _the same_ params in _the same_ fallback order.

The real inventory is two: **`/?url=` at the root**, and **the receive fragment, moving to
`/food/` at §5**. The count matters because the map has been sizing this decision by counting
entry points. It is corrected at ADR-0078's foot rather than in place, per
[`docs/adr/README.md`](README.md).

### 8. The gate asserts one share target, and adds no registry field

`pnpm check:facets` ([ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md)
§8) gains a fourth claim: **at most one rostered manifest declares `share_target`.**

It takes **no new registry field.** A `shareTarget` entry would re-record a conclusion whose
reason lives here, which ADR-0083 §4 forbids. The gate uses the roster the way ADR-0083 §1
intends — to enumerate the manifests rather than to name a file — and then asserts a
property across what it enumerated. The roster supplies identity; the invariant supplies the
claim.

This is what stops a second Facet acquiring a share target by copying a manifest instead of
arguing §1.

### 9. What is not claimed

Two facts sit outside anything a build can observe, and are recorded as non-claims rather
than as gates nobody can write. Both are in the class of #287's iOS jar and ADR-0083's
Cloudflare route: real, unestablished, and harmless in every outcome.

- **The share sheet.** §8's gate proves the _declaration_, never that Chromium registered
  it. Nothing in a build can see a share sheet.
- **Android link capture.** Capture is on by default with no site opt-out and is keyed to a
  WebAPK's declared scope. A Rations-only install captures `/food/`; a root-only install
  matches it too, because `/food/` is inside `/` by prefix. **Which app Android hands the
  link to when both are installed is untested and unsettled by the spec.** Both outcomes are
  harmless — one origin, one jar, one ledger, and the meal lands either way — which is what
  makes it recordable rather than blocking.

### 10. The debt on the unmerged p2p branch

ADR-0074 §8 — on the unmerged p2p branch, so unlinkable from here — chose `/` for the
receive link for reasons that had nothing to do with Facets: a precached asset served 200
with COOP and COEP, no Cloudflare change, and avoiding §9's hole where an HTML entry of its
own falls through to the Worker script and loses cross-origin isolation. §5 overturns the
choice and not the reasons.

Two of the three survive intact. `public/_headers` is `/*`, so cross-origin isolation
applies to `/food/` with no change (#269). Whether Cloudflare's `[assets]` serves
`dist/food/index.html` for `/food/` is the acceptance condition ADR-0083 already named,
checked by a real request rather than modelled locally.

The third is **retired**. That branch's `App.svelte` warns: _"Do not give receive an HTML
entry of its own: the #125 offline gate hardcodes `dist/index.html` and would never see
one."_ ADR-0083 §2 fixed exactly that — the gate reads the roster and runs both arms per
Facet. And `/food/index.html` is not a receive-only entry in any case; it is Rations' entry,
which exists regardless.

**This record does not edit that branch.** The debt is on the first p2p design to reach
`main` to apply §5 and §6, in the same shape as
[ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §8's deletion
protocol and for the same reason. That branch's own `App.svelte` had already reached §1
informally — _"What it opens belongs to the food screen, which is where a meal is"_ — so what
is owed is the scope change and the deleted root reader, not a re-argument.

## Consequences

**A Rations-only user has no share target, and does have meal send and receive.** The first
is a loss with no mitigation offered; the second is a gain ADR-0080 §9 had written off. Both
are consequences of one rule rather than two accommodations, which is the point of stating
the rule at all.

**The map avoids an unverified fact by not building the thing that needs it.** #269 told the
Facet ticket that depended on the share sheet to verify it on real hardware first. Nothing
depends on it now: one manifest declares one target, and one entry cannot be de-duplicated
against itself. Should a Rations image share ever be built, §9's first non-claim becomes a
prerequisite rather than a footnote, and the Android install it needs is the same class of
errand as #287.

**Two records are corrected by two different mechanisms in one change, and the difference is
load-bearing.** ADR-0080 §9 was _revised_ — true on the evidence it had, and overturned by a
later argument it invited — so it takes an `Amended by:` trailer. ADR-0078 §6 was _false when
written_ — there was always one entry point — so it takes an `## Amendment` at its foot.
Getting these the wrong way round is what #275 caught in ADR-0076 §5.

**#293 is answered here rather than separately.** It is adopted into
[#267](https://github.com/palebluebytes/inventoria/issues/267) and closed against this
record. Two tickets applying one rule in two places is how a map ends up with two
vocabularies for one thing, which is the failure ADR-0083 §4 was written about.

**A word this map was written in is now defined.** _Hand-off_ was load-bearing in ADR-0078
§6 and is the subject of §1 here, and `CONTEXT.md` did not define it. It is registered in the
same change. This is #268's _jar_ finding, a second time.

**What is deferred, and what would reopen it.** A Rations share target reopens on any
arrival Rations would mint from — a label photo shared from a camera roll is the obvious one
— and §1 already answers who owns it, so what a future ticket owes is the build and §9's
verification, not the ownership argument. §6 reopens if a p2p design argues that meal send
does require pairing; ADR-0080 §9's clause governs that the same way it governed this.
