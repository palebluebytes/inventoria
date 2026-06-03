# V1 Milestones & Execution Order

- [x] **Environment Setup:** Construct a foundational `flake.nix` that mounts Node.js, `pnpm`, and SQLite. Initialize a Svelte + TypeScript project workspace using Vite.
- [x] **Storage Engine Validation:** Spin up the multi-threaded Web Worker layer running SQLite WASM. Write a test asserting that OPFS database handles survive full browser tab refreshes and application restarts.
- [x] **The EAVT Ingestion Layer:** Build TypeScript transformation scripts that take structured payloads (like `foodTwin` or `swingHabit`) and flatten them cleanly into valid `datoms` database execution inputs.
- [x] **Open Food Facts Integration:** Implement the standard barcode scanner/lookup interface, mapping API responses straight into immutable digital twins inside the storage layer.
- [x] **USDA FoodData Central API Integration:** Integrate the USDA FoodData Central API to search and retrieve nutrient/ingredient data for food-related twins, mapping payloads to standard digital twins in the ledger.
- [x] **Habit & Event Wiring:** Finish the structural behavioral tracking modules, outputting automated timestamped event records targeting designated component entities.
- [x] **Reactive UI Layer:** Build reactive Svelte stores that subscribe to the Web Worker's RPC queries, verifying that user interface components redraw immediately upon database updates.
- [x] **Calorie Tracking & Recipe Management:** Build Fud-AI-styled dashboard, add food/ingredient searches, photo-based logs, and recipe creations with multiple USDA/OFF ingredients and source scraper links.
- [x] **Naming Standardization:** Standardize on snake_case `meal_type` across database schema attributes, stores, components, and tests.
- [x] **Media Twin Ingestion:** Build TMDB and Open Library API integrations, mapping payloads to standard media digital twins in the ledger.
- [x] **Engagement Event Wiring:** Implement UI and schema support for `WatchAction` and `ReadAction` Engagement Events, including the shared media status enum (`saved`, `started`, `progress`, `completed`).
- [x] **Media Dashboard UI:** Build the unified Media Library dashboard for tracking movies, books, and TV shows. Include Kanban-style grouping based on the shared media status enum (`saved`, `started`, `progress`, `completed`).
- [x] **Personal Deployment & PWA:** Configure static asset serving via Cloudflare Workers assets binding, enable cross-origin isolation headers for SQLite WASM, and establish a PWA with "prompt for update" notification.

# V2 Milestones & Execution Order

- [x] **V2 - Camera & AI Autofill:** Add camera barcode scanner UI, manual entry fallback form, and AI autofill via package photo stub.
- [x] **V2 - Open Food Facts Contribution:** Implement contribution stub to push manually entered nutritional details back to Open Food Facts API.
- [ ] **V2 - Production AI Pipeline:** Wire up the AI autofill feature to a real multimodal LLM endpoint.
- [ ] **V2 - WebRTC/Native Camera Integration:** Replace the mocked camera overlay with real device camera streams using the MediaDevices API.
- [ ] **V2 - Data Export & Sync:** Build local-first synchronization and export options for the EAVT ledger.
