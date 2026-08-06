/**
 * The pure numeric core of the personalized calorie/macro helper (ADR-0033 §3).
 * A faithful transcription of `docs/reference/personalized-energy-and-macros.md`
 * — a corrected figure moves the reference doc and this module together, exactly
 * as {@link ./nutrition-targets.ts} mirrors the baked reference docs.
 *
 * Two composed formulae:
 * - {@link mifflinStJeorBmr} — resting metabolic rate (Mifflin-St Jeor 1990).
 * - {@link computeEnergyAndMacros} — BMR → TDEE (×PAL) → goal-adjusted energy
 *   (floored at BMR) → protein-anchored macros → energy-scaled fibre.
 *
 * The result is `{ energy, protein, fat, carbs, fiber_content }` in the override
 * blob's canonical units — **kcal** for energy, **grams** for the rest (ADR-0031 §2)
 * — so it drops straight into a `settings/food/targets` write. Values are returned
 * **unrounded**: the stored targets keep exact precision and rounding is a
 * display-only concern (`round_nutrition`, ticket #29), so no rounding happens here.
 *
 * Fibre rides along because its guideline — the IOM 2005 Total Fiber AI of
 * **14 g / 1000 kcal** — is itself defined *per kcal*, so the honest application is
 * the personalized energy, not the frozen 2000-kcal reference the baked 28 g uses
 * (ADR-0033 Amendment 2). The twelve micronutrients have no energy-linked basis and
 * are untouched — they keep their baked defaults.
 */

/** Biological sex — the two forms of the Mifflin-St Jeor constant (ADR-0033 §6). */
export type BiologicalSex = "male" | "female";

/** The four IOM 2005 Physical Activity Level categories (ADR-0033 §3). */
export type ActivityLevel =
  | "sedentary"
  | "low_active"
  | "active"
  | "very_active";

/** The three goal directions — a percentage of TDEE, not a flat kcal delta. */
export type EnergyGoal = "lose" | "maintain" | "gain";

/**
 * The body metrics + choices {@link computeEnergyAndMacros} derives from — the
 * calculator sheet's form state, mapped to camelCase math params (the ledger's
 * snake_case profile is a separate boundary shape, Coding Standards §1.3/§3.3).
 * `energyOverrideKcal` is the optional manual nudge.
 */
export interface EnergyMacrosInput {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
  ageYr: number;
  activity: ActivityLevel;
  goal: EnergyGoal;
  energyOverrideKcal?: number; // the manual nudge, if the user adjusted it
}

/**
 * The helper's result — the five keys it writes into `settings/food/targets`:
 * `energy` (kcal), `protein` / `fat` / `carbs` / `fiber_content` (grams). One
 * named shape so the module, the calculator sheet's `onApply`, and the editor's
 * apply path can't drift apart (Coding Standards §3.1).
 */
export interface EnergyMacros {
  energy: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber_content: number;
}

/**
 * TDEE = BMR × PAL. Representative multipliers are the **midpoints** of the IOM
 * 2005 PAL bands (the band boundaries are primary-sourced; the midpoint is a
 * product choice — reference doc, "Activity multiplier" table).
 */
const PAL: Record<ActivityLevel, number> = {
  sedentary: 1.25, // IOM band 1.0–1.4, midpoint
  low_active: 1.5, // IOM band 1.4–1.6, midpoint
  active: 1.75, // IOM band 1.6–1.9, midpoint
  very_active: 2.2, // IOM band 1.9–2.5, midpoint
};

/**
 * Goal factor as a fraction of TDEE (reference doc, "Goal adjustment"). A
 * percentage keeps the relative deficit/surplus constant across body sizes and
 * coheres with the BMR safety clamp; the exact percentages are product choices
 * constrained to published guidance (≤ ~20 % first-phase deficit; 200–300 kcal
 * lean-bulk surplus).
 */
const GOAL_FACTOR: Record<EnergyGoal, number> = {
  lose: 0.8, // −20 % of TDEE
  maintain: 1.0, // TDEE as-is
  gain: 1.1, // +10 % of TDEE
};

/**
 * Protein anchored to bodyweight — the Morton (2018) meta-regression breakpoint,
 * inside the ISSN (2017) 1.4–2.0 g/kg range. Anchoring to kg (not %-energy) holds
 * protein steady on a cut, which is the reason the helper writes macros at all.
 */
