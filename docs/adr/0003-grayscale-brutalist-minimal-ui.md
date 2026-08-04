# 3. Grayscale Brutalist Minimal UI Aesthetic

Date: 2026-05-31

## Status

Accepted

## Context

For the MVP of Inventoria, we needed a distinct visual identity that stepped away from generic "AI-generated" aesthetics (such as purple gradients on dark backgrounds, heavily rounded corners, and soft glassmorphism). The UI needed to reflect the core nature of the application: a rigid, technical, and precise append-only ledger for tracking food and habits.

## Decision

We adopted a **Monochrome Brutalist Minimal with Semantic Accents** aesthetic for the frontend UI architecture. This decision enforces the following design and CSS rules across the application:

1. **Typography:** We standardized on `Epilogue`, a highly structured geometric sans-serif, abandoning overused generic fonts like `Inter`.
2. **Color Palette:** The UI is predominantly grayscale (`#000`, `#fff`, and specific zinc grays like `#fafafa`). However, to address usability concerns, we inject highly specific, pure minimal colors for semantic states: an acid green (`#ccff00`) for success, a pure striking red (`#ff3333`) for error, and a sharp yellow (`#ffcc00`) for warnings. These are used sparingly as backgrounds with black text or black borders to maintain the raw brutalist feel.
3. **Shape & Shadow:** All `border-radius` values are strictly set to `0` for sharp, brutalist corners. Soft box-shadows and backdrop blurs were removed entirely, replaced by stark `1px` or `2px` solid black borders and solid, un-blurred black dropshadows (e.g., `box-shadow: 8px 8px 0 rgba(0, 0, 0, 1)`).
4. **Motion:** Animations are sharp, immediate transforms (snapping positions, inverting colors) rather than soft, floaty transitions.

## Consequences

- **Positive:** The MVP has a striking, premium, and highly recognizable aesthetic that accurately feels like a technical ledger. It avoids the generic SaaS template look and maintains extremely high contrast for readability.
- **Positive:** By re-introducing sharp, pure semantic colors (red/green/yellow) in a brutalist style, we resolve the UX trade-off of a purely grayscale UI, ensuring that users can immediately recognize error, success, and warning states without sacrificing the raw aesthetic.
- **Update:** The edge-and-elevation recipe named only by example above (border + `border-radius: 0` + solid offset `box-shadow`) is now tokenized as the canonical interface — see ADR-0038 (`--edge`, `--shadow-1/2/3`, `--radius`, `--ink`/`--paper`), with a stylelint rule enforcing it.
