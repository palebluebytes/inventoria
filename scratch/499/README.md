# #499 — what a density answer is worth, priced in kilocalories

`margins.mjs` prints every figure in the resolution of
[#499](https://github.com/palebluebytes/inventoria/issues/499). Run it from the
repo root:

```sh
node scratch/499/margins.mjs
```

It reads `public/usda/search-index.json` — already in the repo — and imports
`scripts/density-class-check.mjs` so the class selection is the one ADR-0108 §3
proves rather than a second implementation of it. No network, no install.

## What it was written to settle

Not _"how accurate is a density"_ but **"how often must the user be asked"**.
Everything is reported as the kcal cost of a **wrong** answer on a realistic
serving, because a distinction worth a kilocalorie or two is a question that
should never have been asked.

The load-bearing results:

- The four non-oil classes pool to **n=73, CV 1.90%**, which clears ADR-0108 §2's
  own bar. The entire four-way picker is worth **at most 11.6 kcal**, on one food.
- A three-line rule over the **nutrition panel** recovers **123 of 124**
  non-aerated foods with no category tag at all — so it reaches the 24.24% of
  millilitre products that carry no usable tags, which was the whole prize #481
  named for a model.
- **Aerated is invisible to a panel** (air has no macros) and leaves 10–17 kcal
  even when classed, so it is the one case that still earns a question.

## The guard

`fromPanel` is **only safe for a food sold by volume**. Over the whole corpus it
calls dry noodles and freeze-dried chives "syrup" at 400+ kcal of error. They
cannot reach it in the app because `offPanelBasis` asks the density question only
where the panel is per 100 ml — that gate is load-bearing, not incidental, and
anything built from this rule must say so.
