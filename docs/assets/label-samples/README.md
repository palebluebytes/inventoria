# The label samples

Four photographs of three real products, kept so that any verdict about reading a
nutrition label with a model can be re-run rather than merely re-read — the same
reason [`docs/icon-provenance.md`](../../icon-provenance.md) keeps its source icon.
They are the grounding samples of map
[#47](https://github.com/palebluebytes/inventoria/issues/47)'s investigation and the
material ticket
[#476](https://github.com/palebluebytes/inventoria/issues/476) exists to supply.

Photographed 2026-07-31, 21:13:32–21:14:44, on a Fairphone FP5, in the owner's own
kitchen. No frame carried GPS coordinates. They are committed to a public repository
deliberately, with that in mind.

## Two arms, and why there are two

The same four photographs appear twice. They differ in transport, not in subject.

| Arm                              | Dimensions  | Provenance                                                                                                                                                                                                    |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`as-captured/`](as-captured/)   | 2250 × 4000 | Off the phone directly. Rotated 90° clockwise losslessly with `jpegtran -rotate 90 -copy none`, which also drops all metadata. Pixel data is the camera's, re-encoded by nothing.                             |
| [`via-whatsapp/`](via-whatsapp/) | 1125 × 2000 | The same four, as they arrived through WhatsApp in 2026. Downscaled and re-compressed by WhatsApp; EXIF already stripped when they arrived, and stamped 21:15:24, the send time rather than the capture time. |

`as-captured/` is the set to reach for. `via-whatsapp/` is kept because it is a real
degradation of a real capture, and because a model that reads the clean arm but not
the degraded one has told us something about the capture path that the clean arm
alone cannot.

The long edge is what makes the pair worth keeping. A 4000 px original clears any
current downscaling cap, so a high-resolution vision tier has headroom to use; at
2000 px it has almost none, and a standard tier that caps nearer 1568 px still
downscales. So the two arms are the resolution axis, and files paired across them by
name are the same photograph.

Pairing was established by content, not by filename: each `as-captured/` file
downscaled to 1125 × 2000 and compared against all four `via-whatsapp/` files by
greyscale RMSE. Every true pair scored 0.072–0.109 and every mismatch 0.229 or
worse, a clean one-to-one match.

## What each file holds

| File                                                | Product                                   | In frame                         | Languages                                             | Decimals                            | Basis      |
| --------------------------------------------------- | ----------------------------------------- | -------------------------------- | ----------------------------------------------------- | ----------------------------------- | ---------- |
| `peanut-butter-8710411045003-panel-and-barcode.jpg` | Peanut butter, `8710411045003`            | Panel **and** barcode, one face  | Dutch + German                                        | Period: `5.4 g`, `0.6 g`            | per 100 g  |
| `olive-oil-8436578483808-panel.jpg`                 | La Chinata extra virgin olive oil         | Nutrition only, no barcode       | Spanish + English                                     | **Comma**: `3701,13 kJ`, `13,808 g` | per 100 ml |
| `olive-oil-8436578483808-barcode.jpg`               | The same bottle, the other side           | Barcode + net quantity, no panel | Spanish + English + German + French                   | —                                   | 50 ml net  |
| `indian-paste-8901222932167-panel-and-barcode.jpg`  | Indian paste, `8901222932167` (GS1 `890`) | Panel **and** barcode, one face  | English + Spanish + Italian + French + Polish + Dutch | Period: `937.21`                    | per 100 g  |

## What the set exercises

- **A panel that is prose, not a table.** The olive oil declares itself in a running
  sentence — _"Valor energético 3701,13kJ/884 kcal, grasas 100g (de las cuales:
  saturadas 13,808g), hidratos de carbono 0g…"_ — twice over, Spanish then English.
  Every other panel here is a ruled grid. Nothing in the effort had noticed that the
  hardest sample is hard because of its _layout_.
