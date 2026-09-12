import type { Locator } from "@playwright/test";

/**
 * Wait out a sheet's entry animation, so its box is the one it comes to rest
 * at rather than a frame on the way there.
 *
 * **Every box assertion about a sheet needs this, and the reason is #408.**
 * `boundingBox()` is one protocol round trip per element, and two of them are
 * 11-21ms apart — several frames of a 250ms animation. Under `slideUp` that is
 * harmless: a translate moves every descendant by the same vector, so a
 * *difference* between two boxes survives being sampled at two instants. Under
 * `popIn` it is not, because that one **scales** (0.97 → 1), and a card that
 * grows between the two calls hands back a second box measured against a
 * larger card than the first. `settings-ui.spec.ts` read that as a 1.176px
 * overflow of a toggle that in fact sits flush to the pixel: at rest both edges
 * measure 900.422.
 *
 * So this is not belt-and-braces. Above 768px every sheet is now a centred card
 * (ADR-0089 §6, and the branch that made it the default rather than an opt-in),
 * which means every desktop sheet animates by scaling and no box comparison
 * across two round trips is sound until this has resolved.
 *
 * A cancelled animation rejects `finished`, which is not a failure — it means
 * the sheet is already where it is going.
 */
export async function settled(sheet: Locator): Promise<void> {
  await sheet.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})))
  );
}
