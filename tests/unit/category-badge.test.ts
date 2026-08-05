import { describe, it, expect } from "vitest";
import { categoryBadgeVariant } from "../../src/lib/views/habits/category-badge";

// Pins the single source of the habit-category → Badge colour mapping: a
// closed set of five outcomes selected by a free-form, case-insensitive
// category string, with `neutral` as the unknown-category fallback.
describe("categoryBadgeVariant", () => {
  it("maps the four known categories to their variants", () => {
    expect(categoryBadgeVariant("fitness")).toBe("success");
    expect(categoryBadgeVariant("health")).toBe("error");
    expect(categoryBadgeVariant("mind")).toBe("default");
    expect(categoryBadgeVariant("productivity")).toBe("warning");
  });

  it("is case-insensitive", () => {
    expect(categoryBadgeVariant("FITNESS")).toBe("success");
    expect(categoryBadgeVariant("Health")).toBe("error");
    expect(categoryBadgeVariant("MiNd")).toBe("default");
  });

  it("falls back to neutral for any unknown/custom category", () => {
    expect(categoryBadgeVariant("chores")).toBe("neutral");
    expect(categoryBadgeVariant("")).toBe("neutral");
    expect(categoryBadgeVariant("finance")).toBe("neutral");
  });
});
