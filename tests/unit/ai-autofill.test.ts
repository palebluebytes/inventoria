import { describe, it, expect, vi, afterEach } from "vitest";
import {
  autofillFromPackageImage,
  emptyAutofillResult,
  modelOutcomeOf,
  normaliseLabelReading,
  type AIAutofillResult,
} from "../../src/lib/food/ai-autofill";
import {
  ModelExhaustedError,
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
  type LabelReading,
} from "../../src/lib/food/model-route";
import { stubLocalStorage } from "./support/local-storage";

/**
 * The normaliser, over the readings the prototype actually measured
 * (ADR-0115 §5.2, §5.3, §6.2).
 *
 * **The shapes below are not invented.** They are what
 * `@cf/meta/llama-4-scout-17b-16e-instruct` returned for the four committed
 * sample labels at `docs/assets/label-samples/`, recorded on
 * [#482](https://github.com/palebluebytes/inventoria/issues/482) — including the
 * two spellings of absence it used in the same run, which is the case this
 * module exists to get right.
 *
 * Nothing here touches the network, which is the whole reason the transport
 * lives in `model-route.ts`: a pure normaliser can be held to the real labels,
 * and a module that fetches cannot.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reading = (over: Partial<LabelReading> = {}): LabelReading => ({
  name: null,
  brand: null,
  basis: "per_100g",
  nutrition: {},
  ...over,
});

describe("the four sample labels, as the model read them", () => {
  /**
   * The olive oil: a **prose** panel rather than a table, printed per 100 ml,
   * with comma decimals and no fibre row at all. It is the hardest sample in the
   * set and the one where reading beats typing by the widest margin.
   */
  it("reads the olive oil per 100 ml, with the 1000x trap resolved", () => {
    const result = normaliseLabelReading(
      reading({
        name: "ACEITE DE OLIVA VIRGEN EXTRA",
        brand: "La Chinata",
        basis: "per_100ml",
        nutrition: {
          energy_kcal: 899,
          fat_g: 99.9,
          // `13,808 g` on the label. Misread as a thousands separator it is
          // 13,808 g of saturated fat in 100 ml.
          saturated_fat_g: 13.808,
          carbohydrate_g: 0,
          sugar_g: 0,
          // The row this label does not print, in the spelling the model chose.
          fiber_g: null,
          protein_g: 0,
          salt_g: 0,
        },
      })
    );

    expect(result.basis).toBe("per_100ml");
    expect(result.name).toBe("ACEITE DE OLIVA VIRGEN EXTRA");
    expect(result.brand).toBe("La Chinata");
    expect(result.nutrition.saturated_fat_content).toBe(13.808);
    // Absent, not zero: the label prints no fibre row, and the form must render
    // "not measured" rather than a fibre-free claim.
    expect(result.nutrition).not.toHaveProperty("fiber_content");
    // A printed zero is a measurement and survives as one.
    expect(result.nutrition.sugar_content).toBe(0);
  });

  /**
   * The Indian paste prints fibre **as zero**, and the same model answered `0`
   * here and `null` on the oil in the same run. It got the distinction that
   * matters exactly right in both directions while disobeying the spelling the
   * prompt asked for.
   */
  it("keeps a printed zero and drops an absent row, from one response shape", () => {
    const result = normaliseLabelReading(
      reading({ nutrition: { fiber_g: 0, sugar_g: null } })
    );
    expect(result.nutrition.fiber_content).toBe(0);
    expect(result.nutrition).not.toHaveProperty("sugar_content");
  });

  /**
   * The bottle's other face: a barcode and a net quantity, no panel anywhere.
   * Scout and Mistral both returned no nutrition rows at all; the two failing
   * candidates returned a complete panel of zeros.
   */
  it("takes a frame with no panel on it as an empty proposal, not a failure", () => {
    const result = normaliseLabelReading(reading({ nutrition: {} }));
    expect(result.nutrition).toEqual({});
    expect(result.basis).toBe("per_100g");
  });

  // 8 of 21 rows is the correct answer for a label that prints eight, and
  // sparseness is not detectable from a response anyway (#482: a well-formed
  // panel silently omitted four printed rows at `finish_reason: stop`).
  it("does not treat a sparse panel as unusable", () => {
    expect(() =>
      normaliseLabelReading(reading({ nutrition: { energy_kcal: 250 } }))
    ).not.toThrow();
  });
});

