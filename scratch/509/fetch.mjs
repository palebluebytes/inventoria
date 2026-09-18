/**
 * PROTOTYPE, throwaway (#509). Pulls the slice's images out of Nutrition5k's
 * public bucket into TMP. Nothing is committed: the frames are third-party
 * (CC BY 4.0, attribution in README.md) and the harness only needs them local.
 *
 * The bucket serves anonymously over plain HTTPS - no gcloud, no 181 GB tarball
 * (#515 §6.1).
 *
 * Run: node scratch/509/fetch.mjs [--sides N]   (N side-angle frames as well)
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const TMP =
  "/tmp/claude-1000/-home-inkpotmonkey-code-inventoria--claude-worktrees-wayfinder-474-ask-a-model/9155f163-0b21-471f-bd75-bc4192434915/scratchpad/n5k";
const BASE =
  "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery";

const args = process.argv.slice(2);
const sideN = Number(
  args.indexOf("--sides") === -1 ? 0 : args[args.indexOf("--sides") + 1]
);

const slice = JSON.parse(readFileSync("scratch/509/slice.json", "utf8"));
/** The two control dishes: an empty plate, and a dirty 0 kcal row with food. */
const EXTRA = ["dish_1557861216", "dish_1556575700"];
const ids = [...slice.dishes.map((d) => d.id), ...EXTRA];

mkdirSync(join(TMP, "ov"), { recursive: true });
mkdirSync(join(TMP, "side"), { recursive: true });

let got = 0;
for (const id of ids) {
  const out = join(TMP, "ov", `${id}.png`);
  if (existsSync(out)) continue;
  execFileSync("curl", [
    "-sS",
    "-f",
    "-o",
    out,
    `${BASE}/realsense_overhead/${id}/rgb.png`,
  ]);
  got++;
}
console.log(`overhead: ${ids.length} wanted, ${got} newly fetched`);

// The side-angle videos are 1920x1080 and ~1.7 MB each; frame 1 is extracted
// and the video thrown away. See README - these are NOT the primary frame.
let sides = 0;
for (const d of slice.dishes.slice(0, sideN)) {
  const out = join(TMP, "side", `${d.id}.png`);
  if (existsSync(out)) continue;
  const tmpv = join(TMP, `${d.id}.h264`);
  try {
    execFileSync("curl", [
      "-sS",
      "-f",
      "-o",
      tmpv,
      `${BASE}/side_angles/${d.id}/camera_A.h264`,
    ]);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      tmpv,
      "-frames:v",
      "1",
      out,
    ]);
    sides++;
  } catch {
    console.log(`  no side angle for ${d.id}`);
  }
}
if (sideN) console.log(`side angles: ${sides} extracted`);
