# Research: is a bottom-anchored, upward-growing result list a pattern or an outlier? (#326)

**Parent map:** [#326](https://github.com/palebluebytes/inventoria/issues/326) — the app is laid out for a phone, keyboard and all.
**Grounds:** the `order` axis on `prototype/326-search-ui` (`src/lib/proto/proto-search.svelte.ts`: `inverted` = _"best match against the field, list grows upward"_), its single implementing property `.results-list.inverted { flex-direction: column-reverse }` in `FoodStager.svelte`, and the fact that the search field already lives at the bottom, in `FoodStager`'s own `.dock`, inside a `BottomSheet` — the docked-footer shape [ADR-0027](../adr/0027-bottomsheet-as-the-one-sheet-primitive.md) grew the primitive to express and [ADR-0028](../adr/0028-migrate-food-sheets-onto-bottomsheet.md) migrated the food sheets onto.
**Date:** 2026-09-02. **Status:** research only — no code changed, no ADR, nothing but this file.

**Evidence classes.** Every claim below carries one:

- _spec_ — verbatim from the owning specification or design system.
- _source_ — read out of shipping open-source code: the vendor's own repository, or this repo's installed `node_modules`.
- _measured_ — read off this repo at HEAD `f080206` on 2026-09-02.
- _study_ — a figure or finding from a published study, or from a researcher's own field-research write-up, quoted with its sample and method wherever the source states them. Peer-reviewed papers and practitioner columns are both tagged this way; the difference is called out in the text, never hidden by the tag.
- _unverified_ — could not be established from a primary source. Said so, never filled in.

**One source I could not read, and what I used instead.** `m3.material.io` is an Angular application that server-renders nothing but `<meta>` tags; `curl` returns 61 KB of HTML whose entire body text is _"Search – Material Design 3 This website requires JavaScript."_ _measured_ So every M3 quote below comes from a **Google-owned repository that names m3.material.io as its spec** — `material-components-android`'s `docs/components/Search.md` and `androidx`'s `compose/material3/.../SearchBar.kt` — not from the spec page itself. Treat those as **one step weaker than _spec_**. The one thing I _can_ quote directly from `m3.material.io` is its own `<meta name="description">`: _"Search lets people enter a keyword or phrase to get relevant information. Search bars can display suggested keywords or phrases as the user types."_ _spec_

---

## 1. Recommendation

**Do not ship the inverted list.** Keep the field bottom-docked — that half is squarely inside Apple's current guidance and is the app's best asset here — and keep the results reading **downward from the top of the body**, rank 1 first, as they do today. Spend the inversion's budget on the two axes that carry no cost: the **rank marks** the prototype already built, and the **row density**.

Six things decide it, in the order they weigh:

1. **A browser vendor asked this exact question in code and answered no.** Firefox for Android ships a bottom-docked address bar and an `AwesomeBarOrientation { TOP, BOTTOM }` enum for its suggestion list. When the orientation is `BOTTOM`, the list is still a `LazyColumn` with **no `reverseLayout`**, still emitted in rank order, still `scrollToItem(0)` on refresh — and the _entire_ effect of the `BOTTOM` value is `.rotate(270f)` on one autocomplete arrow icon so it points back toward the field. _source_ This is not an absence of precedent; it is a recorded decision against the same problem. (§3.5)
2. **The closest structural analogue does not invert — four times over.** An @-mention popup over a bottom-docked composer is the exact geometry being proposed. In **Mattermost, Zulip, Element and Signal Desktop** — four independently-written open-source clients whose composers sit at the bottom — the popup is anchored above the input and the **top-ranked suggestion is at the top of the popup, farthest from the field**. Not one of them reverses the item order. _source_ (§3.2)
3. **The one real precedent is fzf — and it is a keyboard-only, desktop, no-pointer, no-reading-order tool.** `fzf`'s _default_ layout genuinely is the proposal: prompt at the bottom, best match immediately above it, list growing upward. `skim` copies it verbatim. _spec, source_ But fzf also ships `--layout=reverse-list` — _"Display from the top of the screen, prompt at the bottom"_ — which is precisely the arrangement I am recommending, and fzf's own docs push `--layout=reverse` in nearly every worked example in its README. The precedent exists; it does not travel to a touch screen with a visible ranking. (§3.3)
4. **Chat's `column-reverse` is a recency claim, not a ranking claim.** A chat log inverts because messages are _appended at the end_ and the _end_ is the thing you must see; the item nearest the composer is the **newest**, not the **best**. A ranked search list has no append; its "end" is the worst match. Borrowing the geometry borrows the wrong information model — and this app's own list makes the confusion concrete, because the Recent list is a chronology (`b.time - a.time`) rendered through the same component as the ranked search list. _measured_ (§3.4)
5. **The thumb-zone argument does not survive contact with its own primary source.** Steven Hoober — whose 2013 observations the entire genre is built on — publicly repudiated them in 2017 (_"almost too much for my comfort … I've been able to discard all of those erroneous assumptions"_), captioned the canonical diagram **_"The well-known, but incorrect thumb-sweep chart"_**, and separates the two questions explicitly as heuristics 2 and 3: _"People Touch the Center of the Screen"_ and _"People Look at the Center of the Screen"_. He measured the trade-off in a scrolling list and **reach lost**: _"even when people need to move their hand or stretch to get the center of the screen, they will very often do so."_ His own rule for the bottom edge is a control rule — _"A chyron should remain at the bottom of the viewport only if it provides status, buttons, or control functions"_ — and NN/g call the reachability rationale for bottom-docked _content_ _"largely incorrect"_ in as many words. _study_ The bottom is not where the eye goes and, on the later data, not where the thumb is happiest either. (§4)
6. **`column-reverse` over a rank-ordered DOM is explicitly non-conforming CSS.** Not a judgement call: _"Authors **must not** use `order` or the `*-reverse` values of `flex-flow`/`flex-direction` as a substitute for correct source ordering, as that can ruin the accessibility of the document."_ _spec_ And here the divergence is not cosmetic — it is the **whole point** of the change, so the visual order _is_ the logical claim being made. On top of that, this repo's installed bits-ui collects options with `querySelectorAll` in DOM order _source, measured_, so under `column-reverse` **ArrowDown moves the highlight visually upward** and `Home` jumps to a row at the bottom of the screen. (§6)

**What to do with the inversion's motivation.** The motivation is real and worth keeping: with the keyboard up there are only a handful of visible rows, and the best match should be unmistakable and reachable. Three moves get that without inverting:

- **Keep the two rank channels the prototype already separates** — the `best` ink-inversion (structural: "this won"), and the stepping left edge on ranks 1 and 2. _measured_ These are the part of the design that survives every finding below; they answer §5's question ("how do you say _best_ without a number?") and they work identically in either order.
- **Keep the field where it is.** Apple's own designer, WWDC26 session 292: _"While the bottom toolbar position is preferred, Search can also be placed in a Top Toolbar."_ and _"When search is placed in the bottom Toolbar, the field elegantly animates up over keyboard, optimizing for reachability, and keyboard input."_ _spec_ Note what Apple moves and what it does not: **the field** goes to the thumb; **the results** do not reorder.
- **Take reachability out of the list.** The row nearest the thumb does not have to be the best match for the best match to be one tap away. If tapping rank 1 is the ergonomic problem, the answer is a commit affordance in the dock (which the sheet already has) or a larger rank-1 row, not a reversed reading order.

**The one thing that would change this verdict** is evidence that a phone user with the keyboard up scans **upward from the field** rather than downward from the top of the list. I looked for it and did not find it (§4.5), and §4.5 explains why that gap is structural. If #326 wants the inverted variant anyway, that is the measurement to take on the device — and it is a measurement, not an argument.

---

## 2. Where the search field sits

The two design systems **disagree**, and the disagreement is the finding.

### 2.1 Apple: bottom is now preferred on iPhone

The HIG's own change log dates the shift _spec_ (read from `developer.apple.com/tutorials/data/design/human-interface-guidelines/search-fields.json`, 2026-09-02):

| Date         | Change                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| June 8, 2026 | Updated terminology and refined guidance for search as a tab in iOS.                                                                |
| June 9, 2025 | Updated guidance for search placement in iOS, consolidated iPadOS and macOS platform considerations, and added guidance for tokens. |

**So yes — the repositioning shipped**, in the June 2025 (Liquid Glass / iOS 26) cycle, and the HIG page's own "Related videos" list points at [WWDC25 356 "Get to know the new design system"](https://developer.apple.com/videos/play/wwdc2025/356) and [WWDC26 292 "Design intuitive search experiences"](https://developer.apple.com/videos/play/wwdc2026/292). This was checked rather than assumed.

**[Search fields → iOS](https://developer.apple.com/design/human-interface-guidelines/search-fields), verbatim:**

> There are three main places you can position the entry point for search:
>
> - As a tab in a tab bar
> - In a toolbar at the bottom or top of the screen
> - Directly inline with content

> You can include search in a bottom toolbar either as an expanded field or as a toolbar button, depending on how much space is available. **When someone taps it, it animates into a search field above the keyboard so they can begin typing.**

> **Place search at the bottom if there's room.** … Search at the bottom is useful in any situation where search is a priority, since it keeps the search experience easy to reach. Examples of apps with search at the bottom in various toolbar layouts include Settings, where it's the only item, and Mail and Notes, where it fits alongside other important controls.

> **Place search at the top when it's important to defer to content at the bottom of the screen, or there's no bottom toolbar.**

And from [WWDC26 session 292](https://developer.apple.com/videos/play/wwdc2026/292/) (Apple Design team, transcript), verbatim:

> And with Liquid Glass, we introduced new patterns that make search more ergonomic on iOS…

> It's important to highlight that where you place search, directly impacts where the field animates to, when active. **When search is placed in the bottom Toolbar, the field elegantly animates up over keyboard, optimizing for reachability, and keyboard input.** When Search is placed inline, as a field, it remains at the top when active, avoiding any UI at the bottom of your app.

> **While the bottom toolbar position is preferred**, Search can also be placed in a Top Toolbar.

**This app's dock is exactly the shape Apple describes** — a field pinned above the keyboard — and it got there independently, via ADR-0027's docked-footer slot. `.dock` carries `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s))` and holds the `Combobox.Input`. _measured_

### 2.2 Material 3: top, and no bottom variant exists

From Google's `material-components-android` `docs/components/Search.md`, verbatim:

> **Search bar** is a persistent and prominent search field **at the top of the screen** and **search view** is a full-screen modal typically opened by selecting a search icon.

The Compose Material3 API — Google's own, each KDoc linking to `m3.material.io/components/search/overview` — names the components and pins the placement _source_:

| Component                     | KDoc, verbatim                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SearchBar`                   | "represents a search bar in the collapsed state. It should be used in conjunction with an `ExpandedFullScreenSearchBar` or `ExpandedDockedSearchBar` to display search results when expanded."                                               |
| `TopSearchBar`                | "Using a `TopSearchBar` as the top bar of a `Scaffold` **ensures that the search bar remains at the top of the screen.**"                                                                                                                    |
| `ExpandedDockedSearchBar`     | "displayed in a **popup over the collapsed search bar**. It is recommended to use `ExpandedDockedSearchBar` on medium and large screens such as tablets, and to instead use `ExpandedFullScreenSearchBar` on compact screen such as phones." |
| `ExpandedFullScreenSearchBar` | "a search bar that is currently expanding or in the expanded state, showing search results. This component is displayed in a **new full-screen dialog**."                                                                                    |

Two things follow. **First**, the M3 names asked for are real: _search bar_, _docked search view_ (`ExpandedDockedSearchBar`), _full-screen search view_ (`ExpandedFullScreenSearchBar`) — and M3 explicitly routes **phones to the full-screen view**, which puts the field at the top of a full-screen surface with results beneath. **Second**, the string `bottom` appears in `SearchBar.kt` **only as padding arithmetic** — there is no bottom-placement API and no bottom guidance anywhere in the component _source, measured_.

### 2.3 The disagreement, stated plainly

|                                      | Apple HIG (iOS 26 / iOS 27 era)                  | Material 3                                                |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| Preferred field position on a phone  | **Bottom toolbar**, animating above the keyboard | **Top** of the screen; full-screen search view on compact |
| Is a bottom-docked field sanctioned? | Yes, and preferred                               | **No such variant exists**                                |
| Anything said about result _order_?  | Only "most relevant … first" (§3.1)              | Nothing found                                             |

This app is a browser PWA that runs on both. **The bottom dock is defensible; it is Apple-shaped, not Material-shaped, and that is a choice already made.** Nothing in either system licenses the _list_ inversion, which is a separate question neither addresses.

---

## 3. Where the results go, and in what order

### 3.1 What the guidelines actually say about order — which is almost nothing

Apple says one relevant sentence, in Best practices _spec_:

> **Simplify search results. Provide the most relevant search results first to minimize the need for someone to scroll to find what they're looking for.** In addition to prioritizing the most likely results, consider categorizing them to help people find what they want.

"First" is not defined spatially. But it is bound in the same sentence to _"minimize the need for someone to **scroll**"_ — which only reads coherently if "first" means "at the end you are already looking at", i.e. the top of a top-down list. That is an inference, and is marked as one.

The WWDC26 session adds _spec_:

> On iOS, recent searches should be shown **directly inline** when the field becomes focused.

> I also recommend limiting the number of suggestions being shown, so that search results feel front, and center. Remember, when results and suggestions are ranked efficiently, people generally shouldn't have to type out their entire search.

Note what Apple moves when search goes to the bottom and what it does not: **the field animates down to the thumb; the results are never said to reorder.** Mail and Notes on iOS have bottom-docked search and a top-down result list.

Material 3 says nothing about ordering that I could reach. Google's own component docs place results in a `Column`/`LazyColumn` under the input, with the only guidance being the literal comment in the MDC-Android layout template: `<!-- Search suggestions/results go here (ScrollView, RecyclerView, etc.). -->` _source_

**Neither design system says a word about inverting a result list. This is not a sanctioned variant of anything; it is unaddressed.**

### 3.2 The @-mention analogue — the closest structural precedent, and it does not invert

This is the case that matters: a ranked suggestion popup **above a bottom-docked text input**, on a screen where the input is the thing being typed into. Slack, Discord, WhatsApp and iMessage are closed source and I could not verify any of them from a primary source — _unverified_, and I am not going to assert what they do. But four independently-written, currently-shipping open-source clients with the same geometry can be read directly:

| Client               | Popup placement                                                                                                                                                              | Item order in the DOM                                                                                         | Where rank 1 lands                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Mattermost**       | `.suggestion-list--top { position: absolute; bottom: 100%; }`                                                                                                                | rendered in results order into a `<ul>`; no `flex-direction` or `reverse` anywhere in `_suggestion-list.scss` | **Top of the popup — farthest from the composer** |
| **Zulip**            | Popper `placement: this.dropup ? "top-start" : "bottom-start"`                                                                                                               | `render()` does `final_items.map(…)` then `.append($items)` — no reversal under `dropup`                      | **Top of the popup**                              |
| **Element (Matrix)** | `.mx_Autocomplete { position: absolute; bottom: 0; … flex-direction: column; }` — `column`, spelled out, not `column-reverse`                                                | `completions.map((completion, j) => …)` in provider order                                                     | **Top of the popup**                              |
| **Signal Desktop**   | `<Popper placement="top-start" modifiers={[sameWidthModifier]}>` — and note `flip` is _not_ among the modifiers, so this is a deliberate placement, not a collision fallback | `memberResults.map((member, index) => …)`                                                                     | **Top of the popup**                              |

All _source_, read from each project's `main`/`develop` on 2026-09-02:
`mattermost/mattermost` → `webapp/channels/src/components/suggestion/suggestion_list.tsx` + `webapp/channels/src/sass/components/_suggestion-list.scss`;
`zulip/zulip` → `web/src/bootstrap_typeahead.ts`;
`element-hq/element-web` → `apps/web/src/components/views/rooms/Autocomplete.tsx` + `apps/web/res/css/views/rooms/_Autocomplete.pcss`;
`signalapp/Signal-Desktop` → `ts/quill/mentions/completion.dom.tsx`.

**Four for four. The popup _box_ moves above the input; the _list inside it_ does not turn over.** The expectation that this analogue inverts is, on the evidence I can read, wrong — and it was the strongest argument the inverted variant had.

### 3.3 fzf and skim — the one real precedent, and its exact shape

**fzf's default layout genuinely is the proposal.** Three independent confirmations from fzf's own artifacts _spec, source_:

From `man/man1/fzf.1`, verbatim:

```
--layout=LAYOUT
Choose the layout (default: default)

default        Display from the bottom of the screen
reverse        Display from the top of the screen
reverse-list   Display from the top of the screen, prompt at the bottom
```

From `CHANGELOG.md`, on `$FZF_DIRECTION`, verbatim: _"indicating the list direction of the current layout: `up` for the default layout, `down` for `reverse` or `reverse-list`."_ And on `--preview-window=next`: _"places the preview adjacent to the input section, on the list side: **above the input in the default layout**, below it in `--layout=reverse`."_

From `src/terminal.go`, the coordinate transform — `layoutDefault` flips the whole window (`y = h - y - 1`), while `layoutReverseList` carries an ASCII diagram of what it is _not_:

```go
case layoutReverseList:
    …
    /*
     * List 1
     * List 2
     * Header 1
     * Header 2
     * Input 2
     * Input 1
     */
```

So: **default = prompt at the bottom, match 1 immediately above it, list growing upward.** `reverse-list` = prompt at the bottom, list reading downward from the top — the arrangement §1 recommends. `skim`'s man page (`man/man1/sk.1`) copies all three verbatim, including `[default: default]` _spec_. `--tac` is unrelated: _"Reverse the order of the input"_, an input-order option, not a layout one.

**Why the precedent does not travel.** Four differences, all load-bearing:

1. **No pointer.** In fzf the cursor is the only selector; "nearest the prompt" is meaningless as a reach argument because nothing is reached. Here the whole motivation is a thumb.
2. **The prompt is the origin of a terminal.** A shell prompt at the bottom with output above it is the ambient convention of the surface fzf lives in; a phone sheet has no such convention.
3. **fzf itself hedges.** `--layout=reverse` exists, `reverse-list` exists, and fzf's own docs reach for `reverse` constantly: **9 occurrences** of `--reverse`/`--layout reverse` in `README.md` and **29** in `CHANGELOG.md`, against **0** in the man page's examples _(measured by `grep -c -E '\-\-reverse|\-\-layout[= ]reverse'`, 2026-09-02)_. The README's `FZF_DEFAULT_OPTS` recommendation is `--layout reverse`, and it says outright _"`reverse` layout and `--border` goes well with this option."_ junegunn ships the inverted default and then writes most of the documentation against it.
4. **No screen reader, no DOM.** §6 does not exist as a problem in a terminal.

**As a precedent this is honest and it is singular.** It is also the only one I found.

### 3.4 Chat's `column-reverse` — a recency claim, not a ranking claim

This distinction is the crux, and it resolves cleanly.

A chat log uses `flex-direction: column-reverse` because of an **append-at-end** information model: new messages arrive at the _end_ of a sequence, the end is the part that must be on screen, and `column-reverse` makes the scroll container pin to that end for free. The item adjacent to the composer is the **most recent**, and "most recent" is a property of _when it arrived_, not of _how good it is_. Nothing is ranked; nothing is being nominated as best. The list has a natural direction because time has one.

A ranked result list has neither property. Nothing is appended — the whole set is replaced on every keystroke. And its far end is not "old", it is **worst**. Inverting it does not surface a fresh end; it puts the weakest rows where the eye lands first (§4.2) and the strongest row where a top-down reader arrives last.

The app makes this concrete. `FoodStager.svelte` renders **both** kinds through the same component, and `proto-search.svelte.ts` already names the trap in its own comment _measured_:

> `graded` grades against a _best match_, so it has nothing to say about the Recent list — that is a chronology (`b.time - a.time`), and its newest entry is not a winner.

If the order axis ships, the same `column-reverse` would be applied to a chronology and a ranking, meaning two different things in two tabs of one sheet. That is a strong argument against carrying the chat geometry across.

### 3.5 Firefox for Android — a browser that already moved its address bar to the bottom, and did _not_ invert

This is the single most useful case I found, because Mozilla modelled the exact question in code and their answer is legible.

Firefox for Android offers a bottom toolbar position (`ToolbarPosition.BOTTOM`, `Settings.shouldUseBottomToolbar`; whether it is the shipped _default_ is decided by a remote Nimbus flag, `FxNimbus.features.defaultBottomToolbar` — so I will not claim a default _unverified_). The suggestion list is a first-class concept with a first-class orientation enum _source_:

```kotlin
/** The orientation of the AwesomeBar, whether it's oriented to the bottom or the top. */
enum class AwesomeBarOrientation { TOP, BOTTOM }
```

**And here is what `BOTTOM` actually changes.** The suggestion list itself is a plain `LazyColumn` with **no `reverseLayout`**, items emitted in provider order, and `state.scrollToItem(0)` whenever a new first suggestion arrives — i.e. it snaps to the **top** of the list. `orientation` is not passed to the `LazyColumn` at all. It is passed down to one place, `AutocompleteButton`, where its entire effect is **rotating one icon** so the "append this to my query" arrow points back toward the field:

```kotlin
.rotate(if (orientation == AwesomeBarOrientation.BOTTOM) 270f else 0f)
```

_source_, read from `mozilla-firefox/firefox` at `main` on 2026-09-02: `mobile/android/android-components/components/compose/awesomebar/.../AwesomeBarOrientation.kt`, `.../internal/Suggestions.kt`, `.../internal/Suggestion.kt`, and `mobile/android/fenix/.../search/awesomebar/AwesomeBarComposable.kt`.

So a major browser engine vendor, shipping a bottom-docked query field on phones, asked itself precisely this question, gave the answer a name and an enum — and concluded that the list keeps reading downward and only an **arrow glyph** should acknowledge that the field is now below. That is the strongest single piece of evidence in this note against the inverted variant, because it is not an absence of precedent, it is a deliberate decision recorded against the same problem.

### 3.6 The rest of the field: system search, address bars, command palettes

Two browsers besides Firefox have already moved the query field to the bottom on phones. **Both left the suggestion order alone.** That is now three independent implementations of the exact experiment.

| Product             | Field position                                                                                                                                                                                                                                                                                                                                                                                                           | Where rank 1 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Safari, iOS**     | **User choice, top or bottom.** Apple, verbatim: _"Depending on the layout, the search field appears at the top (Single Tab layout) or bottom (Tab Bar layout) of the screen."_ And WWDC21 "Design for Safari 15": _"we've moved the tab bar to the bottom of the screen. This puts it directly under the user's thumb, making it easier for them to reach, especially if they're using their phone one-handed."_ _spec_ | **Not established.** No Apple support page, HIG page, newsroom post, WebKit blog post or WWDC transcript states what happens to the Smart Search Field suggestion order with the bar at the bottom, and Safari's chrome is proprietary UIKit outside the open-source WebKit tree. _unverified_ — and the iOS 15 beta redesign controversy is likewise unverifiable from Apple sources; what _is_ primary is that the shipping product exposes both positions as a setting. |
| **Chrome, iOS**     | User choice (_"Touch and hold the address bar and tap Move address bar to the bottom or Move address bar to the top."_)                                                                                                                                                                                                                                                                                                  | **Top of the popup.** `omnibox_popup_presenter.mm` anchors the popup to fill the space _above_ a bottom omnibox, but `omnibox_popup_view_controller.mm` is a plain grouped `UITableView` fed section 0 / row 0 first, with **no `CGAffineTransform`, no flip, no reverse flag**; it scrolls to the top on open, and `highlightNextSuggestion` does `indexPathForRow:path.row + 1` with the comment _"There is a row below, move highlight there."_ _source_                |
| **Chrome, Android** | User choice                                                                                                                                                                                                                                                                                                                                                                                                              | **Top of the popup.** `OmniboxSuggestionsDropdown extends RecyclerView`, layout manager is `SuggestionLayoutScrollListener extends LinearLayoutManager`. **Zero occurrences of `setReverseLayout` or `setStackFromEnd`** in the file _(verified independently: `grep -c` returns `0` against the 29,281-byte source at `refs/heads/main`, 2026-09-02)_. Default `LinearLayoutManager` puts index 0 at the top. _source, measured_                                          |

And the field-at-top cases, for completeness — all with results reading downward _spec, source_:

- **iOS Spotlight** names its winner rather than positioning it: _"When you search for an app, app shortcuts for your most likely next action appear within the **Top Hit**."_ Where the _field_ renders on iOS is not documented by Apple _unverified_, but macOS Spotlight is explicit: _"results appear as you type. Spotlight **lists top hits first**; click a top hit to preview or open it."_ and, for the least relevant end, _"Scroll to the **bottom** of the results, then click Search in Finder."_
- **Android app drawer** (AOSP Launcher3): `search_container_all_apps.xml` sets `android:layout_gravity="top|center_horizontal"`; `all_apps_content.xml` places everything else `android:layout_below="@id/search_container_all_apps"`. Field top, results below, no reversal.
- **VS Code**: `quickInputController.ts` `createUI()` appends titlebar → header (containing the input) → **then** the list, in that DOM order; default alignment is `observableValue<QuickInputAlignment>(this, 'top')`; the CSS anchors with `transform-origin: top center`.
- **Raycast**: _"The **Search Bar** is the single input at the top of the Raycast window, where everything starts."_ / _"**Root Search** is the list of results shown **below** the Search Bar."_
- **Slack**: _"Click the search field at the top of Slack."_ Ordering direction is undocumented and the client is closed _unverified_.
- **Google mobile**: field at top; nothing official about a bottom query box exists _unverified_, and the one Google page mentioning a bottom search input (Google Finance's AI answers) is a chat composer returning a generated answer, not a ranked list.

**Tally.** Three products have shipped a bottom-docked query field on phones. In the two where the code is readable, the list order is unchanged; in the third it is unverifiable. **Zero verified inversions.**

### 3.7 "Drop-up" is collision avoidance, and it never reorders

Every documented upward-opening popup mechanism on the web platform treats upward as a **placement of the box under collision**, and explicitly leaves the item order alone _spec_:

- **Bootstrap `.dropup`**: _"Trigger dropdown menus above elements by adding `.dropup` to the parent element."_ The positioning is described as collision machinery — _"Dropdowns are built on a third party library, Popper, which provides dynamic positioning and viewport detection."_ Nothing about item order.
- **Floating UI `flip`**: _"Changes the placement of the floating element to keep it in view."_ It _"prevents the floating element from overflowing along its side axis by flipping it to the opposite side by default"_, with `fallbackStrategy: 'bestFit' | 'initialPlacement'`. It moves the box.
- **CSS Anchor Positioning (CSSWG editor's draft)** states the rationale outright: _"Anchor positioning, while powerful, can also be unpredictable. The anchor box might be anywhere on the page, so positioning a box in any particular fashion (such as above the anchor, or the right of the anchor) might result in the positioned box overflowing its containing block or being positioned partially off screen."_ `flip-block` _"swaps the values in the block axis… essentially mirroring across an inline-axis line"_ — a geometric mirror of the box, not of the content.
- **The HTML Standard's UA stylesheet for the customizable `<select>` picker** is the closest thing to a normative ruling, and it says _below by default, above only as a fallback_ — verified verbatim against `html.spec.whatwg.org/multipage/rendering.html` on 2026-09-02:

  ```css
  ::picker(select) {
    …
    position-area: self-block-end span-self-inline-end;
    position-try-order: most-block-size;
    position-try-fallbacks:
      self-block-start span-self-inline-end,
      self-block-end span-self-inline-start,
      self-block-start span-self-inline-start;
  }
  ```

  `self-block-end` (below) is the declared placement; every `self-block-start` (above) entry is a _fallback_. Option order is DOM order in either case.

- **jQuery UI Autocomplete**: default `position` is `{ my: "left top", at: "left bottom", collision: "none" }` — below, with no documented upward variant.
- **Chromium's autofill popup**, the canonical shipping flip-when-there-is-no-room case: `CalculatePopupYAndHeight` chooses below unless below is smaller than above (`bottom_available >= popup_preferred_height || bottom_available >= top_available`), and `CanShowDropdownHere` only asks that _"at least one row of the popup can be displayed within the bounds of the content area so that the user notices the presence of the popup."_ No reordering. _source_

**So the answer to "is drop-up a deliberate pattern or a fallback?" is: a fallback — and in six independent specifications and libraries, flipping repositions the container and never reverses the list.** The inverted variant is not "drop-up"; drop-up does not do this.

---

## 4. Thumb reach versus reading order

**The headline is not what either side of this argument expects: the primary sources say the answer to both questions is the _centre_ of the screen, not the bottom — and the researcher whose data the whole thumb-zone genre is built on has publicly disowned the way it is used.**

### 4.1 What Hoober actually measured, and what he now says about it

The 2013 numbers are real and I read them at source _study_ — [How Do Users Really Hold Mobile Devices?](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php), UXmatters, February 2013: **1,333 observations** over two months ending 2013-01-08, of which **780** involved touching the screen; **49%** one-handed, **36%** cradled, **15%** two-handed; of the cradled, thumb **72%** / finger **28%**. Method: direct street observation _"on the street, in airports, at bus stops, in cafes, on trains and busses"_, with no demographics and no device identification recorded. His own caveat, verbatim: _"Please do not take the total number of our observations and surmise that n% of people are typing on their phone at any one moment."_

**Four years later he repudiated both the numbers and their use** — [Design for Fingers, Touch, and People, Part 1](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php), UXmatters, 2017-03-06, verified verbatim against the page on 2026-09-02 _study_:

> People have now read and referred to my 2013 column _How Do Users Really Hold Mobile Devices?_ almost too much for my comfort. … I made some assumptions that were based on observations of the usage of desktop PCs, standards for older types of interactions, and anecdotes or misrepresented data. However, through my later research and better analysis, I've been able to discard all of those erroneous assumptions and reveal the truth.

His superseding figures, same article: **75%** of users touch the screen only with one thumb; **fewer than 50%** hold the phone with one hand; **36%** cradle; **10%** hold in one hand and tap with a finger of the other. (Part 2 adds **41%** hold with both hands and type with both thumbs.) Note the first two together: _most touching is thumb-touching, but most holding is not one-handed_ — which is exactly the conflation the folklore makes.

And on the diagram itself, verbatim:

> Most designers who think about people's use of mobile phones at all still seem to assume that all mobile phones are small iPhones, grasped in one hand, and tapped with the thumb. They still believe in the thumb-sweep charts shown in Figure 5, **believe all taps should be at the bottom of the screen**, and that no one can reach the upper-left corner of the screen.

with Figure 5 captioned, in Hoober's own words: **_"The well-known, but incorrect thumb-sweep chart"_**.

### 4.2 Where the green/yellow/red heatmap came from

**Scott Hurff drew it**, in [How to Design for Thumbs in the Era of Huge Screens](https://www.scotthurff.com/posts/how-to-design-for-thumbs-in-the-era-of-huge-screens/) (2014-09-17), and described it in his own post as _"a heat map of sorts. **It's a best guess** for how easy it is for our thumbs to tap areas on a phone's screen"_, drawn for _"one-handed use; right thumb on the screen; thumb anchored in the lower-right-hand corner"_, with the caveat _"my thumb doesn't reach fully across the phone's screen. Maybe you have bigger hands than I do."_ _study_

So the canonical artefact is **one designer's own thumb, self-described as a guess, coloured on top of a grip-frequency dataset that never measured reach zones at all**. The earlier lineage is Josh Clark's reach arcs ([How We Hold Our Gadgets](https://alistapart.com/article/how-we-hold-our-gadgets/), A List Apart, 2015, excerpted from _Designing for Touch_), which are more careful and already say the thing the folklore drops: _"**Comfort and accuracy don't perfectly align** … for right-handed users, the bottom and top-right corners were the **least accurate** thumb zones"_ and _"the best solutions put **core features at screen middle**, where left and right thumb zones overlap."_ _study_

### 4.3 The crux — touching and looking are different questions, and Hoober answers both

This is the distinction the ticket asked about, and Hoober draws it himself, as two separate numbered heuristics in [Part 2](https://www.uxmatters.com/mt/archives/2017/05/design-for-fingers-touch-and-people-part-2.php): **"2. People Touch the Center of the Screen"** and **"3. People Look at the Center of the Screen"** _study_. Verbatim on the second:

> Users focusing on the center of the screen extends to viewing as well. People prefer to view content in the center of the screen. Plus, **they notice content in the middle of the screen more quickly and read it more accurately.** So follow the existing, reliable mobile patterns of list views and grid views, putting your main content and primary interactions at the center of the screen.

And the direct answer to "do people scan the bottom first?", from Part 1, verbatim:

> Perhaps the most surprising and most critical observation I've made is that, on mobile touch devices **people do not scan from the upper left to the lower right as on the desktop. Nor do they touch the screen in the opposite direction — from the lower right to the upper left — because of the limitations of their thumb's reach. Instead, … they prefer to view and touch the center of the screen.**

**So the inverted list's premise is refuted from the direction it least expects.** The bottom of the screen is not where the eye goes; it is also not, on Hoober's later data, where the thumb is happiest — [Design for Fingers and Thumbs Instead of Touch](https://www.uxmatters.com/mt/archives/2013/11/design-for-fingers-and-thumbs-instead-of-touch.php): _"both the left and right edges of a screen are equally hard to reach for all users. **However, the top and bottom edges are much worse than the sides.**"_

He also ran something close to the experiment in question — [Insights on Switching, Centering, and Gestures for Touchscreens](https://www.uxmatters.com/mt/archives/2014/09/insights-on-switching-centering-and-gestures-for-touchscreens.php) (2014), 31 participants, ~100 hours of encoded video, in which users could scroll content to wherever they wanted before tapping _study_:

> When users can choose where to touch a screen — for example, as with a scrolling list — they almost always tap the center two-thirds of the screen.

> **even when people need to move their hand or stretch to get the center of the screen, they will very often do so. Not because we've made them, but because they choose to.**

**Reach lost to preference, in a scrolling list, measured.** And his conclusion in that article names this exact design:

> **You might have previously thought that, when you copy the user interface for something like Twitter, the key controls for actions and input should be at the top and bottom of the viewport. However, the primary content and interactive area should, in fact, be in the middle of the screen.**

Finally, his own rule for what belongs at the bottom — which is a precise statement of the split this note recommends ([Paging, Scrolling, and Infinite Scroll](https://www.uxmatters.com/mt/archives/2018/11/paging-scrolling-and-infinite-scroll.php), 2018) _study_:

> **A chyron should remain at the bottom of the viewport only if it provides status, buttons, or control functions.**

> As I've noted many times before, people do not necessarily read left to right — and certainly, not in anything that is reliably like an F-pattern. **However, once people find your content, they do reliably read it from top to bottom.**

### 4.4 NN/g and Baymard

**NN/g reject the reachability rationale for bottom-docked _content_ explicitly**, in the one article where they discuss a bottom surface that carries content rather than controls — [Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/), Page Laubheimer, 2023-06-11, verified verbatim on 2026-09-02 _study_:

> **A common (but largely incorrect) rationale for using bottom sheets is that they improve reachability for users on mobile devices** (i.e., it is often suggested that it is easier to tap items at the bottom of the screen). This is unfortunately not universally true — as users hold mobile devices in a variety of ways (one-handed, two-handed, and from a variety of different grip points), the bottom of the screen is often not the most easily reachable screen region (**the middle of the screen represents the most easily tappable area** for the wide variety of ways users hold mobile devices).

That lands on precisely the contested half of this design, and it agrees with Hoober. NN/g also remove the Fitts's-law argument from the table for touch ([Fitts's Law and Its Applications in UX](https://www.nngroup.com/articles/fitts-law/), Raluca Budiu, 2022): _"while the edge placement offers an advantage in mouse- or trackball-driven UIs, **it offers no advantage for touchscreens. In fact, a study by Daniel Avrahami showed that, for touchscreen devices, it actually takes longer to hit targets placed around the edges**"_ — the taskbar-at-the-bottom intuition depends on a cursor hitting a wall, and there is no wall on a touchscreen.

**And NN/g never endorse moving _content_ to the bottom.** Every bottom placement they endorse is a control, and the justification is never reach: bottom tab bars are justified purely as OS convention ([Basic Patterns for Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/)), and their argument _for_ a bottom Submit button ([4 iOS Rules to Break](https://www.nngroup.com/articles/4-ios-rules-break/)) is a **reading-order** argument that presupposes top-down content: _"it goes against the natural top–bottom workflow on the page"_ / _"When they get to the end of it, they expect to find a Submit button right there, next to the last field."_ _study_ That is an argument for this app's dock and against this app's inversion, from one source.

On scanning order, NN/g's eyetracking says the entry point is the top ([F-Shaped Pattern … Misunderstood, But Still Relevant (Even on Mobile)](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/), Kara Pernice, 2017) _study_: _"**In the absence of any signals to guide the eye, they will choose the path of minimum effort and will spend most of their fixations close to where they start reading** (which is usually the top left most word on a page of text)"_ and _"First lines of text on a page receive more gazes than subsequent lines of text on the same page."_ Note NN/g treat the F-pattern as a **failure state**, not a target — _"the F-shaped scanning pattern is bad for users and businesses"_ — which is the right way to read it here: it describes a default entry bias, not a virtue.

**Baymard** turn out to have less to say than expected, and the honest answer to two of the questions asked is "not found" _study_:

- **Search field placement on mobile: not found in either direction.** Baymard publish no finding for or against a bottom-docked mobile search field. Their only positional statement is incidental and assumes a top field: _"mobile autocomplete's visible suggestions are, minimally, often **sandwiched between the search field at the top and the mobile keyboard below**."_
- **Suggestion ordering: explicitly out of scope** of their public article, which says so itself — the ordering research is behind Baymard Premium. _unverified_
- **Count, though, they do have**, and it matters for the density axis: _"the number of autocomplete suggestions displayed to desktop users shouldn't exceed 10, while a **target of 4–8 will work for most mobile users**"_, because _"providing too many autocomplete suggestions was observed to cause choice paralysis"_ and _"**most users are likely to select from among the first few suggestions**"_ ([9 UX Best Practice Design Patterns for Autocomplete Suggestions](https://baymard.com/blog/autocomplete-design), 2022). The prototype's `PROTO_VISIBLE_ROWS = 10` sits at the top of that band; **4–8 is the researched target**, and that is a cheap, evidenced change.
- **The squeeze is real but their figure is old**: _"the touch keyboard will take up close to 50% of the available screen space in portrait mode"_ (2013) and _"The touch keyboard takes up a whopping 70% of the screen, leaving the user with just enough viewport to see 1-2 fields at a time"_ (2015, iPhone-5s era, never republished). Their mobile product-list figure is _"typically only 2 - 4 items visible within the mobile viewport"_ (2020). Baymard never combine these into a with-keyboard result count; that composite would be an inference, not their finding.
- Their eyetracking is **desktop-only** (32 participants, Tobii), so they have no mobile gaze data and make no claim about where users look first on a phone. _unverified_

### 4.5 Has anyone measured the conflict? No — and the absence is structural

**No study places the best-matching item at the bottom of a phone screen near the thumb and measures anything.** Searched across ACM DL, arXiv, Google Scholar, Semantic Scholar and Europe PMC. The absence is not a search artefact; the two literatures are cleanly disjoint by construction:

- **The thumb literature is purely motor**, with a semantically empty target — a dot to be tapped. Bergstrom-Lehtovirta & Oulasvirta (CHI '14) model _"the area of the interface reachable by the thumb of the hand that is holding the device"_ from _"the kinematics of the gripping hand"_. Parhi, Karlson & Bederson (MobileHCI '06) measured time, error and comfort, and _deliberately_ removed the visual variable: _"To ensure visual search was not impacted by the variability of white space surrounding labels as targets changed size, font sizes were scaled with target sizes."_ Trudeau et al. (_Human Factors_ 54(1), 2012) report _"Fitts' effective width and index of performance"_. **None of them involve gaze, attention, or content.** _study_
- **The position-bias literature manipulates rank order on a fixed layout** and never manipulates reach cost — Joachims (§5), and Keane, O'Brien & Smyth (CACM 51(2), 2008), the only other genuine ordering-inversion experiment found, both desktop and pre-smartphone.

What _phone_ evidence exists points the other way. Leiva et al., [Understanding Visual Saliency in Mobile User Interfaces](https://arxiv.org/abs/2101.09176) (MobileHCI '20), 30 participants and 193 mobile UIs, verbatim: _"**Strong bias toward the top-left corner of the display, text, and images was evident**, while bottom-up features such as color or size affected saliency less."_ _study_ And Valliappan et al., [smartphone eye tracking](https://doi.org/10.1038/s41467-020-18360-5) (_Nature Communications_ 11, 4553, 2020) found _"**a center bias** … consistent with previous literature on desktops"_ — with the phone **on a stand**, i.e. reach cost held at exactly zero, which makes it a clean read of the visual half alone. (Caveat: free viewing of natural images, not a UI list.) _study_

**Two dead leads, recorded so nobody chases them.** A widely-repeated claim that a 2017 ANU thesis tested reversed ranking order on mobile is **false** — that work covers screen size, pagination and snippet length. And the claim that Hurff "disowned" his own diagram traces to a low-trust SEO blog; what is verified is milder and better — Hurff called it a "best guess" in the original post, and Hoober labelled the chart family "incorrect".

**So: if #326 ships the inverted list, it is ahead of the literature, not behind it.** That is not a prohibition; it is a statement of who owns the burden of measurement.

---

## 5. Signalling rank without numbering it

**Position 1 already carries most of the signal — that is the finding, and it is measured.**

Joachims et al. (SIGIR 2005), eye-tracking on Google's real results page _study_ — Phase I: 34 undergraduates, usable eye data for 29; Phase II: 22 recruited, usable data for 16 (6 normal / 5 swapped / 5 reversed), all Cornell undergraduates, mean age ~20, ten fixed questions, manipulation performed by a transparent proxy that no subject detected:

> The abstracts ranked 1 and 2 receive most attention. After that, attention drops faster. … It is very interesting that **users click substantially more often on the first than on the second link, while they view the corresponding abstract with almost equal frequency.**

Read that carefully, because it is the sharpest thing in this note. **Rank 1 and rank 2 are _looked at_ about equally often; rank 1 is _clicked_ far more.** The advantage of position 1 is not that it is seen more — it is that being first is itself read as a claim. That is exactly the signal the app wants, and it is free, and it is destroyed by putting rank 1 last in reading order.

The corollary from the "reversed" condition _study_:

> The average rank of a clicked document in the "normal" condition is 2.66 and 4.03 in the "reversed" condition. … the average number of clicks per query decreases from 0.80 in the "normal" condition to 0.64 in the "reversed" condition.

**Caveats, stated:** 2005, desktop, ten-blue-links, a student sample, and a _ranking_ reversal rather than a _layout_ reversal — the reversed condition changed which document sat at rank 1, not which end of the screen rank 1 sat at. It is evidence that **position is read as rank**, not direct evidence about upward-growing lists. Do not over-claim it.

**And the effect has weakened, which cuts both ways.** NN/g's [Pinball Pattern](https://www.nngroup.com/articles/pinball-pattern-search-behavior/) study (Moran & Goray, 2019, 471 queries recorded 2017–2019) reports that where the first result once took **51%** of clicks (2006) and **59%** of scans were strictly sequential (2009), _"**the first position on a SERP received only 28% of clicks**"_ recently, _"**59% of clicks were concentrated in the first three positions**"_, _"even the 6th position received looks in 36% of cases"_, and _"users only clicked past the first page of results in 2% of queries"_ — with the verdict that _"That linear SERP pattern still exists today, but it's the exception rather than the rule."_ _study_ Anyone arguing "position 1 dominates, therefore top" should quote the 28% too. The defensible reading is the **top three**, which is exactly the span the prototype's `data-rank` staircase already marks.

**Explicit "best" labels are real, and the two biggest search UIs on earth both use one.** Google's Search Central _spec_: _"Featured snippets are special boxes where the format of a regular search result is reversed, showing the descriptive snippet first."_ — note that "reversed" there means _snippet before link within one result_, not a reversed list, and Google's consumer help pins the position: _"You can find these featured snippets: **At the top of the search results.**"_ Google's own verb for it is **"elevates"**. Apple names rather than positions: _"app shortcuts for your most likely next action appear within the **Top Hit**"_, and macOS Spotlight does both — _"Spotlight **lists top hits first**"_, with the least relevant end reached by _"Scroll to the **bottom** of the results."_ _spec_ (Spotify's "Top result" is widely described as the same move, but I could not find it on any Spotify-owned support page — the hits are community forum threads. _unverified_, so it carries no weight here.)

**The pattern, across all three: name the winner and put it first.** Nobody moves it to the far end and relies on adjacency to say so.

**What this app already has, and should keep.** The prototype separates two channels that today's app conflates _measured_:

```css
.result-item.best {
  background: var(--ink);
  color: var(--paper);
} /* structural: this won */
.result-item[data-rank="1"] {
  border-left: var(--edge-thick);
} /* the staircase */
.result-item[data-rank="2"] {
  border-left: var(--edge);
}
.result-item.hl {
  outline: var(--edge);
  outline-offset: …;
} /* where you are */
```

and gates `best`/`data-rank` on `ranked = query.trim().length > 0`, so the Recent chronology never crowns a row. That is the right answer to "how do you say _best_ without a number", it is orthogonal to the order axis, and it is the part of the prototype worth keeping whichever way the list runs.

**Accessibility bears on this directly.** WCAG SC 1.3.3 Sensory Characteristics _spec_: _"Instructions provided for understanding and operating content do not rely solely on sensory characteristics of components such as shape, color, size, visual location, orientation, or sound."_ A rank conveyed **only** by an ink-inverted background and a border thickness is conveyed by colour and shape alone. This is a live gap in the current design in _either_ order — the fix is a text affordance (a "Best match" label, or `aria-label` on the winning option), not a change of direction. Note also that SC 1.4.1 Use of Color is not the binding one here; 1.3.3 is, and it is not satisfied by position either, since "visual location" is in its own list of insufficient characteristics.

---

## 6. The accessibility question, decisively

**`flex-direction: column-reverse` over a rank-ordered DOM is not a grey area. The CSS specifications forbid it in normative language, and this is exactly the use they forbid.**

### 6.1 What the CSS specs say

[CSS Flexible Box Layout Module Level 1](https://www.w3.org/TR/css-flexbox-1/), §5 "Ordering and Orientation", verbatim _spec_:

> Note: The reordering capabilities of flex layout intentionally affect **only the visual rendering**, leaving speech order and navigation based on the source order. This allows authors to manipulate the visual presentation while leaving the source order intact for non-CSS UAs and for linear models such as speech and sequential navigation.

> **Authors must not use `order` or the `*-reverse` values of `flex-flow`/`flex-direction` as a substitute for correct source ordering, as that can ruin the accessibility of the document.**

And §5.4, "Reordering and Accessibility: the `order` property":

> Authors must use `order` only for visual, not logical, reordering of content. **Style sheets that use `order` to perform logical reordering are non-conforming.**

[CSS Display Module Level 3](https://www.w3.org/TR/css-display-3/) §3.1 "Reordering and Accessibility", verbatim _spec_:

> The `order` property does not affect ordering in non-visual media (such as speech). Likewise, `order` does not affect the default traversal order of sequential navigation modes (such as cycling through links, see e.g. `tabindex`).

> Authors must use `order` only for **spatial**, not **logical**, reordering of content. Style sheets that use `order` to perform logical reordering are non-conforming.

> Note: This is so that non-visual media and non-CSS UAs, which typically present content linearly, can rely on a logical source order, while `order` is used to tailor the layout order. (Since visual perception is two-dimensional and non-linear, the desired layout order is not always logical.)

**The escape hatch these specs describe does not apply here.** The sanctioned use is a _two-dimensional_ rearrangement whose linear meaning is unchanged — the "Holy Grail" three-column example the flexbox spec itself gives, where nav/article/aside have no intrinsic order. This list is **one-dimensional and its order is its content**: the sequence _is_ the ranking. Reversing it is precisely "logical reordering". The prototype's own comment is candid about this — _"That divergence between visual and DOM order is the honest cost of the inverted variant and is exactly what this is here to expose."_ _measured_ — and the answer the specs give is that it is not a cost you are permitted to pay.

### 6.2 What WCAG requires

**SC 1.3.2 Meaningful Sequence (Level A)** _spec_: _"When the sequence in which content is presented affects its meaning, a correct reading sequence can be programmatically determined."_ Understanding 1.3.2: _"A sequence is meaningful if the order of content in the sequence cannot be changed without affecting its meaning."_

**Read strictly, the inverted list does not fail 1.3.2.** The DOM stays in rank order, so a _correct_ reading sequence remains programmatically determinable — which is all 1.3.2 asks. The prototype is right about that much. The sufficient technique [C27 "Making the DOM order match the visual order"](https://www.w3.org/WAI/WCAG22/Techniques/css/C27) is one way to satisfy it, not the only way, and its own words are _"when the source order matches the visual order, everyone will read the content and interact with it in the same (correct) order."_ _spec_ The listed failure F1 is about _changing meaning_ by CSS positioning; the meaning here is preserved in the DOM.

**SC 2.4.3 Focus Order (Level A)** _spec_: _"If a web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operability."_ Understanding 2.4.3 explicitly permits divergence: _"Focus order does not necessarily need to follow the visual layout of the web page, as long as the order in which elements receive focus is logical, and the hierarchy and relationship of content implied by the visual presentation is preserved."_

**Read strictly, this does not fail 2.4.3 either** — and in any case this listbox uses `aria-activedescendant`, so DOM focus never leaves the input and there is no focus sequence through the options at all.

**So the honest verdict is:** the inverted list **violates the CSS specifications' normative authoring requirement** (§6.1) and it is **hostile to sighted keyboard and low-vision users** (§6.3), but it does **not** cleanly fail either WCAG success criterion. Anyone claiming "it's a WCAG failure" is overstating; anyone claiming "the DOM is in rank order so it's fine" is ignoring a `must not` in two W3C specs and the behaviour in §6.3. Both halves should go in the record.

### 6.3 What actually happens, measured in this repo

The list is a bits-ui `Combobox`: `Combobox.ContentStatic` renders `role="listbox"`, each `Combobox.Item` renders `role="option"`, and the input carries `role="combobox"` with `aria-activedescendant` _measured_.

Three concrete consequences, read from the installed `bits-ui` _source, measured_:

1. **A screen reader is read the best match first.** Speech follows source order (§6.1), so a screen-reader user gets rank 1, 2, 3… correctly — while a sighted user next to them sees the reverse. The two users cannot describe the screen to each other. That is the divergence, and it is worst for the people who use _both_ channels: low-vision magnifier users, and anyone sighted driving by keyboard.
2. **ArrowDown moves the highlight up the screen.** `select.svelte.js` collects candidates with `node.querySelectorAll('[data-…item]:not([data-disabled])')` — **DOM order** — and `ARROW_DOWN` calls `next(candidateNodes, currIndex, loop)`. Under `column-reverse`, "next in the DOM" is "one row higher on the screen". `HOME` selects `candidateNodes[0]`, which is painted at the **bottom**. The prototype's switcher comment already flags this as an open question (_"does Down travel toward rank 2 or toward the bottom of an inverted…"_) _measured_; the answer is that Down travels toward rank 2, which is upward, and no CSS can fix it because the key handler never sees the CSS.
3. **`aria-setsize`/`aria-posinset` cannot rescue it.** Per WAI-ARIA 1.2 _spec_: _"Defines an element's number or position in the current set of listitems or treeitems. **Not required if all elements in the set are present in the DOM.**"_ and _"To orient the user by saying an element is 'item X out of Y', the assistive technologies would use X equal to the `aria-posinset` attribute and Y equal to the `aria-setsize` attribute."_ The whole set _is_ in the DOM here, so the user agent computes both from DOM position — bits-ui sets neither _measured_ — and the computed value would announce the bottom-most row as "1 of 10". Setting them by hand to match the _visual_ order would make the announcement contradict both the speech order and the arrow keys. They are the wrong tool: they describe set membership, not layout.

### 6.4 What the APG combobox pattern adds

The [APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) says nothing about spatial placement of the popup — that is genuinely out of its scope _spec_. Two things it does say bear on this:

> **List autocomplete with automatic selection:** … it presents suggested values that complete or logically correspond to the characters typed in the combobox, and **the first suggestion is automatically highlighted as selected**.

> **Down Arrow:** If the popup is available, moves focus into the popup: … Otherwise, **places focus on the first focusable element in the popup**.
> Listbox popup — **Down Arrow:** Moves focus to and selects the next option. **Up Arrow:** Moves focus to and selects the previous option.

"First" throughout is the _first in the set_, which is a DOM notion. In an inverted layout the automatically-highlighted "first suggestion" is the row at the **bottom of the screen**, and ArrowDown from there travels **up**. The APG is not violated — it simply has no vocabulary for a list whose paint disagrees with its sequence, which is itself informative: the pattern assumes they agree.

---

## 7. The verdict for #326

### 7.1 How much list there actually is

The prototype's row-height comments are right, and they reproduce exactly from this repo's own tokens. At a 390 px-wide viewport with a 16 px root (_derived_ from `src/app.css` and `FoodStager.svelte`, 2026-09-02):

| Piece                      | Token                            | Resolved                                      |
| -------------------------- | -------------------------------- | --------------------------------------------- |
| Row padding, top + bottom  | `--space-xs` ×2                  | 27.1 px                                       |
| Row border, top + bottom   | `--edge-thin` (`1px`) ×2         | 2 px                                          |
| `.result-name`             | `--step-n1` × `line-height: 1.5` | 22.5 px                                       |
| `.result-macros`           | `2px` margin + `--step-n3` × 1.5 | 17.6 px                                       |
| **Row, `full` density**    |                                  | **69.2 px** — matches the prototype's "~69px" |
| **Row, `name` density**    | (macros line dropped)            | **51.6 px** — matches "~51px"                 |
| Inter-row gap              | `--space-2xs`                    | 9.0 px                                        |
| **Pitch, `full` / `name`** |                                  | **78.2 px / 60.6 px**                         |

So the brief's "roughly two to five visible rows" corresponds to a list body of roughly **155–390 px** at today's density. Dropping to `name` density buys about **1.3 extra rows for the same band** — which is a bigger, cheaper win than any reordering, and is the axis the prototype should be measuring hardest.

### 7.2 What to ship

| Axis                                                                        | Verdict                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Field position**                                                          | **Keep the bottom dock.** Apple prefers it and describes exactly this shape ("animates into a search field above the keyboard"); M3 has no bottom variant but forbids nothing about a non-Material app. No change.                                                                                                                           |
| **Result order**                                                            | **`normal`. Do not ship `inverted`.** No design system sanctions it; the closest analogue rejects it four times over; a browser vendor implemented the question and answered no; the only precedent is a keyboard-only terminal tool that ships an opt-out for the same layout; and the CSS specs say `must not`.                            |
| **Rank marks** (`best` ink inversion, `data-rank` stepping edge, `hl` ring) | **Keep — this is the win.** They answer "which is best" without a number and without touching order. Add a **text** channel (a "Best match" label or an `aria-label` on the winning option) so rank is not carried by colour and border thickness alone (SC 1.3.3).                                                                          |
| **Density** (`full` / `name` / `graded`)                                    | **The axis worth measuring.** §7.1 says it moves more rows into the visible band than any reordering could.                                                                                                                                                                                                                                  |
| **Display cap** (`PROTO_VISIBLE_ROWS = 10`)                                 | **Lower it to 8, or 6.** Baymard's public autocomplete research puts the researched mobile target at **4–8**, above which _"choice paralysis"_ sets in, and finds _"most users are likely to select from among the first few suggestions."_ 10 sits at the very top of that band, and this is a one-constant change with evidence behind it. |
| **Overflow line** ("+N more")                                               | Below the list, at the ranking's weak end — which is where `normal` order already puts it. The `inverted` branch's special-casing goes away with the order axis.                                                                                                                                                                             |

### 7.3 What this note does _not_ establish

- Whether Slack, Discord, WhatsApp or iMessage invert their @-mention popups. _unverified_ — all four are closed source and I would not assert it either way. Four open-source clients with the same geometry do not, which is the strongest available proxy, but it is a proxy.
- What Safari on iOS does to its **suggestion order** when the address bar is at the bottom. No Apple support page, HIG page, newsroom post, WebKit blog post or WWDC transcript states it, and Safari's chrome is proprietary UIKit outside the open-source WebKit tree. _unverified_ — this is the one gap that could still, in principle, produce a mainstream touch precedent, and it is the cheapest thing to check by hand on a device.
- Whether a phone user with the keyboard raised scans **upward from the field**. No study I found addresses it, and §4.5 explains why the gap is structural rather than accidental. If #326 wants the inverted variant, this is the measurement to take — on the device, with the prototype's own switcher, as a within-subjects time-to-first-correct-selection test — and it should be a measurement, not an argument.
- Baymard's **suggestion-ordering** research, which their public article says is out of scope and lives behind Baymard Premium. _unverified_
- Anything read directly off `m3.material.io`, which does not serve its content without JavaScript (see the header).

---

## 8. Sources

**Apple** — [Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields) (read via `developer.apple.com/tutorials/data/design/human-interface-guidelines/search-fields.json`, incl. its change log) · [Searching](https://developer.apple.com/design/human-interface-guidelines/searching) · [WWDC26 292 "Design intuitive search experiences"](https://developer.apple.com/videos/play/wwdc2026/292/) (transcript) · [WWDC25 356 "Get to know the new design system"](https://developer.apple.com/videos/play/wwdc2025/356)

**Material 3 / Google** — [m3.material.io/components/search/guidelines](https://m3.material.io/components/search/guidelines) (unreadable without JS; only its `<meta description>` quoted) · [`material-components-android` `docs/components/Search.md`](https://github.com/material-components/material-components-android/blob/master/docs/components/Search.md) · [`androidx` `compose/material3/.../SearchBar.kt`](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SearchBar.kt) · [Compose SearchBar guide](https://developer.android.com/develop/ui/compose/components/search-bar) · [Google Search Central — featured snippets](https://developers.google.com/search/docs/appearance/featured-snippets)

**W3C** — [CSS Flexbox L1 §5, §5.4](https://www.w3.org/TR/css-flexbox-1/) · [CSS Display L3 §3.1](https://www.w3.org/TR/css-display-3/) · [WCAG 2.2 Understanding 1.3.2](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html) · [Understanding 1.3.3](https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html) · [Understanding 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) · [Technique C27](https://www.w3.org/WAI/WCAG22/Techniques/css/C27) · [WAI-ARIA 1.2 `aria-posinset` / `aria-setsize`](https://www.w3.org/TR/wai-aria-1.2/#aria-posinset) · [APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) · [APG listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)

**Terminal fuzzy finders** — [`junegunn/fzf` `man/man1/fzf.1`](https://github.com/junegunn/fzf/blob/master/man/man1/fzf.1), [`src/terminal.go`](https://github.com/junegunn/fzf/blob/master/src/terminal.go), [`CHANGELOG.md`](https://github.com/junegunn/fzf/blob/master/CHANGELOG.md), [`README.md`](https://github.com/junegunn/fzf/blob/master/README.md) · [`skim-rs/skim` `man/man1/sk.1`](https://github.com/skim-rs/skim/blob/master/man/man1/sk.1)

**Mozilla** — [`mozilla-firefox/firefox`](https://github.com/mozilla-firefox/firefox) at `main`: `mobile/android/android-components/components/compose/browser/awesomebar/AwesomeBarOrientation.kt`, `.../internal/Suggestions.kt`, `.../internal/Suggestion.kt`, `mobile/android/fenix/app/src/main/java/org/mozilla/fenix/search/awesomebar/AwesomeBarComposable.kt`, `mobile/android/fenix/app/src/main/java/org/mozilla/fenix/utils/Settings.kt`

**Open-source chat clients** — [`mattermost/mattermost`](https://github.com/mattermost/mattermost) (`webapp/channels/src/components/suggestion/suggestion_list.tsx`, `webapp/channels/src/sass/components/_suggestion-list.scss`) · [`zulip/zulip`](https://github.com/zulip/zulip) (`web/src/bootstrap_typeahead.ts`) · [`element-hq/element-web`](https://github.com/element-hq/element-web) (`apps/web/src/components/views/rooms/Autocomplete.tsx`, `apps/web/res/css/views/rooms/_Autocomplete.pcss`) · [`signalapp/Signal-Desktop`](https://github.com/signalapp/Signal-Desktop) (`ts/quill/mentions/completion.dom.tsx`)

**Apple support / Chromium / Launcher3 / editors** — [iPhone Spotlight](https://support.apple.com/en-gb/guide/iphone/iph3c511548/ios) · [macOS Spotlight](https://support.apple.com/en-gb/guide/mac-help/mchlp1008/12.0/mac/12.0) · [Safari tab bar layout](https://support.apple.com/en-gb/guide/iphone/ipha9ffea1a3/ios) · [WWDC21 10029 "Design for Safari 15"](https://developer.apple.com/videos/play/wwdc2021/10029/) · [Chrome address bar position](https://support.google.com/chrome/answer/14181646) and [the Chrome blog post announcing it](https://blog.google/products-and-platforms/products/chrome/address-bar-position-change/) · Chromium `ios/chrome/browser/omnibox/ui/popup/{omnibox_popup_presenter.mm, omnibox_popup_view_controller.mm}`, `chrome/browser/ui/android/omnibox/.../suggestions/OmniboxSuggestionsDropdown.java`, `chrome/browser/ui/views/autofill/popup/popup_view_utils.cc` · AOSP Launcher3 `res/layout/{search_container_all_apps.xml, all_apps_content.xml, search_results_rv_layout.xml}` · [`microsoft/vscode` `quickInputController.ts` + `quickInput.css`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/quickinput/browser/quickInputController.ts) · [Raycast manual — Search Bar](https://manual.raycast.com/search-bar) · [Slack — Search in Slack](https://slack.com/help/articles/202528808-Search-in-Slack) · [Google — featured snippets (consumer help)](https://support.google.com/websearch/answer/9351707)

**Drop-up / popup placement** — [Bootstrap 5.3 dropdowns](https://getbootstrap.com/docs/5.3/components/dropdowns/) · [Floating UI `flip`](https://floating-ui.com/docs/flip) · [CSS Anchor Positioning L1 (ED)](https://drafts.csswg.org/css-anchor-position-1/) · [HTML Standard — rendering, `::picker(select)`](https://html.spec.whatwg.org/multipage/rendering.html) · [jQuery UI Autocomplete](https://api.jqueryui.com/autocomplete/)

**Thumb reach & scanning** — Steven Hoober, UXmatters: [How Do Users Really Hold Mobile Devices? (2013)](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php) · [Design for Fingers and Thumbs Instead of Touch (2013)](https://www.uxmatters.com/mt/archives/2013/11/design-for-fingers-and-thumbs-instead-of-touch.php) · [Insights on Switching, Centering, and Gestures (2014)](https://www.uxmatters.com/mt/archives/2014/09/insights-on-switching-centering-and-gestures-for-touchscreens.php) · [The Rise of the Phablet (2014)](https://www.uxmatters.com/mt/archives/2014/11/the-rise-of-the-phablet-designing-for-larger-phones.php) · [Design for Fingers, Touch, and People, Part 1 (2017)](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php) and [Part 2 (2017)](https://www.uxmatters.com/mt/archives/2017/05/design-for-fingers-touch-and-people-part-2.php) · [Principles for Mobile Design (2017)](https://www.uxmatters.com/mt/archives/2017/08/principles-for-mobile-design.php) · [Paging, Scrolling, and Infinite Scroll (2018)](https://www.uxmatters.com/mt/archives/2018/11/paging-scrolling-and-infinite-scroll.php) · Scott Hurff, [How to Design for Thumbs in the Era of Huge Screens (2014)](https://www.scotthurff.com/posts/how-to-design-for-thumbs-in-the-era-of-huge-screens/) · Josh Clark, [How We Hold Our Gadgets](https://alistapart.com/article/how-we-hold-our-gadgets/)

**Nielsen Norman Group** — [Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/) · [F-Shaped Pattern (2006 original)](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/) and [the 2017 revisit](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) · [Text Scanning Patterns](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/) · [The Pinball Pattern](https://www.nngroup.com/articles/pinball-pattern-search-behavior/) · [Love-at-First-Sight Gaze Pattern](https://www.nngroup.com/articles/love-at-first-sight-pattern/) · [Fitts's Law and Its Applications in UX](https://www.nngroup.com/articles/fitts-law/) · [Basic Patterns for Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/) · [4 iOS Rules to Break](https://www.nngroup.com/articles/4-ios-rules-break/)

**Baymard** — [9 UX Best Practice Design Patterns for Autocomplete Suggestions](https://baymard.com/blog/autocomplete-design) · [Mobile Checkout Usability](https://baymard.com/blog/mobile-checkout) · [Product List UX: Number of Products to Load by Default](https://baymard.com/blog/number-of-items-loaded-by-default) · [research methodology](https://baymard.com/research/methodology)

**Studies** — Joachims, Granka, Pan, Hembrooke, Gay, ["Accurately Interpreting Clickthrough Data as Implicit Feedback"](https://www.cs.cornell.edu/people/tj/publications/joachims_etal_05a.pdf), SIGIR 2005 · Leiva et al., ["Understanding Visual Saliency in Mobile User Interfaces"](https://arxiv.org/abs/2101.09176), MobileHCI '20 · Valliappan et al., ["Accelerating eye movement research via accurate and affordable smartphone eye tracking"](https://doi.org/10.1038/s41467-020-18360-5), _Nature Communications_ 11:4553 (2020) · Bergstrom-Lehtovirta & Oulasvirta, "Modeling the Functional Area of the Thumb on Mobile Touchscreen Surfaces", CHI '14, DOI 10.1145/2556288.2557354 · Parhi, Karlson & Bederson, "Target size study for one-handed thumb use on small touchscreen devices", MobileHCI '06, DOI 10.1145/1152215.1152260 · Trudeau et al., _Human Factors_ 54(1) 52–59 (2012), DOI 10.1177/0018720811423660 · Keane, O'Brien & Smyth, "Are people biased in their use of search engines?", CACM 51(2) 49–52 (2008)

**This repo** — `src/lib/proto/proto-search.svelte.ts`, `src/lib/proto/ProtoSwitcher.svelte`, `src/lib/views/food/FoodStager.svelte` (`.dock`, `.results-list.inverted`, `.result-item.best`, `data-rank`), `src/lib/ui/BottomSheet.svelte`, [ADR-0027](../adr/0027-bottomsheet-as-the-one-sheet-primitive.md), `node_modules/bits-ui/dist/bits/select/select.svelte.js`
