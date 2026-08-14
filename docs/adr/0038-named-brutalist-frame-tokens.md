# ADR 0038: Named brutalist frame tokens (edge, elevation, ink/paper)

**Status:** Accepted  
**Date:** 2026-08-04  
**Amended by:** ADR-0039 (narrows how these tokens may be applied: `Button` and `Card` become their canonical carriers)  
**Implemented:** #71-#75, plus #75 (colour) and #83 (radius, shadow shape, colour keywords) for the §Enforcement lint rules

## Context

Inventoria's design system stops at colour. `app.css` defines colour, space and
type tokens in ~97 lines — but the **edge-and-elevation recipe that _is_ the
ADR-0003 brutalist identity** (border + `border-radius: 0` + solid offset
`box-shadow`) has no name. So it is copy-pasted across the component `<style>`
blocks of 73 components, and it drifts.

Measured on the working tree at grilling time:

- Raw `#000` appears **429×**, `#fff` **172×** — despite `--border-accent` /
  `--accent` tokens already existing (and largely bypassed: 12 / 6 uses). Even
  `ui/Button.svelte` and `ui/Card.svelte` hardcode `#000`/`#fff`.
- `border: Npx solid #000` re-declared by hand: `2px` **95×**, `1px` **16×**,
  `3px` **6×**, `4px` **2×**.
- The offset `box-shadow` recipe appears across **six distinct black depths** —
  `4px`(19×), `3px`(7×), `2px`(7×), `8px`(4×), `6px`(1×), `1px`(1×) — plus
  colour/inset state variants (a `green-bg` hover-lift, an `inset 2px` on
  inputs, an `rgba` softener).
- `border-radius: 0` restated **36×**.

In codebase-design terms, `app.css` is a **shallow** module: the interface each
component must restate (border + radius + shadow, at every site) is nearly as
wide as what a real token module would hold. Deepening it shrinks the interface
to a couple of token references and concentrates the identity in one module.
**Leverage:** one edge token, 95 call sites. This ADR operationalises the prose
of ADR-0003 §3, which names these values only by example.

## Decision

**Name the brutalist frame as CSS custom properties in `app.css`, migrate the
literals onto them, and lint the literals out.** The vocabulary covers the full
recipe — edge, elevation, radius, _and_ the ink/paper fill pair — because a
half-named system invites the same drift back: a lint rule cannot ban raw `#000`
if fills still legitimately need it un-tokenised.

### The vocabulary

```css
:root {
  /* Ink & paper — the pure brutalist fill/edge pair */
  --ink: #000;
  --paper: #fff;

  /* Edge — full-shorthand, ink baked in; 3 steps */
  --edge-thin: 1px solid var(--ink); /* subtle: Card, Button borders */
  --edge: 2px solid var(--ink); /* default (the 95× case) */
  --edge-thick: 3px solid var(--ink); /* emphasis */

  /* Square corner — the deliberate brutalist intent, not a variable value */
  --radius: 0;

  /* Elevation — solid un-blurred offset; 3 steps */
  --shadow-1: 2px 2px 0 var(--ink); /* subtle */
  --shadow-2: 4px 4px 0 var(--ink); /* default card */
  --shadow-3: 8px 8px 0 var(--ink); /* hero / modal */
}
```

A component's edge interface shrinks from three restated rules to
`border: var(--edge); border-radius: var(--radius); box-shadow: var(--shadow-2)`.

- **Full-shorthand edge tokens, ink baked in.** `--edge` is the whole
  `2px solid var(--ink)`, not a bare width — one reference per call site, and it
  composes with per-side borders (`border-bottom: var(--edge)`). The three steps
  map three intents; `1px` is load-bearing (Card and Button deliberately use the
  lighter edge), so it is its own step, not drift. The 2 `4px` sites snap to
  `--edge-thick` (3px). Subtle **non-black** dividers keep the existing
  `--border: #e4e4e7` token — `--edge*` is specifically the black brutalist edge.

- **Three elevation steps, with a recorded snap.** The six observed black depths
  collapse to three intents — _subtle_ (1–2), _default card_ (3–4), _hero_ (6–8).
  The migration snaps `1px→--shadow-1`, `3px→--shadow-2`, `6px→--shadow-3`,
  which grows the seven `3px` sites to `4px` and the one `6px` site to `8px`.
  This is a small, deliberate, brutalist-tolerable visual nudge — reviewers
  eyeball the snapped sites; it is not accidental. The colour/inset shadow
  variants (`green-bg` hover-lift, `inset`, `rgba`) are **state effects, not
  elevation steps**, and stay as bespoke per-component rules.