- **A comma-decimal that is a 1000× trap.** `13,808 g` of saturates per 100 ml. Read
  as a thousands separator it becomes 13,808 g, and olive oil is about 14 g of
  saturates per 100 g, so the correct reading is 13.808. This is the sharpest single
  case in the set and it is a number that reaches a panel.
- **A millilitre basis.** The olive oil is declared per 100 ml and sold as 50 ml net,
  which is
  [ADR-0052](../../adr/0052-a-drinks-panel-is-carried-per-100-ml.md)'s and
  [ADR-0060](../../adr/0060-an-amount-is-entered-in-its-panels-unit.md)'s territory,
  not a per-100-g panel with a unit relabelled.
- **Six languages in one row label**, stacked and set small: _"Saturated Fat/ Grasas
  saturadas/ Grassi saturi/ Graisses saturées/Tłuszcz nasycony// Verzadigd vet"_ —
  including Polish diacritics, a doubled slash that is a printing error, and a `Fiber`
  row whose Polish _Błonnik_ is printed faint enough to read as _Bionnik_.
- **Two faces of one bottle**, which is the only reason a request contract has to
  carry more than one image.
- **A barcode sharing the frame with the panel**, on two of the three products, and on
  the olive oil a barcode printed rotated 90° to the label.
- **Side text cropped by the frame** on the peanut butter and the paste — ingredient
  lists and addresses running off the edge, because the photographer framed the panel
  and not the package.

## What the set does not exercise

**No micronutrient rows. None of the four photographs contains one.** The peanut
butter and the paste print the eight rows EU law requires — energy, fat, saturates,
carbohydrate, sugars, fibre, protein, salt. The olive oil's prose carries **seven**:
it prints no fibre row, in either the Spanish or the English sentence. This
was verified on the 2250 × 4000 arm, not inferred from the degraded copies.

This matters because the twelve micronutrients are a target of the app's own
`NutritionInfo` panel, not an observed property of these labels, and the distinction
had been lost. Map #47's grounding text records only a blank name, a low completeness
score, a two-photo bottle and a barcode that failed automated decode; it never claimed
a micronutrient row. `docs/research/49-multimodal-llm-nutrition-extraction.md` §1
nonetheless illustrates the hard case with a 6 pt _"Vitamine B12 … 0,5 µg"_ row and
attributes the observation to that investigation, and its §3 lists "12 micronutrients
in mg/µg" among the residual risks these samples were supposed to retire.

So the recommendation that follows from it — default to a cheap standard-resolution
model and escalate to a high-resolution one when fine micronutrient print is dropped
— **cannot be tested on this set**, in either arm. Whatever a prototype concludes here
is a verdict about eight mandatory rows in six languages, and it should say so.

A fifth photograph of a product that does print micronutrients would close the gap for
the cost of one picture. It was considered and deliberately not taken; the gap is
recorded instead.

The oil's missing fibre row turned out to matter more than a count. Fibre is a row the
_other two_ labels do print, so a model reading the bottle has every reason to expect one
— which makes it a second absent-row instrument alongside the twelve micros, and a
sharper one, because there is a plausible wrong answer to give. When
[#482](https://github.com/palebluebytes/inventoria/issues/482) ran, the model it rejected
wrote `0` there every single time.

## Corrections this set forces

Three claims in the surrounding tickets are wrong against the photographs:

1. **`5,4 g` is not a comma-decimal.** #476 and the lore behind it cite the peanut
   butter's sugars row as the European comma-decimal case. At 2250 × 4000 the
   separator sits on the baseline with no descending tail: the value is `5.4 g`. The
   peanut butter uses periods throughout, on a Dutch and German label. The comma case
   is real but it belongs to the olive oil.
2. **"Twelve micronutrient rows printed in mg/µg at around 6 pt"** describes no file
   here, as above.
3. **Three hard properties undersells the set.** The prose panel, the millilitre
   basis, the rotated barcode, the doubled-slash printing error and the frame-cropped
   side text are all present and none was named.
