# 3. Grayscale Brutalist Minimal UI Aesthetic

**Status:** Accepted  
**Implemented:** `src/app.css`; see the amendments below

Date: 2026-05-31

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
- **Amendment (2026-08-05):** The semantic-accent vocabulary in §2 originally paired each background with a same-named foreground token (`--green`/`--red`/`--amber`, each just `#000` or `#fff`). Once ADR-0038 introduced `--ink`/`--paper` as the canonical black/white foreground pair, those tokens were redundant and their names were actively misleading — `--red: #fff` is not a red at all, it's paper-on-red. The bare `--green`/`--red`/`--amber` foreground tokens are retired; only the `*-bg` background tokens remain (`--green-bg`, `--red-bg`, `--amber-bg`). Call sites now pair a `*-bg` background directly with `var(--ink)` or `var(--paper)` for the foreground, matching whichever reads legibly on that background (e.g. `background: var(--red-bg); color: var(--paper);`). This is a pure rename — no color values changed.
- **Amendment (2026-08-05):** A palette-conformance sweep consolidated the raw hex colour drift that had accumulated across `src/` (duplicate greys, off-brand slate/sky/purple, ad-hoc status colours) onto tokens, so `src/app.css` is now the single place a hex literal is allowed to live. Four new semantic tokens were added: `--red-text`/`--green-text` (dark status foregrounds for text on light surfaces, e.g. FoodStager's over/under-target rows), `--rda-over` (the nutrition over-limit warning rust/amber, previously only referenced via an undefined `var(..., #b45309)` fallback), and `--highlight-bg` (the soft post-it yellow used by note and highlight surfaces). The habit-category badge palette (`HabitDetailHeader.svelte`) was recoloured onto the brutalist accent set: `health` → `--red-bg`, `mind` → `--paper`, and the `default` case → `--border`, all paired with `--ink` text/border, replacing the prior off-brand sky/purple/slate literals. The `HabitItem` agenda-row `:active` press states swapped their hardcoded darker fill (`#b3e600`/`#e6b800`) for `filter: brightness(0.9)`, so the press feedback rides on whatever the row's actual background is instead of a hand-picked shade. With the sweep complete, the stylelint config's `declaration-property-value-disallowed-list` pure-`#000`/`#fff` check is now joined by a total `color-no-hex` rule (still scoped out of `src/app.css`, where token definitions legitimately live) — any new raw hex outside that file is a lint error.
