import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const HERE = "scratch/247";
const files = readdirSync(HERE).filter(
  (f) => f.endsWith(".json") && f !== "package.json"
);
const head = [
  "file",
  "offers",
  "agrees",
  "wrong",
  "silenceWasRight",
  "stateGap",
  "halluc",
  "refusals",
];
console.log(head.join("\t"));
for (const f of files.sort()) {
  const s = JSON.parse(readFileSync(join(HERE, f), "utf8"));
  if (!s.rows || s.offers === undefined) continue;
  console.log(
    [
      f.replace(".json", ""),
      s.offers,
      s.agrees,
      s.wrong,
      s.wrongWhereSilenceWasRight,
      s.stateGapAccepted,
      s.hallucinated,
      s.silent,
    ].join("\t")
  );
  const r = s.rows.filter((x) => x.inSilent19);
  const t = (p) => r.filter(p).length;
  console.log(
    `  silent19: offers ${t((x) => x.got !== null)} agrees ${t((x) => x.mark === "agrees")}` +
      ` wrong ${t((x) => x.mark.startsWith("WRONG"))} refused-right ${t((x) => x.mark === "refused (right)")}` +
      ` refused-missed ${t((x) => x.mark === "refused (missed)")}`
  );
}
