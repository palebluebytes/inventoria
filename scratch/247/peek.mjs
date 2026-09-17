import { readFileSync } from "node:fs";
const f = JSON.parse(readFileSync(process.argv[2], "utf8"));
const b = JSON.parse(f.body);
console.log("result keys:", Object.keys(b.result));
console.log("usage:", JSON.stringify(b.result.usage));
console.log(
  "typeof response:",
  typeof b.result.response,
  Array.isArray(b.result.response)
);
const content = b.result.choices?.[0]?.message?.content;
console.log("content type:", typeof content);
console.log("--- content ---");
console.log(content);
