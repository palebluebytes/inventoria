# Coding Standards: Inventoria

The engineering rules for contributing code to Inventoria. This is the document
code review checks against.

It complements, and does not replace, three neighbours:

- **`AGENTS.md`** — tooling, environment, and the architectural red lines. Where
  this document and `AGENTS.md` overlap, `AGENTS.md` wins.
- **`CONTEXT.md`** — the ubiquitous language. Every domain concept you name in
  code, tests, or commits uses the term defined there.
- **`docs/ARCHITECTURE.md`** and **`docs/adr/`** — why the system is shaped the
  way it is. Read the ADRs that touch code you're about to change.

The guiding principle behind everything below: **the ledger is the source of
truth, and all state is a pure fold over it.** Most rules are a consequence of
protecting that property.

---

## 1. Non-negotiable invariants

These are the red lines from `AGENTS.md` §3, mirrored here deliberately: that file
is always in an agent's context and this one is not, so both carry them. **If you
change one, change both.** Where the two disagree, `AGENTS.md` wins, but that is a
tiebreaker that should never need to fire.

Breaking one is never a style nit — it corrupts the data model. A change that
violates one does not merge.

### 1.1 The ledger is append-only

- The `datoms` table is immutable. **Never** emit `UPDATE` or `DELETE` against
  it. State changes by appending a newer datom, never by mutating an old one.
- "Undo" is a later cancelling fact, not a deletion. An Execution Event is
  undone by appending an `uncompleted` datom (see `getActiveExecutions` in
  `src/lib/habits/habits.ts`), never by removing the original.
- The only sanctioned table-level destructive operations are `resetLedgerSchema`
  (the user-initiated `clear`), the one-shot ADR-0020 migration, and
  `deleteDatomsByEntityPrefix` — the **ledger half** of the Facet-scoped wipe
  behind "Delete all my food data". All three live in `src/lib/db/db.core.ts`;
  do not add others. That wipe's other half takes the Facet's `localStorage`
  records and is `src/lib/facets/facet-wipe.ts`'s, which is where its predicate
  is derived from the registry rather than authored (ADR-0079 §2, §3).
