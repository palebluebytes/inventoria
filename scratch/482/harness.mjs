/**
 * PROTOTYPE, throwaway (#482). Asks Workers AI models to read the four
 * committed label photographs, through the `inventoria-model-route` gateway,
 * at the resolution the app itself would send (MAX_PHOTO_EDGE 1600, quality 80
 * - src/lib/food/image-file.ts). Writes RAW responses; scoring is a separate
 * pass (score.mjs) so the raw outputs survive the judgement.
 *
 * Uses the NATIVE /ai/run/<model> endpoint, not the OpenAI-compatible one,
 * because that is the shape `env.AI.run` sends and therefore the shape that
 * ships. The four candidates need THREE different request shapes; see SHAPES.
 *
 * Run: node scratch/482/harness.mjs <run> [--models a,b] [--labels a,b]
 *      [--repeats N] [--arm as-captured|via-whatsapp] [--edge 1600]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

const SCHEMA_KEYS = [
  "energy_kj",
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrate_g",
  "sugar_g",
  "fiber_g",
  "protein_g",
  "salt_g",
  "vitamin_d_mg",
  "calcium_mg",
  "iron_mg",
  "potassium_mg",
  "vitamin_a_mg",
  "vitamin_c_mg",
  "vitamin_e_mg",
  "vitamin_b6_mg",
  "vitamin_b12_mg",
  "folate_mg",
  "magnesium_mg",
  "zinc_mg",
];

const PROMPT = `You are reading photographs of a food package's nutrition label.

Transcribe ONLY what is printed. Return a single JSON object, nothing else.

{
  "name": string or null,
  "brand": string or null,
  "barcode": string or null,
  "basis": "per_100g" or "per_100ml" or "per_serving" or null,
  "nutrition": { ... }
}

Rules, all of them strict:
- "nutrition" contains a key ONLY for a row the label actually prints. If a row
  is not printed, OMIT THE KEY ENTIRELY. Never write 0 for a row that is absent,
  and never guess a typical value for this kind of food.
- Numbers only, no units and no strings. Use a POINT as the decimal separator:
  a label printing "13,808g" means 13.808.
- Use exactly these keys where the row is printed: ${SCHEMA_KEYS.join(", ")}.
- Micronutrient keys end in _mg and are in milligrams as printed.
- "basis" is the per-quantity the panel declares (per 100 g, per 100 ml, ...).
- Do not correct the label. If the numbers do not add up, transcribe them anyway.`;

/**
 * Three request shapes, one per model family. `chat` takes N images as content
 * parts; `llama32v` takes a byte array and exactly one image; `moondream` is a
 * VQA task model that needs an explicit `stream: false` or the API answers
 * `{"result":{}}` with a 200.
 */
const MODELS = {
  "llama-4-scout": {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    shape: "chat",
  },
  "mistral-small-3.1": {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    shape: "chat",
  },
  "llama-3.2-vision": {
    id: "@cf/meta/llama-3.2-11b-vision-instruct",
    shape: "llama32v",
  },
  moondream: { id: "@cf/moondream/moondream3.1-9B-A2B", shape: "moondream" },
  llava: { id: "@cf/llava-hf/llava-1.5-7b-hf", shape: "llama32v" },
};

const LABELS = {
  "peanut-butter": ["peanut-butter-8710411045003-panel-and-barcode.jpg"],
  "olive-oil-panel": ["olive-oil-8436578483808-panel.jpg"],
  "olive-oil-barcode": ["olive-oil-8436578483808-barcode.jpg"],
  "indian-paste": ["indian-paste-8901222932167-panel-and-barcode.jpg"],
  "olive-oil-both": [
    "olive-oil-8436578483808-panel.jpg",
    "olive-oil-8436578483808-barcode.jpg",
  ],
};

const args = process.argv.slice(2);
const runName = args[0];
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const TMP = "/tmp/claude-1000/label-482";
mkdirSync(TMP, { recursive: true });

