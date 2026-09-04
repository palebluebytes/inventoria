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

### It keeps its ground where the drawing encloses it, and nowhere else

#271 recorded that a transparent icon is not neutral, because iOS composites an
installed icon onto the manifest's `background_color`, which is `#000000`. For
the pomegranate that was a warning. For line art it is fatal, and the difference
is measurable rather than aesthetic. The set first shipped answering that with a
**fully opaque white rectangle** — no alpha channel anywhere — which is correct
about the danger and expensive about everything else: a rectangle is a white
card that follows the mark onto every dark surface it lands on.

What replaced it is not the transparent source. The distinction the first answer
did not draw is between the ground **outside** the drawing and the paper
**inside** it. In the source they are the same thing — nothing. The tin's body,
the fish, the paper behind the ring pull are all uninked, so telling them apart
is not a colour test, and keying white out by colour gives back exactly the
failure the rectangle was there to prevent. It is a **reachability** test:
everything a flood fill reaches from the canvas edge without crossing near-solid
ink is ground and goes; everything it cannot reach is the drawing's own paper
and stays, opaque.

| Composited onto `#000000`                | Distinct values | Mean luminance |
| ---------------------------------------- | --------------- | -------------- |
| the source, transparent                  | 1               | 0.000          |
| white keyed out by colour                | 1               | 0.000          |
| the first shipped 512, a white rectangle | 256             | 0.820          |
| the shipped 512                          | 200             | 0.242          |

The source is 19.8% ink and 80.2% nothing, and every inked pixel is black. On a
black ground it is not a dim icon or a hard-to-read icon. It is one uniform
black square — the whole image collapses to a single colour, and so does any
regeneration that treats the interior as background. The shipped 512 does not:
56.9% of its canvas is fully clear, 17.4% is fully opaque white, and what a
black composite leaves is a drawing rather than a value.

Two files cannot take this, for two different reasons, and both keep an opaque
ground:

- **`rations-180.png`, the `apple-touch-icon`.** iOS does not composite a Home
  Screen clip onto the manifest's `background_color`; it fills the clip's
  transparency with black, and Rations' background is `#ffffff`. Everywhere else
  in the set a cleared ground shows whatever surface the mark is standing on,
  which is the point of clearing it; on iOS it shows a colour nobody chose and
  the opposite of the one the drawing was made for. So this file keeps its paper
  — as a **disc** rather than a rectangle, so what iOS blacks out is only the
  four corners the disc does not reach, and the mark reads as a mark instead of
  as a white card. 19.2% of its canvas is clear against 56.9% on the 512, which
  is the difference between four corners and a silhouette.
- **`rations-maskable-512.png`, Android's crop.** Android crops a maskable icon
  to a shape the icon is never told, guaranteeing only the central 80% circle.
  Any transparency in it is a hole onto whatever the launcher puts behind, and
  the crop can reach into corners a disc does not fill, so the ground has to
  cover the canvas. This file is unchanged.

Black ink on white paper is also the app's own frame (`--ink` and `--paper` in
`src/app.css`, ADR-0038), so the ground that stays is the design system's rather
than a colour picked to solve a problem.

`tests/unit/rations-icon.test.ts` asserts all of this from the files themselves
rather than from the recipe below — that the maskable carries no alpha at all,
that the other four clear their corners, and that every one of the five keeps
its paper. A regenerated set is exactly where those would be lost, and the loss
would show up on somebody's home screen rather than in any gate. It decodes the
pixels to do it, because the paper is a property of the image and not of the
header.

### The set

| File                       | Size | For                                                            |
| -------------------------- | ---- | -------------------------------------------------------------- |
| `rations-512.png`          | 512  | the manifest's large icon; what the registry names             |
| `rations-192.png`          | 192  | the manifest's small icon                                      |
| `rations-maskable-512.png` | 512  | Android's own crop, `purpose: "maskable"`                      |
| `rations-180.png`          | 180  | `apple-touch-icon`, which is what an iOS Home Screen clip uses |
| `rations-32.png`           | 32   | the browser tab                                                |

126,818 bytes for the five — 20,164 more than the opaque set, which is what an
alpha channel on four of them costs. A 64-colour quantise of the 512 saves
26,177 of those at RMSE 0.34%, and 16 colours saves 34,711 at RMSE 1.27%;
neither was taken, because a lossy step is a thing to keep explaining and 35 KB
against the 3.1 MB Loro WASM already in the precache is not worth explaining.
The growth is 0.2% of Rations' `precacheBytes`, well inside the ±5% band
ADR-0083 gives it, so the registry figure did not move.

### The derivation

Run from the fetched source, with ImageMagick 7 (`nix shell nixpkgs#imagemagick`):

