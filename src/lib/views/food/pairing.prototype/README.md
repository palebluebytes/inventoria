# THROWAWAY — an estimate sitting next to a measurement (#244)

Branch `prototype/244-estimate-beside-measurement`. Nothing here ships. The
winner gets rewritten properly into the real components; the rest stays here as
the primary source behind whatever [#244](https://github.com/palebluebytes/inventoria/issues/244)'s
answer says.

## Run it

```sh
pnpm dev
```

Then open **`/?pairing=A`** on the food page. Two params:

| param     | values                              | what it does                   |
| --------- | ----------------------------------- | ------------------------------ |
| `pairing` | `A` · `B` · `C` · `now`             | the variant (← / → also cycle) |
| `food`    | `oil` · `syrup` · `kefir` · `beans` | the pack under it              |

The floating bar at the foot flips both; the two tabs at the top switch between
**the panel** and **the meter**, which are #244's two surfaces.

## The three variants

Each is a different answer to **where the seam goes** between a figure a
manufacturer printed and a figure a USDA reference food supplied.

- **A — two columns.** The panel splits: one column the pack, one the reference
  food. The seam is vertical and constant. The only variant that draws a
  **contested** row — a nutrient both sources carry, which #240 rules the label
  wins. Deliberate rule-breaking: #244 asks whether the silence reads as honest
  or suspicious, and that cannot be judged against silence alone.
- **B — a block below the rule.** The shipped panel is untouched; underneath it,
  a dashed-framed block naming the reference food and holding only the rows the
  label is silent on. #240's rule drawn literally.
- **C — one list, marked.** One panel, one list, in the shipped
  `NutrientBreakdown` shape. Reference rows sit in normal nutrient order and are
  told apart by a small `est` mark.
- **`now`** is the control: what a packaged food's panel and the day's meters
  read today, with no pairing at all.

Each carries the meter treatment its seam implies — one track in two segments
(A), two stacked tracks (B), an outlined extension (C) — because the seam has to
survive the shrink from a panel row to 6px of `ui/Meter.svelte`.

## The four packs, and why each is here

Real label panels out of [#241](https://github.com/palebluebytes/inventoria/issues/241)'s
export; real reference panels out of the committed corpus at the fdcIds
`scripts/pairing-census.mjs` adjudicated.

| `food`  | pack                         | reference food                    | energy |                                                                                |
| ------- | ---------------------------- | --------------------------------- | -----: | ------------------------------------------------------------------------------ |
| `oil`   | Aceite de oliva virgen extra | `Oil, olive, salad or cooking`    |  1.00× | clean; one prize — vitamin E at 96% of a day                                   |
| `syrup` | Jarabe de arce               | `Syrups, maple`                   |  1.03× | label prints sodium **0**, USDA says **12 mg**                                 |
| `kefir` | Kéfir                        | `Yogurt, plain, whole milk`       |  1.20× | rich — eleven of the twelve meters move                                        |
| `beans` | Alubia roja cocida           | `Beans, kidney, all types, dried` |  3.20× | the state gap ([#489](https://github.com/palebluebytes/inventoria/issues/489)) |

**What is not here:** amounts, timestamps, consumption events. A meter needs the
pack's printed panel and nothing else, so the personal half of the export never
entered this directory.

## What to look at

1. **Does the seam survive the meter?** The panel has a row; the meter has 6px.
2. **Is the silence honest or suspicious?** Flip `syrup` between A and B.
3. **Is `beans` distinguishable from `oil`?** It should not be, and that is the
   finding: nothing on the screen says one is 3.20× out of state.
4. **The limit rows.** "USDA fills silence only" fills the beans' **sodium**
   from an unsalted dried pulse. B marks them; A and C do not.
