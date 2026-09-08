# ADR 0099: A capture asserts one screen at a derived tolerance, and moving one owes an account

**Status:** Accepted  
**Date:** 2026-09-07  
**Implemented:** §8's instrument — `scripts/baseline-diff.mjs` (`5e084a0`, #404); §8's procedure — `.github/workflows/e2e.yml`'s header (`d7a9ecb`, #369, extended by `b38b78d`); §7's measurement — `takeSheetScreenshot`'s doc comment in `tests/visual-catalog.spec.ts` (`3c51512`, #366); the pre-landing state of both helpers, recorded in place (`9069dab`, #367)

## Context

[ADR-0010](0010-playwright-native-visual-catalog-generation.md) chose Playwright's
native visual testing over Lost Pixel and committed the baselines to the
repository. It settled which tool takes the pictures. It says nothing about **how
closely two of them must match**, nothing about **what one image's failure says
about the images after it**, and nothing about **what a person owes when they
replace one**. The catalogue is now 31 committed PNGs across 17 declared names and two
projects, and all three silences have produced a defect.

[#339](https://github.com/palebluebytes/inventoria/issues/339) reported the
visible symptom: two capture helpers in one file disagreeing about an
antialiasing budget, with only one of them explaining itself. Verification turned
that report over three times, and each correction made the hole larger.

- **Nothing in this repo compares exactly.** `threshold` — a per-pixel colour
  tolerance in YIQ space — defaults to `0.2` (`comparators.js:83`) and nothing
  anywhere sets it. So the asymmetry was never between one budget and exactness;
  it was between one _chosen_ count budget and one _unchosen_ colour tolerance
  that both helpers already carried.
- **There are four knobs, not two.** `toMatchSnapshot.js:260-263` passes
  `comparator`, `maxDiffPixels`, `maxDiffPixelRatio` and `threshold`. The repo
  set one of four.
- **The chosen one is orphaned by its own comment.** `maxDiffPixels: 5000` was
  sized against the calorie ring's rounded arc cap (~2372 px of observed flake,
  `837c141`); the ring is gone and the budget was kept "for the rest", with
  nothing measured behind "the rest".

Underneath that sits a second failure with no owner. `bb65c52` — "rebaseline the
eighteen captures the mobile arc moved" — read **four** of its eighteen files by
eye, named them well, and blessed the other fourteen without attaching a cause to
any of them. Both invariant specs in this repo already state the position that
commit violated, in prose: _"a baseline can be silently frozen with the bug
already in it."_ The comparison caught a real change at a sheet's left edge and
nothing made anyone look at it.

