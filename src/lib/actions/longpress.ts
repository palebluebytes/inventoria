// Long-press Svelte action. Calls `onlongpress` once the pointer is held for
// `duration` ms without moving beyond a small threshold. Used to start
// selection of logged food items on the Food dashboard (long-press to select,
// then tap to add/remove).

interface LongpressParams {
  duration?: number;
  onlongpress?: () => void;
}

export function longpress(node: HTMLElement, params: LongpressParams = {}) {
  let { duration = 450, onlongpress } = params;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  function clear() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onDown(e: PointerEvent) {
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = setTimeout(() => {
      onlongpress?.();
      if ("vibrate" in navigator) navigator.vibrate?.(15);
    }, duration);
  }

  function onMove(e: PointerEvent) {
    if (timer === null) return;
    if (
      Math.abs(e.clientX - startX) > 10 ||
      Math.abs(e.clientY - startY) > 10
    ) {
      clear();
    }
  }

  node.addEventListener("pointerdown", onDown);
  node.addEventListener("pointermove", onMove);
  node.addEventListener("pointerup", clear);
  node.addEventListener("pointercancel", clear);
  node.addEventListener("pointerleave", clear);

  return {
    update(next: LongpressParams) {
      duration = next.duration ?? 450;
      onlongpress = next.onlongpress;
    },
    destroy() {
      clear();
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", clear);
      node.removeEventListener("pointercancel", clear);
      node.removeEventListener("pointerleave", clear);
    },
  };
}
