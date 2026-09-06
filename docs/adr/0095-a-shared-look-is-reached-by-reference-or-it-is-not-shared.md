# ADR 0095: A shared look is reached by reference, or it is not shared

**Status:** Accepted  
**Date:** 2026-09-06  
**Implemented:** #374 `09b31a4`, #375 `16f0970`, #378 `28267d9`, #379 `5502c92`, #380 `f1aebce`, #381 (the censuses in `tests/unit/ui-primitives.test.ts`)

## Context

[#362](https://github.com/palebluebytes/inventoria/issues/362) opened on seven native `<select>`s wearing three hand-rolled skins, and closed on a question that was never about selects: what makes a look actually shared. Four other families were in the same state at the same commit — nine hand-rolled `<textarea>` skins, four byte-identical copies of `.retro-input`, and one rule in `views/habits/HabitDetailView.svelte` that was `ui/Input`'s `.input` transcribed declaration for declaration.

The evidence that forced the rule is [#336](https://github.com/palebluebytes/inventoria/issues/336), and it is unusually clean because the same file sits on both sides of it.

#336 floored `ui/Input`'s `.input` at `9b1c24f`: a ten-line diff to one component, adding `min-height: var(--tap-min)` where the padding had come to 47px. Six files imported `ui/Input` at that commit, and all six were floored by that diff, at no cost and with no edit of their own.

`views/habits/HabitDetailView.svelte` was one of the six. It also carried this:

```css
.select-brutal,
.input-number-brutal {
  width: 100%;
  background: transparent;
  border: var(--edge-thin);
  padding: var(--space-2xs) var(--space-s);
  font-family: inherit;
  font-size: var(--step-0);
  color: var(--text-primary);
  outline: none;
  border-radius: var(--radius);
}
```

That is `.input` with the floor missing, in a file that imports `ui/Input` on line 6. Its four selects and its number field went on drawing 47px while the fields it drew through the component stood at 48, and they stayed short until [#338](https://github.com/palebluebytes/inventoria/issues/338) floored the copy separately at `70617a9` the following day. The copy itself survived until [#379](https://github.com/palebluebytes/inventoria/issues/379) deleted it whole.

So one file received a fix and missed the same fix, at the same commit, according to how each of its fields reached the skin. That is the asymmetry this record states.

**The alternatives that were genuinely live.**

_"A skin with a second wearer is a component."_ A threshold rule, and thresholds invite the argument they are meant to settle: the first question asked of it is "what about a second wearer that is fine?", and the only available answer is a number. It also measures the wrong thing. `.retro-input` was wrong at four copies for the same reason it would have been wrong at two, and `.main` in `src/app.css` is one rule worn by two shells and is right.

_"A primitive wraps the platform control, never replaces it."_ True, and this arc turned on it twice, but it is [ADR-0036](0036-segmented-single-choice-primitive.md)'s test already applied rather than a new decision. It belongs inside this record as the worked example, where it can be read beside the case it decided, and it is §2 below.

**Scope.** This record covers how a look is shared and when the population of a platform element must be held at zero by a census. It does not decide _which_ looks should be shared — `CONTEXT.md`'s Interface primitives roster is that vocabulary — and it says nothing about `<button>`'s population, which is [#361](https://github.com/palebluebytes/inventoria/issues/361)'s, or about the shared caret three components draw, which is [#317](https://github.com/palebluebytes/inventoria/issues/317)'s.

## Decision

### 1. A shared look is reached by reference, or it is not shared

**A class or a rule can be transcribed; a component call site cannot — it holds a pointer to the definition, so a fix to the definition reaches it.**

A look that a screen restates is a copy however carefully it was restated, and a copy taken before a fix never receives it. This is not about discipline: the transcription in `HabitDetailView` was accurate, commented, and written by someone who knew where the original was, and it still missed #336 by a day and a separate commit.

Two consequences follow directly, and both are rules a reviewer can apply:

- The fix for a duplicated skin is **adoption**, never a second copy kept in sync. Where adoption means moving a screen onto a component it does not yet use, that is the work, and it is larger than a class rename: #379 had to take one rule and five wearers together, because porting only the selects would have split the rule and kept half the copy.
- A shared **rule** — a class in `src/app.css` — is a legitimate second form of reference, and it is the weaker one, because nothing at a call site says where the definition lives and nothing stops a hand from transcribing it. The app has one: `.main`, worn by the two shells, and `tests/unit/shell.test.ts` pays for the weakness by asserting that neither shell declares `.main` itself. A shared rule without that check is a copy waiting to happen.

### 2. The worked example: a primitive wraps the platform control, never replaces it

ADR-0036 adopted bits-ui for the food controls, and [ADR-0068](0068-a-checkbox-is-the-platforms-own-control.md) §1 restated its test: a primitive reaches for bits only where the platform has no control with the behaviour. `ui/Select` is the case where the platform supplies **more**, and the refusal is recorded here in full so that it is not proposed again as an oversight.

bits-ui renders a custom listbox out of a portalled `Root` / `Trigger` / `Content` / `Item` stack. A native `<select>` opens the OS picker: full-width rows far above `--tap-min`, correct with every assistive technology, on every platform, for zero code. Adopting bits here would replace a control that already satisfies [ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md) with one this project would then have to floor itself, at a portal cost this repo has already paid once — bits-ui portals defeat the SSR tests ([#235](https://github.com/palebluebytes/inventoria/issues/235)). Nothing in the app wants typeahead, grouping or multi-select against two to seven static options.

What the primitive owns instead is the skin and the interior's shape: `appearance: none` removes the UA's own arrow and nothing else, and `options` is data rather than a `children` snippet, because a snippet hands the interior back to the call site and the call site is where the copies came from.

### 3. A census is required where every legitimate use of the element is the primitive

**Where a primitive wraps a platform element whose every legitimate use is that primitive, a census in `tests/unit/ui-primitives.test.ts` asserts the tree holds exactly one, and it is the primitive.** Where that is not true of the element, no census is required and none should be written.

The clause is scoped, and the scoping is a measurement rather than a preference. Read with `tests/unit/support/markup.ts`'s markup reader over `trackedSvelteFiles()` at the arc's base (`a168a437`, 2026-09-05):

| element      | outside `src/lib/ui/` | inside `src/lib/ui/` | census                |
| ------------ | --------------------- | -------------------- | --------------------- |
| `<button>`   | 111                   | 16                   | no                    |
| `<input>`    | 49                    | 3                    | no                    |
| `<textarea>` | 10                    | 0                    | yes, and it went to 0 |
| `<select>`   | 7                     | 0                    | yes, and it went to 0 |

`<textarea>` and `<select>` qualify because the answer is a single name: there is no multi-line field and no picker in this app that wants anything other than the house skin and the tap floor. Ten and seven are numbers that can reach zero, and both did — the textareas at #374, the selects across #378, #379 and #380.

`<button>` and `<input>` do not qualify, and not because the number is large. A nav item, a calendar day and a toggle cell are correctly not `Button`s; a checkbox, a file picker and a range slider are correctly not `Input`s. Requiring a census there would produce a 111-entry allowlist, which is not a guard but a snapshot everyone appends to — the exact failure `tests/unit/tap-floor.test.ts`'s docblock names when it says a hand-written roster is how the first sweep missed `ui/Checkbox`, the largest shortfall in the app.

**A census, not an allowlist.** The assertion is that the discovered list _equals_ the one entry, never that every discovered entry is named on a list. The census is strictly stronger: an allowlist reads the primitive being deleted or renamed as a pass, and a census fails on it, because the list is then not the one entry. An allowlist by filename is also the shape [ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md) refused for the Facet gates — a gate reads the roster, never a filename — and deriving a one-entry roster by parsing `CONTEXT.md` would be the letter of that rule without its point, and more fragile than writing the entry down.

The discovery is `git ls-files`, shared with `tap-floor.test.ts`, so the population cannot be hand-written and go stale. That matters more than it sounds: a sweep globbing `src/**` alone omits `src/App.svelte` and `src/Rations.svelte`, reports a plausible-looking file count, and cannot see a bare field in either.

**A note on the counts.** A raw text grep for `<button` over the same files reads 120 and 22, and `<input` reads 52 and 4, because it counts mentions in comments and `<script>` blocks as elements. The reader's numbers are the ones a census would actually find, and the asymmetry is the same at either reading.

## Consequences

**Adoption is priced as a port, not a rename.** Every clause above pushes work towards deleting a copy, and a copy is usually load-bearing for the screen around it: #379 moved a rule, five wearers and their markup together; #380 had to widen `ui/Select`'s value to a generic before `MediaEngagementModal`'s rating could bind `number | undefined` without a `Number()` at the write site. The rule accepts that cost deliberately, because the alternative it is measured against is a fix that reaches six files and stops at the seventh.

**Two populations are now held at zero, and the guard bites on a rename.** A file that moves `ui/Select.svelte` or `ui/Textarea.svelte` fails the census until the census names the new path. That is intended, and it is the reason the assertion is an equality.

**The rule is silent on `<button>`, which is where the copies are.** 111 call sites outside `ui/` is the largest remaining population, and #361 owns the sweep. This record deliberately does not extend to it: a general rule requiring a census everywhere would be applied there mechanically and would produce the roster it was written to refuse. What generalises is the first clause, not the third.

**A shared rule in `src/app.css` stays available and stays second-best.** `.main` is the one, it has the test that makes it safe, and a second one should be argued for on the same terms rather than reached for because a component felt heavy.

**This record declares no relationship to an earlier one.** It applies ADR-0036's and ADR-0068's test in §2 and states a rule neither of them contains; ADR-0093 and this record are about different things, a box's height and a definition's reach, and the ADRs above are cited rather than revised.

## Amendment (2026-09-06): the `<button>` cell of §3's table is 116, not 111

§3 reports 111 `<button>`s outside `src/lib/ui/`. That figure is wrong. It is **116**. The other three rows re-measure exactly as written — `<input>` 49/3, `<textarea>` 10/0, `<select>` 7/0 — as does the 16 inside `ui/`.

The reader was blind, not the count mis-transcribed. `tests/unit/support/markup.ts` matched a tag with a pattern that fixed how deep an attribute's braces may nest, at one level. An `onclick={() => { … }}` goes two, so the pattern did not match the tag carrying it — and an unmatched tag is not read without that attribute, it is **not seen at all**. [#376](https://github.com/palebluebytes/inventoria/issues/376) replaced the pattern with a walk that tracks quote state and brace depth (`5c90950`).

Re-run at this record's own base `a168a437`: the reader as it stood gives 111/16, the reader after the fix gives 116/16. The five are one button each in `AgendaView`, `DailyDashboard` and `AddEventScreen`, and two in `HabitsView`.

**The decision is untouched and §3's argument is strengthened.** The clause turns on `<button>` having no single legitimate answer — a nav item, a calendar day and a toggle cell are correctly not `Button`s — and not on how large the number is. The allowlist §3 refuses is a 116-entry one. Read both prose repetitions of 111, in §3 and in Consequences, as 116.

**What this does change is a claim this record makes about its own provenance.** §3 says the table was read "with `tests/unit/support/markup.ts`'s markup reader over `trackedSvelteFiles()` at the arc's base (`a168a437`)". `trackedSvelteFiles()` did not exist at `a168a437` — it arrives two commits later — and the reader that produced the table could not see a whole class of tag. The paragraph immediately below the table makes precisely this argument against a raw text grep, and then quotes a figure carrying a defect of the same kind. A count is worth what the reader that took it is worth, and naming the reader is not the same as having checked it.
