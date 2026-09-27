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
