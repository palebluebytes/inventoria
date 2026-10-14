# Research: a tool-using model loop over the local corpus (#556)

**Grounds:** the live Workers AI catalogue and the live **per-model schema endpoint** on this account's own token, read 2026-10-14 — `GET /accounts/<id>/ai/models/search` and `GET /accounts/<id>/ai/models/schema?model=…`; Cloudflare's developer documentation fetched as its own `index.md` source rather than as rendered HTML, each page's "Last updated" line quoted beside the claim; Meta's `meta-llama/llama-models` repository at `main`; Cloudflare's own `cloudflare/ai-utils` source at `main`; and this repo's `worker/src/model.ts`, `scripts/worker-closure-check.mjs` and `public/usda/search-index.json`.
**No inference call was made.** Not one `/ai/run`, not one gateway POST, not one Playground run. Every number below is either quoted from a dated primary source or arithmetic over one, and the three places where only a measurement could settle the question say so in those words.
**Siblings:** [#556](https://github.com/palebluebytes/inventoria/issues/556) is this note's ticket. The capability it would run on is [ADR-0115](../adr/0115-the-app-asks-a-model-through-one-gated-route-and-only-photographs-leave.md); the account-side settings are [`docs/how-to-operate-the-model-route.md`](../how-to-operate-the-model-route.md). The prior art on asking this model to adjudicate a food is [#247](https://github.com/palebluebytes/inventoria/issues/247) (`docs/research/247-can-a-model-propose-a-pairing.md`) and ADR-0115 §12.
**Date:** 2026-10-14. **Status:** read, not measured.

---

## 0. What this note settles, and the one thing it settles against the prototype

The prototype asks whether a model can drive a local search by a hand-rolled text
protocol. Five of the six findings below are about the mechanisms Cloudflare and Meta
publish for doing that natively. The sixth is not about a model at all, and it is the one
that decides the shape:

**the model route's own gate forbids `fetch(` inside `worker/src/model*`, so the loop
cannot live on the Worker.** `scripts/worker-closure-check.mjs`'s `FORBIDDEN_CALLS` lists
`.put(`, `.delete(` and `fetch(` against `MODEL_PREFIX = "worker/src/model"`, matched
against **source text**, so even a comment spelling one out fails the build. The corpus is
a static asset at `/usda/search-index.json` (`src/lib/food/usda-corpus.ts:996`), fetched
over the network; the reader that would search it, `searchIndexRows`, lives in
`src/lib/food/`, which `ALLOWED_PREFIXES = ["worker/src/", "src/lib/ingestion/"]` does not
admit either. Both halves of a Worker-side tool loop are refused by a gate that is already
green, and neither refusal is incidental: the first is ADR-0115's amnesia clause, the
second is ADR-0070's.

So whatever the protocol, **the device drives the loop and the Worker stays a one-shot
inference proxy**. That changes §6's arithmetic (every round is a separate `/api/model`
POST against a 20-request gateway limit) and it changes what has to leave the device
(§7.3). Read §6 and §7 before §1.

## 1. The live catalogue, re-read

Read 2026-10-14 with `CLOUDFLARE_AI_API_TOKEN` at
`https://api.cloudflare.com/client/v4/accounts/<id>/ai/models/search`.

**The catalogue the account can see holds 70 models, 36 of them Text Generation.** The
`per_page=500` in this repo's operator page is silently clamped to `100`, and
`result_info` then reads `count: 70, per_page: 100, total_count: 326`. **`total_count` does
not describe the result set**: `per_page=50&page=2` returns the remaining 20 rows and
still reports `total_count: 326`, and `page=2` at `per_page=100` returns zero. So 326 is a
number to ignore, and a read that trusted it would conclude 256 models were being withheld.
`hide_experimental=false` changes nothing.

**`@cf/meta/llama-4-scout-17b-16e-instruct` is present, and its properties are the answer
to question 1.** Verbatim from the catalogue entry:

| `property_id`      | value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `function_calling` | `"true"`                                                                     |
| `context_window`   | `"131000"`                                                                   |
| `vision`           | `"true"`                                                                     |
| `async_queue`      | `"true"`                                                                     |
| `price`            | `0.27` per M input tokens, `0.85` per M output tokens (USD)                  |
| `terms`            | `https://github.com/meta-llama/llama-models/blob/main/models/llama4/LICENSE` |

The model page agrees and adds the capability tags **Cloudflare-hosted, Batch, Function
calling, Vision** —
[`/workers-ai/models/llama-4-scout-17b-16e-instruct/`](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/),
which carries **no "Last updated" line** (model pages do not). It does **not** carry a JSON
Mode tag. Hold that thought for §3.

