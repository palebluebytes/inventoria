# Personalized energy & macronutrient helper

**Purpose:** primary-source basis for Inventoria's optional **calorie/macro helper** — the
Settings calculator that turns a user's body metrics (biological sex, age, height, weight)
plus an activity level and a goal into a suggested daily **energy** target and **protein /
fat / carbohydrate** gram targets, which it writes into the `settings/food/targets` override
blob (ADR-0033). Unlike the app's _baked_ reach-toward targets (`active-adult-macros.md`,
`fda-daily-values.md`), which are a single generic 2,000-kcal profile, these numbers are
**computed per person**. This file records the three formulae the helper composes — a resting
metabolic-rate equation, an activity multiplier, and a protein-anchored macro split — to the
same primary-source standard as the baked targets.

The helper is a **throwaway calculator**: it produces the same kind of override numbers a user
could type by hand, so nothing here changes the resolver or the dashboard's single-resolved-map
model (ADR-0031 §2). This doc is the derivation; ADR-0033 is the decision record.

## Sources (primary only)

- **Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO (1990). "A new predictive
  equation for resting energy expenditure in healthy individuals."** _American Journal of
  Clinical Nutrition_ 51(2):241–247. https://doi.org/10.1093/ajcn/51.2.241
  (PubMed: https://pubmed.ncbi.nlm.nih.gov/2305711/) — the resting metabolic-rate (BMR)
  equation and its two sex constants (+5 / −161).
- **Academy of Nutrition & Dietetics — Evidence Analysis Library, "Determination of Resting
  Metabolic Rate"** (Adult Weight Management guideline):
  https://www.andeal.org/template.cfm?template=guide_summary&key=621 — the institutional
  recommendation to use Mifflin-St Jeor (actual body weight) when indirect calorimetry is
  unavailable, and the supporting systematic reviews (Frankenfield et al.,
  https://www.jandonline.org/article/S0002-8223(05)00149-5/abstract and
  https://www.sciencedirect.com/science/article/abs/pii/S0261561413001003).
- **IOM (2005) — _Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids,
  Cholesterol, Protein, and Amino Acids_**, Institute of Medicine of the National Academies.
  Read on NAP: https://www.nationalacademies.org/read/26818 (Summary on the NCBI Bookshelf:
  https://www.ncbi.nlm.nih.gov/books/NBK591034/) — defines the four **Physical Activity Level
  (PAL)** categories and their numeric bands (the activity multiplier). This is the same IOM
  2005 DRI report already cited by `active-adult-macros.md` for the AMDRs.
- **Jäger R, Kerksick CM, Campbell BI, et al. (2017). "International Society of Sports Nutrition
  Position Stand: protein and exercise."** _Journal of the International Society of Sports
  Nutrition_ 14:20. https://doi.org/10.1186/s12970-017-0177-8
  (open access: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5477153/) — the 1.4–2.0 g/kg/day
  active-adult protein range.
- **Morton RW, Murphy KT, McKellar SR, et al. (2018). "A systematic review, meta-analysis and
  meta-regression of the effect of protein supplementation on resistance training-induced gains
  in muscle mass and strength in healthy adults."** _British Journal of Sports Medicine_
  52(6):376–384. https://doi.org/10.1136/bjsports-2017-097608 — the ~1.6 g/kg/day breakpoint
  (diminishing returns above), Inventoria's default protein anchor.

---

## The composed formula

The helper computes in four steps: BMR → TDEE → goal-adjusted energy (floored) → macros.

```
1. BMR  (kcal/day, Mifflin-St Jeor):
     BMR = 10·weight_kg + 6.25·height_cm − 5·age_yr + s
     s = +5   (biological sex = male)
     s = −161 (biological sex = female)

2. TDEE (total daily energy):
     TDEE = BMR × PAL          (PAL from the activity category, table below)

3. Energy target (goal-adjusted, then floored at BMR):
     target = TDEE × goal_factor
     goal_factor = 0.80 (Lose) | 1.00 (Maintain) | 1.10 (Gain)
     target = max(target, BMR)   ← safety clamp: never below resting burn

4. Macros (protein anchored to bodyweight; carbs are the remainder):
     protein_g = 1.6 × weight_kg
     fat_g     = 0.30 × target / 9            (30 % of energy, Atwater fat = 9 kcal/g)
     carbs_g   = max(0, (target − 4·protein_g − 9·fat_g) / 4)
```

All body inputs are **metric** (kg, cm); the helper is metric-only (ADR-0033). Energy is kcal;
macros are grams — the same canonical units the override blob stores.

### Mifflin-St Jeor (step 1)

The Academy of Nutrition & Dietetics' Evidence Analysis Library recommends Mifflin-St Jeor
(using **actual** body weight) as the most appropriate predictive equation for resting metabolic
rate in healthy non-obese and obese adults when indirect calorimetry is unavailable. Validation
(Frankenfield) found it **statistically unbiased** (95 % CI −26 to +8 kcal/day) and accurate to
within ±10 % for ~70–82 % of individuals — better than Harris-Benedict, which systematically
overestimates.

**Binary-sex limitation (documented, not hidden).** The published equation has exactly two forms,
differing only by the constant (+5 vs −161); there is no validated non-binary coefficient. The
helper therefore asks for **biological sex** as a two-option field, framed in the UI as a
metabolic-estimate input only (not an identity question), with the manual nudge and the
fully-optional nature of the helper as the escape hatch for anyone the equation doesn't fit. See
ADR-0033 §Alternatives for why an invented third (averaged) constant was rejected.

### Activity multiplier — IOM PAL categories (step 2)

The IOM 2005 DRI report defines four Physical Activity Level categories. PAL is _defined_ as total
energy expenditure ÷ basal energy expenditure, so using it as a **multiplier on BMR is exactly its
definition** — TDEE = BMR × PAL.

| Category    | IOM PAL band (primary-sourced) | Representative multiplier (product choice) |
| ----------- | ------------------------------ | ------------------------------------------ |
| Sedentary   | 1.0 ≤ PAL < 1.4                | **1.25**                                   |
| Low active  | 1.4 ≤ PAL < 1.6                | **1.5**                                    |
| Active      | 1.6 ≤ PAL < 1.9                | **1.75**                                   |
| Very active | 1.9 ≤ PAL < 2.5                | **2.2**                                    |

The **band boundaries are primary-sourced** (IOM 2005). The single **representative multiplier**
inside each band is Inventoria's product choice (the band midpoint) — analogous to how
`active-adult-macros.md`'s 25/30/45 % split is a product choice _inside_ the primary-sourced AMDR
bounds. Only the bounds are first-party; the point within them is ours.

**Honest caveat for the info copy:** IOM's own Estimated Energy Requirement equations use their own
regression as the basal term and gender/age-specific PA _coefficients_ (which are **not** the PAL
value and are **not** interchangeable), not Mifflin-St Jeor. So "MSJ BMR × PAL" is a sound,
extremely common pairing — PAL is literally a BMR multiplier by definition — but it is not a unit
IOM itself publishes. The UI states this plainly rather than implying IOM endorses the composition.

### Goal adjustment (step 3)

| Goal     | Factor | Basis                                                                                      |
| -------- | ------ | ------------------------------------------------------------------------------------------ |
| Lose     | 0.80   | −20 % of TDEE. Matches the common "never below 80 % of TDEE" first-phase deficit guidance. |
| Maintain | 1.00   | TDEE as-is.                                                                                |
| Gain     | 1.10   | +10 % of TDEE. Lands inside the 200–300 kcal/day lean-bulk surplus band for typical TDEEs. |

**Percentage of TDEE, not a flat kcal delta.** A flat ±500 is a wildly different _fraction_ of
intake across body sizes and activity levels (≈31 % of a small sedentary person's TDEE vs ≈16 % of
an athlete's), producing an inconsistent physiological stress and colliding with the BMR clamp for
small/sedentary people. A percentage keeps the _relative_ deficit/surplus constant. It also coheres
with the clamp: at the sedentary PAL (~1.25), −20 % of TDEE ≈ 0.80 × 1.25 × BMR ≈ **BMR**, so the
percentage floor and the BMR clamp _agree_ for sedentary users and the clamp only tightens the
result for the (rare) case below it. The info copy notes a surplus much above the 200–300 kcal band
mostly adds fat, not muscle.

**Safety clamp.** After the goal factor, the target is floored at the user's own BMR — the helper
never suggests eating below resting burn. The UI shows a short note when the floor bites.

### Macro split (step 4)

- **Protein — 1.6 g/kg bodyweight.** The Morton (2018) meta-regression breakpoint, inside the ISSN
  (2017) 1.4–2.0 g/kg active-adult range and well above the sedentary RDA (0.8 g/kg). Anchoring to
  **bodyweight** (not a %-of-energy) is deliberate: on a cut, a %-energy protein target would _fall_
  with calories exactly when protein should stay high to preserve lean mass — the g/kg anchor holds
  it steady. This also stays consistent with the app's baked protein target (125 g ≈ 1.6–1.8 g/kg
  for a typical adult).
- **Fat — 30 % of energy.** Mid-AMDR (20–35 %, IOM 2005), matching the baked `active-adult-macros.md`
  fat share, converted with the Atwater fat factor (9 kcal/g). Being a percentage, fat flexes with
  the calorie target.
- **Carbohydrate — the remainder.** Whatever energy is left after protein and fat, at 4 kcal/g,
  **clamped at ≥ 0**. At high protein + a deep deficit the remainder could theoretically go negative;
  the clamp prevents a nonsensical target and the UI surfaces a gentle note if it ever bites.

---

## Worked examples (show your work)

**Example A — 35 y, female, 70 kg, 170 cm, Active, Maintain.**

```
BMR   = 10·70 + 6.25·170 − 5·35 − 161 = 700 + 1062.5 − 175 − 161 = 1426.5 kcal
TDEE  = 1426.5 × 1.75 (Active) = 2496 kcal
target= 2496 × 1.00 (Maintain) = 2496 kcal   (> BMR, no clamp)
protein = 1.6 × 70                = 112 g   (448 kcal)
fat     = 0.30 × 2496 / 9         = 83 g    (749 kcal)
carbs   = (2496 − 448 − 749) / 4  = 325 g   (1299 kcal)
check: 448 + 749 + 1299 = 2496 kcal ✓
```

**Example B — same person, goal = Lose (−20 %).**

```
target  = 2496 × 0.80 = 1997 kcal   (> BMR 1427, no clamp)
protein = 1.6 × 70    = 112 g        (unchanged — the point of the g/kg anchor)
fat     = 0.30 × 1997 / 9 = 67 g     (599 kcal)
carbs   = (1997 − 448 − 599) / 4 = 238 g
```

Protein holds at 112 g while calories drop ~500 and carbs absorb the deficit — the physiologically
correct behaviour a flat %-split could not produce.

---

## Caveats / what is and isn't first-party verified

- The **Mifflin-St Jeor equation and its ±constants** are read directly from the 1990 AJCN paper
  and are universal; not in dispute. The AND recommendation is quoted from its Evidence Analysis
  Library guideline summary.
- The **four IOM PAL category bands** (1.0–1.4 / 1.4–1.6 / 1.6–1.9 / 1.9–2.5) are the IOM 2005 DRI
  definitions, confirmed via the DRI-for-Energy summary. The **representative multiplier per band**
  (1.25 / 1.5 / 1.75 / 2.2) is Inventoria's product choice (band midpoint), **not** an IOM-published
  figure — only the bounds are primary-sourced.
- The **0.80 / 1.00 / 1.10 goal factors** are Inventoria product choices constrained to published
  guidance (≤ ~20 % first-phase deficit; 200–300 kcal lean-bulk surplus); the underlying rules are
  sourced, the exact percentages are ours.
- **Protein 1.6 g/kg** is the Morton (2018) breakpoint inside the ISSN (2017) range — first-party
  from those papers. **Fat 30 %** is mid-AMDR (IOM 2005). **Atwater 4/4/9** factors are universal.
- All predictive-equation estimates are approximations; ±10 % on a BMR is ±~150 kcal. The helper's
  output is a **starting point**, not a prescription — the UI says so, and the manual nudge exists
  for exactly this reason. Accuracy degrades in obesity (MSJ with actual weight remains the
  recommended fallback there).

---

## How to bake this in

Two pure functions beside the baked-target module, unit-test-reachable, transcribed from the steps
above. Inputs metric; energy kcal; macros grams — the override blob's canonical units, so the result
drops straight into `settings/food/targets`.

```ts
// Personalized energy/macro helper (ADR-0033).
// Transcribed from docs/reference/personalized-energy-and-macros.md.
export type BiologicalSex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "low_active"
  | "active"
  | "very_active";
export type EnergyGoal = "lose" | "maintain" | "gain";

const PAL: Record<ActivityLevel, number> = {
  sedentary: 1.25, // IOM band 1.0–1.4, midpoint (product choice)
  low_active: 1.5, // IOM band 1.4–1.6
  active: 1.75, // IOM band 1.6–1.9
  very_active: 2.2, // IOM band 1.9–2.5
};
const GOAL_FACTOR: Record<EnergyGoal, number> = {
  lose: 0.8,
  maintain: 1.0,
  gain: 1.1,
};
const PROTEIN_G_PER_KG = 1.6; // Morton 2018 / ISSN 2017
const FAT_ENERGY_FRACTION = 0.3; // mid-AMDR (IOM 2005)

export function mifflinStJeorBmr(
  sex: BiologicalSex,
  weightKg: number,
  heightCm: number,
  ageYr: number
): number {
  const s = sex === "male" ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYr + s;
}

// Returns kcal + macro grams to write straight into the targets override blob.
export function computeEnergyAndMacros(input: {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
  ageYr: number;
  activity: ActivityLevel;
  goal: EnergyGoal;
  energyOverrideKcal?: number; // the manual nudge, if the user adjusted it
}): { energy: number; protein: number; fat: number; carbs: number } {
  const bmr = mifflinStJeorBmr(
    input.sex,
    input.weightKg,
    input.heightCm,
    input.ageYr
  );
  const tdee = bmr * PAL[input.activity];
  const goalAdjusted = tdee * GOAL_FACTOR[input.goal];
  const energy = Math.max(input.energyOverrideKcal ?? goalAdjusted, bmr); // floor at BMR
  const protein = PROTEIN_G_PER_KG * input.weightKg;
  const fat = (FAT_ENERGY_FRACTION * energy) / 9;
  const carbs = Math.max(0, (energy - 4 * protein - 9 * fat) / 4);
  return { energy, protein, fat, carbs };
}
```

Note: the four numbers map to the reach-toward keys `energy` (kcal), `protein`, `fat`, `carbs`
(grams). Fibre and the micronutrients are **not** set by the helper — they keep their baked
defaults. See `active-adult-macros.md` and `fda-daily-values.md` for those.
