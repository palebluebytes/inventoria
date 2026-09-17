# #482 — can a Workers AI model read these labels?

Throwaway prototype, kept as a **primary source** so the verdict on
[#482](https://github.com/palebluebytes/inventoria/issues/482) can be re-run
rather than merely re-read. Not a maintained tool; nothing on `main` imports it.

- `ground-truth.json` — the four panels transcribed **by hand** at 2250×4000,
  written before any model was called. `null` means the label does not print
  that row.
- `harness.mjs` — calls the candidates through the `inventoria-model-route`
  gateway at the resolution the app itself would send (`MAX_PHOTO_EDGE` 1600,
  quality 80). Uses the **native** `/ai/run/<model>` endpoint, because that is
  the shape `env.AI.run` sends and therefore the shape that ships.
- `ablate.mjs` — the same model and images with a naive prompt carrying no
  anti-fabrication rule, to separate what the model does from what the prompt
  does.
- `score.mjs` — scores `raw-*.json` against the ground truth. Deliberately a
  separate pass, so a scoring bug never costs a re-run and the raw outputs
  outlive the judgement.
- `raw-*.json` — every response, verbatim, with latency and neuron usage.

## Re-running

```sh
node scratch/482/harness.mjs <run-name> [--models …] [--labels …] [--repeats N]
                             [--arm as-captured|via-whatsapp] [--edge 1600]
node scratch/482/score.mjs raw-<run-name>.json
```

Needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_API_TOKEN` in the repo-root
`.env`, and `magick` on the path (`nix shell nixpkgs#imagemagick`).

## Three request shapes, not one

The four candidates do **not** share a request shape, and two of the three
failures at the start of this prototype were shape errors rather than model
errors:

| Model                            | Shape                                         | Note                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llama-4-scout-17b-16e-instruct` | `messages` + `image_url` content parts        | the only shape that carries N images                                                                                                                                          |
| `mistral-small-3.1-24b-instruct` | same                                          |                                                                                                                                                                               |
| `llama-3.2-11b-vision-instruct`  | `{prompt, image: number[]}`                   | one image only; the OpenAI-compatible endpoint rejects it outright with `AiError … Unable to add image when there are no user-supplied nor system-supplied messages` (`3030`) |
| `moondream3.1-9B-A2B`            | `{task:"query", question, image: <data URI>}` | one image only; **`stream: false` is load-bearing** — omit it and the API answers `200` with `{"result":{}}` and no error                                                     |

So "carry N images" is a property of one shape, not of Workers AI.
