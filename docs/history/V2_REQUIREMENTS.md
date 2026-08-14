> **Historical.** This document is superseded and is kept only as a record of
> how the project got here. Nothing in it is current. See
> [docs/history/README.md](README.md).

# V2 Domain Implementations

V2 expands upon the solid EAVT foundation and unified physical digital twin tracker by introducing direct environmental inputs (Camera, Real-Time scanning) and advanced AI multimodal analysis.

## Module A: Environmental Ingestion (Camera & Scanning)

The user interface transitions from static manual entries to dynamic camera inputs to reduce user friction when logging real-world items.

### 1. WebRTC Barcode Scanner

Instead of typing GTIN barcodes manually, the UI streams the device's camera to decode standard product barcodes automatically.

- Fallback: Manual Entry is still present if the scanner fails to detect.

### 2. Open Food Facts (OFF) Contributions

A new capability is introduced: When a barcode does not yield results from the OFF database, the user can type in the nutritional information manually and choose to push this data back up to the OFF public dataset.

## Module B: AI Package Analysis

For custom foods or undocumented items, taking a photo of a nutrition label or package front will automatically extract the name and nutritional macros (Calories, Protein, Fat, Carbs) using a Multimodal LLM endpoint.

### Autofill Integration (JSON to Datoms)

```typescript
// Incoming Autofill Result
const aiAutofill = {
  name: "Local Sourdough Bread",
  calories: 210,
  protein: 8,
  fat: 1.5,
  carbs: 40,
};
```

These extracted values pre-populate the manual entry form, which then gets stored into the EAVT ledger as standard `food:custom_*` twins.

## Module C: Sync & Export (Upcoming)

With the local-first architecture solidified via OPFS SQLite, V2 will introduce capabilities to back up the immutable event ledger externally and sync changes between devices using basic append-only log shipping or WebRTC peer-to-peer syncing.

## Module D: Performance & Architecture Scalability

As the EAVT ledger grows with thousands of media and food events, the current state projection mechanisms will need optimization to maintain a snappy, local-first UX.

### 1. State Projection Optimization

- **Differential Updates:** Instead of rebuilding the entire state by processing all datoms on every append event, implement a differential update system where only newly appended datoms are processed against the existing state tree.
- **Web Worker Offloading:** Shift the chronological folding logic (`computeMediaLibraryState` and equivalent functions) from the main UI thread to a dedicated Web Worker to prevent UI blocking during large state reconstructions.

### 2. Algorithmic Efficiency

- **Event Target Resolution:** Optimize event matching (currently $O(N \\times M)$ where N is entities and M is events) by pre-grouping events into a map indexed by `target_id`. This reduces the hydration complexity to $O(N + M)$, which is crucial for large ledgers.
