<script lang="ts">
  import { MEAL_TYPES, type MealType } from "../../food/meal-type";

  // The Way-in bar's meal picker (#453): the chip, and the panel of four it
  // opens. See *Way-in bar* in `CONTEXT.md` and ADR-0095's 2026-09-15
  // amendment.
  //
  // ── Why this is not `ui/Select` any more ──────────────────────────────────
  //
  // It was, and ADR-0095 §2's argument for the native `<select>` was a good one:
  // the platform's list is full-width rows above the tap floor, correct with
  // every assistive technology, on every platform, for zero code. What that
  // argument did not price is what the platform's list LOOKS like. On Android it
  // is a Material dialog — rounded corners, blue radio buttons, system font — in
  // an app that is otherwise square corners, hard rules and ink; on an iPhone it
  // is Safari's own menu. A native select's list is drawn by the OS and nothing
  // but the `option` colours can be styled, so this was never a CSS problem.
  // Reported from a device, and settled on one: three shapes were built on
  // `prototype/meal-picker-skin` and this is the one that won.
  //
  // **The trade is real and it is recorded rather than absorbed**: the app now
  // owns the keyboard, the focus and the dismissal for this control, where
  // before the platform did. What follows is that ownership.
  //
  // ── Why the platform's popover and not bits-ui's ──────────────────────────
  //
  // The prototype used `bits-ui`'s `Popover`, and the fold-in does not, on
  // ADR-0068 §1's own test — reach for bits only where the platform supplies
  // less, not more.
  //
  // `popover="auto"` is Baseline 2024 (Safari 17.4, Chrome 114, Firefox 125) and
  // supplies the two hard parts outright: the **top layer**, so the panel is
  // above everything without a portal or a z-index argument against a Selection
  // bar at 900, and **light dismiss** — an outside tap or Escape closes it, with
  // focus returned to the invoker. What bits adds beyond that is a
  // collision-aware positioning engine, and measured against this repo that is
  // ~32KB of source the app does not ship today:
  // `bits-ui/dist/bits/utilities/floating-layer` plus `popper-layer` and
  // `internal/floating-svelte`. Its `Dialog` — which `ui/Modal` already uses —
  // pulls the dismissible, escape, focus-scope and scroll-lock layers and **no
  // floating layer**, so this would be the first thing in the app to want one.
  //
  // What that engine would have bought is **one flip**, and the honest version of
  // this argument admits it was needed: see `place()`, which opens the panel
  // downward where the bar is at the head of a column rather than at the foot of
  // the band. Twelve lines against 32KB, with no collision geometry beyond the
  // two the bar actually has.
  //
  // The third cost is this repo's own: **a bits portal renders nothing in the
  // server tier**, which is where `tests/unit/` asserts markup (#235). A native
  // popover is an element in the tree, so the panel stays assertable there
  // rather than becoming e2e-only.
  let {
    target,
    onTarget,
  }: {
    target: MealType;
    onTarget: (m: MealType) => void;
  } = $props();

  // Stable per instance, because `popovertarget` is an id reference and the bar
  // is rendered twice on a wide screen (once per position). `$props.id()` is
  // Svelte's own, so it is stable across hydration where a random would not be.
  // `$props.id()` has to be a bare initializer — the compiler rejects it inside a
  // template literal, and `svelte-check` does not (0 errors over the version that
  // would not compile, which is the same gap an unclosed element falls through).
  const uid = $props.id();
  const panelId = `meal-picker-${uid}`;

  let panel = $state<HTMLElement | null>(null);
  let chip = $state<HTMLElement | null>(null);
  let open = $state(false);

  /**
   * Put the panel against the chip: above it where there is room, below it where
   * there is not, and never off the side.
   *
   * A popover is in the top layer, so its `inset` resolves against the viewport
   * and not against the bar it came from — which is the whole point (nothing can
   * clip it) and the one thing it costs. CSS anchor positioning would say all of
   * this declaratively and is deliberately not used: it is Chrome-only at the
   * time of writing, and this app's second platform is the one it is missing
   * from.
   *
   * Measured from the chip rather than derived from the bar's geometry, because
   * the bar stands in three places — full-bleed at the band's foot on a phone,
   * sticky at the head of the day's column at 768, a 22rem flank at 1440 — and
   * the chip's own rect is correct in all three without this knowing which one
   * it is in.
   *
   * **The flip is not optional, and it was measured rather than reasoned.** The
   * first version of this opened upward and said in its own comment that no
   * collision logic was needed, because the bar is anchored to the foot of the
   * screen. That is true of the phone and false of the other two: in the flank
   * the chip's top was 133px down a 989px viewport and the panel is 202px tall,
   * so the browser clamped it to `top: 0` and it covered the day's header with
   * its own bottom half hanging over the chip. One flip, not an engine — but one
   * flip more than the argument for hand-rolling this claimed.
   */
  function place() {
    if (!panel || !chip) return;
    const box = chip.getBoundingClientRect();
    const seam = 2;

    // Horizontal: the chip's own edge, pulled back where the panel would run off
    // the right. A phone puts the chip hard against the left edge, so this only
    // ever bites where the bar has been given a column of its own — and the
    // floor is 0 rather than the seam, because on a phone the plate itself runs
    // to the screen edge and a 2px inset here would put the panel's left rule
    // two pixels off the chip's.
    const overshoot = box.left + panel.offsetWidth + seam - window.innerWidth;
    panel.style.left = `${Math.max(0, box.left - Math.max(0, overshoot))}px`;

    // Vertical: above by preference, because the bar's usual place is the foot
    // of the band and a panel that opens down from there has nowhere to go.
    if (panel.offsetHeight + seam <= box.top) {
      panel.style.bottom = `${window.innerHeight - box.top + seam}px`;
      panel.style.top = "auto";
    } else {
      panel.style.top = `${box.bottom + seam}px`;
      panel.style.bottom = "auto";
    }
  }

  function pick(meal_type: MealType) {
    onTarget(meal_type);
    panel?.hidePopover();
  }

  /**
   * Arrow keys move between the four, which a `<select>` gave for free and a row
   * of buttons does not. Home and End too, on the same argument.
   *
   * Not a `role="menu"`: that claims a menu's full keyboard contract (typeahead,
   * submenus) for four buttons, and the roles a screen reader needs here are
   * already on the chip — `aria-expanded` and `aria-controls` say a panel exists
   * and whether it is up.
   *
   * On each tile rather than on the panel around them, and the compiler is why:
   * a keydown handler on a `<div>` has to claim an interactive role for it, and
   * inventing one to hold a listener is the costume ADR-0101 was careful not to
   * wear. A button already is interactive, and the keys only matter while focus
   * is on one.
   */
  function onKey(e: KeyboardEvent) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const tiles = [...(panel?.querySelectorAll<HTMLElement>(".mp-tile") ?? [])];
    const here = tiles.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tiles.length - 1
          : here < 0
            ? 0
            : (here + (e.key === "ArrowDown" ? 1 : -1) + tiles.length) %
              tiles.length;
    tiles[to]?.focus();
    e.preventDefault();
  }