const arm = flag("arm", "as-captured");
const edge = Number(flag("edge", "1600"));
const repeats = Number(flag("repeats", "3"));
const modelKeys = flag(
  "models",
  "llama-4-scout,mistral-small-3.1,llama-3.2-vision,moondream"
).split(",");
const labelKeys = flag(
  "labels",
  "peanut-butter,olive-oil-panel,indian-paste"
).split(",");

function jpeg(file) {
  const src = `docs/assets/label-samples/${arm}/${file}`;
  const out = join(TMP, `${arm}-${edge}-${file}`);
  if (!existsSync(out)) {
    execFileSync("magick", [
      src,
      "-resize",
      `${edge}x${edge}>`,
      "-quality",
      "80",
      out,
    ]);
  }
  return readFileSync(out);
}

function requestBody(shape, id, bufs) {
  if (shape === "chat") {
    return {
      max_tokens: 1200,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
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
  if (shape === "llama32v") {
    // One image only: this shape has a single `image` field.
    return {
      prompt: PROMPT,
      image: [...bufs[0]],
      max_tokens: 1200,
      temperature: 0,
    };
  }
  // moondream: VQA task model, one image, and `stream:false` is load-bearing.
  return {
    task: "query",
    question: PROMPT,
    image: `data:image/jpeg;base64,${bufs[0].toString("base64")}`,
    stream: false,
    reasoning: false,
    max_tokens: 1200,
  };
}

function extract(shape, json) {
  if (shape === "chat") {
    return {
      content: json?.result?.response ?? null,
      usage: json?.result?.usage ?? null,
      finish: null,
    };
  }
  if (shape === "llama32v") {
    return {
      content: json?.result?.response ?? null,
      usage: json?.result?.usage ?? null,
      finish: null,
    };
  }
  return {
    content: json?.result?.result?.answer ?? null,
    usage: json?.result?.usage ?? null,
    finish: json?.result?.result?.finish_reason ?? null,
  };
}

async function call(mk, bufs) {
  const { id, shape } = MODELS[mk];
  const t0 = Date.now();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${id}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "cf-aig-gateway-id": GATEWAY,
      },
      body: JSON.stringify(requestBody(shape, id, bufs)),
    }
  );
  const ms = Date.now() - t0;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const got = json
    ? extract(shape, json)
    : { content: null, usage: null, finish: null };
  return {
    status: res.status,
    ms,
    ...got,
    raw: res.status === 200 ? null : text.slice(0, 1200),
  };
}

const results = [];
let neurons = 0;
for (const label of labelKeys) {
  const bufs = LABELS[label].map(jpeg);
  for (const mk of modelKeys) {
    const shape = MODELS[mk].shape;
    if (bufs.length > 1 && shape !== "chat") {
      results.push({
        label,
        model: mk,
        arm,
        edge,
        repeat: 0,
        status: "skipped",
        note: "shape carries exactly one image; the two-photo case is unreachable for this model",
      });
      console.log(`skip ${label} ${mk} (single-image shape)`);
      continue;
    }
    for (let r = 0; r < repeats; r++) {
      const out = await call(mk, bufs);
      neurons += out.usage?.neurons ?? 0;
      results.push({
        label,
        model: mk,
        model_id: MODELS[mk].id,
        arm,
        edge,
        repeat: r,
        ...out,
      });
      const tag = out.status === 200 && out.content ? "ok  " : `E${out.status}`;
      console.log(
        `${tag} ${label} ${mk} r${r} ${out.ms}ms ${Math.round(out.usage?.neurons ?? 0)}n :: ${String(
          typeof out.content === "string"
            ? out.content
            : (JSON.stringify(out.content) ?? out.raw ?? "<empty>")
        )
          .slice(0, 70)
          .replace(/\s+/g, " ")}`
      );
      await new Promise((z) => setTimeout(z, 3300));
    }
  }
}
const path = `scratch/482/raw-${runName}.json`;
writeFileSync(path, JSON.stringify(results, null, 2));
console.log(
  `\nwrote ${path} (${results.length} rows, ${Math.round(neurons)} neurons this run)`
);
