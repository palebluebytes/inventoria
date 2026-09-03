# ADR 0090: A ranked list says which one won, and never with a number

**Status:** Accepted  
**Date:** 2026-09-02  
**Amended by:** the Amendment below, which withdraws §5 and the Consequence that followed it  
**Implemented:** #334 — `food/search-list.ts` (§4's gate and §5's cap), `views/food/FoodStager.svelte` (the two marks, the name-only row, the scroll reset, and the highlight decoupled from bits-ui's first candidate. §5 shipped in that ticket and was withdrawn in it — see the Amendment). The prototype the variants were compared on is `prototype/326-search-ui`, and the graded density §6 records as the first thing to try is still only there

## Context

The food search list renders inside a bottom sheet whose field is docked at the foot, and with a keyboard raised it has room for about two rows. Everything about it was therefore load-bearing, and two things about it were wrong.

**The mark that says "this one" was never a rank mark.** The first row renders inverted, black on white. That is bits-ui's `highlighted` state — the Enter target — which the library force-sets to the first candidate on open **and on every keystroke**. It is painted identically over the **Recent** list, which `recentCandidatesForMeal` sorts `b.time - a.time`: a chronology that claims no order at all. So the app was putting "this one is special" on row 1 of a list that makes no such claim, and the only thing distinguishing a ranking from a chronology was the word `Recent` or `Results` in an `<h3>`.

**Fifty rows were rendered behind a two-row window.** `SEARCH_RESULT_LIMIT` is 50 and the view sliced nothing, so a ranking whose shape a reader could never perceive was being asserted across roughly 3,900px of scroll.

A third question was raised and answered empirically: with the field at the bottom, should the best match sit **next to it**, the list growing upward? That is the `column-reverse` shape a chat log uses.

### What settled the order question

[`docs/research/326-mobile-search-conventions.md`](../research/326-mobile-search-conventions.md), against primary sources, plus a prototype driven on the reporter's own phone. The inverted list lost on five independent counts:

- **Firefox for Android implemented this exact question and answered no.** It ships a bottom-docked address bar and an `AwesomeBarOrientation { TOP, BOTTOM }` enum for its suggestion list. Under `BOTTOM` the list stays in rank order; the entire effect of the value is rotating one autocomplete glyph so it points back at the field.
- **The closest structural analogue does not invert, four times over.** An @-mention popup over a bottom-docked composer is the same geometry. Mattermost, Zulip, Element and Signal Desktop all anchor it above the input and all put the top-ranked suggestion at the **top** of the popup, farthest from the field. Element spells `flex-direction: column` out rather than leaving it to default.
- **The one real precedent is `fzf`**, whose default layout genuinely is prompt-at-bottom with the best match above it — and which ships `--layout=reverse-list` for the arrangement chosen here. It is a keyboard-only terminal tool with no pointer and no reading order.
- **Chat inverts on a recency claim, not a ranking claim.** Messages are appended at the end and the end is what you must see; the item nearest the composer is the **newest**, not the **best**. A ranked list has no append and its end is its worst match.
- **The thumb-reach argument does not survive its own primary source.** Steven Hoober repudiated the 2013 observations the genre rests on, captioned the canonical diagram "the well-known, but **incorrect** thumb-sweep chart", and measured the trade-off in a scrolling list, where reach lost: people stretch to bring content to the centre by choice. His bottom-edge rule is a rule about controls. NN/g call the reachability rationale for bottom-docked _content_ "largely incorrect".

Apple's own guidance splits it the same way: with search in the bottom toolbar the **field** animates to the thumb, and the **results** do not reorder.

### Scope

This record covers **how a list of candidates presents its order, its rows and its length**, in the food search and in any list that adopts the same vocabulary. The geometry it sits inside — the sheet, the keyboard, the dock — is [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md).

It does **not** touch ranking itself. The ten keys in `compareRelevance` and the corpus filters are untouched, and `SEARCH_RESULT_LIMIT` remains what a search returns. This is a decision about display.

## Decision

### 1. Rank reads downward from the top, in reading order

The best match is the first row under the heading. The list is not reversed and no `*-reverse` value is used to express order.