</script>

<button
  type="button"
  class="mp-chip"
  bind:this={chip}
  popovertarget={panelId}
  aria-expanded={open}
  aria-controls={panelId}
  aria-label="Which meal these land in"
>
  <!-- **The chip is as wide as its widest possible word, always.** Its label
       changes with the meal, and a box that resizes with its contents moved the
       five marks beside it every time the meal changed — reported from a device.
       So every meal name is rendered into the same grid cell and all but the
       live one is `visibility: hidden`: the cell is then as wide as the widest,
       measured by the browser in the real font at the real size.
       
       Every name rather than the longest one, because "longest string" is not
       "widest word" in a proportional face — it is here, for these four, and it
       would stop being true the first time a name changed or the app was
       translated. This way nothing has to be true. -->
  <span class="mp-word">
    {#each MEAL_TYPES as meal_type (meal_type)}
      <span class="mp-ghost" aria-hidden="true">{meal_type.toUpperCase()}</span>
    {/each}
    <span class="mp-live">{target.toUpperCase()}</span>
  </span>
  <!-- Drawn rather than typed, for `ui/Select`'s reason: `▾` falls outside every
       unicode-range Epilogue is served in, so a glyph would be whatever fallback
       the device has. This joins #317's population of hand-drawn marks. -->
  <svg class="mp-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 6 L17 12 L7 18 Z" fill="currentColor" />
  </svg>
</button>

<div
  bind:this={panel}
  id={panelId}
  popover="auto"
  class="mp-panel"
  ontoggle={(e) => {
    open = (e as ToggleEvent).newState === "open";
    if (!open) return;
    place();
    // The one the panel is on, so the keyboard starts where the eye is and a
    // screen reader announces the current value rather than the first option.
    panel?.querySelector<HTMLElement>('.mp-tile[aria-pressed="true"]')?.focus();
  }}
>
  {#each MEAL_TYPES as meal_type (meal_type)}
    <button
      type="button"
      class="mp-tile"
      aria-pressed={meal_type === target}
      onclick={() => pick(meal_type)}
      onkeydown={onKey}>{meal_type.toUpperCase()}</button
    >
  {/each}
</div>

<style>
  /* The chip: ink ground, paper letters, the one inverted tile on the bar's
     line. That inversion is what says which meal a tap lands in, so it may not
     read as a sixth button beside the five that act. */
  .mp-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3xs);
    min-height: var(--tap-min);
    padding: 0 var(--space-2xs);
    background: var(--ink);
    border: 0;
    border-radius: 0;
    color: var(--paper);
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
  }
  .mp-chip:focus-visible {
    outline: 2px solid var(--paper);
    outline-offset: -4px;
  }
  /* One cell, five children, four of them invisible: the cell is as wide as the
     widest word and the live one is centred in it. */
  .mp-word {
    display: grid;
    justify-items: center;
  }
  .mp-word > * {
    grid-area: 1 / 1;
    white-space: nowrap;
  }
  .mp-ghost {
    visibility: hidden;
  }
  .mp-mark {
    width: 0.8rem;
    height: 0.8rem;
    /* Points at the panel: down while it is closed, up while it is open, which
       is the disclosure reading every caret in this app carries. */
    transform: rotate(90deg);
    transition: var(--turn-mark);
  }
  .mp-chip[aria-expanded="true"] .mp-mark {
    transform: rotate(-90deg);
  }

  /* The panel is the plate again — an ink rectangle with paper tiles laid on it
     and the same `--edge-width` seam between them — so it reads as another
     course of the bar rather than as a card floating over the day.
     `position: fixed` because a popover in the top layer is positioned against
     the viewport; `place()` writes the two values. */
  .mp-panel {
    position: fixed;
    margin: 0;
    padding: var(--edge-width);
    display: grid;
    gap: var(--edge-width);
    min-width: 11rem;
    background: var(--ink);
    border: 0;
    border-radius: 0;
    overflow: visible;
  }
  .mp-tile {
    min-height: var(--tap-min);
    padding-inline: var(--space-s);
    background: var(--paper);
    border: 0;
    border-radius: 0;
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .mp-tile[aria-pressed="true"] {
    background: var(--ink);
    color: var(--paper);
  }
  .mp-tile:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -4px;
  }
  .mp-tile[aria-pressed="true"]:focus-visible {
    outline-color: var(--paper);
  }
  /* A popover's backdrop is the platform's own pseudo-element, and this one
     stays transparent: the panel is four words over a bar, not a mode, and
     dimming the day would claim it is. Light dismiss works either way. */
  .mp-panel::backdrop {
    background: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .mp-mark {
      transition: none;
    }
  }
</style>