describe("eleven rows are transcribed and one is derived", () => {
  it("carries the macros across unchanged", () => {
    const result = normaliseLabelReading(
      reading({
        nutrition: {
          energy_kcal: 250,
          fat_g: 8,
          saturated_fat_g: 2.5,
          carbohydrate_g: 30,
          sugar_g: 12,
          fiber_g: 3,
          protein_g: 15,
        },
      })
    );
    expect(result.nutrition).toMatchObject({
      calories: 250,
      fat_content: 8,
      saturated_fat_content: 2.5,
      carbohydrate_content: 30,
      sugar_content: 12,
      fiber_content: 3,
      protein_content: 15,
    });
  });

  /**
   * The one row whose proposed figure is not the printed figure, and therefore
   * the one the user cannot check by looking at the pack. The wire carries salt
   * as printed because asking the model to divide would be a computed number
   * reaching a panel (rule 3); this division is ours.
   */
  it("divides salt into sodium here, and nowhere else", () => {
    const result = normaliseLabelReading(
      reading({ nutrition: { salt_g: 0.6 } })
    );
    expect(result.nutrition.sodium_content).toBeCloseTo(0.24, 10);
    expect(result.nutrition).not.toHaveProperty("salt_g");
  });

  // Every panel field is stored in grams, and the four micros are asked for in
  // the unit their label prints.
  it("converts the four micros out of the unit the label prints them in", () => {
    const result = normaliseLabelReading(
      reading({
        nutrition: {
          vitamin_d_ug: 5,
          calcium_mg: 120,
          iron_mg: 2.6,
          potassium_mg: 300,
        },
      })
    );
    expect(result.nutrition.vitamin_d).toBeCloseTo(5e-6, 12);
    expect(result.nutrition.calcium).toBeCloseTo(0.12, 10);
    expect(result.nutrition.iron).toBeCloseTo(0.0026, 10);
    expect(result.nutrition.potassium).toBeCloseTo(0.3, 10);
  });

  // The request is what bounds the fabrication surface; a response carrying an
  // extra row is a model being chatty, and dropping it is the same outcome as
  // never having asked.
  it("ignores a key the contract never asked for", () => {
    const result = normaliseLabelReading(
      reading({
        nutrition: { energy_kj: 3701.13, zinc_mg: 4, cholesterol_mg: 2 },
      })
    );
    expect(result.nutrition).toEqual({});
  });

  it("ignores a value that is not a finite number", () => {
    const result = normaliseLabelReading(
      reading({
        nutrition: {
          energy_kcal: Number.NaN,
          fat_g: Number.POSITIVE_INFINITY,
        },
      })
    );
    expect(result.nutrition).toEqual({});
  });
});

/**
 * Dropping to `per_100g` was rejected outright: `invertServingSize`'s fallback
 * is defensible because it reads back a panel we already stored, whereas
 * guessing the basis of a label we have just read **relabels every row at
 * once**.
 */
describe("a basis the panel cannot hold refuses the whole result", () => {
  for (const basis of ["per_serving", null, "per 100ml", "100g"])
    it(`refuses ${JSON.stringify(basis)}`, () => {
      expect(() =>
        normaliseLabelReading(reading({ basis, nutrition: { energy_kcal: 1 } }))
      ).toThrow(ModelUnusableError);
    });

  it("takes the two it can hold", () => {
    expect(normaliseLabelReading(reading({ basis: "per_100g" })).basis).toBe(
      "per_100g"
    );
    expect(normaliseLabelReading(reading({ basis: "per_100ml" })).basis).toBe(
      "per_100ml"
    );
  });
});

describe("the guided-manual starting point is unchanged", () => {
  it("is still an empty result at the basis a label prints", () => {
    const empty: AIAutofillResult = {
      name: null,
      brand: null,
      basis: "per_100g",
      nutrition: {},
    };
    expect(emptyAutofillResult()).toEqual(empty);
  });
});

/**
 * `scanOutcomeOfFailure` a second time, fallthrough included — which is what
 * stops an unrecognised failure being mistaken for a readable answer.
 */
describe("a failure becomes exactly one outcome", () => {
  it("maps each named class", () => {
    expect(modelOutcomeOf(new ModelUnreachableError())).toBe("unreachable");
    expect(modelOutcomeOf(new ModelExhaustedError())).toBe("exhausted");
    expect(modelOutcomeOf(new ModelUnusableError())).toBe("unusable");
    expect(modelOutcomeOf(new ModelRefusedError())).toBe("refused");
  });

  it("falls through to refused for anything it does not recognise", () => {
    expect(modelOutcomeOf(new Error("something else"))).toBe("refused");
    expect(modelOutcomeOf("a string")).toBe("refused");
    expect(modelOutcomeOf(undefined)).toBe("refused");
  });
});

/**
 * The seam the confirm form calls. `autofillFromPackageImage(imageBase64)` was
 * written against a single-image world ADR-0115 §3.1 ended: the request's unit
 * is the capture array at the moment of the tap, and a two-sided bottle
 * genuinely needs both shots.
 */
describe("the seam takes N photographs and throws its classes", () => {
  it("sends every photograph and normalises what comes back", async () => {
    stubLocalStorage();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            name: "La Chinata",
            brand: null,
            basis: "per_100ml",
            nutrition: { energy_kcal: 899, fiber_g: null },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await autofillFromPackageImage(["AAAA", "BBBB"]);

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string
    );
    expect(body.images).toEqual(["AAAA", "BBBB"]);
    expect(result.nutrition.calories).toBe(899);
    expect(result.nutrition).not.toHaveProperty("fiber_content");
  });

  it("throws rather than returning anything partial", async () => {
    stubLocalStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 }))
    );
    await expect(autofillFromPackageImage(["AAAA"])).rejects.toBeInstanceOf(
      ModelUnreachableError
    );
  });
});