This is also a correctness rule, not only a taste one. CSS Flexbox is explicit that authors "**must not** use `order` or the `*-reverse` values of `flex-flow`/`flex-direction` as a substitute for correct source ordering, as that can ruin the accessibility of the document" — and here the reordering would not be cosmetic, since the sequence **is** the ranking being claimed.

Measured in the installed bits-ui, the practical cost is immediate: candidates are collected with `querySelectorAll` in DOM order, so under `column-reverse` **ArrowDown moves the highlight visually upward** and `Home` jumps to a row at the bottom of the screen. `aria-posinset` cannot repair it either — the user agent computes it from DOM position and would announce the bottom row as "1 of N".

### 2. Rank is structural, and carries no number

Two marks, neither of them numeric:

- **The winner inverts** — ink on paper — and this appears **only in a ranked list**.
- **The runners-up carry a stepping left edge**, `--edge-thick` then `--edge`, over `--edge-thin` as the resting border. Three tokens that already exist. The staircase ends at the third row, which is where the list stops making a claim worth reading.

### 3. Rank and keyboard highlight are separate channels

They answer different questions — "what won" does not move, "where you are" does — and one mark cannot carry both. The rank marks are static. The moving highlight becomes a ring, decoupled from the library's automatic first-candidate highlight.

### 4. A chronology gets no rank mark

Recent is sorted by time. It has no best match, and crowning its newest entry is a claim about order that the list does not make. **This is the defect that started the section, stated as a rule: a presentation that means "this one won" may not appear over a list that has not ranked anything.**

### 5. Six rows, then an explicit way to see more

A display cap, distinct from the search's own ceiling. Baymard's autocomplete research puts the researched mobile target at 4-8 suggestions, above which they report choice paralysis and find that most users select from among the first few. Six sits inside that band.

The overflow line renders at the ranking's weak end, below the list.

