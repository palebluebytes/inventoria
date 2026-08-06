import { describe, it, expect } from "vitest";
import {
  mifflinStJeorBmr,
  computeEnergyAndMacros,
} from "../../src/lib/food/personalized-energy-macros";

// These tests transcribe the worked examples and clamp cases from
// docs/reference/personalized-energy-and-macros.md. Values are returned
// unrounded (stored targets keep exact precision; rounding is display-only), so
// the worked-example integers are reproduced by rounding the raw output.

describe("mifflinStJeorBmr (1990 equation, +5 male / −161 female)", () => {
  it("computes the female form (Example A person: 35 y, 70 kg, 170 cm)", () => {
    // 10·70 + 6.25·170 − 5·35 − 161 = 700 + 1062.5 − 175 − 161 = 1426.5
    expect(mifflinStJeorBmr("female", 70, 170, 35)).toBe(1426.5);
  });

  it("computes the male form (same metrics, +5 vs −161 → +166 kcal)", () => {
    // The two forms differ only by the constant: +5 − (−161) = 166 kcal.
    expect(mifflinStJeorBmr("male", 70, 170, 35)).toBe(1426.5 + 166);
  });
});

describe("computeEnergyAndMacros — worked Example A (Active, Maintain)", () => {
  // 35 y ♀, 70 kg, 170 cm → BMR 1426.5 → TDEE ×1.75 = 2496.375 → Maintain ×1.00.
  const result = computeEnergyAndMacros({
    sex: "female",
    weightKg: 70,
    heightCm: 170,
    ageYr: 35,
    activity: "active",
    goal: "maintain",
  });

  it("reproduces the worked figures (energy 2496, protein 112, fat 83, carbs 325, fibre 35)", () => {
    expect(Math.round(result.energy)).toBe(2496);
    expect(Math.round(result.protein)).toBe(112);
    expect(Math.round(result.fat)).toBe(83);
    expect(Math.round(result.carbs)).toBe(325);
    // Fibre scales with energy: 14 g/1000 kcal × 2496.375 ≈ 34.9 → 35 g, above the
    // baked 28 g because this person's target exceeds the 2000-kcal reference.
    expect(Math.round(result.fiber_content)).toBe(35);
  });

  it("returns unrounded values (TDEE ×1.75, protein exactly 1.6 g/kg, fibre per-kcal)", () => {
    expect(result.energy).toBeCloseTo(2496.375, 3);
    expect(result.protein).toBe(112); // 1.6 × 70, exact
    expect(result.fat).toBeCloseTo(83.2125, 3); // 0.30 × 2496.375 / 9
    expect(result.carbs).toBeCloseTo(324.865625, 3);
    expect(result.fiber_content).toBeCloseTo(34.94925, 5); // 14 × 2496.375 / 1000
  });

  it("stays above BMR, so the safety clamp does not bite", () => {
    const bmr = mifflinStJeorBmr("female", 70, 170, 35);
    expect(result.energy).toBeGreaterThan(bmr);
  });
});

describe("computeEnergyAndMacros — worked Example B (Active, Lose)", () => {
  // Same person, goal Lose (−20 %): energy 2496.375 × 0.80 = 1997.1.
  const result = computeEnergyAndMacros({
    sex: "female",
    weightKg: 70,
    heightCm: 170,
    ageYr: 35,
    activity: "active",
    goal: "lose",
  });

  it("reproduces energy 1997 and holds protein at 112 (the g/kg anchor)", () => {
    expect(Math.round(result.energy)).toBe(1997);
    // Protein is anchored to bodyweight, so it does NOT fall with calories —
    // the whole reason the helper writes macros rather than energy alone.
    expect(result.protein).toBe(112);
  });

  it("still clears BMR (1997 > 1427), so no clamp", () => {
    expect(result.energy).toBeGreaterThan(
      mifflinStJeorBmr("female", 70, 170, 35)
    );
  });
});

