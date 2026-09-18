/**
 * PROTOTYPE, throwaway (#509). Asks Workers AI to estimate the calories of a
 * plate photograph, through the `inventoria-model-route` gateway, at the
 * resolution the app itself would send (MAX_PHOTO_EDGE 1600, quality 80 —
 * src/lib/food/image-file.ts). Writes RAW responses; scoring is a separate pass
 * (score.mjs) so the raw outputs survive the judgement. #482's method, copied.
 *
 * Ground truth is Nutrition5k (CC BY 4.0), weighed to ±1 g — see slice.mjs and
 * README.md. Images are NOT committed: they are third-party and 640x480 each;
 * fetch.mjs pulls them into TMP.
 *
 * Run: node scratch/509/harness.mjs <run> [--prompt bare|itemised|noguard]
 *      [--model llama-4-scout] [--dishes N|all] [--repeats 1]
 *      [--only id,id] [--controls] [--frame overhead|side|both]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ENV = Object.fromEntries(
  readFileSync("/home/inkpotmonkey/code/inventoria/.env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ])
);
const ACCOUNT = ENV.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = ENV.CLOUDFLARE_AI_API_TOKEN;
const GATEWAY = "inventoria-model-route";

const TMP =
  "/tmp/claude-1000/-home-inkpotmonkey-code-inventoria--claude-worktrees-wayfinder-474-ask-a-model/9155f163-0b21-471f-bd75-bc4192434915/scratchpad/n5k";

const MODELS = {
  "llama-4-scout": { id: "@cf/meta/llama-4-scout-17b-16e-instruct" },
  "mistral-small-3.1": { id: "@cf/mistralai/mistral-small-3.1-24b-instruct" },
};

// ---------------------------------------------------------------------------
// The prompts. Three variants, differing in exactly one thing each, so the
// comparison is a discriminant rather than a vibe.
//
//  bare      — the shipped PlateEstimate shape: { name, calories, ingredients }.
//              Tests whether an estimate the user can only accept or reject
//              wholesale is what the model gives when nothing asks for more.
//  itemised  — adds a per-item breakdown with portion and kcal. Tests #509 Q2:
//              is the estimate checkable, and do the parts sum to the whole?
//  noguard   — itemised with the UNCERTAINTY SENTENCE REMOVED. #482's ablation,
//              re-run for this consumer's own safety property (#509 Q3).
// ---------------------------------------------------------------------------

/** The guard sentence under test. Its whole job is to buy a `null`. */
const GUARD = `- If the photograph does not show food on a plate, or the food is too
  obscured to judge, set "calories" to null and "items" to []. A null is a
  correct answer. Never guess a number for a picture you cannot read.`;

const SHARED_HEAD = `You are looking at a photograph of a plate of food, taken by someone
recording what they are about to eat. Estimate what is on it.

Return a single JSON object, nothing else.`;

const RULES_TAIL = `- "calories" is your estimate of the total energy of the food ON THE PLATE,
  in kcal, as a number. Do not include the plate, and do not estimate a
  typical restaurant portion — estimate what you can actually see.
- Numbers only, no units and no strings, using a POINT as the decimal separator.
- Do not describe the photograph, the plate, the table or the lighting.`;

const PROMPTS = {
  bare: `${SHARED_HEAD}

{
  "name": string or null,
  "calories": number or null,
  "ingredients": [string, ...]
}

Rules, all of them strict:
- "name" is what you would call the dish. "ingredients" names the foods you
  can see, as short plain words — no quantities inside the strings.
${RULES_TAIL}
${GUARD}`,

  itemised: `${SHARED_HEAD}

{
  "name": string or null,
  "calories": number or null,
  "items": [
    { "food": string, "portion": string, "grams": number, "kcal": number },
    ...
  ]
}

Rules, all of them strict:
- "name" is what you would call the dish.
- "items" is one entry per distinct food you can see. "portion" is how you
  would describe the amount to a person looking at the same plate (for
  example "about half a cup", "two slices", "a handful"), "grams" is that
  portion's weight, and "kcal" is that portion's energy.
- "calories" must equal the sum of the items' "kcal". Do not round it away
  from that sum.
${RULES_TAIL}
${GUARD}`,
};
// The ablation: byte-identical to `itemised` with the guard sentence removed.
PROMPTS.noguard = PROMPTS.itemised.replace(`\n${GUARD}`, "");

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const runName = args[0];
if (!runName) throw new Error("usage: harness.mjs <run> [flags]");
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const has = (n) => args.includes(`--${n}`);

const promptKey = flag("prompt", "itemised");
const modelKey = flag("model", "llama-4-scout");
const repeats = Number(flag("repeats", "1"));
const frame = flag("frame", "overhead");
const only = flag("only", null);
const dishArg = flag("dishes", "all");

const slice = JSON.parse(readFileSync("scratch/509/slice.json", "utf8"));
let dishes = slice.dishes;
if (only) {
  const want = new Set(only.split(","));
  dishes = dishes.filter((d) => want.has(d.id));
} else if (dishArg !== "all") {
  dishes = dishes.slice(0, Number(dishArg));
}

