import type { Action } from "svelte/action";

/**
 * Makes a modal backdrop dismissable: clicking the backdrop itself (but not its
 * content) or pressing Escape calls `onDismiss`.
 *
 * Applied to the overlay element, it replaces the per-modal inline
 * `onclick`/stopPropagation pair. Because the listeners are attached in script
 * rather than markup, the backdrop stays a presentational `<div>` with no
 * interactive-role/keyboard a11y warnings, while the dialog role lives on the
 * content card. Escape-to-close comes for free.
 */
export const dismissable: Action<HTMLElement, () => void> = (
  node,
  onDismiss
) => {
  let dismiss = onDismiss;

  // Only a click on the backdrop itself dismisses; clicks on the content card
  // (descendants) bubble up with a different target and are ignored.
  function onClick(event: MouseEvent) {
    if (event.target === node) dismiss();
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") dismiss();
  }

  node.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeydown);

  return {
    update(next: () => void) {
      dismiss = next;
    },
    destroy() {
      node.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeydown);
    },
  };
};