**Which models carry `function_calling: "true"`**, of the 36 Text Generation rows, 2026-10-14:
`@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b`, `@cf/moonshotai/kimi-k2.6`,
`@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash`,
`@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-4.7-flash`, `@cf/utter-project/eurollm-9b-it`,
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/ibm-granite/granite-4.0-h-micro`,
`@cf/deepseek-ai/deepseek-v4-flash-0731`, `@cf/deepseek-ai/deepseek-v4-pro-0813`,
`@cf/swiss-ai/apertus-v1.5-8b`, `@cf/nvidia/nemotron-3-120b-a12b`,
`@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/qwen/qwen3.8-27b`, `@cf/google/gemma-4-26b-a4b-it`,
`@cf/mistralai/mistral-small-3.1-24b-instruct`, `@cf/meta/llama-4-scout-17b-16e-instruct`.

Two of those are worth naming now. `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is the
**only** model that is simultaneously in the live catalogue, marked `function_calling`, and
on the JSON Mode supported list (§3) — but its live `context_window` is **24,000**, not
131,000, and it costs `0.293`/`2.253` per M tokens against scout's `0.27`/`0.85`. Seven of
the listed models — `kimi-k2.6`, `kimi-k2.7-code`, `glm-5.2`, `glm-5.3`, `glm-5.3-flash`,
`deepseek-v4-flash-0731` and `deepseek-v4-pro-0813` — **require a paid billing method** per
the pricing page, which puts them outside this account by construction.

**The docs' own example model is gone.** Both function-calling pages, and the JSON Mode
page, demonstrate everything on `@hf/nousresearch/hermes-2-pro-mistral-7b`. It is **not in
the live catalogue** (uncapped check against all 70 names, not a `head`). Nothing on those
pages is reproducible as written.

## 2. Native tool calling: the exact shapes, and three primary sources that disagree

### 2.1 The request

The live per-model schema (`…/ai/models/schema?model=@cf/meta/llama-4-scout-17b-16e-instruct`,
read 2026-10-14) exposes three input variants by `oneOf` title: **`Prompt`**, **`Messages`**
and **`Async_Batch`**. The `Messages` variant's keys, in full:

```
frequency_penalty, functions, guided_json, max_tokens, messages, presence_penalty,
raw, repetition_penalty, response_format, seed, stream, temperature, tools, top_k, top_p
```

`tools` is `"A list of tools available for the assistant to use."` and its items are a
`oneOf` over **two accepted shapes**:

- **flat** — `{ name, description, parameters }`, all three `required`;
- **nested** — `{ type, function: { name, description, parameters } }`, both `required`,
  where `type` is `"Specifies the type of tool (e.g., 'function')."`

In both shapes `parameters` requires `type` and `properties`, takes an optional `required`
array of names, and each property requires **both** `type` and `description`. There is no
`enum`, no `strict`, no `additionalProperties` knob in the declared schema. That matters
for §5: **the tool-parameter schema as Cloudflare declares it has no way to say "one of
these 8 ids".**

`functions` is a **different field** and is not an alias: its items are `{ name, code }`,
both required. That is embedded function calling's wire form, not a tool declaration.

### 2.2 The response — and the disagreement

Three primary sources describe `tool_calls`, and they do not match.