- **`--radius: 0` is a named intent, not noise.** Its value never varies, but it
  distinguishes "the brutalist square corner" from legitimate `border-radius: 50%`
  circle geometry (Button's spinner, the calorie ring, avatars). Those 50% sites
  stay literal. The token gives the future lint rule a precise target: a literal
  non-zero, non-50% radius is drift.

- **Tokens only — no `.frame` primitive class.** The edge bundle is not constant
  (shadow depth varies, some frames have no shadow, some use `--edge-thin`, hover
  swaps to a colour lift), so a single `.frame` class would fragment into
  `.frame`, `.frame-thin`, `.frame-raised`, … — re-creating the drift. And a
  global utility class fights Svelte's scoped-style idiom; the `:global`-skin
  precedent (ADR-0036/0037) is _component-scoped_ `:global` inside a bits
  wrapper, not a global utility in `app.css`. The tokens already deliver the
  leverage. The migration therefore stays a pure literal→`var()` find-replace
  with zero new class semantics.

- **Fold `--border-accent` in; keep `--accent` distinct as deferred debt.**
  `--border-accent` is exactly `#000000` — it becomes `var(--edge)` / `var(--ink)`
  and is retired. `--accent` (`#09090b`, zinc-950) is a _different_ colour — the
  near-black text/focus tone, which also duplicates `--text-primary`. Folding it
  into `--ink` would be a real visual change, so it is left alone and the
  "two near-blacks (`#000` ink vs `#09090b` text) + `--accent` duplicates
  `--text-primary`" reconciliation is **acknowledged tech debt, deferred**.

### Enforcement

Stylelint enforces the three brutalist invariants of ADR-0003 §3 **outside
`app.css`** (token definitions legitimately live there), so drift fails CI
instead of relying on reviewer vigilance. Each rule lands _last_, once no
literals remain — added earlier it would fail CI immediately.

- **Colour** (#75): `color-no-hex` plus a `declaration-property-value-disallowed-list`
  banning `#000`/`#fff` on colour properties. #83 **tightened** this to also ban
  the `black`/`white` keyword equivalents (`/\b(black|white)\b/i`), closing the
  keyword gap.
- **Radius** (#83): a `declaration-property-value-allowed-list` on `border-radius`
  admitting only `0`, `var(--radius)`, the `var(--…, var(--radius))` fallback
  idiom, and `50%` (legit circle geometry). The set of legal radii is closed, so
  an allow-list — not a disallowed-list — is the right shape.
- **Shadow shape** (#83): a `box-shadow` entry on the disallowed-list matching a
  non-zero **blur** (third length) — every brutalist shadow is blur-`0`
  (offset/spread/inset), so only _blurred_ soft shadows are the anti-pattern.
  Shadow colour is already covered by `color-no-hex`.

All three are hard-fail. During #83's cleanup the six `999px` "pill" radii and
WeekStrip's `0 4px 12px` soft drop-shadow were flattened as **drift, not
sanctioned** — square corners and the sharp `--shadow-2` offset are the brutalist
intent, not a style the tree ever chose.

### Scope boundary

The semantic-accent tokens `--green: #000` / `--red: #fff` / `--amber: #000` are
misnamed (they are the ink/paper _foreground_ on the `*-bg` backgrounds, not
greens/reds) and are now just `var(--ink)`/`var(--paper)`. Rationalising the
semantic-accent vocabulary is ADR-0003 §2 territory and is **out of scope here**;
it is carved out as its own impl ticket.

## Consequences

- **Positive:** The brutalist identity lives once. The interface each component
  restates shrinks to a couple of token references; new components inherit the
  recipe instead of re-deriving (and re-drifting from) it. The lint rule makes
  ADR-0003 mechanically enforceable for the first time.
- **Positive:** `Button`/`Card` adoption and any future "lint ADR-0003" work
  (the sibling grilling candidates) now have the tokens they assumed.
- **Neutral / watched:** A small deliberate visual change ships with the shadow
  snaps (`3px→4px`, `6px→8px`). No other visual change is intended; the ink/paper
  and edge migrations are value-for-value.
- **Deferred:** the two-near-blacks reconciliation (`--accent`/`--text-primary`)
  and the semantic-accent renaming are logged as follow-on debt, not resolved
  here.

## Implementation

Cut from grilling #68 as five `ready-for-agent` tickets, expand→migrate→contract:

1. **Expand** — add the tokens to `app.css` (additive, blocks all).
2. **Edge migration** — border/radius/shadow literals → tokens, all dirs,
   `ui/` first as pattern-setter, dir-batched commits, snapped sites eyeballed.
3. **Fill migration** — `#000`/`#fff` inversion fills → `--ink`/`--paper`;
   retire `--border-accent`. (After edges — same files.)
4. **Contract** — the stylelint rule.
5. **Semantic-colour cleanup** — the deferred `--green`/`--red`/`--amber`
   misnaming (parallel; needs ink/paper only).

Each migration batch is verified with `pnpm check`, `pnpm lint:css`, and a
dev-server + Chrome-MCP eyeball.
