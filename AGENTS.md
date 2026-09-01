# AI Agent Directives: Inventoria

Inventoria is a local-first Svelte PWA that records everything it tracks as
immutable facts in an append-only SQLite ledger running in the browser.

Read `CODING_STANDARDS.md` before writing code. It is the document code review
checks against, and this file deliberately does not restate it.

## 1. Tooling & Environment (Strict)

- **Environment:** `flake.nix` provides Node, pnpm, and the SQLite CLI inside a
  `nix develop` shell. Add tooling there, or reach a one-off binary with
  `nix shell nixpkgs#<pkg>` — never a global `apt`, `brew`, or `npm -g` install.
- **Package manager:** `pnpm` exclusively, inside the Nix shell, with `pnpm dlx`
  for one-off Node binaries. Never `npm`, `yarn`, or `bun`.
- **Verification:** a change is verified when `pnpm check`, `pnpm test:unit`, and
  `pnpm lint:css` are clean. `pnpm check` already chains the docs check, the
  worker-closure check and the entity-ownership check.
- **Entity ids are minted in one place.** `src/lib/facets/entity-id.ts` is the
  only module that may build one, and the prefixes it accepts are declared in
  `src/lib/facets/registry.ts`, one owning Tracked Domain each
  (`docs/adr/0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md`).
  `pnpm check:entities` fails a construction anywhere else. Adding an entity
  prefix means editing the registry and `docs/eavt-vocabulary.md` in the same
  change.
- **The offline gate runs at build time, not in that roster.** `pnpm build`
  chains `scripts/offline-boot-check.mjs`, which fails the build if the app
  cannot reach `mount(App)` with the network off (#125). It needs a `dist/`,
  which is why it is not in the roster above; run it alone against an existing
  one with `pnpm check:offline`. If it reports that the check itself needs
  updating, its browser stubs have fallen behind the app and the build is fine.
- **Browser automation:** drive the app through the Chrome MCP browser tools
  (`mcp__claude-in-chrome__*`) only when the user explicitly asks for it.
  Otherwise describe any manual in-app check for the user to run themselves
  rather than launching the browser unprompted.
- **Playwright belongs to CI.** `.github/workflows/e2e.yml` runs the suite on
  every push. Leave `pnpm test:e2e` and `--update-snapshots` out of your local
  loop — including a single targeted spec — unless the user asks for that run by
  name. Verify with the roster above instead.

## 2. Progressive Disclosure (Context Routing)

Consult these files rather than hallucinating structures. Read the ones that
touch what you are about to change; do not read all of them by default.

| Before you…                                                    | Read                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Name anything                                                  | `CONTEXT.md` — the ubiquitous language, including the UI primitive vocabulary                    |
| Ask why something is the way it is                             | `docs/adr/` — one record per decision; `docs/adr/README.md` explains the conventions             |
| Touch SQLite WASM, OPFS, or the schema                         | `docs/ARCHITECTURE.md`                                                                           |
| Add or change a ledger attribute or entity prefix              | `docs/eavt-vocabulary.md` — the canonical registry; update it in the same change                 |
| Add a whole new tracked domain                                 | `docs/how-to-add-a-tracked-domain.md`                                                            |
| Add or change a Facet, or ask which Facet something belongs to | `docs/adr/0076-a-facet-is-an-installable-face-onto-one-jar.md` — what a Facet is, and the roster |
| Argue about the storage model                                  | `docs/append-only-ledger.md`                                                                     |
| Work an issue                                                  | `docs/agents/issue-tracker.md` — this repo's `gh` conventions                                    |

Work in flight is tracked as GitHub issues, not in a file, and triaged with the
labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and
`wontfix`. `docs/history/` holds superseded planning documents and is not
current; do not take direction from it.

**Every commit on a ticket names it in a trailer** — `Closes #NN` when it finishes
the ticket, `Refs #NN` when it advances one it does not finish. `CODING_STANDARDS.md`
§9 carries the rule, including why `Closes` leaves the issue open until the branch
reaches `main`.

## 3. Architectural Red Lines

These three mirror `CODING_STANDARDS.md` §1, deliberately: this file is always in
context and that one is not. If you change one, change both.

- **Immutability First:** The database is an append-only ledger. NEVER generate
  `UPDATE` or `DELETE` against `datoms`. State shifts are managed solely by
  appending a newer datom, which wins because it carries a later hybrid logical
  clock stamp (ADR-0020), not because of its `time` value. Two sanctioned
  destructive operations already exist — `resetLedgerSchema` (the user-initiated
  `clear`) and the one-shot ADR-0020 migration, both in `src/lib/db/db.core.ts`.
  Do not add others.
- **Thread Isolation:** All SQLite execution must occur inside a dedicated Web
  Worker. The main thread only receives read-only views or emits append actions.
- **Naming Casing:** Always use snake_case for EAVT ledger attributes and
  associated client variables/store properties (e.g. `meal_type` and
  `selected_meal_type`). NEVER introduce camelCase equivalents like `mealType`.
