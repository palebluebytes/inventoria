# Where the app's icons come from

Every image the app installs under is somebody's work, and this page records
whose. It exists because [#271](https://github.com/palebluebytes/inventoria/issues/271)
prototyped Rations with an image pulled from a thumbnail cache that had no
author and no licence attached to it, and that record said replacing it blocks
the build rather than trailing it. A shipped icon with no traceable licence is
the failure this page is here to make impossible to repeat.

| Facet      | Icon                              | Author         | Licence                         |
| ---------- | --------------------------------- | -------------- | ------------------------------- |
| Inventoria | `public/favicon.svg`              | **unrecorded** | **unrecorded**                  |
| Rations    | `public/food/icons/rations-*.png` | Michael Senkow | CC BY 3.0, attribution required |

`public/food/icons/CREDITS.txt` carries the attribution itself and ships to
`/food/icons/CREDITS.txt` beside the images, which is the route
`public/fonts/OFL.txt` already takes for the typeface. This page is the working
record behind it. Both files are precached, because CC BY 3.0 clause 4(a) and
OFL 1.1 clause 2 both ask the notice to travel with every copy of the work and
an offline install is one — which is why `txt` is in `vite.config.ts`'s
`globPatterns`.

**The root's mark has the same gap #302 was opened to close, and this page does
not close it.** `public/favicon.svg` first appears in `cdcd07b`, a pre-commit
hooks commit, with no author, no licence and nothing to trace; the repository
does not say where it came from and neither can this page. It is outside #302,
whose subject is Rations, and recording it means asking whoever put it there
rather than measuring anything. It is written down here so that the next reader
finds a known gap instead of an implied clearance.

## The Rations icon

**"anchovy tin", by Michael Senkow, id 7864233, published 2025-05-03**, from the
Noun Project: <https://thenounproject.com/icon/anchovy-tin-7864233/>.

**Licence: Creative Commons Attribution 3.0** —
<https://creativecommons.org/licenses/by/3.0/>. The Noun Project offers icons
under exactly three licences, and its terms name them: Public Domain, CC BY 3.0,
and a paid Royalty-Free waiver of the attribution CC BY 3.0 requires. This icon
is marked free to use, so it is the second, and the obligations are the ordinary
CC BY ones: name the author, the title, the source and the licence, and say that
the work was changed. Commercial use and derivatives are both permitted, so
scaling the art and laying it on a ground needs no further permission. The one
restriction in those terms that a reader might trip over — that an icon may only
go on **items for resale** under a paid licence or a legible on-item credit —
does not reach here: the terms define an item for resale as tangible
merchandise, and an app icon is not one.

The source is committed unmodified at `docs/assets/rations-anchovy-tin-source.png`
— 512x512, `sha256 5d50cdbe9336bf4d7b942ea87c1dcfde6309f63674456ba4128ba597c0fc5ad3`,
fetched from `https://static.thenounproject.com/png/7864233-512.png`. It sits in
`docs/` and not `public/`, so it is not part of the build. Keeping it is what
makes the measurements below re-runnable rather than merely re-readable: the
"one distinct value" row in the next section is a property of the transparent
source, and a reader who cannot open that file has to take it on trust.

### Why a tin

[#271](https://github.com/palebluebytes/inventoria/issues/271) settled the
subject before it settled the image: **a food opened up with what is inside
showing**. It rejected abstract marks for being too much logo and not enough
item, and it rejected single foodstuffs for reading as one meal rather than a
store. A ration tin with the lid rolled back is both halves of that at once —
it is the thing the Facet is named for, and it is open.

### It is opaque, and that is the whole design

#271 recorded that a transparent icon is not neutral, because iOS composites an
installed icon onto the manifest's `background_color`, which is `#000000`. For
the pomegranate that was a warning. For line art it is fatal, and the difference
is measurable rather than aesthetic:

| Composited onto `#000000` | Distinct values | Mean luminance |
| ------------------------- | --------------- | -------------- |
| the source, transparent   | 1               | 0.000          |
| the shipped 512, opaque   | 256             | 0.820          |

The source is 19.8% ink and 80.2% nothing, and every inked pixel is black. On a
black ground it is not a dim icon or a hard-to-read icon. It is one uniform
black square — the whole image collapses to a single colour. So **the Rations
icon carries its own ground**: white paper, opaque, no alpha channel anywhere in
the shipped set. Nothing composites through it, which makes it immune to whatever
`background_color` [#305](https://github.com/palebluebytes/inventoria/issues/305)
eventually writes into Rations' manifest rather than dependent on it.

Black ink on white paper is also the app's own frame (`--ink` and `--paper` in
`src/app.css`, ADR-0038), so the ground is the design system's rather than a
colour picked to solve a problem.

`tests/unit/rations-icon.test.ts` asserts the opacity from the files themselves
rather than from the recipe below, because a regenerated set is exactly where it
would be lost, and the loss would show up on somebody's home screen rather than
in any gate.

### The set

| File                       | Size | For                                                            |
| -------------------------- | ---- | -------------------------------------------------------------- |
| `rations-512.png`          | 512  | the manifest's large icon; what the registry names             |
| `rations-192.png`          | 192  | the manifest's small icon                                      |
| `rations-maskable-512.png` | 512  | Android's own crop, `purpose: "maskable"`                      |
| `rations-180.png`          | 180  | `apple-touch-icon`, which is what an iOS Home Screen clip uses |
| `rations-32.png`           | 32   | the browser tab                                                |

106,654 bytes for the five. A 64-colour quantise of the 512 saves 7,918 of them
at RMSE 0.27%, and 16 colours saves 19,672 at RMSE 1.29%; neither was taken,
because a lossy step is a thing to keep explaining and 19 KB against the 3.1 MB
Loro WASM already in the precache is not worth explaining.

### The derivation

Run from the fetched source, with ImageMagick 7 (`nix shell nixpkgs#imagemagick`):

```sh
magick 7864233-512.png -trim +repage art.png

# The "any" icons: art at 86% of the canvas, on opaque paper.
magick art.png -filter Lanczos -resize 440x440 \
  -background white -alpha remove -alpha off -gravity center -extent 512x512 \
  base-512.png
for s in 512 192 180; do
  magick base-512.png -filter Lanczos -resize ${s}x${s} -alpha off -strip rations-$s.png
done
magick base-512.png -filter Lanczos -resize 32x32 -threshold 62% -alpha off -strip rations-32.png

# The maskable: art inscribed in Android's safe circle.
magick art.png -filter Lanczos -resize 308x308 \
  -background white -alpha remove -alpha off -gravity center -extent 512x512 \
  -strip rations-maskable-512.png
```

**308 is derived, not chosen.** Android crops a maskable icon to an unknown
shape and guarantees only the central circle of 80% diameter — 409.6 px on a 512
canvas. The trimmed art is 462x405, so the largest copy of it whose corners sit
on that circle is `409.6 / sqrt(462^2 + 405^2) = 0.6667` of full size, giving
308x270. Measured back off the shipped file, the ink's bounding box is 308x270
at +102+121, whose corners are 204.8 px from the centre: exactly the safe
radius, and the art itself does not reach into its own bounding-box corners, so
the ink is strictly inside. The same measurement on `rations-512.png` gives a
bounding box whose corners are 292.7 px out — past the 256 px circle, which is
why the maskable is a separate file and not the same one relabelled.

**The 32 is thresholded and the others are not.** Rendered both ways and
compared: at 32 px the antialiased downsample turns the engraving's hatching
into an even grey and the tin stops reading as a tin, where a hard 1-bit
threshold keeps the rim, the rolled lid and three separate fish. At 48 px and up
the difference stops mattering and the antialiased version is the better
picture.

### Where it stops reading

Rendered at 512, 192, 180, 64, 48, 32 and 16 and looked at:

- **32 px and above: the subject reads.** At 32 the tin, the rolled-back lid and
  the three fish inside are separable. The ring pull survives as a mark rather
  than a ring: its hole is one pixel wide, so it reads as a tab on the lid and
  not as something you could put a finger through.
- **16 px: it does not.** Every treatment tried — plain downsample, threshold at
  50/62/75%, thickening the ink first at four strengths — collapses to an
  undifferentiated dark lump. This is a property of the art, not of the
  pipeline: 19.8% ink at engraving density has more lines than a 16 px grid has
  pixels.

So no 16 px file is shipped, and the smallest is 32. A browser that wants 16 for
a tab will downsample the 32 itself and get the lump; that is the honest floor
for this drawing, and the alternative — a second, simplified mark for small
sizes — would be a different icon rather than a smaller one.

### Why they live under `/food/`

The set is at `public/food/icons/`, so it serves from `/food/icons/…` — **inside
Rations' scope**, not beside the root's `favicon.svg`. ADR-0077 gives each Facet
its own service worker at its own scope, and a service worker scoped to `/food/`
cannot precache a URL above it. Shipping Rations' icons at `/icons/…` would have
left the one Facet whose whole record is about precaching its own weight fetching
its own mark over the network. The directory shares a name with the repo-root
`food/` that holds the entry HTML; they are different things that land in the
same place, `dist/food/`.

## What is not settled here

[#305](https://github.com/palebluebytes/inventoria/issues/305) writes Rations'
manifest and is where these files become `icons` entries with `sizes`, `type`
and `purpose`. It is also where `background_color` is chosen for Rations; the
set above does not depend on the answer, but paper rather than the root's black
is the one that matches.

[#306](https://github.com/palebluebytes/inventoria/issues/306) is the other
consumer. ADR-0077 §2 says the static half of a precache — "`usda/`, `fonts/`,
the Rations icon set" — is **declared per Facet in the registry**, and the
registry today carries one icon URL rather than a set. That is enough for a
manifest and not enough for a per-Facet precache; the set exists, and saying so
in the place the build reads is #306's. Until then the root's single service
worker precaches all five files, which is 106 KB the root does not use.