> **Withdrawn (2026-09-03, #334):** this section shipped and was taken out again in the
> same ticket. Baymard's count governs an autocomplete dropdown that has a results page
> behind it, and this list has none — so the cap made the weak end of a ranking
> unreachable rather than merely far, which no precedent in the research note does.
> The whole ranking is rendered, drawn lazily, and scrolled. See the
> [Amendment](#amendment-2026-09-03-334-5-is-withdrawn-the-list-is-long-and-lazy-not-short).

### 6. Rows are name-only

The macros line is dropped. It cost roughly 18px per row — measured, a full row is ~69px against ~51px without it — which at this density is the difference between two visible rows and three, and it buys more visible rows than any reordering could.

**This is the clause most likely to be argued with, so its cost is stated plainly:** the macros line is what distinguishes near-duplicate USDA names, and near-duplicates are the norm — _"Bananas, ripe and slightly ripe, raw · 97 kcal"_ beside _"Bananas, overripe, raw · 85 kcal"_. The three densities were built and compared on a phone against exactly those rows, including a **graded** variant carrying macros on the winner alone; name-only was chosen with that trade in view.

### 7. A new query returns the list to its best match

Any change to the query resets the list's scroll to the top. Without it, three rows down plus one more keystroke silently reorders the ranking beneath a viewport parked in the middle of it, and with a handful of visible rows the new best match is never seen.

## Consequences

**The rank marks are the load-bearing part and they survive their own question.** They work identically in either order, so §1 losing the inversion cost them nothing.

**Colour and border thickness are the only channels carrying rank.** That is thin. A text channel — a "Best match" label, or an `aria-label` on the winning option — is the obvious next move and is deliberately not taken here, because it competes for the horizontal space §6 has just spent.

**Decoupling the highlight is a real change to library behaviour**, not a skin. bits-ui sets it automatically and the app now overrides that, so a library upgrade can silently restore the old conflation. Anything checking rank marks should assert that the Recent list carries none.

**Name-only rows can be unpickable.** §6 records the cost honestly; if a user reports choosing the wrong banana, the graded variant is on `prototype/326-search-ui` and is the first thing to try, not a new design.

**Six rows can hide a good match that ranks seventh.** The overflow line is the mitigation and it is weak — it says how many are hidden, not what they are. If this bites, the answer is better ranking, not a longer list, since a longer list is what §5 exists to prevent.

> **Withdrawn with §5 (2026-09-03, #334).** This consequence was accepted at the time and
> should not have been: "it says how many are hidden, not what they are" is a description
> of a list you cannot reach the rest of. See the [Amendment](#amendment-2026-09-03-334-5-is-withdrawn-the-list-is-long-and-lazy-not-short).

**What this forecloses.** The inverted list is answered rather than merely untried, and the research note records what would reopen it: evidence that a phone user with the keyboard raised scans **upward from the field**. No study addresses it, and the note explains why that gap is structural. Reopening it is a measurement on a device, not an argument.

**Unestablished, and recorded as such rather than assumed.** Whether Slack, Discord, WhatsApp or iMessage invert their @-mention popups — all four are closed. What Safari on iOS does to suggestion order with a bottom address bar; no Apple source states it, and it is the one gap that could still produce a mainstream touch precedent.

## Amendment (2026-09-03, #334): §5 is withdrawn — the list is long and lazy, not short

§5 shipped and was taken out again before the branch merged. The cap rendered six rows
and counted the rest; every row past the sixth left the DOM. What follows is why that was
wrong, and it is a correction to this record rather than to the code that implemented it.

**Baymard's number does not transfer, because their list is not this list.** The quoted
finding is about **e-commerce autocomplete suggestions** — a dropdown of query shortcuts
sitting in front of a full search results page. Capping it costs nothing there: whatever
the dropdown omits, Enter still reaches. This list has no page behind it. It _is_ the
destination, so a row not rendered is a food that cannot be reached at all. §5 carried
the 4–8 band across that gap without noticing it was there, and
[the research note](../research/326-mobile-search-conventions.md) §4.4 makes the mismatch
visible in its own wording: the count governs "the number of autocomplete **suggestions**
displayed". The same section already marks Baymard's _ordering_ research `unverified`
(it is behind their paywall) and refuses to combine their keyboard-squeeze figures into a
with-keyboard row count, calling that composite "an inference, not their finding". The
count deserved the same scepticism and did not get it.

**Every precedent that settled §1 keeps its weak end reachable by scrolling.** The survey
was read for ordering and it answers this too: Firefox for Android's suggestion list is a
`LazyColumn` that `scrollToItem(0)`s on refresh, Chrome iOS is a `UITableView` that
scrolls to the top on open, and macOS Spotlight documents the far end in as many words —
_"Scroll to the bottom of the results, then click Search in Finder."_ Not one of them
truncates. §5 was the only clause in this record with no precedent behind it, and the
note that supplied the other clauses' precedents contradicts it.

**§2 had already solved what §5 was for.** The cap was argued from a ranking too long to
perceive. But the staircase ends at the third row by design, so what a reader must
perceive is over within three rows, and whether six or fifty follow changes nothing about
seeing which one won. The marks made the cap redundant, and the record did not notice
because §5 was written from a different premise than §2.

**What ships instead.** Every candidate is rendered, in rank order, and the weak end is
reached by scrolling. The overflow line goes with the cap that produced it — with nothing
hidden there is no count to print. The cost §5 was trying to buy back is paid by
`content-visibility: auto` on the row: off-screen rows skip layout and paint, and stay in
the DOM. That distinction is the whole point. bits-ui collects its candidates with
`querySelectorAll`, so a row withheld from the DOM is one `ArrowDown`, `End` and `Enter`
cannot reach — which is the same unreachability the cap was withdrawn for, reintroduced
one layer down. Laziness is allowed to defer drawing a row. It is not allowed to remove
one.

**This supersedes the Recent carve-out** this Amendment first carried. That argument —
that §5's cap should not reach a chronology, because a cut Recent row has no path back
with no local-twin search (#320) — was right about reachability and wrong about scope: the
same objection applies to the ranked list, which is why the cap is gone from both rather
than gated to one. `searchList` no longer caps anything, so the two lists differ in
exactly one thing, which is §4's rank gate.

**What would reopen it.** A measurement, not an argument: a phone showing that fifty
lazily-drawn rows cost real scroll or frame time in this sheet. The number to beat is
`SEARCH_RESULT_LIMIT`, which is 50, and the row is now name-only at ~51px.
