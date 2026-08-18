import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
// A plain-Node ops script, deliberately outside the app's tsconfig: the mirror
// check runs on a bare GitHub runner with no install step.
// @ts-ignore
import {
  createRecordCounter,
  countArchiveRecords,
} from "../../scripts/usda-archive.mjs";

// The record counter behind `pnpm usda:backup verify`. USDA's bulk archives are
// a single JSON object whose one key holds every food, and Foundation's array
// carries trailing `null` slots — so the count that matters is the number of
// real records, measured rather than inherited from the manifest it checks.

const count = (json: string, root_key: string) => {
  const counter = createRecordCounter(root_key);
  counter.push(Buffer.from(json, "utf8"));
  return counter.total();
};

describe("createRecordCounter — counting the records in a bulk archive", () => {
  it("counts the elements of the array under the named key", () => {
    const json = '{"FoundationFoods":[{"fdcId":1},{"fdcId":2},{"fdcId":3}]}';
    expect(count(json, "FoundationFoods")).toEqual({
      found: true,
      records: 3,
      null_entries: 0,
    });
  });

  it("separates the real records from the null slots", () => {
    const json = '{"FoundationFoods":[{"fdcId":1},null,null]}';
    expect(count(json, "FoundationFoods")).toEqual({
      found: true,
      records: 1,
      null_entries: 2,
    });
  });

  it("is not fooled by braces, brackets or commas inside a string", () => {
    const json =
      '{"SRLegacyFoods":[{"description":"Beans, snap [green], {raw}"},{"description":"x"}]}';
    expect(count(json, "SRLegacyFoods")).toEqual({
      found: true,
      records: 2,
      null_entries: 0,
    });
  });

  it("is not fooled by an escaped quote inside a string", () => {
    const json = '{"SurveyFoods":[{"description":"a \\" ] } b"},{"a":1}]}';
    expect(count(json, "SurveyFoods")).toEqual({
      found: true,
      records: 2,
      null_entries: 0,
    });
  });

  it("counts nested structures as one record each", () => {
    const json =
      '{"FoundationFoods":[{"foodNutrients":[{"amount":1},{"amount":2}],"portions":[[1,2],[3,4]]},{"fdcId":2}]}';
    expect(count(json, "FoundationFoods")).toEqual({
      found: true,
      records: 2,
      null_entries: 0,
    });
  });

  it("counts scalar elements, and never counts a null slot as a record", () => {
    const json = '{"FoundationFoods":["a",1,true,null]}';
    expect(count(json, "FoundationFoods")).toEqual({
      found: true,
      records: 3,
      null_entries: 1,
    });
  });

  it("reads the named array, not a sibling one", () => {
    const json = '{"decoy":[1,2,3,4,5],"FoundationFoods":[{"a":1},{"b":2}]}';
    expect(count(json, "FoundationFoods")).toEqual({
      found: true,
      records: 2,
      null_entries: 0,
    });
  });

  it("reports an empty array as found, so zero is never a silent pass", () => {
    expect(count('{"FoundationFoods":[]}', "FoundationFoods")).toEqual({
      found: true,
      records: 0,
      null_entries: 0,
    });
    expect(count('{"OtherFoods":[{"a":1}]}', "FoundationFoods")).toEqual({
      found: false,
      records: 0,
      null_entries: 0,
    });
  });

  it("gives the same answer however the stream is chopped up", () => {
    const json =
      '{"FoundationFoods":[{"description":"Beans, snap [green]"},null,{"description":"a \\" b"},null]}';
    const bytes = Buffer.from(json, "utf8");
    const counter = createRecordCounter("FoundationFoods");
    for (const byte of bytes) counter.push(Buffer.from([byte]));
    expect(counter.total()).toEqual({
      found: true,
      records: 2,
      null_entries: 2,
    });
  });

  it("survives a multi-byte character split across two chunks", () => {
    const json = '{"FoundationFoods":[{"description":"Piña, raw"},null]}';
    const bytes = Buffer.from(json, "utf8");
    const split = bytes.indexOf(Buffer.from("ña", "utf8")) + 1;
    const counter = createRecordCounter("FoundationFoods");
    counter.push(bytes.subarray(0, split));
    counter.push(bytes.subarray(split));
    expect(counter.total()).toEqual({
      found: true,
      records: 1,
      null_entries: 1,
    });
  });
});

/** A zip built by hand, so the reader is tested against bytes it did not write. */
function zipOf(files: { name: string; body: Buffer; method: 0 | 8 }[]): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let at = 0;

  for (const { name, body, method } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const stored = method === 8 ? deflateRawSync(body) : body;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(at, 42);

    parts.push(local, nameBytes, stored);
    directory.push(central, nameBytes);
    at += local.length + nameBytes.length + stored.length;
  }

  const centralDirectory = Buffer.concat(directory);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(at, 16);

  return Buffer.concat([...parts, centralDirectory, eocd]);
}

describe("countArchiveRecords — reading the count out of the zip", () => {
  const json = Buffer.from(
    `{"FoundationFoods":[${Array.from({ length: 40 }, (_, i) => `{"fdcId":${i},"description":"Beans, snap [green] ${i}"}`).join(",")},${Array(7).fill("null").join(",")}]}`,
    "utf8"
  );

  it("inflates a deflated entry and counts through it", async () => {
    const zip = zipOf([
      {
        name: "FoodData_Central_foundation_food_json.json",
        body: json,
        method: 8,
      },
    ]);
    await expect(countArchiveRecords(zip, "FoundationFoods")).resolves.toEqual({
      found: true,
      records: 40,
      null_entries: 7,
    });
  });

  it("refuses an entry that is not deflated", async () => {
    const zip = zipOf([{ name: "surveyDownload.json", body: json, method: 0 }]);
    await expect(countArchiveRecords(zip, "FoundationFoods")).rejects.toThrow(
      /compression method 0/
    );
  });

  it("refuses a zip that is not a single JSON entry", async () => {
    const zip = zipOf([
      { name: "foods.json", body: json, method: 8 },
      { name: "readme.txt", body: Buffer.from("notes", "utf8"), method: 8 },
    ]);
    await expect(countArchiveRecords(zip, "FoundationFoods")).rejects.toThrow(
      /one entry/
    );
  });
});
