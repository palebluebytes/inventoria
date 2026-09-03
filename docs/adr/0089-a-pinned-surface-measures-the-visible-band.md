# ADR 0089: A pinned surface measures the visible band, never a viewport unit

**Status:** Accepted  
**Date:** 2026-09-02  
**Amends:** ADR-0027 §Decision (the sheet's height model and its over-dialog layering)  
**Implemented:** §1-§4 by #327 — `ui/viewport-inset.ts`, `facets/startup.ts`, `app.css`, both `index.html`, `layout/Sidebar.svelte`. §5 and §8's scroll-chaining rule by #328 — `ui/BottomSheet.svelte`, `views/food/FoodStager.svelte`. §9 by #333 — `tests/support/virtual-keyboard.ts`, `tests/keyboard-invariants.spec.ts`. §8's other two rules by #332 — `views/food/FoodStager.svelte`, `views/food/CommitButton.svelte`, and the 16px floor swept across 12 components. §1's consumer with no dialog around it by #331 — `views/food/SelectionBar.svelte`, one declaration. §6 by #329 — `ui/BottomSheet.svelte`'s `centred`, and the six surfaces that folded onto it: `views/food/NutritionPanel.svelte` (three consumers), `views/items/ItemEditModal.svelte`, `views/media/MediaIngestModal.svelte`, `views/media/MediaEngagementModal.svelte`, `views/food/DailyDashboard.svelte`'s photo preview and `views/food/FoodDataSection.svelte`'s wipe confirmation; see the Amendment below for the roster this record got wrong. §7 by #330 — `ui/back-stack.ts`, `ui/BottomSheet.svelte`, `ui/Modal.svelte`, `views/FoodView.svelte`, and the second sheet `ui/BottomSheetDemo.svelte` raises for it

## Context

Three screenshots from an Android phone, [#326](https://github.com/palebluebytes/inventoria/issues/326): with the ingredient-search sheet open and the software keyboard raised, the sheet's header — title, grab handle, and **the close button** — was pushed off the top of the screen, and the result list was clipped mid-row. The dock survived only because it sits at the bottom.

`BottomSheet` is `position: fixed; bottom: 0; max-height: 85vh`. The viewport meta was `width=device-width, initial-scale=1.0` and nothing else, so the default `interactive-widget=resizes-visual` applied: the keyboard shrinks the **visual** viewport and leaves the **layout** viewport alone. Both `bottom: 0` and `85vh` keep naming a box that is now partly behind the keyboard, the browser scrolls the visual viewport to reveal the focused field, and the top of the sheet leaves the screen.

**`dvh` does not rescue this, and that is the finding that closed off the cheap answer.** Measured on the repo's pinned Chromium: under `resizes-visual` every viewport unit is inert when a keyboard opens — `vh`, `svh`, `dvh` and `lvh` all reported the same number at every size. There is no unit that means "the part you can see".

The blast radius is not one sheet. 23 surfaces inherit `BottomSheet`, most containing a text field. Seven more hand-roll `position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%)` cards at 85-90vh, four of those with inputs. `SelectionBar` holds a text input inside a `position: fixed; bottom: 0` bar with no dialog around it at all. Nothing in `src/` listened to `visualViewport`, `resize` or `orientationchange`; the app had no runtime awareness of viewport change of any kind.

### The alternatives that were live

**`interactive-widget=resizes-content`.** One meta key; the layout viewport then shrinks with the keyboard and `100dvh` and `bottom: 0` simply work. Refused on two grounds. It is Chromium and Firefox only — WebKit has never shipped it ([bug 259770](https://bugs.webkit.org/show_bug.cgi?id=259770), `NEW` and unassigned, last active 2026-06-07) and [#194](https://github.com/palebluebytes/inventoria/issues/194) §10 makes iOS the floor platform, so it would leave two platforms with genuinely different geometry and an un-feature-detectable meta key deciding which. It is also **untestable here**: measured against the pinned Chrome 147, no CDP command can make `visualViewport.height` diverge from `innerHeight` — `Emulation.setVisibleSize` and the `viewport` clip are documented as "not observed by the page", `setVirtualKeyboardGeometryOverride` is absent from that build, and `navigator.virtualKeyboard` is `undefined`. Every lever that moves the visual viewport moves the layout viewport with it.

**The `VirtualKeyboard` API** (`navigator.virtualKeyboard.overlaysContent` plus `env(keyboard-inset-*)`). Chromium only, absent from the pinned build, and strictly narrower than the option below.

**Doing nothing about safe areas.** Considered and refused, see §2.

### Scope

This record covers **how a surface pinned to the viewport decides its geometry**, and the meta-tag opt-ins that decide what a viewport is. It covers the sheet primitive's height model and, on a phone, its layering.

It does **not** cover what goes inside a sheet: the search list's order, its rank marks and its row density are [ADR-0090](0090-a-ranked-list-says-which-one-won-without-a-number.md). It does not cover drag-to-dismiss, which the grab handle still falsely advertises. It does not decide whether six bottom-nav tabs is the right mobile pattern; only that the nav must reserve the inset it never did.

## Decision

### 1. One mechanism, in JavaScript, on `:root`

`ui/viewport-inset.ts` listens to `visualViewport` and publishes three custom properties on the document element:

| Property      | Meaning                                             |
| ------------- | --------------------------------------------------- |
| `--vv-h`      | the visible band's height                           |
| `--vv-top`    | its top edge, in fixed-position coordinates         |
| `--vv-bottom` | the gap below it, which in practice is the keyboard |

It listens to `resize` **and `scroll`**: the browser scrolls the visual viewport to reveal a focused field, which moves `offsetTop` without changing `height`, and a listener reading only `resize` leaves a surface correctly sized and in the wrong place.

**`interactive-widget` is deliberately never set.** One code path on every platform, including the floor platform, is worth more than the nicer behaviour on two of them.

**The gap below the band is computed from `document.documentElement.clientHeight`, never `window.innerHeight`.** A `position: fixed` box resolves `bottom` against the layout viewport, which is `clientHeight`; `innerHeight` reports the large viewport, the height the page would have with the browser's collapsible chrome hidden. Where a browser distinguishes them, using the wrong one leaves a surface short of the keyboard by the height of that chrome.

### 2. The app takes the whole screen, and every full-bleed surface pays for it

`index.html` carries `viewport-fit=cover`. Six `env(safe-area-inset-*)` rules already existed in the tree and every one of them resolved to its `0px` fallback, because without the opt-in the layout viewport stops at the safe area and the insets are zero by definition ([#325](https://github.com/palebluebytes/inventoria/issues/325)).

**Both, or neither.** Adding the opt-in alone starts five surfaces reserving space correctly while the bottom nav still sits under the home indicator; fixing the nav alone changes nothing observable. A surface that paints full-bleed is responsible for its own insets from here on.

### 3. The three properties are declared where the tokens live

`app.css` declares `--vv-h: 100svh`, `--vv-top: 0px`, `--vv-bottom: 0px`. The runtime writes over them as inline properties on `<html>`, which beats a `:root` rule, so the declarations are the **pre-keyboard defaults** rather than dead values.

**A consumer writes a bare `var(--vv-h)` and never its own fallback.** Before this, each call site guessed: `var(--vv-h, 85vh)` in one place, `var(--vv-top, auto)` in another, `var(--vv-bottom, 0px)` in a third. Four fallbacks for one number, none of them agreeing.

They sit apart from the fluid type and space scales above them, and that separation is deliberate: those are a design system, these are a measurement of a screen at an instant. For the same reason `--tap-min: 48px` is not fluid either — a touch target is a floor set by the size of a finger, which does not change with the screen. 48 is Material's figure and clears Apple's 44pt, so one number satisfies both rather than passing one guideline and failing the other.

### 4. The shell is not a consumer

`.app` stays at `100svh`. The nav does not chase the keyboard: it is not something you use while typing, and making it track the band means it competes with every focused field on the page for space. Only surfaces pinned over the page track the band.

### 5. On a phone, a sheet holding a text field is full height

No 85vh peek. The peek is exactly the fraction the keyboard eats, and the only thing it bought — dismiss by tapping outside — the close button already provides. Such a sheet is `top: var(--vv-top); height: var(--vv-h)`.

**`top` plus an explicit `height`, never `top` plus `bottom`.** Stretching between two edges makes the box depend on the layout viewport's height as well as the band's, so any error in that number reappears as a gap; a pinned top edge and a height depend on the band alone and structurally cannot. Every other sheet stays bottom-anchored at `bottom: var(--vv-bottom)` with `max-height: var(--vv-h)`, and so merely stops running under the keyboard.

Above 768px the peek returns. This is one design that widens, not a second design: a width difference may buy more room, never a different shape.

### 6. On a phone there is one overlay shape, and it is the sheet

The seven hand-rolled centred cards fold onto `BottomSheet`. Centred becomes an expression **inside** the primitive above 768px, not seven copies of `translate(-50%, -50%)` outside it. This is the migration ADR-0027 deferred and ADR-0028 began; a centred card with a keyboard raised is the worst geometry available, and leaving those seven outside the primitive means the fix reaches only the surfaces that already used it.

### 7. A second full-height sheet replaces rather than stacks

On a phone, opening a sheet over a sheet replaces it, and Back returns to the one beneath. Two full-height surfaces cannot show a dim between them, so the `elevated` prop, the 1800/1801 layer and the over-dialog `pointer-events` machinery have nothing to express there. They remain above 768px, where a dim is visible and stacking means something.

### 8. What is guaranteed on screen

**The header and the dock's field are always visible. Only the scrolling region gives up space.** Nothing else in a sheet may claim the last row.

Three rules follow from it and are part of this decision:

- **A control that cannot act does not hold space.** The food sheets' commit button leaves the dock while searching, where `canPrimary` already requires a staged food and the button is therefore always disabled. It was holding roughly 85px of the scarcest space on the screen to say nothing.
- **A text input is at least 16px.** Under that, iOS Safari zooms the page on focus — a second way this screen leaves the edge, unrelated to the keyboard geometry and unfixed by it.
- **`overscroll-behavior: contain` on a sheet's scroll region.** A full-height sheet whose list is scrolled to its end would otherwise chain into the page behind it, which is invisible under the sheet and so reads as the sheet fighting the finger.

### 9. How this is proved

A `visualViewport` **fake**, installed by `context.addInitScript` and driven by a test handle, asserting geometric invariants rather than pixels: the sheet's bottom within the band, the dock's field within the band, the first row below the header, and an exact restoration when the keyboard closes. Measured: the fake reproduces the real signature that no CDP command can — `visualViewport.height` falling to 377 while `innerHeight` holds at 727 — and drove a real sheet from 618px to 320px through real CSS `calc()`.

**The limit is written into the spec, not left implicit: this proves the app reacts correctly to a visual-viewport resize. It does not prove any browser emits one.** That half is unfalsifiable in CI and belongs to a manual device check.

## Consequences

**Layout now depends on JavaScript.** This is the real price. A CSS-only mechanism existed and was refused, so a surface on a device where the script fails falls back to its declared defaults — `100svh`, `0px`, `0px` — which is exactly the pre-keyboard behaviour and no worse than before this record.

**The mechanism fails safe, and this was observed rather than reasoned.** On Vivaldi for Android the sheet stopped short of the keyboard, leaving a band of dimmed page below it; the same build and URL in Chrome on the same device showed no band. The sheet's own box measured exactly where `visualViewport` said the band ended, so the disagreement is inside that browser, between what it reports and where it paints. **A browser that under-reports the visible area makes a surface too short, never too tall** — the header, the field and the way out all stay on screen, and what is lost is a strip of backdrop. Any future mechanism resting on this data must keep that direction of failure.

**Twelve visual baselines move.** Every sheet capture in `tests/visual-catalog.spec.ts` is an element screenshot of `.bottom-sheet-content`, so a change to the height model changes the captured pixel height. `add-habit-screen-*.png` will neither break nor protect, and #333 found that the insulation is not what this record first said: the injected `height: auto !important` was inert, because a plain sheet declares no `height` at all. What insulates that shot is `position: absolute` and `max-height: none` — and those are what a full-page capture of a whole screen needs, since a pinned box is rendered once at the top of the image whatever the page's height. The two requirements conflict, so that capture cannot be made a witness for the height model; the twelve element screenshots are, and §9's invariants carry what pixels cannot.

**Seven surfaces have to be rewritten to gain anything.** §6 is most of the work in this record, and until a hand-rolled card folds onto the primitive it keeps its own broken geometry. A partially-completed migration is the state this leaves behind if the follow-up tickets stall.

**`elevated` becomes a desktop-only prop**, which is a smell worth naming: a prop that means nothing on the primary platform is a candidate for removal once §7 has settled in practice.

**What this forecloses.** Any later "just use `dvh`" is answered: it was measured inert. Any later `interactive-widget` proposal must first say what it does about the floor platform and about CI, because both were the reasons it lost.

**Deferred behind a seam.** Drag-to-dismiss: the grab handle is drawn and does nothing, which is a lie worth fixing, but not while the geometry beneath it is moving. Whether six nav tabs is right for a phone is a separate question; this record only requires the nav to reserve the inset that §2 makes real.

## Amendment (2026-09-03): §6's roster, and what centring turned out to need

§6 shipped whole as #329. Four clauses around it were wrong or absent, corrected here
rather than rewritten so the original record stands.

- **There were six cards, not seven, and the two counts in this record are both
  wrong.** Run at the commit that accepted this record (`2609491`, 2026-09-02 21:10),
  `git grep "translate(-50%, *-50%)" -- src/lib` matches seven files, and one of the
  seven is not a card: `views/food/FoodStager.svelte`'s barcode reticle centres itself
  `position: absolute` inside the camera viewport, so it is decoration on a fixed-size
  box rather than a pinned surface, and no keyboard can move it. The other six are the
  cards: `views/food/NutritionPanel.svelte`, `views/items/ItemEditModal.svelte`,
  `views/media/MediaIngestModal.svelte`, `views/media/MediaEngagementModal.svelte`,
  `views/food/DailyDashboard.svelte`'s photo preview, and
  `views/food/FoodDataSection.svelte`'s wipe confirmation. Three of the six hold a
  field, not the four the Context claims. The reticle is why the sweep in
  `tests/unit/sheet-geometry.test.ts` keys on `position: fixed` **and** the centring
  together rather than on the transform alone: the transform alone cannot tell a
  pinned card from a mark drawn inside one box. #329's table reached seven rows a different
  way: it dropped the wipe confirmation, which had landed six hours before this record
  was written and was in the `grep` all along, and it added two rows that are not
  hand-rolled centred cards — `views/food/LabelPhotoReader.svelte`, which the ticket
  itself flags as `inset: 0` rather than a card, and `ui/BottomSheetDemo.svelte`'s
  parent card, which `git log -S"translate(-50%, -50%)"` shows has never in its
  history carried that transform: it is a stand-in for a bits-ui dialog and was
  `inset: 0` from the day it was written. So six folded, and #329's commit messages
  count against the ticket's seven rather than against this figure.
- **`views/food/LabelPhotoReader.svelte` is out of scope, and this says so rather
  than leaving it to the empty `grep`.** It is `inset: 0` full-bleed and was never a
  centred card. It holds no field, so no keyboard can open under it; the shape a
  full-height sheet resolves to on a phone is the shape it already has; and what
  folding would change is only the wide screen, where a photo reader wants the screen
  rather than a 600px card. `tests/unit/sheet-geometry.test.ts` carries it in a named
  roster of the pinned surfaces that are not the primitive, so it is a decision a
  later reader has to overturn rather than one they can drift past.
- **A centred card takes the height back above 768px.** §6 says only where the box
  sits, and the first field-bearing card to fold showed that is not enough: `flush`
  and `fill` pin a sheet to 85vh above the breakpoint, and they are §5's proxy for
  "holds a text field", so their full-height claim is a claim about a keyboard. There
  is no keyboard above 768px, and a three-field form pinned to 85vh in the middle of a
  wide screen is a column of empty paper. All six of the folded cards capped
  themselves at 85vh and none of them pinned, so `centred` sizes to content and keeps
  the cap. The phone's height model is untouched.
- **The primitive's header needed a slot §6 does not mention.** The nutrition panel's
  way out sits beside the panel's name, because it is a control on the panel's
  _subject_ rather than on the panel ([ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md)
  §1), and the sheet's header was title + close with no room for one. It now takes a
  `headerActions` snippet in the right rail, and both side rails widen by one slot so
  the title stays dead-centre. The header cannot measure what it is handed, so the
  slot count is declared rather than fitted: a caller passes the snippet only when a
  control will render, and a snippet holding its own conditional is the failure this
  forbids.

One thing #329 leaves for §7 to unmake: the wipe confirmation opens over the food
settings sheet, so it folded onto `elevated`, which §7 retires on a phone. It was
already stacking that way by hand at 1800/1801, so this is the same behaviour under
the primitive's word rather than a new consumer of a shape §7 refuses — but it is one
more call site for §7 to reckon with.

## Amendment (2026-09-03): what §7 turned out to need, and where Back stops

§7 shipped as #330. Four things around it were absent from the record rather than
wrong in it, and one Consequence above needs a fact it does not carry.

- **Back is a single resource, and this record was not the first claim on it.**
  §7 gives every open sheet a history entry, and
  [ADR-0088](0088-a-selection-is-a-mode-with-its-own-verbs-and-its-own-way-out.md)
  §3 had already given one to a live Selection — under a comment in
  `FoodView.svelte` reading "ours is the top entry, nothing else in this app
  pushes one", which §7 falsifies. The two could not be built beside each other:
  a Selection's own verbs open sheets, so one Back would have closed the sheet
  **and** cleared the Selection, and left the Selection's entry behind for the
  next one. So there is one stack, `ui/back-stack.ts`, and a Selection is a stop
  on it beside the sheets. The ordering is the order things opened in, which is
  the only ordering a person could predict.

- **Back closes a sheet at every width; only the replacement is the phone's.**
  §7 reads as one rule and is two. A dim between two cards is a width question
  and the record settles it. Whether Back leaves the app with a dialog open is
  not: a desktop browser has the same button, and the answer that is right on a
  phone is not wrong on a laptop. One code path, for the reason §1 gives for
  refusing `interactive-widget`.

- **A replaced sheet is hidden, not unmounted.** "Replaces" describes what a
  person sees, and unmounting would also throw away what they left there — a
  scroll position, a half-filled field, a child component's state. The sheet
  beneath is `display: none`, which takes it out of the focus order and the
  accessibility tree without taking it out of the document.

- **A `Modal` that is not a sheet is not a stop, and Back still leaves the app
  with one open.** The stack knows sheets, because §7 is written about sheets.
  Two surfaces are outside it: `views/food/LabelPhotoReader.svelte`, the one
  screen `Modal` carries directly, and `ui/BottomSheetDemo.svelte`'s stand-in
  dialog. Naming the gap rather than widening the rule under it: making every
  dialog a stop is a decision about `Modal`, and the record that reaches it
  should say so out loud.

- **For whoever takes the `elevated` decision this record flags.** Two
  measurements it does not have. The default layer, 1700/1701, is already above
  the 1600 a bits-ui dialog card renders at, so `elevated` has never been what
  clears a dialog — it has only ever been a sheet over a sheet. And on a phone it
  now expresses nothing whatever, because the sheet it would be raised over is
  not on the screen. Above 768px it is still the only thing that puts a dim
  between two cards.
