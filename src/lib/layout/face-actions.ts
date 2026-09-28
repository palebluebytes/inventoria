import { writable, type Readable } from "svelte/store";
import type { Snippet } from "svelte";

/**
 * The face's own controls, published by the face and drawn by the shell's
 * pinned header (ADR-0114 §5).
 *
 * **The place is the shell's and the control is the face's**, and the two boxes
 * are on opposite sides of the scroll container: the header is a flex item above
 * `.main`, and every face mounts inside it. So a face cannot draw into the
 * header, and the shell cannot own the control — Media's gear opens a sheet over
 * `MediaView`'s own state, and the food screen's four read a page, a date and a
 * disclosure that exist nowhere else. Lifting any of them into `App.svelte`
 * would move a face's state into the box that holds all seven.
 *
 * It is the same shape as `./shell-ceiling.ts` and for the same reason: one box
 * knows a thing the other box needs, and neither is the other's parent. That
 * module publishes a measured number through a custom property; this one
 * publishes a snippet through a store, because a control is markup and there is
 * nothing general about which controls a face has.
 *
 * **A snippet rather than a roster of buttons**, which is the shape
 * `FaceHeader` asked for before this module existed: the food screen carries
 * four, Media carries one, and the landing screen has no header at all. What the
 * header owns is where they sit.
 *
 * The snippet is written in the face's own file, so its scoped CSS reaches it
 * wherever it is rendered — Svelte stamps the scope class at compile time, in
 * the component the markup was written in, not the one it is drawn under.
 */
const slot = writable<Snippet | null>(null);

/** What the header draws after the title, or `null` on a face with no controls. */
export const faceActions: Readable<Snippet | null> = slot;

/**
 * Hand the header this face's controls, and take them back when it unmounts.
 *
 * Returns its own teardown so the caller is one line —
 * `$effect(() => publishFaceActions(headerActions))` — which is the shape
 * `FaceHeader` already uses to publish and clear `--shell-ceiling`.
 *
 * **The teardown clears only what it published.** Switching faces destroys one
 * and mounts another, and nothing here should depend on which of the two runs
 * first: a teardown that set `null` unconditionally would be correct in one
 * order and would wipe the header the arriving face had just filled in the
 * other. Comparing identities makes the order stop mattering, which is cheaper
 * than knowing it.
 */
export function publishFaceActions(actions: Snippet): () => void {
  slot.set(actions);
  return () => slot.update((current) => (current === actions ? null : current));
}