const PROTEIN_G_PER_KG = 1.6;

/** Fat as a fraction of energy — mid-AMDR (20–35 %, IOM 2005), matching the baked split. */
const FAT_ENERGY_FRACTION = 0.3;

/**
 * Dietary fibre as grams per 1000 kcal — the IOM 2005 Total Fiber Adequate Intake,
 * the fibre intake found protective against coronary heart disease. Fibre has no
 * AMDR; this per-kcal rate IS its guideline, so scaling it by the personalized
 * energy (rather than pinning to the baked 28 g at the 2000-kcal reference) applies
 * the same figure consistently. At 2000 kcal it reproduces 28 g exactly.
 */
const FIBER_G_PER_1000_KCAL = 14;

/** Atwater energy factors (kcal per gram) — universal. */
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_CARB = 4;

/**
 * Resting metabolic rate, Mifflin-St Jeor (1990), using **actual** body weight —
 * the Academy of Nutrition & Dietetics' recommended predictive equation.
 *
 *   BMR = 10·weight_kg + 6.25·height_cm − 5·age_yr + s
 *   s = +5 (male) / −161 (female)
 *
 * The binary-sex constant is a documented limitation of the published equation,
 * not hidden (ADR-0033 §6): there is no validated non-binary coefficient.
 * Reference: docs/reference/personalized-energy-and-macros.md, "Mifflin-St Jeor".
 */
export function mifflinStJeorBmr(
  sex: BiologicalSex,
  weightKg: number,
  heightCm: number,
  ageYr: number
): number {
  const s = sex === "male" ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYr + s;
}

/**
 * Composes BMR → TDEE → goal-adjusted energy (floored at BMR) → protein-anchored
 * macros → energy-scaled fibre, returning the five keys the helper writes into
 * `settings/food/targets`: `energy` (kcal), `protein` / `fat` / `carbs` /
 * `fiber_content` (grams). Pure and unit-test-reachable. Reference:
 * docs/reference/personalized-energy-and-macros.md, "The composed formula".
 *
 * - **TDEE** = BMR × PAL[activity].
 * - **Energy** = TDEE × goal factor, then `max(…, BMR)` — the safety clamp never
 *   suggests eating below resting burn. When `energyOverrideKcal` is supplied (the
 *   UI's manual nudge), it replaces the goal-adjusted value but is *still* floored
 *   at BMR.
 * - **Protein** = 1.6 g/kg bodyweight — held steady on a cut (the g/kg anchor).
 * - **Fat** = 30 % of energy at 9 kcal/g.
 * - **Carbs** = the remaining energy at 4 kcal/g, **clamped ≥ 0** (at high protein
 *   + a deep deficit the remainder could otherwise go negative).
 * - **Fibre** = 14 g / 1000 kcal of the (clamped) energy — the AI's own per-kcal
 *   basis applied to the personalized target rather than the frozen 2000-kcal
 *   reference (ADR-0033 Amendment 2). Tracks the nudge, since it scales off `energy`.
 */
export function computeEnergyAndMacros(input: EnergyMacrosInput): EnergyMacros {
  const bmr = mifflinStJeorBmr(
    input.sex,
    input.weightKg,
    input.heightCm,
    input.ageYr
  );
  const tdee = bmr * PAL[input.activity];
  const goalAdjusted = tdee * GOAL_FACTOR[input.goal];
  // Safety clamp: floor at the user's own BMR (applies to the manual nudge too).
  const energy = Math.max(input.energyOverrideKcal ?? goalAdjusted, bmr);
  const protein = PROTEIN_G_PER_KG * input.weightKg;
  const fat = (FAT_ENERGY_FRACTION * energy) / KCAL_PER_G_FAT;
  const carbs = Math.max(
    0,
    (energy - KCAL_PER_G_PROTEIN * protein - KCAL_PER_G_FAT * fat) /
      KCAL_PER_G_CARB
  );
  // Fibre scales off the same clamped energy, so it tracks the nudge and never
  // suggests less than the resting-burn diet's fibre. At 2000 kcal → 28 g exactly.
  const fiber_content = (FIBER_G_PER_1000_KCAL * energy) / 1000;
  return { energy, protein, fat, carbs, fiber_content };
}
