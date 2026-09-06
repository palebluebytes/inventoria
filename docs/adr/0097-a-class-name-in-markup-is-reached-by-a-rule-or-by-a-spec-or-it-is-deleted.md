# ADR 0097: A class name in markup is reached by a rule or by a spec, or it is deleted

**Status:** Accepted  
**Date:** 2026-09-06  
**Implemented:** #376 (`tests/unit/worn-classes.test.ts`, and the 43 sites it emptied)

## Context

[#376](https://github.com/palebluebytes/inventoria/issues/376) opened on two fields wearing `class="input-brutal …"`, in `AddHabitScreen` and `ScheduleRuleEditor`. `grep -rn '\.input-brutal' src/` returned nothing: no rule in either file, in any other component, or in `src/app.css`, and none since the day the class was written. Both fields draw correctly anyway, because a sibling class on the same element carries the skin. The name is load-bearing for nothing.

[ADR-0095](0095-a-shared-look-is-reached-by-reference-or-it-is-not-shared.md) settled the case where a look is **copied**. This is the same illness one stage later: a look's **name** copied without the look. The two have different signatures and want different guards — a copy produces two rules that drift apart, and a bare name produces a box styled by nothing at all, which drifts from nothing and so is invisible to every check the repo had.

**The count is the finding, and it was not two.** A sweep over `trackedSvelteFiles()` at the arc's base read 118 files wearing 1,376 class names, 894 of them distinct. **43** of those wearings — a file and a name — had no rule reaching them: 33 distinct names across 24 files.

**Where they came from, mostly.** Commit `9612363` ("clear all remaining warnings") deleted thirteen CSS rules that `svelte-check` reported as unused and said so in its own body: "remove dead CSS rules — utility classes that are inert when passed to `<Card>` … Markup/classes untouched." Following the warning exactly is what produced the disease, because the warning names the rule and never the markup. `.stat-card`'s `display: flex; flex-direction: column` went that day, and the four habit stat cards have drawn their figure and its label side by side ever since — a `margin-top` on an inline `<span>` doing nothing, on a screen nobody looked at again.

**The Svelte fact that makes it undetectable.** A `class` handed to a Svelte component is a **prop**, and carries no scoping hash of the caller's. Compiling `HabitExecutionTimeline` at Svelte 5.55.10 emits `Card($$anchor, { class: 'mt-4 shadow-brutal' })` beside `.shadow-brutal.svelte-11ox1e9 { … }`, and **zero warnings**: the compiler can see the class is used, so it keeps the rule and scopes it to a hash the card will never wear. Five files asked Card for a brutalist shadow that way and none of them got one. The trap is written up from the other side in the notes on #375; this is the first time it has been measured.

**The alternatives that were genuinely live.**

_"Every worn name must have a rule."_ The strongest form, and wrong. Fifteen names that no rule reaches are how the Playwright suite steers — they are outside the 43 because reach 4 keeps them out, and under this alternative they would join it: `.db-badge` is what eleven specs wait on for the ledger to come up, `.macro-item.calories .macro-now` is how the dashboard's figures are read. Enforcing a rule for those means moving them to `data-testid`, which is forty-odd spec assertions of churn to swap one unstyled hook for another.

_"Report the count and stop."_ Refused for the reason `tests/unit/tap-floor.test.ts`'s docblock gives about its own population: a sweep run once is a number, and a number about markup is stale by the next commit. #376 asked for the decision to be made explicitly, and this is it.

_"Guard, with an allowlist of sanctioned bare names."_ Refused on [ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md)'s and ADR-0095 §3's terms — a hand-written roster is a snapshot everyone appends to. All four reach sets below are derived from the tree.

_"Lean on `svelte-check`."_ It answers the converse question (a rule that lands on nothing), reports it as a warning that `--threshold error` drops, and, as above, does not report it at all once the class rides on a component tag.

**Scope.** This record covers class names written in `src/` markup and what counts as a rule reaching one. It does not decide which look a name should carry — `CONTEXT.md`'s primitive roster is that vocabulary — nor whether an end-to-end hook is better as a class or a `data-testid`, which nothing here forces either way. It says nothing about `id`s or `data-*` names.

## Decision

### 1. A class name is reached four ways, and only four

**A class name written in `src/` markup must be reached by at least one of these. A name reached by none of them is not written.**

1. **A rule in the file's own `<style>` block**, which Svelte scopes to that file.
2. **A rule in `src/app.css`**, which is scoped to nothing. The app has one such class, `.main`, and ADR-0095 §1 says why a second should be argued for rather than reached for.
3. **A `:global(…)` in any component's `<style>`.** This is the only way one file's sheet reaches another file's box, and the app uses it: `.mt-4` is declared this way, in two unrelated views.
4. **A Playwright spec or its helpers selecting by it.** A class is a hook, and a rule is not the only thing that can hang off one. What this record refuses is a name nothing at all depends on; a spec that steers by a name depends on it.

The reading is at the level of the **name**, not the cascade: a rule `.a .x` credits `.x` even where no `.a` encloses the box. That direction is chosen deliberately. Over-crediting costs a finding the reader cannot honestly make; under-crediting invents a defect that is not there.

### 2. A caller's scoped rule never reaches a class it hands a component

**A class written on a component tag is reached only by 2, 3 or 4 above.** Writing the rule scoped, in the file that passes the class, produces a rule that compiles, raises no warning, and lands on nothing.

Where a caller has to reach into a primitive, the two forms that work are:

- a `:global(…)` **anchored under a local element**, so the escape is bounded — `.stats-grid :global(.stat-card)`, not a bare `:global(.stat-card)`;
- a **custom property the primitive already reads**, which is the better one where it exists. `ui/Card` documents `--card-bg` and `--card-padding` for exactly this, and a caller that re-declares Card's padding instead is writing the copy ADR-0095 §1 refuses.

### 3. An unreached name is resolved by writing the rule or by deleting the name

There is no third resolution and no exemption list. Which of the two applies is decided by the box, not by the name:

- **Write the rule** where the name asks for a look the app is visibly missing. Two of the 43 were this: `.stat-card` and `.summary-card`, both restored to the flex column `9612363` took.
- **Delete the name** where the box already draws correctly, because a parent or a sibling class carries the look. Forty-one of the 43 were this.
- **Delete the element too, where it exists only to wear the name.** `AddHabitScreen` and `ScheduleRuleEditor` each carried an empty `<span class="custom-checkbox" class:checked={…}></span>` that has never had a rule in its whole history — a checkbox drawn by nothing, in a card whose amber `.active` tint was already showing the state. An element with no content and no rule is not markup.

### 4. The sweep is a standing guard

`tests/unit/worn-classes.test.ts` discovers its population from `git ls-files` through `trackedSvelteFiles()` and derives all four reach sets from the tree, so nothing in it is hand-written and nothing in it can go stale on its own. A name that loses its last rule fails on the commit that removes it.

## Consequences

**A new class costs its rule in the same commit.** That is the point, and it is the smallest possible price for the failure being prevented: a class whose rule arrives "next commit" is indistinguishable, to this guard and to a reader, from one whose rule never arrives.

**The unit tier now reads the end-to-end suite, and that is a real coupling.** Deleting the last spec assertion that selects `.recipe-library` fails a unit test in a different directory. It is intended — that failure is the notification that a class just became dead — but the failure message has to say so, and it does, since the file naming the four reaches is the one that fails.

**Two populations of names are outside the reading, and both are printed rather than dropped.** A class an expression builds (`class="badge badge-{variant}"`) names a family, not a class; deleting the braces and splitting manufactures the name `badge-`, which no element wears and no rule declares, and would have this guard convict five primitives on its own arithmetic. `tests/unit/support/markup.ts` now seals the expression instead and hands those back as `dynamicClasses`, and the test asserts the list of five so the blind spot is visible rather than merely absent.

**Deleting forty-one names shrank the vocabulary the markup reads in.** `<span class="pm-name">` is now `<span>`, and a reader loses a hint about what that span holds. That is accepted: the hint was not free, because every one of those names also read as a promise that a rule existed, and following one of those promises is what cost #376 its first hour.

**The habit screens change shape, so the visual baselines owe a rebaseline.** `.stat-card` and `.summary-card` were restored, which is a real pixel change on two screens `tests/visual-catalog.spec.ts` captures — the first time either has drawn as designed since June.

**This record states a rule ADR-0095 does not contain, and revises nothing.** ADR-0095 §1 is about a definition's reach between two places that both have one; this is about a name with no definition anywhere. ADR-0083 and ADR-0095 §3 are cited above for the shape of a derived guard, not altered by it.
