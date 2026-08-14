# AI Agent Directives: Inventoria

You are working on Inventoria, a local-first Progressive Web App (PWA) built with Svelte and organized via Nix flakes.

## 1. Tooling & Environment (Strict)

- **Environment Management:** The project uses Nix flakes. System-level tools (Node, pnpm, SQLite CLI) are provided by `flake.nix` inside a `nix develop` shell. Do not suggest installing global system packages via apt, brew, or npm.
- **Package Manager:** Use `pnpm` exclusively within the Nix environment. Never run `npm`, `yarn`, or `bun`.
- **UI Framework:** Svelte (using strict TypeScript). Leverage Svelte's native fine-grained reactivity for UI updates.
- **Script Execution:** Use `pnpm dlx` for executing one-off binaries or initialization scripts.
- **Browser automation:** Only drive the app through the Chrome MCP browser tools (`mcp__claude-in-chrome__*`) when the user explicitly asks for it. Otherwise verify changes with `pnpm check`, `pnpm test:unit`, and `pnpm lint:css`; describe any manual in-app check for the user to run themselves rather than launching the browser unprompted.

## 2. Progressive Disclosure (Context Routing)

Consult these files rather than hallucinating structures. Read the ones that touch
what you are about to change; do not read all of them by default.

| Before you…                                       | Read                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Write any code at all                             | `CODING_STANDARDS.md` — the document code review checks against                      |
| Name anything                                     | `CONTEXT.md` — the ubiquitous language, including the UI primitive vocabulary        |
| Ask why something is the way it is                | `docs/adr/` — one record per decision; `docs/adr/README.md` explains the conventions |
| Touch SQLite WASM, OPFS, or the schema            | `docs/ARCHITECTURE.md`                                                               |
| Add or change a ledger attribute or entity prefix | `docs/eavt-vocabulary.md` — the canonical registry; update it in the same change     |
| Add a whole new tracked domain                    | `docs/how-to-add-a-tracked-domain.md`                                                |
| Argue about the storage model                     | `docs/append-only-ledger.md`                                                         |

Work in flight is tracked as GitHub issues, not in a file. `docs/history/` holds
superseded planning documents and is not current; do not take direction from it.

## 3. Architectural Red Lines

These three mirror `CODING_STANDARDS.md` §1, deliberately: this file is always in
context and that one is not. If you change one, change both.

- **Immutability First:** The database is an append-only ledger. NEVER generate `UPDATE` or `DELETE` statements. State shifts are managed solely by appending a newer datom, which wins because it carries a later hybrid logical clock stamp (ADR-0020), not because of its `time` value.
- **Thread Isolation:** All SQLite execution must occur inside a dedicated Web Worker. The main thread only receives read-only views or emits append actions.
- **Naming Casing:** Always use snake_case for EAVT ledger attributes and associated client variables/store properties (e.g., `meal_type` and `selected_meal_type`). NEVER introduce camelCase equivalents like `mealType`.

## Agent skills

### Issue tracker

Issues are tracked on GitHub via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage status is recorded via standard canonical label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with a global CONTEXT.md and docs/adr/. See `docs/agents/domain.md`.
