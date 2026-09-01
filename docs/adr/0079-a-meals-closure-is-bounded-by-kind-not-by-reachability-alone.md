# ADR 0079: A meal's closure is bounded by kind, because reachability is computed from the sender's own claims

**Status:** Accepted  
**Date:** 2026-08-31  
**Amends:** [ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) (§8.4 and §8.5 are tightened, §8 gains an eighth refusal, and the premise its unknown-attribute clause rests on is corrected)  
**Implemented:** #232 `32b1405`, `2dce40c`

## Context

[ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) §8 lists
seven refusals and calls §8.5, reachability, "the clause doing the security work".
#232 built all seven, and two payloads walked through them.

**The first: reachability is computed from edges the payload itself asserts.** §8.5
says "the reader recomputes the closure from the roots and refuses everything outside
it", and nothing said what an edge may point at. A sender who writes `event/target:
"settings:global"` on the root _makes_ settings reachable, so the check meant to stop
it is the check that admits it. Measured against the built reader rather than reasoned
about: a payload carrying `settings/food/targets`, a `habit:` and a `notes/op` was
accepted whole, all six rows. `event/instantiation.ingredients[].ref` and
`recipe/ingredients[].ref` do the same job. §8.4 has the same shape one hop earlier —
nothing checked that a declared root was a Consumption Event, so a payload could
declare `settings:global` a root and pass a closure recomputed from it.

**The second: §8's unknown-attribute clause rests on a false premise.** It justifies
itself with "an unknown attribute can only ride an entity the closure reaches, so it
is a fact about a food, harmless if unread". That assumes every projection scopes its
read by entity. Two do not. Of the five in `src/lib/db/projections.ts`, `HABITS_LINEAGES`,
`CAL_EVENTS` and the consume half of `CONSUMPTION` scope by entity prefix, but
`MEDIA_LIBRARY` reads `attribute LIKE 'media/%' OR attribute LIKE 'event/%'` and
`ACQUISITION_LIBRARY` reads `attribute LIKE 'twin/%' OR attribute LIKE 'event/%'`,
both ignoring the entity entirely. So `twin/name` and `twin/image` riding a perfectly
legitimate `fdc:` twin, properly reachable from a legitimate root, land in a library
of physical items the recipient never acquired. They passed all seven refusals and
both of the entity-kind checks above.

Neither is a coding mistake against ADR-0073. Both are the record's own rules
implemented as written.

### The alternatives that were live

- **A deny-list of the kinds known to be dangerous** — `settings:`, `habit:`,
  `cal_event:`, `notes:`. Refused on the asymmetry: a deny-list fails **open** on
  exactly the case that matters, an entity kind or a namespace coined after this code
  was written, while an allow-list fails closed and shows up as "my meal will not
  send" the first time anyone tests a new kind. A security clause fails toward
  refusing.
- **A per-attribute allow-list mirroring `docs/eavt-vocabulary.md`.** Refused, and
  ADR-0073 §8 was right to refuse it: that list grows every release and
  [ADR-0014](0014-namespace-prefixes-for-eavt-entity-identification.md)'s own
  amendment records what keeping a growing list inside a fixed decision costs.
- **Accepting the attribute leak and documenting it**, on the ground that
  [ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) §13.3 already
  declines to defend against a sender whose numbers are simply wrong. Refused because
  it is not the same thing: §13.3 is about a _meal_ being a lie, and this is a write
  into a domain the user was never shown. ADR-0073 §6 says "nothing writes unseen
  holds at attribute granularity or it does not hold at all". That sentence and this
  leak cannot both stand.
- **Checking the root carries `event/type: "ConsumeAction"`** instead of checking its
  prefix. Refused: the same sender writes that value, so it is exactly as
  unauthenticated as the id, and it is a second thing to get wrong.

### Scope

This record covers what a meal payload's closure may contain. It does not cover the
transport ([ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md)),
the screens ([ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md)),
the accept path, or the own-device half
([ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md)),
which §6 addresses only to rule it out.

## Decision

### 1. A declared closure root is a Consumption Event

Checked against ADR-0014's `event:consume_` prefix. This is **not a new refusal**: §4
already defines roots as `event:consume_` ids, and §8.4 is where the definition is
finally enforced. It belongs there because §8.5 is computed _from_ the roots, so a
payload free to declare any entity a root passes a closure check that then means
nothing.

### 2. What a root reaches is a food Digital Twin, and nothing else

`fdc:`, `gtin:`, `food:custom_` and `recipe:` — the four ADR-0073 §5 already
enumerates as the ids that cross. The media and item twins are not food and no meal
reaches them.

This tightens §8.5 rather than adding to it. "Refuses everything outside the closure"
now means outside by **kind** as well as outside by reach, because reach alone is the
sender's to assert.

### 3. A meal's facts live in four attribute namespaces

`event/`, `food/`, `nutrition/`, `recipe/`. Anything else is refused. **This is the
eighth refusal**, and it is the only genuinely new one here.

### 4. ADR-0073 §8's unknown-attribute clause stands, at the level it was arguing

An unknown attribute _inside_ one of those four namespaces still crosses, unread and
unrefused. What §3 refuses is a whole domain, not an attribute: the namespace list is
a closed set of ten that moves only when a tracked domain is added, which
`docs/how-to-add-a-tracked-domain.md` already gates, rather than a per-attribute
mirror that moves every release. The clause survives; only its justification is
replaced, by §2 and §3 doing the work its premise wrongly assumed the projections
were doing.

### 5. Both lists fail closed, and a test pins them to the registry

A food twin kind or a namespace added to `docs/eavt-vocabulary.md` and not to these
lists stops honest meals crossing, and the symptom appears on somebody else's device.
So a unit test partitions the registry's own tables against the two lists, with the
exclusions named one by one. Whoever coins the next prefix decides then whether a
meal may carry it, rather than discovering the answer later.

The test asserts a **partition**, never a subset: a new prefix that is in neither list
fails it.

### 6. None of this reaches the own-device half

ADR-0075's payload is a ledger delta, not a meal closure. It declares no roots, so
there is nothing to walk from and all three bounds are inapplicable **as written**
rather than merely relaxed. Said here because the checks look general and are not:
they are meaningful only because a meal declares what it is a closure of. What the
equivalent guarantee is for a delta is that record's to settle, and #248's arc is
where it is being asked.

## Consequences

**ADR-0073 §8 is seven refusals plus one, and two of the seven are stricter than they
read.** A reader who goes looking for the eight will find §8.4 and §8.5 doing more
than they say, which is why this record exists rather than a comment in the code.

**Three bounds where the design had one, and they are one argument.** The roots are
Consumption Events, what they reach are food twins, what those carry is a meal's own
namespaces. Each was mutated out in turn during #232 and fails only its own tests, so
none is masking another — and dropping any one reopens what the other two were
closing.

**A new kind of food twin, or a new namespace a meal should carry, stops sends until
it is added.** That is the fail-closed cost, paid deliberately, and §5 is what makes
it a failing test at home rather than a refusal on a recipient's phone.

**The worst a successful impostor achieves is unchanged**, which was ADR-0073's
Consequences claim and is now true rather than asserted: a plausible-looking fake meal
on a screen, which a human reads before accepting. What changed is that the fake is
now confined to being a meal.

**§8's stated reasoning was checked against the code and did not survive.** The
general lesson is worth more than this instance: before believing any claim of the
form "it rides a food entity, so nothing reads it", read the projection's `WHERE`.
Two of five do not mention the entity at all.
