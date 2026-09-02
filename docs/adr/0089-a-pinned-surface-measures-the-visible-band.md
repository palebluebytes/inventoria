# ADR 0089: A pinned surface measures the visible band, never a viewport unit

**Status:** Accepted  
**Date:** 2026-09-02  
**Amends:** ADR-0027 §Decision (the sheet's height model and its over-dialog layering)  
**Implemented:** §1-§4 by #327 — `ui/viewport-inset.ts`, `facets/startup.ts`, `app.css`, both `index.html`, `layout/Sidebar.svelte`. §5-§8 are still only the prototype on `prototype/326-search-ui`

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

**Twelve visual baselines move.** Every sheet capture in `tests/visual-catalog.spec.ts` is an element screenshot of `.bottom-sheet-content`, so a change to the height model changes the captured pixel height. `add-habit-screen-*.png` is insulated by an injected `height: auto !important` and will neither break nor protect.

**Seven surfaces have to be rewritten to gain anything.** §6 is most of the work in this record, and until a hand-rolled card folds onto the primitive it keeps its own broken geometry. A partially-completed migration is the state this leaves behind if the follow-up tickets stall.

**`elevated` becomes a desktop-only prop**, which is a smell worth naming: a prop that means nothing on the primary platform is a candidate for removal once §7 has settled in practice.

**What this forecloses.** Any later "just use `dvh`" is answered: it was measured inert. Any later `interactive-widget` proposal must first say what it does about the floor platform and about CI, because both were the reasons it lost.

**Deferred behind a seam.** Drag-to-dismiss: the grab handle is drawn and does nothing, which is a lie worth fixing, but not while the geometry beneath it is moving. Whether six nav tabs is right for a phone is a separate question; this record only requires the nav to reserve the inset that §2 makes real.
