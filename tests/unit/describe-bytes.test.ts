import { describe, it, expect } from "vitest";
import { describeBytes } from "../../src/lib/storage/describe-bytes";

describe("describing a size to a person", () => {
  it("names bytes, kilobytes, megabytes and gigabytes", () => {
    expect(describeBytes(0)).toBe("0 bytes");
    expect(describeBytes(940)).toBe("940 bytes");
    expect(describeBytes(2_400)).toBe("2.4 KB");
    expect(describeBytes(412_000_000)).toBe("412 MB");
    expect(describeBytes(3_200_000_000)).toBe("3.2 GB");
  });
});