- **A partial deletion is sanctioned only where its rows are closed under
  reference** (ADR-0079 §1). The first two exceptions are safe because they are
  total: afterwards no fold can produce a wrong answer, because there is nothing
  left to fold. `deleteDatomsByEntityPrefix` is not total, so it can leave rows
  pointing at rows that are gone, and the condition is what stops it. Rations
  satisfies it — every food reference edge stays inside food's own entities, and
  nothing outside food points into food. A future Facet that cannot show the
  same does not get a wipe. Closure is a property of the **ledger**, not of the
  screens: `ACQUISITION_LIBRARY` had to stop promoting food twins (#280) before
  this could ship, even though no datom referenced one.
- **A `VACUUM` is not a fourth.** `vacuumLedger` rewrites the whole file, in the
  same module, and is still not one of these: it hands back the pages a
  sanctioned deletion has already freed, reading every surviving row and writing
  it back, so no argument of it can lose a datom. ADR-0079 §4 requires it — a
  wipe that reclaims nothing is a promise the storage card on the same screen
  disproves.

### 1.2 SQLite runs only in the worker

- All SQLite/OPFS execution happens inside `src/lib/db/db.worker.ts`. The main
  thread never touches the database directly — it sends `append` actions and
  receives read-only Projections over the RPC in `src/lib/db/db.client.ts`.
- Reads are `SELECT`-only. The worker rejects any non-`SELECT` query; keep it
  that way.

### 1.3 snake_case everywhere the ledger is involved

- EAVT attributes, entity-id prefixes, stored values, and **the client
  variables and store properties that carry them** are all snake_case:
  `meal_type`, `selected_meal_type`, `hlc_ms`, `device_id`.
- Never introduce a camelCase equivalent of a ledger concept (`mealType`,
  `deviceId`). `CONTEXT.md` lists these under _Avoid_ for a reason.
- This extends to internal shapes that mirror ledger rows. The HLC clock
  (`src/lib/db/hlc.ts`) returns `{ hlc_ms, hlc_ctr, device_id }` precisely so a
  stamp is written, compared, and read back without renaming a field at any
  boundary. Follow that pattern: if a shape becomes a database row, give it the
  column names from birth.

---

## 2. Architecture & layering

Read state flows in exactly one direction. Keep code in the layer that owns its
concern.

```
Ledger (datoms)  →  Projection SQL  →  pure compute() fold  →  read-only view  →  UI
     ▲                                                                              │
     └──────────────────────────  append(datoms)  ◄───────────────────────────────┘
```

### 2.1 Projections are pure folds

- A **Projection** (`CONTEXT.md`) is the only way the app reads current state.
  It is a `SELECT` paired with a pure `compute(datoms)` function; see
  `src/lib/db/projections.ts` and the `*/state.ts` folds.
- `compute` takes `StoredDatom[]` and returns an enriched set. It is
  **pure**: no I/O, no clock, no randomness, no reaching back into the DB. This
  is what makes projections testable datoms-in / result-out (e.g.
  `tests/unit/habits-state.test.ts`).
- A Projection takes no runtime parameters. It returns the full set for one kind
  of entity; date/slot/range narrowing happens afterward in the UI.
- Ordering and latest-wins are defined against the **logical clock**, not
  wall-clock `time` (ADR-0020). Order datom streams with `compareHlc` /
  `HLC_ORDER_ASC` from `src/lib/db/hlc.ts`; never re-introduce `ORDER BY time`
  for state ordering. `time` remains valid for domain purposes — the millisecond
  a user confirmed an action, and calendar-day bucketing.

### 2.2 Keep logic in its canonical layer

- **`db.core.ts`** owns the schema, the append invariant, and migrations — pure
  functions over a `LedgerDb` handle, testable without the Worker/OPFS layer.
- **`db.worker.ts`** is thin orchestration: receive message → call a core
  function → post the result. Business logic does not live here.
- **`*/state.ts`** owns the fold for its domain; **`*/<domain>.ts`** (e.g.
  `habits/habits.ts`) owns pure domain calculations (scores, streaks, schedules).
- **`stores/`** and **`views/`** own reactivity and presentation. Domain math
  does not leak into a `.svelte` file, and DB details do not leak past
  `db.client.ts`.
- Before writing a helper, look for the canonical one. Ordering →
  `compareHlc`. Datom value parsing → `parseDatomValue`. Entity grouping →
  `groupByEntity`. Don't grow a near-duplicate beside an existing utility.

### 2.3 Respect the domain vocabulary

When code names a domain concept — a type, a function, a test description, an
entity prefix — use the term from `CONTEXT.md` and avoid the synonyms it lists.
A `computeConsumption` fold produces Consumption Events, not "food logs". If the
concept you need isn't in the glossary, that's a signal to reconsider or to
raise it, not to invent parallel language.

---

## 3. TypeScript

The project runs Svelte with strict TypeScript and `checkJs` on
(`tsconfig.app.json`). `pnpm check` must pass with zero errors.

### 3.1 Make boundaries explicit

- Model data with named `interface`s that state the real shape. Prefer a shared
  contract (`Datom`, `StoredDatom`, `HlcKey`) over an ad-hoc inline object that
  drifts between call sites.
- When one type is another plus a few fields, compose it — `StoredDatom extends
Datom, HlcKey`; `HlcKey extends HlcMark` — rather than restating fields or
  maintaining a parallel near-duplicate shape.

### 3.2 Avoid `any`, gratuitous casts, and soft optionality

- `any` and `as any` are debt, not a tool. Some pre-existing folds still carry
  `as any[]` on enriched event arrays; **do not add more**, and prefer to
  tighten one when you touch it.
- Reach for a cast only at a genuine external boundary (the untyped sqlite-wasm
  handle, `MessageEvent.data`). Inside our own code, fix the type instead.
- Don't paper over an unclear invariant with `?` optionality or a silent
  fallback. If a field is always present, type it as present. If a branch relies
  on an invariant, make the invariant explicit (a type, a guard, or a documented
  precondition) rather than a defensive `??`.
- Be consistent about defensiveness. Either a value can be malformed (guard it at
  the boundary, once) or it can't (trust the type everywhere). Don't sprinkle
  lone `Number(...)` / `?.` guards that contradict the declared type elsewhere.

### 3.3 Naming

- `snake_case` for ledger-facing fields and the variables that hold them
  (§1.3). `camelCase` for ordinary local variables and non-ledger function
  parameters. `PascalCase` for types, interfaces, and Svelte components.
- Entity ids carry their documented prefix (`habit:`, `cal_event:`,
  `event:consume_`, `settings:global`). Match the existing prefix scheme; don't
  coin a new one without an ADR.

---

## 4. Functions, modules, and complexity

The bar is **direct, boring, legible code**. Prefer deleting a branch to
centralising it, and a simpler model to a cleverer mechanism.

- **One clear job per function.** Separate orchestration from calculation:
  `computeStreak` derives, `getDailyLineageStates` buckets, `getActiveExecutions`
  resolves undos — each is independently testable.
- **Don't bolt special cases onto unrelated flows.** A new one-off `if` in the
  middle of a busy function is a design smell. Push the case into a dedicated
  helper, a typed dispatch, or a data-driven table (see how
  `projections.ts` collapses five near-identical queries through `inHlcOrder`).
- **No thin wrappers.** An identity pass-through or a helper that only renames
  its argument earns nothing; inline it.
- **Watch file size.** If a change pushes a file from under ~1000 lines to over
  it, stop and decompose first. Extract subcomponents, folds, or helpers rather
  than letting a module sprawl. Treat crossing that line as needing a real
  justification, not a default.
- **Comments explain _why_.** The codebase documents intent and invariants (see
  the header of `db.core.ts` or the ADR references in `hlc.ts`), not mechanics.
  Match that: a comment should say something the code cannot.

---

## 5. Concurrency & data integrity

- **Batches are atomic.** A multi-datom append commits or rolls back as a whole
  (`appendDatoms` wraps the loop in `BEGIN`/`COMMIT` with a `ROLLBACK` on any
  error). New write paths follow the same all-or-nothing shape; never leave state
  half-applied.
- **Surface collisions, don't swallow them.** Appends use a plain `INSERT` so a
  genuine duplicate primary key raises rather than silently overwriting an
  immutable datom.
- **Errors cross the worker boundary as messages.** The worker catches, and
  replies `{ status: "error", error }`; the client rejects the corresponding
  promise. Don't let an exception escape the handler.
- **Don't serialise independent work** for no reason, and don't parallelise
  where ordering matters. Match the structure to the actual dependency.

---

## 6. Testing

- **Unit tests** are `tests/unit/**/*.test.ts`, run by Vitest via
  `pnpm test:unit`. **E2E tests** are `tests/*.spec.ts`, run by Playwright via
  `pnpm test:e2e`. Keep the `.test.ts` / `.spec.ts` split — Vitest only collects
  `tests/unit`. The E2E suite runs in CI on every push
  (`.github/workflows/e2e.yml`); it is not part of the local gate roster in §7.
- **Test the pure core against the real engine.** DB-level invariants are tested
  against the actual sqlite-wasm build, not a mock (`db-append-only.test.ts`,
  `db-migration.test.ts`), because that's where the invariant actually lives.
- **Any change to schema, migration, or the append path ships with a test.** A
  destructive or one-shot data path (migrations especially) is not mergeable
  untested — assert that every fact survives, that the op is idempotent, and that
  the fresh path is unaffected.
- **Inject, don't reach for globals.** Pure modules take their clock and
  randomness as parameters (`createHlc(device_id, { wallClock, seed })`,
  `getOrCreateDeviceId(db, generate)`) so tests are deterministic. Preserve that
  seam; don't call `Date.now()` / `crypto.randomUUID()` where a caller could pass
  it in.
- Name tests in domain vocabulary and assert behaviour, not implementation.

---

## 7. Formatting & tooling

- **Environment:** Nix flakes + `pnpm` only. Never `npm`/`yarn`/`bun`, never
  global installs. One-off binaries via `pnpm dlx`. (See `AGENTS.md`.)
- **Prettier is authoritative** (`.prettierrc`): 2-space indent, double quotes,
  semicolons, `printWidth` 80, `trailingComma: es5`, always-parenthesised arrow
  params. Don't hand-fight it; a Husky pre-commit hook formats staged files.
- **Gates:** `pnpm check`, `pnpm test:unit`, and `pnpm lint:css` must be clean
  before you push — the same roster `AGENTS.md` §1 carries. `pnpm check` runs
  svelte-check, `tsc`, and the docs check, which verifies documentation structure
  across the repo (links resolve, ADR statuses use the closed vocabulary,
  declared supersessions are linked back) plus prose style on the handful of
  pages written to be read start to finish. `pnpm docs:check` runs that last part
  alone when you want a faster loop.
- **`lint:css` keeps the scales and the measurements apart** (ADR-0089 §3). A
  raw px in `padding`, `margin` or `gap` fails: rhythm comes from the fluid space
  scale, and a px is a measurement, which belongs either in `src/app.css` with
  the others (`--tap-min`, `--hairline`) or on a component that names its own —
  see `HabitHeatmap`'s `--cell`/`--seam`, a drawing whose numbers no scale can
  express. A value carrying `env()` is exempt: a safe-area inset is a measurement
  too, and its `0px` fallback is not a spacing decision.

---

## 8. Documentation & decisions

- **Record decisions as ADRs.** A non-obvious architectural or data-model choice
  gets an ADR in `docs/adr/` (see ADR-0020 for the model: Context → Decision →
  Consequences, with an explicit status). Code that implements an ADR references
  it; the ADR is marked implemented when it lands.
- **If a change contradicts an ADR, say so** in the PR rather than silently
  overriding it — surface it as a reopening ("Contradicts ADR-XXXX, but …").
- **Keep the glossary honest.** Introducing a genuinely new domain concept means
  adding it to `CONTEXT.md`, with the synonyms to avoid.

---

## 9. Commits

Follow Conventional Commits, matching the existing log (`git log --oneline`):

```
type(scope): imperative, lowercase subject, no trailing period
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `revert`. Scope reflects the area (`db`, `site`, `adr`, `habits`).
- **One self-contained change per commit.** Split unrelated work; stage with
  explicit paths or `git add -p`, not a blanket `git add -A`.
- **Name the issue in the trailer.** A commit that finishes a ticket ends
  `Closes #NN`; one that advances a ticket it does not finish ends `Refs #NN`.
  Split work is the common case, so a three-commit ticket is two `Refs` and one
  `Closes`. The trailer is what lets a reader arrive from the issue and land on
  the change, and it is the only durable link once the branch is gone.
- **`Closes` fires on `main`, not on your branch.** GitHub honours the keyword
  when the commit reaches the default branch, so a pushed feature branch leaves
  the issue open until it merges. Close it by hand when the work is done and the
  merge is not imminent, and say in the closing comment where it shipped.

---

## Review checklist

A change is ready when:

- [ ] No `UPDATE`/`DELETE` on the ledger; SQLite touched only in the worker.
- [ ] Ledger-facing names are snake_case; no camelCase domain aliases.
- [ ] State reads go through a pure `compute()` Projection ordered by the logical
      clock, in the layer that owns the concern.
- [ ] No new `any`/gratuitous casts; boundaries are explicit typed contracts.
- [ ] No special-case branch bolted onto an unrelated flow; no thin wrapper; no
      file pushed past ~1000 lines without justification.
- [ ] Writes are atomic and roll back cleanly; worker errors return as messages.
- [ ] Schema/migration/append changes carry tests; pure modules stay injectable.
- [ ] `pnpm check`, `pnpm test:unit`, and `pnpm lint:css` pass; Prettier-clean.
- [ ] Non-obvious decisions captured as/against an ADR; new terms in `CONTEXT.md`.
- [ ] Conventional-commit messages, one logical change each, each naming its
      issue (`Closes #NN` when it finishes the ticket, `Refs #NN` when it does not).
