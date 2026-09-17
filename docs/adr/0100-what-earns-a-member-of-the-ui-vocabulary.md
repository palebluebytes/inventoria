# ADR 0100: What earns a member of the `ui/` vocabulary

**Status:** Accepted  
**Date:** 2026-09-13  
**Amends:** [ADR-0040](0040-no-monolithic-chip-vocabulary.md) — its deletion test is generalised out of the chip space, and its bespoke remainder is re-derived rather than carried  
**Amends:** [ADR-0098](0098-a-tap-floor-binds-every-control-not-every-field.md) — the prediction in its Consequences that the mark/target duplication needs a new primitive is withdrawn; §3 stands  
**Implemented:** `src/lib/ui/FieldCaption.svelte` and `.field-caption` in `src/app.css` (#383), `src/lib/ui/SecretField.svelte` (#384), `src/lib/ui/Disclosure.svelte` (#316); the roster a gate reads is `tests/unit/support/ui-roster.ts`. The four tickets this record decides are #383 (filed as required — see the Amendment below, which downgrades it to earned), #384 (earned), #316 (earned) and #390 (refused, and becomes an adoption)

## Context

Four open tickets ask one question in four costumes, and each was parked for the
same reason: answering it inside a sweep would have decided the vocabulary by
accident. #390 says so out loud — _"Choosing that name inside a sweep would have
been deciding the vocabulary by accident."_

| ticket                                                         | the duplication                                             |     copies |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ---------: |
| [#384](https://github.com/palebluebytes/inventoria/issues/384) | a masked field with a reveal toggle, in two settings sheets |          2 |
| [#390](https://github.com/palebluebytes/inventoria/issues/390) | ADR-0098 §3's mark/target recipe, in two identical pairs    |          4 |
| [#316](https://github.com/palebluebytes/inventoria/issues/316) | a control that opens a region, in three visual shapes       |          5 |
| [#383](https://github.com/palebluebytes/inventoria/issues/383) | the caption over a form control                             | 7 settings |

**Two tests already exist and neither is this one.**
[ADR-0068](0068-a-checkbox-is-the-platforms-own-control.md) §1 decides when a
primitive reaches for bits-ui — _"a new primitive reaches for bits when the
platform has no control with the behaviour, never merely because its siblings
did"_ — which is a question about how a member is **built**, asked after it
exists. [ADR-0095](0095-a-shared-look-is-reached-by-reference-or-it-is-not-shared.md) §1 decides what
to do about a duplicated look once a member exists — _"the fix for a duplicated
skin is adoption, never a second copy kept in sync"_. Neither says when one must
be **created**, and that is the whole of the gap.

[ADR-0040](0040-no-monolithic-chip-vocabulary.md) has the germ, buried in prose
and never stated as a rule: _"It fails the deletion test: it removes little and
adds a broad new surface."_

### The two verdicts any rule here has to reproduce

ADR-0040 decided two cases on the same day and they are the only calibration
available. Both, after subtracting the sites existing primitives served, had a
reach of **one**:

- **`Chip` was refused.** _"Surveying the candidate sites against those two facts
  left exactly **one** genuinely un-modelled shape"_ — a filter bar with
  click-to-clear.
- **`ToggleGroup` was minted.** _"It is adopted at the one qualifying site — the
  `ItemsView` tag filter bar."_ The same filter bar.

So a count did not separate them, and any rule expressed as a count alone
overturns one of the two. What separated them is in 0040's own words: `Chip`
would _"re-invent `Badge` and `Button` just to house one filter bar — bloating a
new primitive's variant axis"_, while `ToggleGroup` carried one behaviour nothing
else had. The discriminator is the **width of what is added**, not the count of
what is removed.

## Decision

### 1. Two triggers and one brake

A member is earned by satisfying **either** trigger and clearing the brake.

**Trigger A — reach.** A change of one mind must land in **two or more copies**
that share one semantics, after subtracting every site an existing member already
serves.

**Trigger B — a gap.** A behaviour that neither the platform nor the current
roster has. This needs no count: it is `ToggleGroup`'s route, and it is
ADR-0068 §1's test asked one level up, about the vocabulary rather than about
bits.

**The brake — the deletion test, made arithmetic.** The member must remove more
surface than it adds, and it must not widen an existing member's **variant axis**
to absorb a stranger.

`Chip` satisfies Trigger B for one filter bar and fails the brake.
`ToggleGroup` satisfies the same trigger and clears it, because it adds one
behaviour rather than a costume rack. Both historical verdicts survive.

### 2. A copy is the unit, not a file and not a rule

Reach counts **copies**: one written-out instance of the shared thing, wherever
it sits. Two in one file are two, because a fix must be written twice.

Counting files would score #390 as three and hide the pair that makes it
interesting — `NutritionTargetEditor` holds two of the four. Counting rules would
score #384 as ten and flatter it. Both tickets already count in copies in their
own prose, which is a good sign the unit is the natural one.

### 3. The brake counts branches, never props

A **variant** is a branch: a conditional path inside the component, each needing
its own rule, its own test and its own line in the contract. The component's own
surface grows with every one.

A **snippet is a hole**, and holes are free. The surface is unchanged whether two
callers fill it or twenty, so a member may take snippets freely and must resist
variants.

This is what lets #316 be one primitive across three visual shapes — a `mark`
snippet and a `title` snippet, zero variants — and it is what stops a member
quietly becoming the `Chip` this vocabulary refused.

### 4. The shared thing decides the form

ADR-0095 §1 permits two forms of reference and is explicit that they are not
equal: a component (strong, because a call site holds a pointer to the
definition) and a shared rule in `src/app.css` (weak, because _"nothing at a call
site says where the definition lives"_, and the app's one instance, `.main`, pays
for the weakness with a test asserting neither shell declares it).

So:

- **Declarations alone** may be a shared class.
- **An element, markup, state or ARIA** requires a component.

This is a real test rather than a foregone conclusion — it can return "a class" —
and it separates the four for four different reasons. #383 because the shared
thing is the `<label>` and its `for`, which no class can carry. #390 because it
is a `::before` mark and two relocated states. #384 because it is markup and a
`type` toggle. #316 because it is `aria-expanded`, `aria-controls` and the id
that links them.

### 5. A correctness defect removes the discretion

Where a trigger is met **and** any site in the reach set has the semantics wrong,
the member is **required** rather than merely earned.

The worked case is #383. `CalorieCalculatorSheet`'s `.field-label` is
`<span>Age</span>` over a number input — no `for`, no association — while
`HabitDetailView`'s **identically named** `.field-label` is
`<label for="log-status-val">`. That is a broken control, not an inconsistent
one, and correctness has to be reached by reference or it regresses the next time
somebody copies the nearest example.

One broken site on its own is a bug ticket, not a vocabulary decision. What a
defect changes is the discretion, not the trigger.

### 6. A member is named for what it is for

For its purpose, or for the platform control it wraps. **Never for its
appearance.**

Both conventions are already in the roster: `Badge`, `Button` and `ToggleGroup`
are named for semantics — a display label, a selected action, a clearable
single-select — and `Input`, `Select`, `Checkbox` and `Textarea` for the platform
control underneath. Appearance is in neither.

This also guards §1's brake, because a shape name is exactly what invites a
widening variant axis: name a member `IconButton` and everything that looks like
an icon button acquires a claim on it.

### 7. Landing converts every copy, or names the survivor

A member lands with **all its copies converted in one ticket**. Where a site
genuinely cannot convert, it is named with its argument in a
`SHORT_BY_ARGUMENT`-shaped list **in the same commit**.

Incremental adoption is how a fourth copy appears: the member exists, the old
copies persist, and the next author reaches for whichever they found first.
[ADR-0093](0093-a-tap-floor-binds-the-box-that-accepts-the-tap.md)'s Consequences
already states the failure — _"a copy taken before a fix never receives it"_ —
and ADR-0095 §1 has the precedent for the cost: #379 _"had to take one rule and
five wearers together, because porting only the selects would have split the rule
and kept half the copy."_ A member landing beside surviving copies has added a
form of the thing rather than removed one, which fails §1's brake on its own
terms.

### 8. A census per population, and a roster a gate reads

Once a member exists, a test pins the count of remaining hand-rolled instances at
**zero**, with any survivor carrying its argument, in the shape
`tests/unit/tap-floor.test.ts` established: an exemption costs a diff.

**One census per population, beside the concern it polices.** A single
`membership.test.ts` would be several unrelated censuses sharing a filename — a
caption population is found by rules reaching a `<label>`, an icon control by a
floored `<button>` drawing its mark in CSS, a disclosure by `aria-expanded`
outside the primitive. What is shared is the shape, not the query.

**The roster is a declared list the gate reads, never a folder listing.**
[ADR-0083](0083-a-gate-that-names-one-entry-point-proves-one-facet.md) set the
precedent, and `src/lib/ui/` currently demonstrates why it is needed:
`BottomSheetDemo.svelte` sits in that folder with **zero** callers, being a
harness for the `?demo=bottomsheet` route rather than a member of anything.

### 9. Falling reach never evicts

This is a minting test, not a tenancy test. A member with one caller stays: the
pointer _is_ the value, and folding it back into its single call site recreates
exactly the copy §1 exists to prevent. Zero callers is dead code and goes by
ordinary hygiene, not by this record.

### 10. Then ADR-0068 §1

The two tests are a **sequence, not a menu**. This record decides whether the
vocabulary gains a member; ADR-0068 §1 then decides how that member is built —
bits-ui only where the platform has no control with the behaviour. Trigger B is
phrased to echo it deliberately, because they are the same shape at two
altitudes.

### 11. Scope: the `ui/` vocabulary, and nothing else

Both the brake and the form test are UI concepts. A variant axis means nothing
for a utility function, and §4's element/markup/ARIA ladder is what decides class
against component.

Ordinary duplicated logic is served by ordinary refactoring judgement and needs
no vocabulary ceremony. The reason UI needs one is ADR-0095 §1's actual finding:
a look can be transcribed **accurately, by someone who knew where the original
was**, and still miss a fix. That is not how a function behaves.

### 12. The rule is reactive, and the gate has a blind spot

The trigger fires at the second copy, which means it fires **after** the copy
exists. §8's census only exists once a member has been minted, so nothing
mechanical catches the first duplication of a thing that has no member yet.

#390's two `.info-btn` rules are the evidence: byte-identical _including their
comment_, and identical before #361 touched them. Nobody wrote them in one
sitting.

This is recorded rather than papered over. Review is what catches a second copy
today; the census takes over permanently from the moment a member exists. A sweep
for any rule written out across files is a real instrument and belongs in its own
ticket, not in a clause here that would claim a prevention this record does not
deliver.

## The four worked examples

**#383 — the caption. Required (§5).** Seven distinct settings over 15
label-borne rules, two of them outside the type scale on hard-coded rem, two not
uppercase at all, and the `<span>`/`<label for>` defect above. The shared thing
is an element and an association, so §4 says component. Named for purpose.

**#384 — the secret field. Earned.** Two copies, one semantics, nothing serves
it, and the reach has already been paid **twice**: `z-index: 2` in #375, then
`2.75rem → var(--tap-min)` in #361, each a single cause written into two files.
Markup and a `type` toggle, so §4 says component.

**#316 — the disclosure. Earned.** Five copies, one semantics — a control that
opens a region — in three visual shapes that §3 makes snippets rather than
variants, so the brake is clear. `aria-expanded`, `aria-controls` and the linking
id, so §4 says component. Its own ticket already argues why bits-ui's `Accordion`
is the wrong build, which is §10 working as intended.

**#390 — the icon control. Refused.** `ui/Button` already carries
`min-height: var(--tap-min)` and already takes a `children` snippet. The four
copies are `<button>`s that never adopted it, and ADR-0098 §3's `::before`
gymnastics exist only because the mark is **drawn in CSS instead of passed as
content** — pass a glyph or an SVG as children and there is nothing to relocate.
So §1's subtraction leaves a reach of zero, and §6 refuses the name `IconButton`
besides: "icon" describes the mark, and a control you press is a `Button`.

The ticket becomes an adoption: four sites onto `Button`, ADR-0098 §3's recipe
**deleted rather than extracted**.

That refusal is the point. A rule that only ever says yes is not a test, and this
one refuses one of the four candidates that motivated it, on the subtraction
clause put there to reproduce the `Chip` verdict.

## Consequences

- **Positive:** four tickets stop being four independent judgement calls and
  become transcriptions of one argument. The failure this avoids is real: decided
  separately, they would have produced `SecretField`, `FieldCaption`,
  `Disclosure` and `IconButton` as four unrelated precedents and still no rule.
- **Positive:** the rule reproduces both of ADR-0040's verdicts rather than
  overturning either, which is the only calibration this space has.
- **Positive:** §8 gives each surviving ticket a definition of done that is a
  number rather than "looks converged".
- **Negative, and stated in §12:** nothing mechanical catches the first
  duplication of an unmodelled thing. The rule is reactive by construction.
- **ADR-0040's bespoke remainder is re-derived, not carried.** Its three
  exclusions — nutrient data pills, the Owned/Wanted tabs, `reps-pill` and
  `time-hint-pill` — all fall out of §1's one-semantics clause without being
  named. A grandfathered list of kinds is the half that rots, because nothing
  tells a reader when an entry stops applying. A reader who finds the old list
  should treat it as a worked example of this rule, not as a second mechanism.
- **Relationship to prior ADRs:** completes ADR-0095 §1 (which owns adoption but
  not minting); sequences into ADR-0068 §1 (which owns the build); generalises
  ADR-0040's deletion test out of the chip space and amends its remainder;
  withdraws the prediction in ADR-0098's Consequences that the mark/target
  duplication needs a new primitive, while leaving its §3 standing.

## Amendment (2026-09-13, #383): §5's worked case is not a defect, and the census it rests on was short twice

**§5's example is refuted on the markup.** This record says of #383's reach set
that _"`CalorieCalculatorSheet`'s `.field-label` is `<span>Age</span>` over a
number input — no `for`, no association"_, and calls that _"a broken control,
not an inconsistent one"_. Read at `6a456151`, the three sites are:

```svelte
<label class="field">
  <span class="field-label">Age</span>
  <input type="number" class="num" … />
</label>
```

The label **wraps** its control, which is an association the platform supplies
and assistive technology honours. The same is true of the file's two other
metrics fields, and of `FoodStager`'s `.cf-reason-code`. So there was no
accessibility defect at any of them, the `<span>`/`<label>` split the re-measure
found was a difference in _how_ the association was written rather than whether
it existed, and **#383 was earned rather than required**. The work is unchanged:
Trigger A was met eight settings over, and §5 governs the discretion, not the
trigger.

What the claim was reaching for survives in a weaker form and is worth keeping:
an implicit association cannot be seen by a sweep, cannot be pointed at from
another element, and breaks silently the moment somebody moves the caption out
of the wrapper. Explicit is better, and the port made all seventeen explicit.
But that is a preference, not a bug, and this record should not have been
written as though a control were broken without opening the file.

**The census was short twice, not once.** #383's body found ten sites, its
re-measure found six more and called the total fifteen rules in seven settings.
Implementing it found two that neither pass had: `FoodStager`'s `.cf-pack > span`
and `ReadPairingCode`'s `.label` — the latter an eighth setting. Both were
invisible for one reason, and it is a reason worth stating because §8 asks every
member for a census: a caption written as a `<span>` **inside a wrapping
`<label>`** defeats a sweep keyed on rules reaching a label, because what the
rule reaches is the wrapper and not the text. The census that shipped
(`tests/unit/field-caption.test.ts`) therefore asks two questions, not one — is
every `<label for>` the primitive's, and does any rule outside `app.css`
redeclare the look — and the first only became answerable once the port had
emptied the population.

**§4's ladder returned "a class" as well as "a component", and both were
needed.** The shared thing across thirteen sites is an element and its `for`, so
those are the component. Three more captions name a **group** — `ui/Segmented`,
`ui/ToggleGroup` and, in `ReportsPage`, bits-ui's `DateRangePicker.Label` — and a
group of radio cells or date segments has no one labelable control to point a
`for` at, so each draws a `<span id>` reached by `aria-labelledby`. Those three
shared declarations only, which is §4's other rung, and they were three
byte-identical copies of the look. Declaring it once in `src/app.css` is what
lets the census assert a single declaration; leaving it inside the component
would have left four copies of the thing ADR-0095 §1 exists to stop.