| Source                                                                                                                                                   | Shape                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| live per-model schema, read 2026-10-14                                                                                                                   | `tool_calls[]` of `{ id, type, function: { name, arguments } }`           |
| [`/workers-ai/features/function-calling/traditional/`](https://developers.cloudflare.com/workers-ai/features/function-calling/traditional/), Apr 21 2026 | `[{ "arguments": {…}, "name": "getWeather" }]` — flat, no `id`, no `type` |
| [`cloudflare/ai-utils`](https://github.com/cloudflare/ai-utils) `src/runWithTools.ts` at `main`, read 2026-10-14                                         | typed `tool_calls?: { name: string; arguments: unknown }[]` — flat        |

Cloudflare's own helper, which is the implementation the docs point at, reads
`toolCall.name` and `toolCall.arguments` directly. The live schema for the model we would
actually call says those live under `.function`. **A reader must handle both**, and the
cheap way to find out which arrives is one call that logs the object — which is a
measurement this note did not take.

The `usage` object in the same output schema is `{ prompt_tokens, completion_tokens,
total_tokens }`. That is the single read that would settle every token estimate in §6.

### 2.3 "Traditional" vs "embedded" — the distinction exists, and the comparison made is not reliability

[`/workers-ai/features/function-calling/`](https://developers.cloudflare.com/workers-ai/features/function-calling/)
(Last updated Apr 21, 2026) names both: **embedded** executes the function alongside the
inference call via `@cloudflare/ai-utils`; **traditional** is "industry-standard", you get
`tool_calls` back and call the thing yourself. The page's whole argument for embedded is
one sentence: _"Embedded function calling allowed us to cut down the lines of code from 77
to 31."_

**No Cloudflare page claims native tool calling is more reliable than a prompted text
protocol.** Searched across every page `workers-ai/llms.txt` lists (fetched 2026-10-14) —
there is no reliability claim, no accuracy comparison, no benchmark, and no "prefer tools
over prompting" guidance anywhere in the Workers AI documentation. The nearest thing to
guidance is the Agents product's
[`/agents/tools/codemode/`](https://developers.cloudflare.com/agents/tools/codemode/)
(Last updated Jun 24, 2026), and what it argues is about **context**, not correctness:

> With direct tool calls, each result returns to the model before it chooses the next
> operation. Intermediate data consumes context, even when the model only needs a small
> part of it for the final answer.

and its own routing table says _"Direct tool calls | Simple tasks using a small, known tool
set"_. One search tool and one pick is a small, known tool set. **Cloudflare's only
published guidance on this choice puts the prototype's shape on the direct side.**

For completeness: embedded function calling is refused here on repo grounds before it is
weighed on its merits (§0) — it needs the function body inside the Worker, and the Worker
may not `fetch(` the corpus or import `src/lib/food/`.

## 3. Structured output: the field names are live, the model is not on the list

**Both knobs exist in the live schema for this model** (read 2026-10-14):

- `guided_json` — `object`, `"JSON schema that should be fufilled for the response."`
  (Cloudflare's typo, preserved). It appears in **all three** input variants.
- `response_format` — title `"JSON Mode"`, `{ type: "json_object" | "json_schema",
json_schema: {} }`.

The model page for scout documents both as parameters. So does
[`/workers-ai/features/json-mode/`](https://developers.cloudflare.com/workers-ai/features/json-mode/)
(Last updated Sep 14, 2026), which states the convention — _"JSON Mode is compatible with
OpenAI's implementation"_ — and gives a worked `json_schema` example whose response arrives
under the usual `response` key.

**And that page's supported-model list does not contain
`@cf/meta/llama-4-scout-17b-16e-instruct`.** The list, in full, with its live-catalogue
status as of 2026-10-14:

| Model on the JSON Mode list                     | In the live catalogue? |
| ----------------------------------------------- | ---------------------- |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast`      | yes                    |
| `@cf/meta/llama-3-8b-instruct`                  | **no**                 |
| `@cf/meta/llama-3.1-8b-instruct`                | **no**                 |
| `@hf/nousresearch/hermes-2-pro-mistral-7b`      | **no**                 |
| `@hf/thebloke/deepseek-coder-6.7b-instruct-awq` | **no**                 |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`  | yes                    |

Four of six are gone. Two Cloudflare primary sources therefore contradict each other about
this model: the per-model schema and the model page both offer `response_format`, the
feature page's list omits it. **Which one is true is a measurement, and it is a cheap one** —
one call with a two-field `json_schema`, reading whether the body parses or comes back
`JSON Mode couldn't be met`.

**There is no constrained-decoding guarantee in any case.** The same page:

> Note that Workers AI can't guarantee that the model responds according to the requested
> JSON Schema. Depending on the complexity of the task and adequacy of the JSON Schema, the
> model may not be able to satisfy the request in extreme situations. If that's the case,
> then an error `JSON Mode couldn't be met` is returned and must be handled.

That is the opposite posture from the one `docs/research/49-multimodal-llm-nutrition-extraction.md`
quoted for Claude, where constrained decoding makes schema conformance structural. **On
Workers AI, JSON Mode is a request, not a constraint** — and `JSON Mode couldn't be met`
does not appear in
[`/workers-ai/platform/errors/`](https://developers.cloudflare.com/workers-ai/platform/errors/)
(Last updated Sep 17, 2026) at all, so its code and HTTP status are undocumented.

**`guided_json` is documented nowhere in prose.** It appears in every per-model schema and
on every model page's parameter list, and in no feature page; `workers-ai/llms.txt` has no
page mentioning it. There is no statement of what it does differently from
`response_format`, whether it constrains decoding, or what happens when it cannot be
satisfied. **The docs do not say.**

Also documented: JSON Mode _"currently doesn't support streaming"_, which is irrelevant to
a 30-token reply and worth knowing before someone adds `stream: true`.

## 4. Multi-turn tool loops: the wire takes a `tool` role that neither the model card nor the prompting page knows about

### 4.1 What the wire accepts

The live `messages` item schema for this model (read 2026-10-14) declares exactly three
properties:

```
role           "The role of the message sender (e.g., 'user', 'assistant', 'system', 'tool')."
tool_call_id   "The tool call id. If you don't know what to put here you can fall back to 000000001"
content        string | array of { type, text, image_url:{url} } | one such object
```

So `role: "tool"` and `tool_call_id` are both real fields on the request. The
`tool_call_id` description is the most candid line in the whole schema and should be read
as what it is: **a correlation id the backend does not depend on.**

### 4.2 What Cloudflare's prose and its own code do with them

[`/workers-ai/features/prompting/`](https://developers.cloudflare.com/workers-ai/features/prompting/)
(Last updated Apr 21, 2026) says _"Typically, the role can be one of three options"_ —
system, user, assistant. **It never mentions a `tool` role**, and its multi-turn example is
plain alternating user/assistant.

The function-calling page's traditional example (Apr 21, 2026) is the only prose that shows
a round trip, and it does it like this:

```js
messages: [
  { role: "user", content: "Who is Cloudflare on GitHub?" },
  { role: "assistant", content: JSON.stringify(selected_tool) },
  { role: "tool", content: JSON.stringify(res) },
],
tools: [ /* the same tool array, repeated */ ]
```

**No `tool_call_id` anywhere**, the assistant turn carries the _stringified tool-call
object_ as its text content, and the tool array is resent.

`cloudflare/ai-utils` `src/runWithTools.ts` (read 2026-10-14) does the same thing and adds
one field the official types reject:

```ts
messages.push({
  role: "assistant",
  content: JSON.stringify(toolCallObjectJson),
});
// …
messages.push({
  role: "tool",
  content: JSON.stringify(result),
  // @ts-expect-error workerd types
  name: selectedTool.name,
});
```

So Cloudflare's own canonical loop uses `{ role, content, name }`, never `tool_call_id`,
and has to suppress a type error to do it. Two more things in that file are worth having:

- it logs `Tool ${name} not found, maybe AI hallucinated` — **Cloudflare's own
  implementation expects a fabricated tool name** and returns early on it;
- the **final** turn calls `ai.run(model, { messages, stream })` with **no `tools`** —
  the tool definitions are dropped once the answer is wanted.

### 4.3 Meta documents no round trip for Llama 4 at all

`meta-llama/llama-models/models/llama4/prompt_format.md` at `main` (read 2026-10-14) is
Meta's own prompt-format record for this model family, and it is the primary source that
owns the question.

- **The special-token vocabulary has three roles.** _"`<|header_start|>` and
  `<|header_end|>`: These tokens enclose the role for a particular message. The possible
  roles are: [system, user and assistant]."_ And _"There are 3 different roles that are
  supported by Llama 4"_.
- **The string `ipython` does not occur in the file.** Llama 3.1's tool-result role is
  simply absent from Llama 4's format.
- **The document has no tool-result example.** Its `# Tool calling` section has exactly
  three subsections — zero-shot from the system message, zero-shot from the user message,
  and custom formats — each of which stops at the model's call. There is no worked example
  of feeding a result back, and no section heading for one.
- Tools are declared **in the prompt**, not in a wire field: _"All available functions can
  be provided either in the system message or in the user message"_, as a JSON list, and
  the model answers `[get_weather(city="San Francisco"), get_weather(city="Seattle")]`.
  _"The tool call format for the model is the same whether your function calls are provided
  in the system or user message."_

So the `tools` array and the `tool` role are **Workers AI chat-template conveniences
layered over a model whose published format has neither**. The artifact that would say
exactly how `role: "tool"` is rendered is the model's `chat_template.jinja` on Hugging
Face, and `meta-llama/Llama-4-Scout-17B-16E-Instruct` answers **HTTP 401**: _"Access to
model … is restricted. You must have access to it and be authenticated."_ **The mapping is
not readable from a primary source.**

**And Meta explicitly documents the prototype's approach.** The third subsection,
"Tool calling with custom formats", opens: _"Here is an example of how you could also write
custom instructions for model to do zero shot tool calling. In this example, we define a
custom tool calling format using the `<function>` tag."_ Its system prompt instructs
_"If you choose to call a function ONLY reply in the following format with no prefix or
suffix"_, _"Function calls MUST follow the specified format"_, _"Only call one function at
a time"_, _"Put the entire function call reply on one line"_. **A hand-rolled one-line text
protocol is a mode Meta documents for this model family, not a workaround for lacking one.**
The prototype's `SEARCH:` / `PICK:` / `GIVE UP` is that pattern with different delimiters.

### 4.4 Iteration caps, and repeated calls

**One documented knob, and its default is zero.** `runWithTools`'s `config` takes
`maxRecursiveToolRuns` ([embedded API reference](https://developers.cloudflare.com/workers-ai/features/function-calling/embedded/api-reference/),
Last updated Apr 21, 2026), documented with no default. The source settles it:
`src/runWithTools.ts` has `@param {number} [config.maxRecursiveToolRuns=0]` and
`maxRecursiveToolRuns = 0` in the destructuring, with the recursion gated on
`maxRecursiveToolRuns > 0`. **Cloudflare's own tool loop performs exactly one tool round by
default and does not iterate unless asked.** A 4-round cap is already four times the
reference implementation's default.

**Nothing in any Cloudflare or Meta primary source addresses a model repeating a
near-identical call.** No loop detection, no dedup guidance, no "if the model asks twice"
note. The one adjacent published remark is the Code Mode page's observation that each
direct call's result re-enters context (§2.3), and the embedded troubleshooting page's
performance list — _"Shorten prompts (to reduce time for input processing)"_, _"Reduce
number of tools provided"_ — which is about latency.
[Troubleshooting](https://developers.cloudflare.com/workers-ai/features/function-calling/embedded/troubleshooting/)
(Last updated Apr 21, 2026) names exactly one error: _"If you are getting a `BadInput`
error, your inputs may exceed our current context window."_ **Repeat-call behaviour is
undocumented and is the prototype's own to measure.**

## 5. Choosing from a candidate list

### 5.1 There is no primary source on index-versus-identifier

**Say it plainly: no Cloudflare and no Meta document discusses selecting from a returned
list by index or letter versus by a numeric identifier, and neither publishes anything on
transcription or copy error rates.** Searched across `workers-ai/llms.txt`'s full page list
and across `developers.cloudflare.com` and `llama.com` (2026-10-14). There is a large
third-party literature on this and a larger volume of blog advice; **none of it is primary
and none of it is cited here.** The prototype's own 0-fabrication result over 22 products —
with every pick validated against the rows actually returned — is currently the best
evidence this repo has, and it is this repo's.

The nearest thing to a first-party statement is prompt-level, from Meta's own
function-calling system prompt: _"ONLY use functions that are EXPLICITLY listed in the
function list below"_, _"NEVER create or invent new functions not listed below"_. That is
an instruction, not a guarantee, and it is about function names rather than argument
values.

**And the tool-parameter schema cannot express the constraint.** Per §2.1, a `tools` entry's
`parameters.properties.<name>` requires `type` and `description` and nothing else — no
`enum`. So native tool calling gives no mechanism to restrict `PICK: <id>` to the eight ids
just returned. Validating the pick against the returned set in the harness, which the
prototype already does, remains the only enforcement available on this path.

### 5.2 The one model Cloudflare publishes that makes the question disappear

`@cf/cloudflare/clef-flash` and its two siblings are not in the prototype's frame and they
should be. From the catalogue and the live schema (both read 2026-10-14):

> Clef is a 27B multimodal decision model that turns a state and a schema of typed
> questions into decisions. It reads the state as text, JSON, images, or video, and returns
> a probability for every allowed option of every question.

The input is not `messages`. It is `{ model, state, questions }`, all three required, where
each question is one of three types. The relevant one, verbatim from the live schema:

> **Choice** — `"Pick one option from a set you define. Returns the chosen option, a
probability per option, and confidence."`
> `criteria`: `"Map of option id (non-empty string) to its description: string, object,
array, or null when no detail is needed. **2 to 255 options.**"`

and the answer:

> `choice`: `"The highest-probability option."`
> `probabilities`: `"Probability per option/level; **values sum to 1**."`
> `confidence`: `"How certain the model is, derived from the probabilities."`

Read that against the prototype's three failure classes. The option ids are keys **we
write** — an `fdcId` as a string is a legal option id — and the answer is one of them plus
a distribution over all of them. **A fabricated id is not expressible in the return type.**
The 8 wrong-variant picks become a visible probability spread rather than a confident
single line, and the 4 no-picks get a principled threshold from `confidence` instead of a
`GIVE UP` token. Up to **255** candidates can be adjudicated in **one** call, which for a
local search that returns 8 is a loop with no rounds at all.

Three cautions, each stated as a caution:

1. **Cloudflare never says the decoding is constrained.** The probability-per-option return
   type strongly implies the option set is enumerated rather than generated, and the schema
   says the values sum to 1 — but **the mechanism is not documented**, and "the return type
   makes it impossible" is an inference from a schema, not a quoted guarantee.
2. **255 options is below the corpus.** `public/usda/search-index.json` ships **2,023**
   rows, so a local search still has to narrow before clef sees anything. Clef replaces the
   _adjudication_, not the search.
3. **Clef's terms may be gated, and agreeing is itself an inference call.** Per
   `docs/how-to-operate-the-model-route.md`, acceptance is a `POST /ai/run` answering
   `5016`/`403` with a thank-you message. That call was **deliberately not made** here.
   Clef is absent from that page's gated/not-gated table, so its status is unknown.

Clef also has no `function_calling` property and takes no `messages`, so it is not a
drop-in for anything in §2 — it is a different instrument for a different question, and
the question it is built for is the prototype's.

## 6. Limits that bite a multi-call loop

### 6.1 Context and `max_tokens`

| Quantity                    | Value                       | Source                                                            |
| --------------------------- | --------------------------- | ----------------------------------------------------------------- |
| context window, scout       | **131,000 tokens**          | catalogue `context_window`, and the model page's Model Info table |
| context window, Meta's card | **10M**                     | `llama-models/models/llama4/MODEL_CARD.md`, Scout row             |
| `max_tokens` default        | **256**                     | live per-model schema, all three input variants                   |
| `max_tokens` ceiling        | **the context window**      | glossary: _"This limit cannot exceed the context window."_        |
| `temperature` default       | **0.15**, range 0–5         | live per-model schema                                             |
| `seed`                      | integer, **1 … 9999999999** | live per-model schema                                             |

The 131,000 / 10M gap is worth naming: **Meta's card and Cloudflare's catalogue are both
primary and the one that binds is Cloudflare's.** The prototype's `max_tokens: 30` is far
inside the only documented ceiling; `seed` exists and the prototype is not using it, which
is free determinism for a re-run.

### 6.2 Rate limits — and the one that actually binds is this repo's own gateway

[`/workers-ai/platform/limits/`](https://developers.cloudflare.com/workers-ai/platform/limits/)
(Last updated Sep 17, 2026): **Text Generation is 300 requests per minute**, _"unless the
model requires the Workers Paid plan"_, in which case it is 20/min on standard billing or
50/min on prepaid gateway credits. Scout is **not** in the pricing page's paid-only list
(`kimi-k2.6`, `kimi-k2.7-code`, `glm-5.2`, `glm-5.3`, `glm-5.3-flash`,
`deepseek-v4-flash-0731`, `deepseek-v4-pro-0813`), so **300/min applies**.

That number is irrelevant. **This repo's gateway is 20 requests / 60 s, sliding** (#490,
and `MODEL_GATEWAY_ID` in `worker/src/model.ts`), and
[AI Gateway rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/)
(Last updated Sep 30, 2026) counts **requests**, uniformly: _"This rate limiting behavior
will be uniformly applied to all requests for that gateway."_ With the loop on the device
(§0), **each round is one request**, so:

- a 4-round product costs **4 of 20** — the gateway permits **5 products per minute**;
- 22 products need **≥ 4.4 minutes** of wall clock even at zero latency;
- a sliding window means a burst does not amortise.

And when it trips, per this repo's own measurement in the operator page, the body is
`{"errors":[{"message":"Rate limited","code":2003}]}` with **no `Retry-After`** — and HTTP
`429` is shared with `3036`, the daily-allocation stop, which means opposite things. A
device-driven loop needs to read the body code, not the status.

Two more loop-relevant behaviours:

- **A synchronous request may wait in a capacity queue by default.**
  [Reject busy requests](https://developers.cloudflare.com/workers-ai/features/reject-if-busy/)
  (Last updated Sep 17, 2026): `rejectIfBusy` in the third argument to `env.AI.run()`
  makes it fail instead. The refusal is `3040` / `429`, _"Capacity temporarily exceeded"_
  ([errors](https://developers.cloudflare.com/workers-ai/platform/errors/), Sep 17 2026).
  A loop that waits four times multiplies that wait.
- **The timeout is `3007` / `408`**, with no documented duration.

### 6.3 Neurons, and the arithmetic that decides the shape

[Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (Last updated
Oct 9, 2026), scout's row verbatim: **`24545` neurons per M input tokens, `77273` neurons
per M output tokens** — i.e. `0.0245` neurons per input token and `0.0773` per output
token. _"Our free allocation allows anyone to use a total of **10,000 Neurons per day at no
charge**."_ The plan table reads `Workers Free | 10,000 Neurons per day | N/A - Upgrade to
Workers Paid`, and _"All limits reset daily at 00:00 UTC. If you exceed any one of the above
limits, further operations will fail with an error."_ The error is **`3036` / `429`**,
_"You have used up your daily free allocation of 10,000 neurons."_ **Yes — Workers Free's
daily allocation is documented as a hard stop with no overage to buy**, which is what
ADR-0115 §4.1 and `worker/src/model.ts` already rest on.

The corpus side, measured from the committed artifact: `public/usda/search-index.json`
holds **2,023** rows, mean `description` length **29.7** characters (max 121), and a
`<fdcId>  <description>` line averages **37.8** characters.

**The one assumption below is tokens-per-character**, taken as ~3.2 chars/token for this
text (`fdcId` digit runs tokenize poorly, which pushes the rate down from English prose's
~4). Every figure is therefore an estimate, and **one `usage` object from one real call
replaces the whole table.** With a ~250-token system prompt, a ~95-token 8-row result
block, and ~10-token replies, a 4-round loop resending history costs
`4 × 250 + 6 × 105 = 1,630` input tokens and 40 output tokens:

| Shape                                          | input tokens | neurons / product | products / free day |
| ---------------------------------------------- | -----------: | ----------------: | ------------------: |
| 4-round loop, scout, history resent            |       ~1,630 |           **~43** |            **~230** |
| whole corpus in one prompt, scout (2,023 rows) |      ~24,150 |          **~592** |             **~16** |
| one `choice` over 8 candidates, `clef-flash`   |         ~200 |          **~0.7** |            **~14k** |
| one `choice` over 255 candidates, `clef-flash` |       ~3,100 |           **~11** |            **~930** |

`clef-flash` is **3455 neurons per M input tokens** and is charged **nothing for output**
(_"Clef models do not charge for output tokens"_, model page), with a 24,576-token context.
The prototype's 22-product run costs roughly **950 neurons, about 9.5% of one free day**, or
`$0.0105` at `$0.011 / 1,000 Neurons` — cheap. Stuffing the corpus instead costs **~13
times more** and caps the day at 16 products, which is the quantitative case for the loop
over the one-shot. The clef column is the case against both.

For calibration against this repo's only real measurement: #482 measured **76 neurons for
one label image** and 133 for two (`worker/src/model.ts`), so a 4-round text loop costs
about **half a label read**.

### 6.4 The discount that would make a growing history cheap does not apply here

[Prompt caching](https://developers.cloudflare.com/workers-ai/features/prompt-caching/)
(Last updated Apr 21, 2026) describes exactly the loop's cost shape — _"when a coding agent
sends a new prompt, it typically resends all previous prompts, tool definitions, and
conversation history. The delta between consecutive requests is often just a few new
lines"_ — and says cached input tokens are billed at a discounted rate, that Workers AI
_"enables prefix caching by default for select models"_, and that _"Compatibility and
pricing details are listed on each model page"_. It also gives the practical rules:
`x-session-affinity` on `extraHeaders` to pin the instance, static content first, _"Avoid
timestamps in system prompts"_, and _"Reuse tool definitions across requests"_.

**Scout has no cached-input price.** Its pricing row lists input and output only; the rows
that carry a `per M cached input tokens` line are `deepseek-v4-flash-0731`,
`deepseek-v4-pro-0813`, `glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `kimi-k2.5`, `kimi-k2.6`,
`kimi-k2.7-code` — every one of which is paid-only. Scout's model page carries no prompt-caching
row either. So on this model **the resend in §6.3's table is paid at full input rate**, and
the per-round cost grows linearly with the round number with no discount available.

### 6.5 Three further limits, each with a documented absence

- **Request size.** `3006` / `413` _"Request is too large"_ states **no threshold**
  ([errors](https://developers.cloudflare.com/workers-ai/platform/errors/)), which
  `worker/src/model.ts`'s `MAX_REQUEST_BYTES` docblock already records. A text loop is far
  from it.
- **Concurrency.** The Limits page is rate limits only. **No documented concurrency cap**,
  so running 22 products in parallel is bounded by the gateway's 20/60 s and nothing else
  published.
- **Batch.** Scout is marked `async_queue: "true"` and tagged **Batch**. The
  [Batch API](https://developers.cloudflare.com/workers-ai/features/batch-api/) (Last
  updated Apr 21, 2026) queues a collection and returns a `request_id` to poll, with
  _"total payload under 10 MB"_. It is explicitly for _"large workloads … when there is no
  human interaction"_ and it **does not shorten a loop** — each round depends on the
  previous one's result, so a 4-round loop is 4 sequential batches, not one. It would suit a
  22-product _evaluation_ run, not the live path.

## 7. What this would change in the prototype

Ordered by how much it changes, not by section order.

### 7.1 Add a clef arm before adding native tools

`clef-flash`'s `choice` question is the only published mechanism that makes a fabricated id
unrepresentable, returns a usable confidence instead of a `GIVE UP` token, and collapses the
loop to one call — at roughly **1/60th** the neuron cost of a 4-round scout loop for 8
candidates (§6.3). The local search stays; the model stops being asked to transcribe an id
and starts being asked to pick a key. The two open questions are whether its terms are gated
(an inference call, not made here) and whether its judgement on this task is any good, which
is a measurement against the same 22 hand-adjudicated products.

### 7.2 Native tool calling is available, and it buys less than it looks

`function_calling: "true"` is real, the `tools` field and the `tool` role are real, and a
loop can be written against them. But: the response shape is disputed between three primary
sources (§2.2); `role: "tool"` is undocumented in Cloudflare's prompting page, absent from
Meta's Llama 4 format, and its rendering is behind a 401 (§4.3); the parameter schema has no
`enum` so it cannot constrain the pick (§5.1); and **no primary source claims it is more
reliable than a prompted protocol** (§2.3) while Meta's own format document presents a
custom one-line text protocol as a supported mode (§4.3). The honest position is that native
tools would make the transport conventional and change nothing about the error classes the
prototype actually hit. **If the native arm is built, build it as a measured A/B against the
text protocol on the same 22 products**, because that comparison is the thing no document
answers.

Pick **one** reader that handles both `tool_calls[i].name` and
`tool_calls[i].function.name`, and log the first real response to find out which arrives.

### 7.3 The loop runs on the device, and shipping it needs an ADR amendment

§0's gate decides the topology. Beyond that, `worker/src/model.ts` pins
`MODEL_REQUEST_KEYS = ["task", "images"]` and refuses unknown keys **exactly**, with a test
on the arity, because ADR-0115 §3.1's disclosure says only photographs leave. A corpus loop
sends a **product name and a conversation**, which is readable text that is not a
photograph. That is not a small field addition: it is a second kind of readable egress, and
ADR-0115 §1 says in terms that _"anyone adding a second is adding the second, not continuing
a pattern"_. **A prototype can run outside the route entirely; a shipped version needs
§3.1 amended and the disclosure copy re-read.** `MODEL_TASKS` gaining a second member is the
easy half.

### 7.4 Free wins available today

- **`seed`** (1 … 9999999999) exists on this model and is unset. Setting it makes a re-run
  comparable instead of merely similar.
- **`max_tokens: 30`** is sound; the only documented ceiling is the context window, so the
  tight cap is a deliberate choice rather than a limit being approached.
- **Read `usage`** on every call (`prompt_tokens`, `completion_tokens`, `total_tokens`).
  It replaces §6.3's whole estimate table with measurements and costs nothing.
- **Classify `429` by body code**, not status: `2003` is the gateway's sliding window and
  clears in seconds; `3036` is the free allocation and clears at 00:00 UTC.
- **Expect to wait**, or pass `rejectIfBusy` and handle `3040`.
- **Do not count on prefix caching** (§6.4) — it is not priced for this model.

## 8. Sources, with the date each was read

All read **2026-10-14**. Cloudflare pages were fetched as `<url>index.md`, which is the
page's own Markdown source, and each carries a "Last updated" line quoted above.

**Live API, this account's token, read-only** — no `/ai/run`:

- `GET https://api.cloudflare.com/client/v4/accounts/<id>/ai/models/search?per_page=100` (and `page=2`, `per_page=50`, `hide_experimental=false`, `task=Text Generation`)
- `GET https://api.cloudflare.com/client/v4/accounts/<id>/ai/models/schema?model=@cf/meta/llama-4-scout-17b-16e-instruct`
- `GET https://api.cloudflare.com/client/v4/accounts/<id>/ai/models/schema?model=@cf/cloudflare/clef-flash`

**Cloudflare documentation:**

- https://developers.cloudflare.com/workers-ai/features/function-calling/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/function-calling/traditional/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/function-calling/embedded/api-reference/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/function-calling/embedded/troubleshooting/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/json-mode/ — Sep 14, 2026
- https://developers.cloudflare.com/workers-ai/features/prompting/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/prompt-caching/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/batch-api/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/features/reject-if-busy/ — Sep 17, 2026
- https://developers.cloudflare.com/workers-ai/platform/limits/ — Sep 17, 2026
- https://developers.cloudflare.com/workers-ai/platform/pricing/ — Oct 9, 2026
- https://developers.cloudflare.com/workers-ai/platform/errors/ — Sep 17, 2026
- https://developers.cloudflare.com/workers-ai/platform/glossary/ — Apr 21, 2026
- https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/ — Sep 18, 2026
- https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/ — no "Last updated" line
- https://developers.cloudflare.com/workers-ai/models/clef/ — no "Last updated" line
- https://developers.cloudflare.com/workers-ai/llms.txt — the page index the negative claims were checked against
- https://developers.cloudflare.com/ai-gateway/features/rate-limiting/ — Sep 30, 2026
- https://developers.cloudflare.com/agents/tools/ — Oct 12, 2026
- https://developers.cloudflare.com/agents/tools/codemode/ — Jun 24, 2026

**Cloudflare source** (first-party code, not documentation):

- https://github.com/cloudflare/ai-utils — `src/runWithTools.ts` at `main`

**Meta:**

- https://github.com/meta-llama/llama-models/blob/main/models/llama4/prompt_format.md
- https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md
- `https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct/raw/main/chat_template.jinja` — **HTTP 401, gated**

**Not consulted, deliberately:** no blog, no forum thread, no third-party write-up is cited
anywhere above. Where a question had no first-party answer — index-versus-identifier
selection (§5.1), repeated near-identical calls (§4.4), `guided_json`'s semantics (§3), how
`role: "tool"` is rendered for this model (§4.3) — the finding is the absence.
