# Docs Journal

<!-- Newest entry first. Appended by the diataxis skill; safe to edit by hand. -->

## 2026-07-06 (fix-up) — scope base 0568955

**Scope:** post-mortem corrections after two independent reviews of the first run, plus
recording that ADR-0020's HLC ordering landed in code (`0568955`).

**Correction of the record:** the entry below claims the glossary Used-in lines "were set
against the pages linking each term this session". They were not: they were authored
predictively and ten of twenty-two were wrong. Fixed this session; the new `check-docs.sh`
now verifies them by grep, so the claim can no longer be hand-waved.

**Done:**

- Seeded `docs/check-docs.sh` (from the diataxis skill's template): style greps, paragraph
  bounds, link/anchor resolution, nav-vs-index.html consistency, Used-in verification,
  re-render stability. All checks pass.
- Fixed the ten Used-in drifts: linked `ledger` and `Habit Lineage` on first use in
  `eavt-vocabulary.html` (two drifts fixed at the source); Provenance and Note now also
  name `append-only-ledger.html`; six terms no page links yet say "none yet".
- `render-adrs.sh` now extracts the nav from `index.html` instead of carrying a fourth
  hand-maintained copy, and the ADR index separates titles with `·`, not an em-dash
  (twenty of them shipped in the first run's chrome).
- Marked ADR-0020 implemented (commit `0568955`, `src/lib/db/hlc.ts`) and re-rendered the
  corpus; `append-only-ledger.html` no longer narrates the decision as pending direction.
- `RESOURCES.md`'s Datomic annotation no longer embeds a repo-behavior claim (it had gone
  stale within hours); repo facts live in ADR-0020.
- The introduction's closing now sends each audience to a distinct door: returning author
  to the glossary, architecture reader to the explanation page and the ADR index.

**Deferred:** unchanged from the entry below — the Tutorial and How-to quadrants, the
Schedule Rule and projection-registry reference pages.

## 2026-07-06 — 49aeba8

**Scope:** first run, from an empty site tree at HEAD 49aeba8 (no prior journal). Built the
Diátaxis skeleton spanning Reference, Explanation, and the ADR corpus.

**Done:**

- Seeded `docs/assets/style.css` from the skill template.
- Wrote `index.html` (introduction): problem-first opening flowing into vision then mechanism,
  with an ecosystem SVG. Motivation grilled from the user: a local-first ledger owning
  everything, self-built for extensibility, kept legible for future LLM-driven workflows.
  Audience settled as future-self, secondarily the architecture-curious developer.
- Wrote `glossary.html` (Reference): all 22 `CONTEXT.md` terms, grouped by code seam,
  description-only projection citing `CONTEXT.md` as source of truth.
- Wrote `append-only-ledger.html` (Explanation, titled "State Is a Reading of the Past"): why
  the store is immutable, the fold to current state, the Datomic lineage and where Inventoria
  diverges, the fold cost and its CQRS escape hatch, and the CRDT op-log connection.
- Wrote `eavt-vocabulary.html` (Reference): entity prefixes and attribute namespaces computed
  from `src/` this session, a datom-anatomy sketch, and the Rich Hickey / Datomic attribution.
- Rendered all 19 ADRs via a checked-in `docs/render-adrs.sh` (pandoc, GFM) into `adr/*.html`
  plus `adr/index.html`; one spelled-out nav entry "Architectural Decision Records" on every page.
- Created `docs/RESOURCES.md` with the Datomic data-model source.
- Wrote **ADR 0020** (order datoms by a conflict-free logical clock, not a bare wall-clock key),
  arising from a design discussion the doc work surfaced, and re-rendered the ADR corpus (now 20).
  Folded a short version into the explanation page's Datomic-divergence section.

**Domain model / decisions (domain-modeling):**

- Added **Projection** to `CONTEXT.md` as the read-side counterpart to Ledger. The code and
  ADR-0015/0019 already used the term; the domain glossary did not name it. The site needed it
  and does not invent domain language, so it was defined at the source first.
- ADR 0020 records the decision to replace wall-clock `time` as the ordering/identity key with a
  logical clock (HLC or `(time, device_id, counter)`), and to explicitly reject the fuller
  Datomic machinery (reified transactions, add/retract Op, covering indexes, bitemporal history)
  as the wrong trade for a browser database. Grounded in the ADR-0018 last-write-wins data-loss
  edge and ADR-0014's merge-on-sync design.

**Defect surfaced and fixed:**

- `docs/adr/0005-*.md` carried a committed git merge-conflict marker (`# 5.` vs `# 10.` title).
  Resolved to `# 5.` (matching the filename) with the user's approval so it renders cleanly.

**Evaluate:**

- Mechanical checks pass on the four authored pages: zero em-dashes, zero word-tells, every
  glossary anchor resolves, nav complete on every page, the Datomic claim sourced.
- Compass pass by a fresh sub-agent flagged two over-length paragraphs in the introduction, one
  in the explanation, and one rationale clause creeping into the EAVT Reference page
  ("load-bearing, not cosmetic"). All four fixed.

**Deferred:**

- **Tutorial quadrant is empty**, the biggest gap. A "Log your first meal" lesson run live
  against the running app, with real pasted outputs, is the natural first tutorial. Held for a
  session with the dev server up (`pnpm dev`).
- **How-to quadrant is empty.** Top candidates: "How to add a new tracked domain" (the
  extensibility the project was built for) and "How to run Inventoria locally" (quarry the README).
- **Introduction sourcing.** The intro names external data sources (Open Food Facts, USDA, TMDB,
  Open Library) and core tech (SQLite WASM, OPFS, Svelte) as repo-integration facts without
  per-source `RESOURCES.md` links. Re-examine if a later page makes a behavioural claim about one.
- **Glossary Used-in lines** were set against the pages linking each term this session; keep them
  current as tutorial and how-to pages land (most terms currently point only at EAVT Vocabulary).
- Candidate Reference pages for next time: the Schedule Rule JSON shape (six recurrence paradigms)
  and the projection registry, both high-value for future-self.