describe("computeEnergyAndMacros — BMR safety clamp (never below resting burn)", () => {
  it("floors the natural sedentary+lose target at BMR (percentage floor and clamp agree)", () => {
    // At the sedentary PAL (1.25) a −20 % cut lands at 1.25 × 0.80 = 1.00 × BMR —
    // exactly BMR — so the goal-adjusted target and the clamp coincide.
    const bmr = mifflinStJeorBmr("male", 80, 180, 30); // 1780
    const result = computeEnergyAndMacros({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      ageYr: 30,
      activity: "sedentary",
      goal: "lose",
    });
    expect(result.energy).toBe(bmr);
  });

  it("floors a manual nudge that dips below BMR back up to BMR", () => {
    // The manual nudge (energyOverrideKcal) is still subject to the floor: a
    // 1000-kcal nudge under a 1780-kcal BMR is pulled back up to resting burn.
    const bmr = mifflinStJeorBmr("male", 80, 180, 30); // 1780
    const result = computeEnergyAndMacros({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      ageYr: 30,
      activity: "active",
      goal: "maintain",
      energyOverrideKcal: 1000,
    });
    expect(result.energy).toBe(bmr);
  });

  it("honours a manual nudge that stays above BMR", () => {
    const result = computeEnergyAndMacros({
      sex: "female",
      weightKg: 70,
      heightCm: 170,
      ageYr: 35,
      activity: "active",
      goal: "maintain",
      energyOverrideKcal: 2200,
    });
    expect(result.energy).toBe(2200);
    // Macros track the accepted (nudged) energy, not the pre-nudge TDEE.
    expect(result.fat).toBeCloseTo((0.3 * 2200) / 9, 6);
    // Fibre scales off the same accepted energy: 14 g/1000 kcal × 2200 = 30.8 g.
    expect(result.fiber_content).toBeCloseTo((14 * 2200) / 1000, 6);
  });
});

describe("computeEnergyAndMacros — fibre (energy-scaled, ADR-0033 Amendment 2)", () => {
  it("reproduces the baked 28 g exactly when the accepted energy is the 2000-kcal reference", () => {
    // A person whose maintain target lands on 2000 kcal via a manual nudge — the
    // personalized fibre must equal the baked default at the reference diet, so the
    // new rule never disagrees with the old flat value at 2000 kcal.
    const result = computeEnergyAndMacros({
      sex: "female",
      weightKg: 70,
      heightCm: 170,
      ageYr: 35,
      activity: "active",
      goal: "maintain",
      energyOverrideKcal: 2000,
    });
    expect(result.fiber_content).toBe(28); // 14 × 2000 / 1000
  });

  it("floors fibre at the resting-burn diet, never below (clamp propagates)", () => {
    // Same clamp case as the energy floor: sedentary + lose lands at BMR (1780), so
    // fibre is 14 × 1780 / 1000 = 24.92 g, not a below-resting figure.
    const result = computeEnergyAndMacros({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      ageYr: 30,
      activity: "sedentary",
      goal: "lose",
    });
    expect(result.fiber_content).toBeCloseTo((14 * 1780) / 1000, 6);
  });
});

describe("computeEnergyAndMacros — carbs ≥ 0 clamp (defensive)", () => {
  it("clamps the carb remainder at 0 instead of going negative", () => {
    // A degenerate high-protein / low-energy case where protein + fat energy
    // exceeds the (BMR-floored) target: the remainder would be negative, so the
    // clamp holds it at 0 rather than producing a nonsensical target.
    const result = computeEnergyAndMacros({
      sex: "female",
      weightKg: 40,
      heightCm: 85,
      ageYr: 90,
      activity: "sedentary",
      goal: "lose",
    });
    expect(result.carbs).toBe(0);
    // The pre-clamp remainder is genuinely negative here (guard actually bites).
    const preClamp = result.energy - 4 * result.protein - 9 * result.fat;
    expect(preClamp).toBeLessThan(0);
  });
});
