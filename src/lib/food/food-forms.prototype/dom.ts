/**
 * PROTOTYPE — see README.md. Throwaway; not reached by the app.
 *
 * Twenty lines of element-building, so the three shapes are written as data and
 * not as template strings. Svelte would be the app's answer; a throwaway that
 * asks one question does not need a compiler.
 */

type Child = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key.startsWith("on"))
      el.addEventListener(key.slice(2), value as EventListener);
    else if (key === "text") el.textContent = String(value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat())
    if (child)
      el.append(
        typeof child === "string" ? document.createTextNode(child) : child
      );
  return el;
}

export const clear = (el: Element) => {
  while (el.firstChild) el.firstChild.remove();
  return el;
};

/** A percentage the way this prototype always prints one, or an em-dash. */
export const pct = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(0)}%`;

export const kcal = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value)}`;

/**
 * A gram figure, to one decimal.
 *
 * Rounded to whole grams, a red delicious apple's 0.2 g of protein prints as
 * "0" — indistinguishable from the absent figure ADR-0048 insists is a
 * different fact. An em-dash is what absence looks like here.
 */
/**
 * A USDA description as a reader should see it.
 *
 * The "(Includes foods for USDA's Food Distribution Program)" parenthetical is
 * a provenance note on 20 rows, and those 20 are staples — the only orange
 * juice row in the corpus, 85/15 ground beef, smooth peanut butter, russet
 * potatoes, the generic raw apple. It is a NAME to strip, never a row to drop.
 */
export const shown = (description: string) =>
  description.replace(
    /\s*\(Includes foods for USDA's Food Distribution Program\)/,
    ""
  );

export const grams = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 10) / 10}`;
