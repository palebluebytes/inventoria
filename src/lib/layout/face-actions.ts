import { writable, type Readable } from "svelte/store";
import type { Snippet } from "svelte";

/**
 * What a face hands the shell's pinned header: **its own controls**, and
 * **what its title does** (ADR-0114 §5, ADR-0091 §5).
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
 * module publishes a measured number through a custom property; these publish a
 * snippet and a callback through stores, because a control is markup, a
 * destination is behaviour, and there is nothing general about either.
 *
 * **Two slots rather than one record.** A face publishes controls once, for as
 * long as it is mounted, and republishes its way back every time it opens or
 * leaves a page — so one record would make Media restate a gear it never
 * changed, and would make the food screen's page state decide the identity of a
 * snippet that never moved.
 */

/**
 * One published slot, and the teardown that clears **only what it published**.
 *
 * Nothing here should depend on the order two faces' lifecycles run in:
 * switching faces destroys one and mounts another, and a teardown that set
 * `null` unconditionally would be correct in one order and would wipe the
 * header the arriving face had just filled in the other. Comparing identities
 * makes the order stop mattering, which is cheaper than knowing it.
 */
function slotOf<T>() {
  const held = writable<T | null>(null);
  return {
    published: held as Readable<T | null>,
    publish(value: T | null): () => void {
      held.set(value);
      return () =>
        held.update((current) => (current === value ? null : current));
    },
  };
}

const actions = slotOf<Snippet>();
const back = slotOf<FaceBack>();

/** What the header draws after the title, or `null` on a face with no controls. */
export const faceActions: Readable<Snippet | null> = actions.published;

/**
 * Hand the header this face's controls, and take them back when it unmounts.
 *
 * Returns its own teardown so the caller is one line —
 * `$effect(() => publishFaceActions(headerActions))` — which is the shape
 * `FaceHeader` already uses to publish and clear `--shell-ceiling`.
 */
export function publishFaceActions(snippet: Snippet): () => void {
  return actions.publish(snippet);
}

/**
 * The way back off a page, once a face has pages to be on (ADR-0091 §5).
 *
 * **The face says where, the header says what it is called.** The record's
 * accessible name is the visible word plus the destination — "Food, back to the
 * day" — and the two halves are owned in different places now: the word is the
 * roster's one spelling (ADR-0114 §3), which only the header holds, and the
 * destination is a fact about the face's own screen, which only the face knows.
 * So the face publishes `to` and the header composes the name from it.
 */
export type FaceBack = {
  /** Where the title returns to, in the face's own words: `"the day"`. */
  to: string;
  /** Take it. */
  go: () => void;
};

/** What the title is a control for, or `null` while it is only a title. */
export const faceBack: Readable<FaceBack | null> = back.published;

/**
 * Hand the header the way back, or `null` on a face that is not on a page.
 *
 * Republished rather than toggled, because it changes while the face stays
 * mounted: `$effect(() => publishFaceBack(onPage ? { … } : null))` runs again on
 * every crossing, and the previous teardown fires first.
 */
export function publishFaceBack(way: FaceBack | null): () => void {
  return back.publish(way);
}
