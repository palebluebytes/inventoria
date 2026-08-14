# Research: multimodal-LLM cost & accuracy for nutrition-label extraction

> **Ticket:** [#49](https://github.com/palebluebytes/inventoria/issues/49) — parent map [#47](https://github.com/palebluebytes/inventoria/issues/47) (label-photo food-capture).
> **Question:** Can a multimodal LLM reliably turn a nutrition-label photo into the structured full `nutrition/info` panel, and at what cost? This is the evidence the user's stated caution about **cost and accuracy** demands before committing the `autofillFromPackageImage` stub (`src/lib/food/ai-autofill.ts`) to a real multimodal call.
> **Date:** 2026-07-31. Model ids and pricing are quoted from the authoritative **`claude-api` skill** (the ticket forbids answering these from memory); vision/structured-output mechanics are quoted from platform.claude.com primary docs.

---

## TL;DR

- Reading a full nutrition panel from a phone photo with Claude vision + strict structured output costs **well under one cent per label** on the cheapest capable model, and about **two cents** on the tier that reads dense/degraded print best. Cost is **not** a real objection.
- Strict JSON-schema output **guarantees the shape** of the panel (valid JSON, every required field present, correct types) via constrained decoding — it eliminates the "malformed / missing-row / wrong-type" failure class outright. It does **not** guarantee the _values are correct_: it cannot range-check a hallucinated number, cannot tell mg from g, and (for required fields) will force _a_ value even when the label row was unreadable.
- The residual risk is therefore **value fidelity on the exact hard samples** in the map (German/Dutch, Spanish two-photo, multilingual Indian; comma-decimals; 12 micronutrients in mg/µg that must be stored in grams). That risk is plausibly small given Claude's multilingual OCR + instruction-following, but it is **unproven on these labels** — which is exactly what the prototype ticket must retire.
- **Recommended mechanism for #51:** AI autofill **into the existing guided-manual panel as a pre-filled draft the user confirms**, not blind trust. That caps the blast radius of any hallucination to a human-reviewed correction while keeping the sub-cent cost.

---

## 1. Claude vision models — ids, pricing, and the cheapest that can read a label

Model ids and per-token pricing (per the **`claude-api` skill**, cached 2026-06-24):

| Model                | Model id            | Input $/1M                        | Output $/1M           | Vision resolution tier |
| -------------------- | ------------------- | --------------------------------- | --------------------- | ---------------------- |
| Claude Fable 5       | `claude-fable-5`    | $10.00                            | $50.00                | High-res               |
| Claude Opus 4.8      | `claude-opus-4-8`   | $5.00                             | $25.00                | High-res               |
| Claude Opus 4.7      | `claude-opus-4-7`   | $5.00                             | $25.00                | High-res               |
| Claude Opus 4.6      | `claude-opus-4-6`   | $5.00                             | $25.00                | Standard               |
| Claude Sonnet 5      | `claude-sonnet-5`   | $3.00 ($2.00 intro to 2026-08-31) | $15.00 ($10.00 intro) | High-res               |
| Claude Sonnet 4.6    | `claude-sonnet-4-6` | $3.00                             | $15.00                | Standard               |
| **Claude Haiku 4.5** | `claude-haiku-4-5`  | **$1.00**                         | **$5.00**             | Standard               |

**Anthropic bills images as text tokens** — there is no separate per-image fee. Claude reads an image in 28×28-pixel patches ("visual tokens"): an image costs `⌈width / 28⌉ × ⌈height / 28⌉` visual tokens ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). Each model caps resolution by a long-edge limit and a visual-token limit; larger images are downscaled first:

| Tier            | Models               | Max long edge | Max visual tokens |
| --------------- | -------------------- | ------------- | ----------------- |
| High-resolution | Claude 4.7 and later | 2576 px       | 4784              |
| Standard        | all other models     | 1568 px       | 1568              |

