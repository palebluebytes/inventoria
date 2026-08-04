<script lang="ts">
  // The swipeable full-screen reader for a food's captured label photos
  // (ADR-0034 §5, ticket #58). One food accepts N photos — a nutrition panel on
  // one face and a barcode on another — and this reads across them by eye (no
  // pixel-stitching in v1). The parent (`FoodStager`) owns the ordered array; the
  // reader is a pure view over it, driving add/remove/close back through
  // callbacks so the single source of truth stays with the form.
  import Modal from "../../ui/Modal.svelte";

  let {
    /** The ordered label photos (base64), first = display. Never empty while open. */
    photos,
    /** Which photo to open on. Clamped into range; index is owned internally after. */
    startIndex = 0,
    /** Remove the photo at `i` from the set (before save only). Omit for a
     *  read-only reader (e.g. OFF reference photos), which hides the action bar. */
    onRemove,
    /** Append another shot — the parent triggers its shared file input. Omit for
     *  a read-only reader. */
    onAdd,
    /** Dismiss the reader. */
    onClose,
  }: {
    photos: string[];
    startIndex?: number;
    onRemove?: (i: number) => void;
    onAdd?: () => void;
    onClose: () => void;
  } = $props();

  // A reader given neither mutation callback is read-only — used to page through
  // OFF's own reference photos, which the user compares against but never edits.
  let readOnly = $derived(!onRemove && !onAdd);

  // The parent remounts the reader on each open, so capturing `startIndex` once
  // is the intended seed — index is owned internally after (arrows/swipe move it).
  // Clamped at init (the reader only renders with ≥1 photo, so length-1 ≥ 0).
  // svelte-ignore state_referenced_locally
  let index = $state(Math.min(Math.max(startIndex, 0), photos.length - 1));
  // The array can shrink under us when a photo is removed — keep the cursor in
  // range so the view never points past the end.
  $effect(() => {
    if (index > photos.length - 1) index = Math.max(0, photos.length - 1);
  });

  const prev = () => {
    if (index > 0) index -= 1;
  };
  const next = () => {
    if (index < photos.length - 1) index += 1;
  };

  // Pointer-drag swipe: past a threshold of the viewport it advances a page, and
  // a live translate tracks the finger so the gesture reads as one motion. Nav
  // buttons cover the same moves for keyboard/pointer and for e2e (§Testing).
  let dragging = $state(false);
  let startX = 0;
  let dragX = $state(0);

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    startX = e.clientX;
    dragX = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    dragX = e.clientX - startX;
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    const threshold = 60;
    if (dragX <= -threshold) next();
    else if (dragX >= threshold) prev();
    dragX = 0;
  }

  // ArrowLeft/Right stay a reader-local window handler (bits' Dialog owns Escape,
  // routed through Modal's onClose, but not the carousel arrows).
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Dialog shell folded onto the house Modal (#67): it supplies the portal +
     focus trap the reader lacked. The reader is a full-bleed opaque surface, so
     Modal's overlay is inert (transparent, no blur) and sits just below at 1900
     while the content-as-backdrop stays at 2000. `.lpr` spreads Modal's
     `{...props}` (role/aria/focus-trap) onto itself — hence no hand-rolled
     dialog attributes here. -->
<Modal
  {onClose}
  title="Label photos"
  overlayBg="transparent"
  overlayBlur="none"
  overlayZ={1900}
>
  {#snippet children({ props })}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div {...props} class="lpr" data-testid="label-photo-reader">
      <div class="lpr-bar">
        <span class="lpr-counter" data-testid="lpr-counter"
          >{index + 1} / {photos.length}</span
        >
        <button
          type="button"
          class="lpr-icon lpr-close"
          onclick={onClose}
          aria-label="Close photos">✕</button
        >
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="lpr-stage"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
      >
        {#if index > 0}
          <button
            type="button"
            class="lpr-nav lpr-prev"
            onclick={prev}
            aria-label="Previous photo">‹</button
          >
        {/if}
        <img
          class="lpr-img"
          src={photos[index]}
          alt={`Label photo ${index + 1} of ${photos.length}`}
          draggable="false"
          crossorigin="anonymous"
          style:transform={`translateX(${dragX}px)`}
          style:transition={dragging ? "none" : "transform 0.15s ease-out"}
        />
        {#if index < photos.length - 1}
          <button
            type="button"
            class="lpr-nav lpr-next"
            onclick={next}
            aria-label="Next photo">›</button
          >
        {/if}
      </div>

      <div class="lpr-dots" aria-hidden="true">
        {#each photos as _, i (i)}
          <span class="lpr-dot" class:on={i === index}></span>
        {/each}
      </div>

      {#if !readOnly}
        <div class="lpr-actions">
          {#if onRemove}
            <button
              type="button"
              class="lpr-btn lpr-remove"
              onclick={() => onRemove(index)}
              data-testid="lpr-remove">Remove this photo</button
            >
          {/if}
          {#if onAdd}
            <button
              type="button"
              class="lpr-btn lpr-add"
              onclick={onAdd}
              data-testid="lpr-add">＋ Add photo</button
            >
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  /* Full-screen over the log sheet (BottomSheet sits at z 1700–1801), so the
     reader pins above it. Its own opaque backdrop covers the form beneath.
     `pointer-events: auto` is reader-local: Modal portals `.lpr` to end-of-body
     as a sibling of the open LogFoodSheet dialog, which sets `pointer-events:
     none` on <body>; the reader would otherwise inherit it and go click-through.
     Modal (unlike BottomSheet) doesn't bake the fix in, so it lives here. */
  .lpr {
    position: fixed;
    inset: 0;
    z-index: 2000;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    background: var(--ink);
    color: var(--paper);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .lpr-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(env(safe-area-inset-top, 0px) + var(--space-s)) var(--space-s)
      var(--space-2xs);
  }
  .lpr-counter {
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .lpr-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: rgba(255, 255, 255, 0.12);
    border: 0;
    border-radius: 999px;
    color: var(--paper);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .lpr-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    touch-action: pan-y;
  }
  .lpr-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  .lpr-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: rgba(255, 255, 255, 0.14);
    border: 0;
    border-radius: 999px;
    color: var(--paper);
    font-size: 1.8rem;
    line-height: 1;
    cursor: pointer;
  }
  .lpr-prev {
    left: var(--space-s);
  }
  .lpr-next {
    right: var(--space-s);
  }
  .lpr-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: var(--space-2xs) 0;
  }
  .lpr-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.3);
  }
  .lpr-dot.on {
    background: var(--paper);
  }
  .lpr-actions {
    display: flex;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-s)
      calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
  }
  .lpr-btn {
    flex: 1;
    min-height: 48px;
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    border-radius: 10px;
    background: transparent;
    color: var(--paper);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .lpr-remove {
    border-color: rgba(255, 120, 120, 0.6);
    color: #ff9a9a;
  }
  .lpr-add {
    background: var(--green-bg);
    color: var(--ink);
    border-color: var(--green-bg);
  }
</style>
