# AI Agent Directives: Inventoria

You are working on Inventoria, a local-first Progressive Web App (PWA) built with Svelte and organized via Nix flakes.

## 1. Tooling & Environment (Strict)

- **Environment Management:** The project uses Nix flakes. System-level tools (Node, pnpm, SQLite CLI) are provided by `flake.nix` inside a `nix develop` shell. Do not suggest installing global system packages via apt, brew, or npm.
- **Package Manager:** Use `pnpm` exclusively within the Nix environment. Never run `npm`, `yarn`, or `bun`.
- **UI Framework:** Svelte (using strict TypeScript). Leverage Svelte's native fine-grained reactivity for UI updates.
- **Script Execution:** Use `pnpm dlx` for executing one-off binaries or initialization scripts.

## 2. Progressive Disclosure (Context Routing)

Consult these files for deep domain context rather than hallucinating structures:

- **Database & Architecture:** Read `docs/ARCHITECTURE.md` before touching SQLite WASM, OPFS, or EAVT sync.
- **Domain Logic:** Read `docs/V1_REQUIREMENTS.md` to see exact data shapes for Digital Twins and Habits.
- **Execution Plan:** Consult `docs/TODO.md` to update progress and locate the active milestone.

## 3. Architectural Red Lines

- **Immutability First:** The database is an append-only ledger. NEVER generate `UPDATE` or `DELETE` statements. State shifts are managed solely by appending newer timestamps (`time`).
- **Thread Isolation:** All SQLite execution must occur inside a dedicated Web Worker. The main thread only receives read-only views or emits append actions.

## Agent skills

### Issue tracker

Issues are tracked locally as markdown files in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage status is recorded via standard canonical label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with a global CONTEXT.md and docs/adr/. See `docs/agents/domain.md`.
