# 12. Nix-Driven Reproducible Development Environment

**Status:** Accepted  
**Implemented:** `flake.nix`, `flake.lock`

Date: 2026-06-22

## Context

Collaborating on modern web projects often introduces version mismatch friction across Node.js runtimes, package managers, and database command-line tools. In local-first architectures like Inventoria, this is exacerbated by:

1. **SQLite Native Binaries:** Different OS versions running mismatched CLI versions.
2. **Playwright Browser Sandboxing:** System-level library dependencies for headless browser automation (specifically chromium, webkit, and firefox) that frequently fail in CI or under NixOS due to dynamic linker pathways.
3. **Tooling & LSPs:** Ensuring all contributors share identical language servers (for Svelte, Nix, TypeScript, Markdown, YAML) to prevent linting/formatting divergences.

Normally, developers would be instructed to install these tools globally on their systems or rely on system packages via `apt`, `brew`, or `nix-env`.

## Decision

We use Nix Flakes (`flake.nix`) to manage and isolate the entire development environment. All key tools and libraries are resolved hermetically:

1. **Runtimes & Build Tools:** Sourced via unstable nixpkgs (e.g. `nodejs_latest`, `pnpm`, `sqlite`).
2. **Playwright Integration:** We package `playwright-driver` and its precompiled browsers within the Nix environment, and expose them via environment variables in `shellHook`:
   - `PLAYWRIGHT_BROWSERS_PATH` is linked directly to the Nix-built Playwright browsers.
   - `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` prevents Playwright from executing network fetches.
   - `PLAYWRIGHT_CLI_EXECUTABLE` points to the Nix-built CLI.
3. **Editor Assistance (LSPs):** Bundled into the environment shell (e.g. `svelte-language-server`, `typescript-language-server`, `nil`, `marksman`).

System-level packages are explicitly banned from manual installation rules.

## Consequences

- **Positives:**
  - Standardized, zero-install environment initialization (`nix develop` or `direnv allow`).
  - No "works on my machine" issues for browser testing. Playwright tests execute locally exactly as they do in CI.
  - Eliminates dynamic linker errors under NixOS environments by using wrappers from Nixpkgs.
- **Negatives:**
  - Requires contributors to have Nix installed on their machines.
  - Initial instantiation can have a high compile/download duration due to packaging browsers.
