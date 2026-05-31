# Inventoria (V1)

Inventoria is a local-first Progressive Web App (PWA) built using **Svelte** and a fact-based, append-only Entity-Attribute-Value-Time (EAVT) model running on SQLite WASM via OPFS.

## Getting Started

This repository uses **Nix flakes** for environment reproducibility and **pnpm** for node module management.

1. Enter the development environment:

```bash
nix develop
```

2. Install project dependencies:

```bash
pnpm install
```

3. Launch the Svelte development server:

```bash
pnpm dev
```

## AI Agent Development

The workspace is pre-configured for AI coding tools using the root AGENTS.md directive profile.

Detailed system documentation is split progressively:

- Storage & Web Worker Architecture: docs/ARCHITECTURE.md

- Domain Schemas & Payload Ingestion: docs/V1_REQUIREMENTS.md

- Roadmap Tracker: docs/TODO.md