```sh
magick 7864233-512.png -trim +repage art.png

# The ink, at 86% of the canvas, on nothing.
magick art.png -filter Lanczos -resize 440x440 \
  -background none -gravity center -extent 512x512 ink-512.png

# Ground is what a flood fill CANNOT reach from a corner without crossing
# near-solid ink. Threshold at 78% (alpha 199) so the fill eats the outer part
# of the antialiased edge and the paper only starts under ink already dark
# enough to hide where it starts.
magick ink-512.png -alpha extract -threshold 78% barrier.png
magick barrier.png -colorspace sRGB -fill red -draw 'color 0,0 floodfill' \
  -fuzz 0% -fill white -opaque red -fill black +opaque white outside.png
magick outside.png -negate -alpha off interior.png

# Paper cut to that shape, with the ink laid over it.
magick -size 512x512 xc:white interior.png -compose CopyOpacity -composite ground-512.png
magick ground-512.png ink-512.png -compose Over -composite base-512.png

# The "any" icons.
for s in 512 192; do
  magick base-512.png -filter Lanczos -resize ${s}x${s} -strip rations-$s.png
done

# The 32 thresholds its colour as before; its alpha is the silhouette resampled,
# unioned with the ink so no thresholded stroke can lose its own pixels.
magick base-512.png -background white -alpha remove -alpha off flat.png
magick flat.png -filter Lanczos -resize 32x32 -threshold 62% c32.png
magick base-512.png -alpha extract -filter Lanczos -resize 32x32 -threshold 50% a32.png
magick a32.png \( c32.png -negate \) -compose Lighten -composite alpha32.png
magick c32.png alpha32.png -alpha off -compose CopyOpacity -composite -strip rations-32.png

# The apple-touch-icon: art inscribed in an opaque white disc.
magick -size 512x512 xc:none -fill white -draw 'circle 255.5,255.5 255.5,-0.5' disc-512.png
magick art.png -filter Lanczos -resize 359x359 \
  -background none -gravity center -extent 512x512 ink-disc.png
magick disc-512.png ink-disc.png -compose Over -composite base-disc-512.png
magick base-disc-512.png -filter Lanczos -resize 180x180 -strip rations-180.png

# The maskable: art inscribed in Android's safe circle, full-bleed.
magick art.png -filter Lanczos -resize 308x308 \
  -background white -alpha remove -alpha off -gravity center -extent 512x512 \
  -strip rations-maskable-512.png
```

Run against the committed source these reproduce all five shipped files
byte-for-byte, the maskable included.

**The flattened "any" icons are the opaque set, unchanged.** `rations-512.png`
composited back onto white is bit-identical to the file it replaced, and so is
`rations-32.png`; only the 192 moves at all, by RMSE 0.35%, and only where the
silhouette's edge is now resampled against transparency instead of against
white. Nothing about the picture was redrawn to make it transparent — the ground
was subtracted from it.

**359 is derived, not chosen**, by the same argument as the maskable's 308 but
measured off the ink rather than off its bounding box. The trimmed art's
furthest inked pixel is 283.4 px from its centre, against a bounding-box half
diagonal of 307.2 — the drawing does not reach its own corners. The square
ground leaves 36 px of paper at the canvas edge; keeping that same margin
against a disc of radius 256 puts the ink inside 220 px, so the art scales by
220 / 283.4 = 0.776, and 462 x 0.776 = 359.

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

Clearing the ground added a second axis to look along, so the 32 was rendered
again on paper and on near-black: it reads on both, because what carries it at
that size is the white body of the tin against the ink, and both of those are
still in the file. A silhouette does not become harder to read on a dark tab
bar — it is the outer rectangle, now gone, that used to decide what the mark sat
on.

### Why they live under `/food/`

The set is at `public/food/icons/`, so it serves from `/food/icons/…` — **inside
Rations' scope**, not beside the root's `favicon.svg`. ADR-0077 gives each Facet
its own service worker at its own scope, and a service worker scoped to `/food/`
cannot precache a URL above it. Shipping Rations' icons at `/icons/…` would have
left the one Facet whose whole record is about precaching its own weight fetching
its own mark over the network. The directory shares a name with the repo-root
`food/` that holds the entry HTML; they are different things that land in the
same place, `dist/food/`.

## What the manifest takes, and what it leaves

[#305](https://github.com/palebluebytes/inventoria/issues/305) wrote Rations'
manifest and settled which of these files it enumerates. **Three of the five**,
in `src/lib/facets/registry.ts`, which is where the build reads them:

| File                       | `sizes`   | `purpose`  |
| -------------------------- | --------- | ---------- |
| `rations-512.png`          | `512x512` | — (`any`)  |
| `rations-192.png`          | `192x192` | — (`any`)  |
| `rations-maskable-512.png` | `512x512` | `maskable` |

The other two are declared by `food/index.html` with `<link>` instead, because
that is where a browser looks for them: `rations-180.png` is the
`apple-touch-icon` and `rations-32.png` is the tab favicon. A manifest that
listed them as `icons` would be claiming they are install marks, and neither is.

**`background_color` is `#ffffff` and `theme_color` is `#000000`** — `--paper`
and `--ink`, the app's own frame (ADR-0038), rather than the root's purple on
black. The background is the one that had to be chosen carefully, because an
installed icon is composited onto it, and it is now **load-bearing rather than
merely agreeable**: the manifest's two `any` icons clear their ground outside
the drawing, so this colour is what shows around the tin instead of a white
rectangle. Paper is the colour the drawing was made for, so the splash reads as
one surface. When the icons were opaque, the same value made the splash seamless
without having to — the section above records that trade and what it bought.

[#306](https://github.com/palebluebytes/inventoria/issues/306) is the other
consumer, and it closed the gap the manifest leaves. ADR-0077 §2 says the static
half of a precache — "`usda/`, `fonts/`, the Rations icon set" — is **declared
per Facet in the registry**, and the manifest's three are not the set's five. So
Rations' `precache` names the whole set by pattern, `food/icons/rations-*.png`,
alongside the `CREDITS.txt` the licence asks to travel with it. All 127 KB sit
inside the Facet that uses them, and none of it is in the root's service worker.
