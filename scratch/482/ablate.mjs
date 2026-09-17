/**
 * PROTOTYPE, throwaway (#482). Ablation: how much of the good absent-row
 * behaviour is the MODEL and how much is the PROMPT? Same images, same model,
 * a naive prompt with no anti-fabrication rule. Answers a contract question for
 * #483: is the "absent is never zero" rule prompt-carried or model-carried?
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ENV = Object.fromEntries(
  readFileSync("/home/inkpotmonkey/code/inventoria/.env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ])
);

const KEYS =
  "energy_kj, energy_kcal, fat_g, saturated_fat_g, carbohydrate_g, sugar_g, fiber_g, protein_g, salt_g, vitamin_d_mg, calcium_mg, iron_mg, potassium_mg, vitamin_a_mg, vitamin_c_mg, vitamin_e_mg, vitamin_b6_mg, vitamin_b12_mg, folate_mg, magnesium_mg, zinc_mg";

const NAIVE = `Read this nutrition label and return a JSON object with "name", "brand", "basis" and "nutrition". Use these nutrition keys: ${KEYS}.`;

const FILES = {
  "peanut-butter": "peanut-butter-8710411045003-panel-and-barcode.jpg",
  "olive-oil-panel": "olive-oil-8436578483808-panel.jpg",
  "indian-paste": "indian-paste-8901222932167-panel-and-barcode.jpg",
  "olive-oil-barcode": "olive-oil-8436578483808-barcode.jpg",
};

const out = [];
for (const [label, file] of Object.entries(FILES)) {
  const p = `/tmp/claude-1000/label-482/as-captured-1600-${file}`;
  execFileSync("magick", [
    `docs/assets/label-samples/as-captured/${file}`,
    "-resize",
    "1600x1600>",
    "-quality",
    "80",
    p,
  ]);
  const b64 = readFileSync(p).toString("base64");
  for (let r = 0; r < 2; r++) {
    const t0 = Date.now();
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ENV.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.CLOUDFLARE_AI_API_TOKEN}`,
          "Content-Type": "application/json",
          "cf-aig-gateway-id": "inventoria-model-route",
        },
        body: JSON.stringify({
          max_tokens: 1200,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: NAIVE },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${b64}` },
                },
              ],
            },
          ],
        }),
      }
    );
    const j = await res.json();
    out.push({
      label,
      model: "llama-4-scout",
      arm: "as-captured",
      edge: 1600,
      repeat: r,
      prompt: "naive",
      status: res.status,
      ms: Date.now() - t0,
      content: j?.result?.response ?? null,
      usage: j?.result?.usage ?? null,
    });
    console.log(
      `${label} r${r} ${Date.now() - t0}ms :: ${JSON.stringify(j?.result?.response).slice(0, 110)}`
    );
    await new Promise((z) => setTimeout(z, 3300));
  }
}
writeFileSync("scratch/482/raw-ablate.json", JSON.stringify(out, null, 2));
console.log("wrote scratch/482/raw-ablate.json");