[#366](https://github.com/palebluebytes/inventoria/issues/366) then measured that
change and found it **sanctioned** — [ADR-0089](0089-a-pinned-surface-measures-the-visible-band.md)
§7 and its Amendment, via `867c14a`. That refutation is what makes the process
half of this record necessary rather than incidental: the case does not rest on a
bug having been frozen, only on nobody having looked.

And the third silence is structural. `Visual Catalog Generator` takes seven
full-page captures in **one** test, so a mismatch on the first leaves the other
six uncompared. On a red catalogue,
[#368](https://github.com/palebluebytes/inventoria/issues/368) measured that
understatement at **six differing captures reported as one**.

Every figure in this record was measured against `playwright@1.59.1`, the 31
committed baselines, `src/app.css`, `.github/workflows/e2e.yml` and git, except
§1's timings, which are #368's two instrumented CI runs. The
arguments are on #366, #367, #368 and #369; the map is
[#365](https://github.com/palebluebytes/inventoria/issues/365).

### The alternatives that were live

**Fold this into ADR-0010.** Rejected. 0010 answers "which tool", and nothing in its
argument — Lost Pixel's sunset, dependency leanness, offline-first — bears on any
of the three questions here. Folding three measured decisions into a record
written before the catalogue had a second helper would bury its own decision. It
gains a pointer.

**Leave the defaults.** This is not the null option it looks like; it is a choice
to keep a number nobody has ever argued for. Measured against this repo's own
tokens, `0.2` allows a YIQ delta of 1408.6, and `--green-bg` (acid green,
success) rendering as `--amber-bg` (warning yellow) is a delta of **972**. A
success badge drawn as a warning badge is invisible to all 31 baselines. So is a
`--highlight-bg` post-it vanishing into `--paper` (924), and a 1px `--border`
losing itself into `--bg-base` (237). A uniform grey shift of **52 levels of
255** passes. This palette is brutalist; semantic colour is load-bearing in it.

**Exactness — `threshold: 0`.** Not chosen, and, unlike everything else here,
**not measured**. It sits outside the bracket §3 derives by construction: it
fails `--ink` (`#000`) against `--text-primary` (`#09090b`), a token substitution
nobody can see, and it makes the repo's tolerance a property of the runner's
rasteriser rather than of its palette. What would settle it is #405's phase 2
rewriting nothing, which this record schedules rather than pre-empts.

**A budget for the sheets, sized like the full-page one.** #339's implied fix,
and the thing this record most deliberately does not do. It fills in an asymmetry
rather than dissolving it, and a _count_ budget means 31 different things across
these images — 0.089% of `rations-settings-page` (1280x4376) up to 2.93% of
`food-past-meal` desktop (600x284), a 33x spread.

**`expect.soft` on the monolith instead of splitting it.** One word, and it does
report all seven. Refused on measurement: see §1.

**A mechanical gate for the rebaseline account.** Refused: see §8.

### Scope

This record covers what a comparison against
`tests/visual-catalog.spec.ts-snapshots/` is allowed to claim — how tight, over
what, per test — and what a commit that moves one of those files owes. It does
not cover:

- **Which tool takes the picture.** ADR-0010's, and untouched. Its silence here
  is not a ruling this record overturns; it is a silence.
- **The invariant specs' own content.** `tests/keyboard-invariants.spec.ts`,
  `tests/layout-invariants.spec.ts` and `tests/unit/sheet-geometry.test.ts` carry
  the geometry claim (§6). This record points at them and changes none of them.
- **Anything ADR-0089 decided.** #366's verdict is that the sheet's box never
  moved; the geometry it did not move is 0089's.
- **The CPU-load click-timeout flake.** A truncated run shares a symptom with §1
  and has an unrelated cause. #406 will reduce it incidentally and does not chase
  it.
- **Snapshots that are not images.** `tests/unit/recent-foods.test.ts`'s two
  `toMatchInlineSnapshot` assertions owe nothing under §8: their content _is_
  their diff.

## Decision

### 1. A capture is one test's assertion, and one test asserts one capture

Every `toHaveScreenshot` in this repository is the only one in its test. The rule
binds all three of `tests/visual-catalog.spec.ts`'s catalogues; two of them
already comply and say why in a comment, and `Visual Catalog Generator` is
brought to it by #406.

The reason is that **a capture a test does not own is a capture the suite may
silently not make**. Under plain `expect`, a failing assertion ends the test, so
the six captures behind it are neither passed nor failed — they are unreported.
A red run's failure count is therefore a lower bound by construction, and the
count is what a person reads when deciding what a change did. #368 measured the
gap on a catalogue that was genuinely red: seven captures, **six** of them
differing, **one** reported.

**The premise that made this expensive was false.** The seven captures ride one
linear seeding script, which looked like a pipeline that a split would have to
run seven times. It is not: it is seven independent seeds concatenated. Two split
tests captured the monolith's own baseline filenames and passed, on both
projects, in both runs — and one of them was `notes-dashboard`, the _last_
seeding leg, having dropped `resetDatabase`, `setupApiKeys` and all five
preceding seeds. Exactly two legs are wanted by one screen each, and both are a
single call.

**The cost is one app boot per test, and nothing else.** `settings-page` is
302 ms inside the monolith and 1414 ms standalone; the 1112 ms delta is the boot
to the millisecond, and the capture itself costs the same either way (264 ms →
246 ms). Splitting all seven adds ~6 s of serial CPU; at the configured
`workers: 2` with `fullyParallel` the wall-clock floor becomes the agenda test
alone, so the suite gets **faster**.

**`expect.soft` is refused, and it is refused on evidence rather than on taste.**
It composes — as a caller's parameter, never written into a helper two complying
describes also use — and it is cheap, ~0.8 s per differing capture rather than
the poll-to-timeout cost it looks like. It is still strictly weaker, because it
converts a failed _assertion_ into a recorded one and does nothing for the ~80
interaction steps between the captures. In all three of #368's serial runs the
`chromium` monolith died mid-script; under plain `expect` two screens never
compared, under `expect.soft` those same two **still** never compared, and under
the split both were verified in that same run in 3.6 s combined.

### 2. Every tolerance this repo runs at is declared, or it is not one this repo has chosen

The four knobs `toMatchSnapshot` reads are `comparator`, `maxDiffPixels`,
`maxDiffPixelRatio` and `threshold`. Each is either set in
`playwright.config.ts`, or refused in writing (§5). "Not set" is the state that
produced this record and is not an available answer.

They live in the config, not at the call sites. "One rule for both helpers" is a
claim about the project rather than about two functions, and a third helper
written next month should inherit it without anyone remembering.

There is a fifth control the repo **cannot** reach, and it is named here so it is
not mistaken for one it forgot: `pixelmatch.js:29` sets `includeAA: false` and
Playwright never overrides it, so every over-threshold pixel is re-tested by the
Vysniauskas antialiasing detector and dropped if either image reads as an edge.
This repo cannot turn that off, tune it, or observe it (§5).

### 3. The colour claim is a bracket, and a gate holds the bracket rather than the number

`pixelmatch` admits a pixel when its YIQ delta exceeds
`maxDelta = 35215 x threshold^2`. **The decision is the bracket**, because a
number cannot say what re-measures it when the thing it was sized against
disappears — and "nothing tied `5000` to anything" is precisely why that budget
outlived the calorie ring.

Two anchors, both live tokens in `src/app.css`:

- **must fail** — `--border` (`#e4e4e7`) losing itself into `--bg-base`
  (`#fafafa`), delta **237.4**. A 1px border vanishing is a regression this
  catalogue exists to catch.
- **must pass** — `--ink` (`#000`) against `--text-primary` (`#09090b`), delta
  **43.2**. A token substitution nobody can see.

Those bracket the threshold at **0.0351 < t < 0.0821**, whose geometric centre is
0.0537. The floor is where it is rather than at the bare root of 43.2/35215
(0.035025) because the bound is exclusive: at `t = 0.0350`, `maxDelta` is 43.138
and the must-pass anchor fails by six hundredths of a level. The value that lands
is **`0.05`** (`maxDelta` 88.0), and the tightest
semantic confusion in the palette — `--rda-over` rust reading as `--red-text`
error, delta 705 — then fails by 8x.

**Any later value must sit inside that bracket and cite a measurement.** Above
the ceiling the threshold starts passing a vanished border, so the answer to
residual noise is a `maxDiffPixelRatio` sized by that noise, or a `mask` over the
region producing it — never a wider threshold. The number is free; the claim is
not.

**The bracket is held by a gate that asks the installed comparator.** A Vitest
test in the `tests/unit/` idiom reads the anchor tokens out of `src/app.css` and
`threshold` out of `playwright.config.ts`, imports `getComparator("image/png")`
from `playwright-core/lib/server/utils/comparators.js`, paints two small solid
PNGs per pair, and asserts the verdicts. On a uniform block the AA detector is
inert by construction — every neighbour is equal — so the gate measures
`threshold` alone.

**The assertion's timeout moves with the threshold.** `expectScreenshot` polls
for _stability_ — the first iteration against the baseline, every later one
against the previous screenshot — so tightening `threshold` tightens that loop,
and its failure mode is a **timeout rather than a diff**. A stable-but-moved
capture still converges in about two screenshots (~0.8 s measured); only a page
that cannot produce two consecutive agreeing shots burns the budget. So
`timeout: 15_000` is declared beside the threshold in the same block, paid only
by a capture that never settles, rather than left at the 30 s default where a
tightening silently makes it load-bearing.

It deep-imports rather than restating `35215` for the reason #404 later adopted:
`package.json` declares `^1.59.1`, and everything this argument rests on is
`playwright-core` internals with no public guarantee. A reimplementation goes
silently wrong on upgrade; a deep import fails as module-not-found, which is
loud. **Do not pin the caret range** — the gate makes drift fail loudly, and
pinning buys nothing on top of that.

### 4. The count budget is deleted, and a count can never replace it

`maxDiffPixels: 5000` goes. Three things independently condemn it:

- **Its measured basis is gone**, by its own comment.
- **It is not one budget.** 5000 px spans 0.089% to 2.93% across these images — a
  33x spread — so it is 31 different claims wearing one number.
- **The job it names belongs to another mechanism that is already on.** §2's
  `includeAA: false` is what suppresses antialiasing landing on different
  sub-pixels. The budget's stated purpose is a job it is not doing.

**If measurement ever resurrects a budget it must be a `maxDiffPixelRatio`**,
which means one thing on all 31 images, and it must arrive with the measurement
that sized it. Keeping an orphan against the chance that something needs it is
how this one went orphan in the first place.

### 5. The refusals are stated, because silence is what produced this record

- **`comparator` stays `pixelmatch`.** `ssim-cie94` is refused because §3's
  bracket is expressed in YIQ delta and would have to be re-derived in ΔE94 to
  mean anything, and nothing is wrong enough with pixelmatch to pay that.
- **`maxDiffPixelRatio` is refused unless a measurement demands it** — in those
  words, not by silence, and under §4's condition.
- **`includeAA: false` is recorded as an unchosen dependency.** A reader who
  finds a text-edge change passing at `0.05` must be able to learn why without
  concluding the bracket is broken.

### 6. Tolerance does not carry the geometry claim

Two facts confine the worry that a colour tolerance hides a layout change.

- **A resize can never be absorbed.** `comparators.js:69-72` produces
  `sizesMismatchError` unconditionally, before any budget or threshold is read.
- **A same-size, in-box move is guarded where it belongs.**
  `tests/unit/sheet-geometry.test.ts` held its invariant _before_ the pixels
  moved, and `tests/keyboard-invariants.spec.ts` and
  `tests/layout-invariants.spec.ts` assert geometry rather than photograph it.

So the geometry claim belongs to the unconditional size check and the invariant
specs, and that is what lets §3 be argued on colour and noise alone. **A sheet's
edge geometry does not need an invariant of its own** — #366 found the geometry
was the part that had been stable.

### 7. A capture claims everything inside its clip, including what it did not mean to photograph

An element capture is not a claim about that element. It is a claim about the
rectangle.

`takeSheetScreenshot` clips the sheet element itself, whose ink border starts at
**column 1** and is mirrored at columns 391 and 392, so the clip carries one
pixel of **backdrop** on the left and none on the right. Over most of its height that
column reads `srgb(150)`, which is `--bg-base` (`#fafafa`) through one
`rgba(0, 0, 0, 0.4)` overlay: 0.6 x 250. The remainder is the page's own bottom
nav, in ink, behind. At one unchanged geometry that column has taken three
different values across six captures. A column tracking the sheet could not do
that.

The consequence is a rule about evidence: **a moved baseline is not evidence
about the surface under test until someone says which part of the clip moved.**
`bb65c52`, #339 and the map all read a 437-pixel full-height column as the
sheet's border moving as one; columns 1-392 are byte-identical across that
commit, and the sheet's box never moved at all.

**The column is not clipped out.** What is behind a modal is part of what a sheet
looks like, and removing it would rebaseline six files to hide a fact the
helper's doc comment now states in place, where a re-seeder meets it. If it ever
produces a false failure, the answer is a `mask` over that column under §3's
amendment route — not a wider threshold, which would buy the same silence
everywhere else as well.

### 8. A rebaseline commit accounts for every baseline it moves, and the unit of the account is the cause

**What it binds is a committed _image_ baseline**, not a path. A PNG owes an
account precisely because `git show` renders it as `Bin 24831 -> 24799 bytes` and
nobody can read it. The distinguishing property is **opacity in the diff**, which
is what makes the rule's reach derivable rather than enumerated. One directory
qualifies today.

The account lives in a `test(visual)` commit that touches nothing else:

1. **The denominator.** How many baselines were compared, and how many moved. It
   costs `git status | wc -l`, and it is what turns "18 files" into a
   measurement.
2. **Every moved file under a named cause, with total coverage.** A cause is a
   change a reader can go and look at: a commit (preferred, and
   `git log <last-rebaseline>..HEAD -- src/` produces the candidate list
   mechanically), a ticket, an ADR clause, a config change, or a dependency bump.
   Non-`src/` causes included explicitly — that class is the one that moves
   everything at once, and is where per-cause pays for itself.
3. **One measured read per cause; the rest attributed to it, and labelled as
   attributed.** Measured means the diff was read: count, ratio, region.
   `bb65c52` read four _files_; this asks for one read per _cause_, which is both
   cheaper and the thing that was actually missing there. The instrument is
   `scripts/baseline-diff.mjs` (#404).
4. **A new baseline owes more, not less.** There is no prior and no diff, so
   nothing but a person's eye stands between it and a frozen bug. The account
   says what the screen is, why it exists now, and that the image was looked at.
   A green run writes a new baseline **silently**; only `git status` saying
   untracked rather than modified distinguishes it from one that moved.
5. **A move nobody can attribute may still ship** — measured, labelled
   unattributed, and carrying a **filed issue number**. Refusing the commit is
   the tempting rule and it is wrong twice: it would have blocked `bb65c52` over
   a change #366 later found sanctioned, and it holds a branch hostage to a
   question that deserves its own investigation. What failed there is that
   "worth a follow-up" is not a follow-up.
6. **A `Rebaseline-Run:` trailer** carrying the run URL, beside `Refs` and
   `Co-Authored-By`. Artifacts have `retention-days: 7`, so the evidence outlives
   itself only as a reference; a trailer is greppable and immune to prose drift.
   **`Refs` names the ticket that occasioned the dispatch**, with per-cause
   tickets in the body beside their files — twelve `Refs` would cross-link twelve
   issues to a commit that implemented none of them.
7. **Tolerance is named only when tolerance is the cause.** `playwright.config.ts`
   is in the tree at every commit, so the number is always recoverable, and a
   field required every time is a field copied forward stale — the exact failure
   that made `maxDiffPixels: 5000` an orphan.

**Why `git status` can name the set at all.** Under `--update-snapshots=changed`
— the preset, and what `e2e.yml` runs — the comparison executes with the
configured options and only a _failure_ is rewritten (`toMatchSnapshot.js:295-303`).
So against a wholesale copy of the artifact, `git status` is the refused set
**exactly**: an identity, not an approximation, which is what makes clause 2's
coverage a finite obligation rather than a judgement about which files looked
interesting. The steps that follow from it are `e2e.yml`'s header, not this
record's.

**The artifact's existence is itself a proof.** `e2e.yml`'s upload carries an
implicit `success()` ([GitHub's expression semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions)),
there is no `continue-on-error` in the file, a rewritten baseline returns
`pass: true` and a missing one is written and passed. So a downloadable
`visual-snapshots` artifact proves that **all 31 captures executed and every file
it did not rewrite passed at the configured tolerance**. That is what clause 1's
denominator rests on. It also means a rebaseline dispatch hands back **no diffs
at all** — `test-results/` uploads `if: failure()` — which is why clause 3 needs
an instrument.

**An ADR's Consequences can pre-pay the intent half.** [ADR-0098](0098-a-tap-floor-binds-every-control-not-every-field.md)
already says _"every visual baseline in `tests/` will differ, and the rebaseline
is a CI dispatch rather than a local run"_; [ADR-0097](0097-a-class-name-in-markup-is-reached-by-a-rule-or-by-a-spec-or-it-is-deleted.md)
names its two screens. Written before the pixels moved, such a line cannot be a
post-hoc rationalisation, which is exactly what "was that move intended" is
asking. It discharges intent outright; the file list and the one measured read
are still owed, because "every baseline will differ" predicts nothing about
_how_.

**Deletion is not a rebaseline.** A removed capture's PNGs go in the commit that
removes the capture, which touches the spec and `src/` and is therefore outside
the isolation rule above. Nothing in the machinery will ever prompt this —
Playwright never deletes an orphan and `changed` mode never touches one, so an
orphaned PNG is invisible to CI permanently.

**Three things this rule is not.**

- **It is not retroactive.** `bb65c52`'s fourteen unaccounted files stay formally
  unadjudicated. Eleven of its eighteen were already rewritten by `81cb249`, and
  a rebaseline supersedes its predecessor's images completely, so the debt on a
  superseded image is not merely unpaid but **unpayable**. #366 adjudicated the
  one that mattered.
- **It is not a gate.** Every gate in this repo proves a fact about code; this
  one could only prove that a body exists and that its file count matches the
  diff, and a presence gate teaches filler. The one place a future gate could
  legitimately go is an orphan check, and even that is refused for now — three of
  the seventeen names are generated by a loop, so a static check would have to
  evaluate the spec, and the cost of missing an orphan is bytes.
- **It is not an escape hatch for a branch that wants to be green.** e2e is
  CI-only and a red catalogue blocks nobody; #405's own landing deliberately
  holds a branch red between two dispatches. "The branch needs to be green" is
  precisely the pressure that produced `bb65c52`, and left unstated it gets
  re-litigated.

**The vocabulary stays in this record.** _Cause_, _the account_, _measured_,
_attributed_ and _unattributed_ do not go in `CONTEXT.md`. That file is the
domain and UI-primitive language and is disciplined about carrying no process or
testing terms; this is vocabulary for one document about one commit shape.

## Consequences

**The catalogue gets stricter in three independent ways at once, and every
baseline may move for it.** A tighter threshold, a deleted budget and a split
monolith are three separate reasons for a file to be rewritten, which is why
#405's landing sequences them and forbids a commit between its two phases: the
second dispatch's diff set is the only direct measurement this argument has ever
had, and it is readable only if tolerance is the sole variable.

**Nothing here is implemented by this record, and the handoff is three tickets.**
#406 carries §1's split; #405 carries §2 to §4 as one config block, one deleted
option and one gate, plus the two dispatches that measure them; #404 is the
instrument §8's measured tier needs and lands before either. §5 to §7 are
statements rather than work — §5's refusals are already the state of the config,
§6 names guards that exist, and §7's ruling is that the column stays.

**A rebaseline stops being a chore and becomes a piece of writing.** The
denominator is a `wc -l`, the causes come out of `git log`, and one measured read
per cause is a `scripts/baseline-diff.mjs` invocation — but somebody has to
decide what the cause _is_, and that is the work. This is deliberate. The
practice already existed unwritten and was already better than `bb65c52`:
`81cb249` names all eleven of its moved files, separates the five new ones, and
volunteers its own weaker grade out loud — _"attributed rather than proven
per-pixel."_ This record promotes that sentence to a rule.

**The obligation lives in four places and is stated in full in exactly one.**
Argument here; one bullet in `CODING_STANDARDS.md` §9 and one review checklist
line, both citing this record by number; the procedure in `e2e.yml`'s header,
which is the file you are looking at when you dispatch; and one pointer sentence
in `AGENTS.md` §1. **No mirroring pair.** That device exists in `AGENTS.md` §3
only because that file is always in context and `CODING_STANDARDS.md` is not, and
a pointer discharges the need here. No new `docs/agents/` page: a fifth home is a
fifth thing to rot.

**Splitting the monolith moves the suite's cost from wall-clock to CPU**, and
both directions are measured: ~+6 s of serial CPU, but a lower wall-clock floor
at `workers: 2`. It also removes the one place where a mid-script interaction
failure could hide two screens, which #368 hit in three runs out of three.

**A `test(visual)` commit is now load-bearing prose, and prose rots.** Nothing
checks that a cause is real, that an attribution is honest, or that the measured
file was the right one to measure. §8 refuses a gate for that on purpose, and the
cost of the refusal is that this rule is enforced by review alone.

**Two joints are weaker than the rest, and both are named rather than smoothed
over.**

- **§3's lower anchor is a judgement, not a measurement.** `--ink` against
  `--text-primary` "must pass" because the palette reads as treating them
  interchangeably; nobody has measured that no real regression lives in that gap.
  The upper anchor and the four confusions _are_ measured. If the lower anchor is
  wrong the bracket's floor moves and `0.05` moves with it — which is why the
  gate asserts the anchors rather than the number.
- **§8's coverage clause has no precedent to lean on.** Cause-and-verdict is
  `81cb249` written down, and the measured/attributed split is `81cb249`'s own
  phrase promoted. But "every moved file assigned to a cause" has never actually
  been done; `81cb249` came closest and still left two files under a four-item
  list of maybes. #405's phase 1 is where we find out whether twenty files really
  do fall under twelve causes, or whether three fall under none and §8's clause 5
  carries more weight than this record assumes.

**What none of this reaches is a change that moves no pixels above `0.05` and
breaks something anyway.** The catalogue photographs seventeen screens, fourteen
of them at two sizes; everything else in the app is guarded by the invariant specs, the unit
tier, or nothing. Tightening a tolerance narrows the gap between "the picture is
the same" and "the screen is the same". It does not close it, and this record
does not claim it does.

## Amendment (2026-09-08): the counts in this record are byte comparisons, and the comparator's are lower

The instrument §8 clause 3 names now exists (`scripts/baseline-diff.mjs`, #404),
and the first thing it did was disagree with this record.

Pointed at the pair clause 3 holds up as the shape to aim at — `bb65c52`'s
`food-nova-explainer-Mobile-Chrome-linux.png`, the capture #366 adjudicated — it
reports **352** changed pixels in rows 0 to 360, ratio 0.00205. The figure this
record and the #365 map quote is **437**, exactly column 0, all 437 rows, ratio
0.0025 — §6 calls it a "437-pixel full-height column", and at the tolerance the
suite runs at it is neither 437 nor full-height.

Both readings are of the same two files and both are right about different
things. 437 pixels differ **at all**: that is a byte comparison, which is what
every throwaway script in this map ran. 352 is what `getComparator("image/png")`
counts at `threshold` 0.2, the other 85 being pixels under that tolerance or
dropped by the antialiasing detector §2 names. The map never had
the second number because it never asked the comparator.

**The number an account quotes is the comparator's**, because the account is
about a file the suite refused and the suite's refusal is the comparator's
verdict. The tool prints both for exactly this reason: a reader who reproduces a
measurement by comparing bytes gets the larger figure, and with only one of them
published there is no way to tell which of the two readings is the wrong one.

What this does not touch is the geometry, which is why clause 3's exemplar
sentence survives intact. The delta is still column 0 and still a border seam
moving `srgb(48)` to `srgb(150)` — 330 pixels of it, with a further 22 from
`srgb(51,52,48)` to the same grey. §3's bracket is unaffected: it is derived from
YIQ deltas between tokens, not from any count.