(Source: [vision docs → Resolution and token cost](https://platform.claude.com/docs/en/build-with-claude/vision).) So a typical downscaled label photo costs **~1,500 visual tokens on the standard tier** (e.g. a 1920×1080 photo → 1456×819 → 1,560 tokens) and up to ~2,700–4,800 on the high-res tier. Supported formats: JPEG, PNG, GIF, WebP; ≤10 MB base64 on the Claude API; up to 100 images/request on 200k-context models (600 on others) (same source).

**Cheapest model that can plausibly read a label:** **Claude Haiku 4.5** (`claude-haiku-4-5`, $1/$5). It is the lowest-cost _current_ model that supports **both** image input **and** strict structured output — structured outputs are available on "Claude 4.5 and later," with Haiku 4.5 explicitly listed ([structured-outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs); `claude-api` skill). Everything below Haiku 4.5 in the catalogue is retired.

**Accuracy/cost trade-off between tiers.** The load-bearing difference for _this_ task is the **vision resolution tier**, not headline reasoning benchmarks. Haiku 4.5 and Sonnet 4.6 are **standard tier** (photo downscaled to ≤1568 px long edge, ≤1568 visual tokens); Sonnet 5, Opus 4.7/4.8, and Fable 5 are **high-resolution tier** (≤2576 px, up to 4784 visual tokens — "up to roughly three times more visual tokens" of fidelity, [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). The map's grounding investigation found the real labels are precisely the hard cases — small multilingual micronutrient rows, a two-photo olive-oil bottle, degraded Indian packaging. On those, the extra fidelity of the high-res tier is the difference between reading a 6-pt "Vitamine B12 … 0,5 µg" row and dropping it. So: **Haiku 4.5 is the cost/latency floor; the high-res tier (Sonnet 5 first) is the accuracy escalation** when standard-tier downscaling loses fine print.

---

## 2. Structured-output reliability for a fixed nutrition schema

The target is the full `NutritionInfo` panel (`src/lib/food/nutrition.ts`): 4 macros + saturated/fibre/sugar/salt + 12 micronutrients + name/brand + a per-100g-vs-per-serving basis flag — ~23 fields, values stored in **grams** (ADR-0021/-0030).

**What strict structured output guarantees** ([structured-outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)):

- **Always valid JSON** — no parse errors.
- **Type-safe** — every field is the declared type.
- **Schema-compliant** — the response matches the JSON schema _exactly_, including that all `required` fields are present.

These come from **constrained decoding**, so they hold structurally. Set on `output_config.format` (JSON output) and/or `strict: true` (tool inputs). First use of a new schema pays a one-time grammar-compilation latency; compiled grammars are then **cached 24 h** (same source).

**What it does NOT guarantee — the failure modes that matter here:**

1. **Hallucinated values.** The schema constrains _shape_, not _truth_. It has **no numerical constraints** — `minimum`/`maximum`/`multipleOf` are unsupported ([structured-outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)) — so an implausible value (e.g. "protein 5000 g") passes schema validation. Claude "might hallucinate or make mistakes when interpreting low-quality, rotated, or very small images" ([vision docs → Limitations](https://platform.claude.com/docs/en/build-with-claude/vision)) — the exact conditions of the map's real samples. **Mitigation:** treat schema-conformance as necessary-but-not-sufficient; keep a human-confirm step (see §6).
2. **Unit confusion.** Labels print macros in grams but micronutrients in **mg/µg**, while the panel stores everything in **grams**. The schema cannot enforce the conversion, and there is no first-party guarantee the model converts mg→g correctly. **Mitigation:** either capture `{value, unit}` per nutrient and convert in code (deterministic, recommended), or instruct conversion in the prompt and verify.
3. **Missing rows forced to fabricated values.** For a `required` field the model must emit _something_; if a label omits (say) fibre, constrained decoding will still produce a number. **Mitigation:** make every nutrient field **nullable** (`type: ["number", "null"]`) so "not on this label" is representable rather than invented. Nullability is the single most important schema-design decision for this task.
4. **Refusal / truncation.** On `stop_reason: "refusal"` or `max_tokens`, the output may not conform or may be incomplete ([structured-outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs); `claude-api` skill). At ~700 output tokens for the panel this is a non-issue with a sane `max_tokens`, but handle both stop reasons.

Net: structured output **removes** the "malformed / wrong-type / missing-key" class of bugs that would otherwise dominate free-text extraction. It **relocates** the risk entirely to value fidelity, which is where the prototype and the human-confirm UI must do the work.

---

## 3. Multilingual labels and comma-decimals

The real samples are German/Dutch, Spanish ("Aceite"), and multilingual Indian packaging, with European comma-decimals ("5,4 g").

- **Non-English nutrient names.** This is two steps: OCR the label text (Claude vision reads text in the image regardless of script), then map foreign nutrient names ("Eiwitten"/"Proteínas"/"Kohlenhydrate") onto the fixed schema fields — an LLM reasoning task Claude handles well in general. **However, the vision docs make no specific claim about nutrition-label OCR or non-English nutrient-name mapping accuracy, and there is no first-party benchmark for it.** This is a reasoned expectation, not a measured guarantee.
- **Comma-decimals.** "5,4 g" must be normalised to `5.4`. Nothing in the schema does this; it relies on the model reading European convention correctly, or on a prompt instruction plus a code-side sanity pass. Same "unproven on these labels" caveat.
- **Two-photo products** (the olive oil: nutrition on one side, barcode on the other) are supported — the API accepts multiple images in one request and analyses them jointly ([vision docs → Multiple images](https://platform.claude.com/docs/en/build-with-claude/vision)).

**Verdict:** multilingual + comma-decimal handling is _plausible_ from Claude's general multilingual OCR and instruction-following, but it is the **single biggest unproven assumption** in the whole approach. The prototype ticket must run the four real labels through the chosen model and inspect the JSON before #51 commits.

---

## 4. Cost per label captured, end-to-end

Assume one label = **1–2 photos** downscaled to the standard tier (~1,500 visual tokens each) + a system/schema prompt (~1,000 input tokens) + the panel JSON out (~700 output tokens). Using the §1 prices:

| Model                        | 1-photo label | 2-photo label | 1,000 captures (2-photo) |
| ---------------------------- | ------------- | ------------- | ------------------------ |
| **Haiku 4.5** ($1/$5)        | ~**$0.006**   | ~**$0.008**   | ~**$8**                  |
| Sonnet 5 ($3/$15, high-res)¹ | ~$0.018       | ~$0.022       | ~$22                     |
| Opus 4.8 ($5/$25, high-res)¹ | ~$0.030       | ~$0.035       | ~$35                     |

¹ High-res tier images cost more visual tokens (up to ~4784 each), so the Sonnet 5 / Opus 4.8 figures are conservative upper bounds. Even so, **1,000 full-panel captures cost single-digit-to-mid-tens of dollars.** The user's cost caution is effectively resolved: at Haiku, ~10,000 label captures ≈ $80.

**Latency.** Haiku 4.5 is the fastest tier; a single vision + small-JSON call is interactive (a few seconds), non-streaming is fine at ~700 output tokens. The **first** request against a new schema pays a one-time grammar-compilation delay, then the grammar is cached 24 h ([structured-outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). No first-party per-request latency SLA is published; treat as "single-digit seconds, interactive," to be confirmed in the prototype. Note: this is a **network round-trip**, so the flow needs online connectivity and a graceful-degradation path back to guided-manual entry (the app is a local-first PWA).

---

## 5. Guided-manual alternative (zero-model baseline)

Guided-manual entry — the map's locked fallback (decision 5) and today's `saveCustomFood()` path — has **zero model cost, zero API latency, no network dependency (works offline), and no hallucination risk**. Its cost is _user effort_: transcribing ~23 fields (4 macros + 4 sub + 12 micros + name/brand + basis) by hand is high-friction and itself error-prone — plausibly 1–3 minutes per food — which is exactly the friction AI autofill exists to remove. Its "accuracy" is whatever the user types (the floor, not a ceiling).

The real #51 decision is therefore **not** "AI vs manual" as mutually exclusive. Because AI cost is sub-cent, the framing collapses to: **AI-autofill-then-human-confirm** (model drafts the panel, user reviews/corrects in the guided-manual UI) **vs guided-manual-only**. The former dominates on effort at negligible cost, _provided_ extraction accuracy on the real labels is good enough that correcting a draft is cheaper than typing from scratch — the thing the prototype measures.

---

## 6. Bottom line for #51 ("Decide the extraction mechanism")

- **Recommended mechanism:** **multimodal-LLM autofill that pre-fills the existing guided-manual panel as an editable draft the user confirms** — never blind-committed. Human-confirm caps hallucination blast-radius to a review-and-correct while preserving sub-cent cost. Guided-manual stays as both the confirmation surface and the offline/failure fallback.
- **Recommended model:** default to **Claude Haiku 4.5** (`claude-haiku-4-5`) — cheapest model with vision + strict structured output. **Escalate to a high-resolution-tier model, Claude Sonnet 5 (`claude-sonnet-5`) first,** if the prototype shows standard-tier downscaling drops micronutrient rows or misreads small multilingual print (the likely case for the real samples). Reserve Opus 4.8 for a last resort. Use `strict`/`output_config.format` with **every nutrient field nullable**, and capture micronutrient `{value, unit}` for deterministic mg→g conversion in code.
- **Cost-per-capture figure to plan against:** **~$0.006–0.008/label on Haiku 4.5**, **~$0.02/label on Sonnet 5** (both 2-photo, full panel). Cost is a non-issue.
- **Accuracy verdict:** **Schema shape is guaranteed** (valid JSON, all fields present, correct types — the malformed/missing-row failure class is eliminated by constrained decoding). **Value fidelity is not guaranteed and is unproven on the real German/Dutch, Spanish, and Indian labels** — hallucinated numbers, mg↔g unit confusion, and comma-decimal ("5,4 g") reads are the live risks, none catchable by the schema. **This is decision-support, not autonomous truth: ship it behind a human-confirm step, and run the prototype against the four real sample labels before locking the model choice.**

---

## Addendum (2026-08-03): chosen delivery path — Workers AI native, provider-swappable, user-key-gated

> **Decision (supersedes the model-choice framing above for delivery):** run extraction through a **Cloudflare Workers AI native vision model**, built behind a **provider abstraction** so the model/provider can be swapped later without touching the capture flow, and **gate the worker with an API key the user configures in the app's Settings** (never bundled). The §1/§6 Claude analysis remains valid as the accuracy benchmark and as the first alternate provider to slot behind the abstraction.
> Cloudflare figures quoted from primary docs (Aug 2026).

### Why Cloudflare is the natural home

Inventoria **already deploys a Cloudflare Worker** (`worker/src/index.ts`, the scraping proxy — ADR-0007) on Cloudflare Workers hosting (ADR-0005). The LLM call adds **no new backend** — it's a second route on the worker we already run, mirroring `/api/proxy`.

### Delivery: Workers AI native model (`env.AI` binding)

Run an open-weight vision model on Cloudflare; billing hits the Cloudflare account. Best fit: **`@cf/meta/llama-3.2-11b-vision-instruct`** (image input **and** JSON mode). Alternatives to trial in the #51 prototype: `llama-4-scout-17b`, `mistral-small-3.1-24b`, `moondream3.1` (explicit OCR + structured output).

- **Pricing:** `$0.011 / 1,000 neurons`, **10,000 neurons/day free**. Llama 3.2 11B Vision = 4,410 neurons/M input, 61,493/M output.
- **Per label** (~1 photo + schema prompt + ~700-token JSON out) ≈ **~56 neurons ≈ $0.0006**; free tier covers **~175 captures/day (~5,000/month) at $0**; 1,000 captures ≈ **$0.62**.
- **Trade-offs accepted** (vs. the Claude analysis above): (1) Workers AI JSON mode is **best-effort — Cloudflare explicitly "can't guarantee that the model responds according to the requested JSON Schema,"** so the worker must **validate the `AIAutofillResult` shape and retry/repair**, not trust it; (2) open-weight OCR on the §3 multilingual hard labels is **weaker than Claude and unproven** — the #51 prototype runs the four real labels through the chosen model before locking it. Human-confirm (§6) already caps the blast radius of a bad read.

### Provider abstraction (swap-friendly by design)

Keep the model call behind one seam so switching provider (to Claude via AI Gateway, or any other) is a single impl swap, not a flow rewrite:

- **Client seam (already exists):** `autofillFromPackageImage(imageBase64) -> AIAutofillResult` in `src/lib/food/ai-autofill.ts` stays the _only_ thing the capture flow (#53) and confirm form (#52/#57) know about. Local dev keeps the stub (ADR-0007 workerd/NixOS blocks Workers AI in the Vite mock); it POSTs to the real worker only in preview/prod.
- **Worker seam:** a `LabelExtractor` interface `(images, schema) -> AIAutofillResult` with a `WorkersAiExtractor` impl calling `env.AI.run(...)`. A future `AiGatewayExtractor` (→ Claude, §6) drops in behind the same interface — route, request/response shape, and client all unchanged. **Each impl normalises its provider's raw output into `AIAutofillResult` internally**, so provider quirks (JSON-mode slop, unit formats, comma-decimals) never leak upward.

### Gating: user-supplied API key in Settings

The route spends money, so it must reject anonymous callers. Model: **the worker holds a configured secret; the app does NOT bundle it — the user pastes their key into Settings**, and it's sent on each request (e.g. `Authorization: Bearer …`) for the worker to verify. Because the key is user-provided and lives in the user's settings, not the public bundle, this is a **real** gate (the earlier "bundled key is only obfuscation" caveat does not apply here), and it matches the app's established secrets convention.

- **Store it like #60 stores the others** — localStorage settings, off the EAVT ledger (alongside OFF/USDA/TMDB keys).
- **Worker check:** constant-time compare against its configured secret (Wrangler secret / env var); `401` on mismatch or absence.
- **Hard spend cap** on the Cloudflare account as the worst-case backstop, independent of key leakage.
- **Origin check** as a cheap extra filter (not a security boundary).

This is a #51 / impl-ticket decision and lands on the same worker route as the model call.

---

## Sources

- **`claude-api` skill** (authoritative for model ids and pricing, cached 2026-06-24) — model catalogue, per-token pricing, structured-output supported models.
- [Vision — platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/vision) — visual-token cost formula (`⌈w/28⌉×⌈h/28⌉`), resolution tiers (2576 px / 4784 tokens high-res; 1568 px / 1568 tokens standard), image billing as text tokens, formats/limits, multi-image support, accuracy limitations.
- [Structured outputs — platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — schema-conformance guarantees (valid JSON, type-safe, required fields via constrained decoding), unsupported constraints (no numeric/string-length constraints, no recursion), grammar compilation + 24 h cache, refusal/max_tokens caveat.
- Map [#47](https://github.com/palebluebytes/inventoria/issues/47) grounding investigation — the four real sample labels, comma-decimals, the full-panel target schema, and the `autofillFromPackageImage` / `saveCustomFood` code targets.
- **Addendum sources (Cloudflare, Aug 2026):** [Workers AI models](https://developers.cloudflare.com/workers-ai/models/) (vision model catalogue), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) ($0.011/1,000 neurons, 10,000 neurons/day free, per-model neuron rates), [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) (supported models incl. `llama-3.2-11b-vision-instruct`; the no-schema-guarantee caveat). Future alternate provider behind the abstraction: [AI Gateway — Anthropic](https://developers.cloudflare.com/ai-gateway/providers/anthropic/) (BYOK server-side key routing to Claude). Local architecture: ADR-0005 (Workers hosting), ADR-0007 (`worker/src/index.ts` serverless proxy), #60 (secrets→localStorage settings convention this reuses).