/**
 * Controls: photographs that are NOT a plate of food. #482 found the frame
 * printing no panel separated the models fastest; this is its counterpart, and
 * it is the only case where `calories: null` is the demonstrably right answer.
 */
const CONTROLS = [
  {
    id: "control-label-jar",
    kind: "not-a-plate",
    src: "docs/assets/label-samples/as-captured/peanut-butter-8710411045003-panel-and-barcode.jpg",
    note: "a nutrition label, i.e. food packaging — food-adjacent, no plate",
  },
  {
    id: "control-label-oil",
    kind: "not-a-plate",
    src: "docs/assets/label-samples/as-captured/olive-oil-8436578483808-panel.jpg",
    note: "an oil bottle's panel — food-adjacent, no plate",
  },
  {
    id: "control-empty-plate",
    kind: "empty-plate",
    src: join(TMP, "ov", "dish_1557861216.png"),
    note: "dish_1557861216: a plate with nothing on it, 0 kcal / 1 g in the corpus",
  },
  {
    id: "control-zero-row",
    kind: "dirty-row",
    src: join(TMP, "ov", "dish_1556575700.png"),
    note: "dish_1556575700: six cherry tomatoes the corpus records as 0 kcal / 86 g — a dirty row, not an empty plate",
  },
];

const CACHE = join(TMP, "send");
mkdirSync(CACHE, { recursive: true });

/**
 * Re-encode the way the app does on the way out (#477 §2: every outbound image
 * is re-encoded, never passed through). These frames are already under the
 * 1600 px edge, so this is a quality-80 JPEG pass and nothing else.
 */
function jpegFor(srcPath, tag) {
  const out = join(CACHE, `${tag}.jpg`);
  if (!existsSync(out)) {
    execFileSync("magick", [
      srcPath,
      "-resize",
      "1600x1600>",
      "-quality",
      "80",
      out,
    ]);
  }
  return readFileSync(out);
}

/**
 * `frame` picks which of Nutrition5k's two views is sent. #515 §6.4 recommended
 * the side angle as the PRIMARY frame; `--frame side` is what tests that claim,
 * and `--frame both` is the N-image arm (#509 Q4).
 */
function imagesFor(item) {
  if (item.src) return [jpegFor(item.src, item.id)];
  const ov = () => jpegFor(join(TMP, "ov", `${item.id}.png`), item.id);
  const sidePath = join(TMP, "side", `${item.id}.png`);
  const side = () => jpegFor(sidePath, `${item.id}-side`);
  if (frame === "side") return existsSync(sidePath) ? [side()] : [];
  if (frame === "both") return existsSync(sidePath) ? [ov(), side()] : [];
  return [ov()];
}

function requestBody(bufs) {
  return {
    max_tokens: 1200,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPTS[promptKey] },
          ...bufs.map((b) => ({
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${b.toString("base64")}`,
            },
          })),
        ],
      },
    ],
  };
}

async function call(bufs) {
  const t0 = Date.now();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODELS[modelKey].id}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "cf-aig-gateway-id": GATEWAY,
      },
      body: JSON.stringify(requestBody(bufs)),
    }
  );
  const ms = Date.now() - t0;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    ms,
    content: json?.result?.response ?? null,
    usage: json?.result?.usage ?? null,
    raw: res.status === 200 ? null : text.slice(0, 1200),
  };
}

const targets = has("controls")
  ? CONTROLS.filter((c) => existsSync(c.src))
  : dishes;

const results = [];
let neurons = 0;
for (const item of targets) {
  const bufs = imagesFor(item);
  if (!bufs.length) {
    console.log(`skip ${item.id} (no ${frame} frame)`);
    continue;
  }
  for (let r = 0; r < repeats; r++) {
    const out = await call(bufs);
    neurons += out.usage?.neurons ?? 0;
    results.push({
      id: item.id,
      kind: item.kind ?? "plate",
      prompt: promptKey,
      model: modelKey,
      model_id: MODELS[modelKey].id,
      n_images: bufs.length,
      frame,
      repeat: r,
      truth_kcal: item.kcal ?? null,
      truth_mass: item.mass ?? null,
      ...out,
    });
    const tag = out.status === 200 && out.content ? "ok  " : `E${out.status}`;
    console.log(
      `${tag} ${item.id} r${r} ${out.ms}ms ${Math.round(
        out.usage?.neurons ?? 0
      )}n truth=${item.kcal ?? "-"} :: ${String(
        out.content ?? out.raw ?? "<empty>"
      )
        .slice(0, 80)
        .replace(/\s+/g, " ")}`
    );
    await new Promise((z) => setTimeout(z, 3300));
  }
}

const path = `scratch/509/raw-${runName}.json`;
writeFileSync(path, JSON.stringify(results, null, 2));
console.log(
  `\nwrote ${path} (${results.length} rows, ${Math.round(
    neurons
  )} neurons this run)`
);
