# V1 Milestones & Execution Order

- [x] **Environment Setup:** Construct a foundational `flake.nix` that mounts Node.js, `pnpm`, and SQLite. Initialize a Svelte + TypeScript project workspace using Vite.
- [ ] **Storage Engine Validation:** Spin up the multi-threaded Web Worker layer running SQLite WASM. Write a test asserting that OPFS database handles survive full browser tab refreshes and application restarts.
- [ ] **The EAVT Ingestion Layer:** Build TypeScript transformation scripts that take structured payloads (like `foodTwin` or `swingHabit`) and flatten them cleanly into valid `datoms` database execution inputs.
- [ ] **Open Food Facts Integration:** Implement the standard barcode scanner/lookup interface, mapping API responses straight into immutable digital twins inside the storage layer.
- [ ] **Habit & Event Wiring:** Finish the structural behavioral tracking modules, outputting automated timestamped event records targeting designated component entities.
- [ ] **Reactive UI Layer:** Build reactive Svelte stores that subscribe to the Web Worker's RPC queries, verifying that user interface components redraw immediately upon database updates.
