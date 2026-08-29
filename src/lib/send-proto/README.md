# #201 prototype — what does a person tap to send a meal, and to receive one?

**Throwaway.** Dev-only, and a primary source for
[#201](https://github.com/palebluebytes/inventoria/issues/201) rather than
anything to build on. It writes nothing to the ledger; the only real data it
reads is your logged meals, so the picker and the meal header have the density
they will really have.

Everything upstream is decided. The transport is a sealed Cloudflare Durable
Object relay ([#200](https://github.com/palebluebytes/inventoria/issues/200)),
the payload is a narrowed reference closure
([#197](https://github.com/palebluebytes/inventoria/issues/197)), the code is at
least 128 bits and is scanned or pasted but never spoken or typed
([#199](https://github.com/palebluebytes/inventoria/issues/199)), and the same
room case was proved on hardware
([#198](https://github.com/palebluebytes/inventoria/issues/198)). What is left is
the screens.

## Running it

```sh
pnpm dev
# then open one of
#   http://localhost:5173/?variant=A
#   http://localhost:5173/?variant=B
#   http://localhost:5173/?variant=C
```

`←` and `→` cycle the variants; the pink bar at the foot is the rig, not the
design.

To point a real phone at the QR — which is the only way to judge whether the
symbol is sized right — front the dev server with a tunnel, the way the #198
probe does:

```sh
pnpm proto:201
# in another shell
nix shell nixpkgs#cloudflared -c cloudflared tunnel --url http://localhost:5173
```

## The rig

- **far end** — what the other device does when the code is taken: they get it,
  their inbox is full, the relay is unreachable, they refuse it. Every failure
  the design has to have a face for is one select away, rather than something
  you wait for.
- **fill inbox** — puts three meals in the inbox, which is the depth
  ([#199](https://github.com/palebluebytes/inventoria/issues/199) §13), so the
  "a fourth is refused rather than evicting one" case is reachable.
- **reset** — clears both halves.

There is no relay and no seal. Every transition is a timer, at roughly the
durations #198 measured: the sender waits, then the far end answers; a receive
verifies in about 900 ms.

The QR is **real** — the #198 probe's own writer renders it — because #198 told
this ticket to size the on-screen symbol for a 101-character version 5 code read
in 931 ms, and a mock at the wrong density would answer that wrongly. Point a
phone at it and it resolves to the link.

## The three variants

They disagree about **structure**, not decoration: where the affordance lives,
what kind of surface it opens, and how many different sentences a refusal gets.

### A — a way out in the header

Sending is per-meal; receiving is not. So a sixth square joins the meal header,
set apart from the five ways in by a rule because it is the only one that takes
something away, and it is absent when the meal is empty on ADR-0059 §4's rule.
Receiving is a standing control beside Recipes, with a count, and it opens one
sheet that both starts a receive and lists what is waiting.

**Its refusal call: one line.** All seven of #197 §5's refusals read "This is not
a meal Inventoria can read", with the technical cause behind a disclosure. The
seal refusal is the exception — "someone else answered" is different news.

### B — one handover, two doors

Handing a meal over is one thing the app does, learned once, in one place. The
meal header gains nothing. A single control beside Recipes opens a sheet whose
whole subject is the exchange, and which meal you are sending is chosen inside
it, from your real history, in the shape ADR-0058's past-meal picker taught.

**Its refusal call: the smallest honest grouping** — four lines. "It did not
arrive whole" and "it is not a meal" are different news to a person even though
both are #197 §5 refusals.

### C — the exchange takes the screen

This is a thing you do with the phone held up, at arm's length, with someone
else looking at it. So it is not a sheet over the food screen; it is a mode the
phone enters, with no app chrome at all. Nothing is added to the meal header:
the affordances are plain lines of text in the flow of the page — under a meal's
logged rows to send it, at the foot of the day to receive one.

**Its refusal call: every refusal in its own words.** If the app knows why it
said no, it says why.

## What every variant is holding to, because it was already decided

- The code has **two carriers** (#200 §7): a QR in the same room, a link
  everywhere else, secret in the fragment. The link is not a convenience mode —
  it is the only humane carrier for two people in different cities.
- **Nothing is typed** (#199 §3). Scan or paste; there is no code entry field
  anywhere in any of the three.
- The sender learns **delivery, never acceptance** (#199 §7), so declining is
  never socially visible. There is no "they added it" state, deliberately.
- A refusal **burns the code** (#199 §6) — no "try again" on a spent one.
- The **inbox holds three and refuses a fourth rather than evicting** (#199 §13,
  #197 §5), so "their inbox is full" is a state the _sender_ sees.
- A payload is judged **at receive, not at accept** (#197 §5), so the inbox only
  ever holds acceptable meals and the refusal lands while the sender is still
  standing there.
- **No photos cross** (#197 §1.3), so a label-captured food arrives with nothing
  to look at, and a `gtin:` twin arrives with no provenance and reads "not
  rated". `MealBrief` shows both.
- **Nothing says who it is from** (#199 §11), anywhere.
- Accept **re-mints**: their clock, their Meal Type, and the recipe comes with it
  (#197 §2.1, §2.2).
- The **file export is the step-down** (#200 §8), offered inline on the failure
  surface rather than as a hint to go and find Settings.

## What it deliberately does not do

- **No own-device face.** The ticket asks whether that half shows anything at
  all; its mechanism is [#202](https://github.com/palebluebytes/inventoria/issues/202)'s
  to decide, and drawing a Settings row for a pairing flow nobody has chosen
  would be answering the wrong question first.
- **No camera.** The receive screens show where the viewfinder goes; #198 already
  proved the read, and a permission prompt in the middle of a design review buys
  nothing.
- **No relay, no seal, no ledger write.** The question is what a person taps.

## What is touched outside this directory, and must come back out

- `src/lib/views/FoodView.svelte` — the `?variant=` read, the header controls,
  two snippets, the host mount, and a block of `.proto-*` styles.
- `src/lib/views/food/DailyDashboard.svelte` — two optional `Snippet` props,
  `mealActionsExtra` and `mealFooterExtra`, undefined in the shipped app.
- `package.json` — `proto:201`.

All of it is commented `PROTOTYPE (#201)`. The winner gets rewritten properly
when it folds; the variants stay here, on the branch, as the primary source.
