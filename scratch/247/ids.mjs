import { readFileSync } from "node:fs";
const idx = JSON.parse(readFileSync("public/usda/search-index.json", "utf8"));
const by = new Map(idx.foods.map((r) => [r.fdcId, r.description]));
for (const id of process.argv.slice(2).map(Number))
  console.log(id, by.has(id) ? `IN CORPUS  ${by.get(id)}` : "NOT IN CORPUS");
