/**
 * Every tile's visible name, in the order a `FaceGrid` emitted them.
 *
 * Shared by the two files that ask about that grid from opposite ends —
 * `face-switcher.test.ts` renders it directly, `landing-screen.test.ts` finds it
 * inside a whole shell — because the order is what both are really asserting
 * (ADR-0114 §7 refuses a re-sort) and two readers of one markup would not stay
 * the same reader.
 */
export const tileNames = (body: string): string[] =>
  [...body.matchAll(/class="face-name[^"]*">([^<]+)</g)].map((m) => m[1]);

/**
 * The face's name as the shell's pinned header draws it, with Svelte's block
 * anchors and any control it is wrapped in taken out.
 *
 * **One word, two shapes**: a bare heading on the day, and a button inside the
 * same heading once the face is on a page (ADR-0091 §5, #538). Three files ask
 * what the title says, and a regex written against the bare shape breaks on the
 * anchors the `{#if}` stamps — which is how all three broke at once. What they
 * are each asserting is the word, so the word is what this returns.
 *
 * `null` where the header drew no `<h1>` at all, so a miss reads as a miss
 * rather than as an empty title.
 */
export function headerTitle(body: string): string | null {
  const heading = body.match(/<h1 class="face-title[^"]*">([\s\S]*?)<\/h1>/);
  if (!heading) return null;
  return heading[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}
