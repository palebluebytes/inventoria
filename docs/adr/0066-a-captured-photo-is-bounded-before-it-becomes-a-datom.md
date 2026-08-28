# ADR 0066: A captured photo is bounded to 1600 px before it becomes a datom

**Status:** Accepted  
**Date:** 2026-08-28  
**Implemented:** #181 `dee9077` (the bound and the seam it is tested through), `505cca5` (review fixes, including §2's smoothing setting), `10c7868` (the e2e photo fixtures that now have to decode)

## Context

Sizing the ledger for the export in
[ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md)
turned up what actually fills it. One shared helper,
`readImageAsDataUrl` in `src/lib/food/image-file.ts`, read a captured `File`
straight through `FileReader.readAsDataURL` with no downscale, no re-encode and
no cap. Whatever the camera produced became a datom value, base64 encoded, which
inflates it by about a third.

A current phone photo is commonly 3 to 8 MB, so 4 to 11 MB stored, and
`food/label_photos` is an ordered array
([ADR-0034](0034-label-photo-food-capture.md) §5), so a two-sided label doubles
it. Every meal, habit, note and calendar event in the ledger put together is
measured in kilobytes. Photos are the mass of this database, by an order of
magnitude, and the ledger never gives any of it back.

That last clause is what makes this urgent rather than untidy. The `datoms`
table is append only, so the size of a photo is decided once, at the instant of
capture, and then carried for the life of the database. An oversized photo is
not a cost that can be paid down later.

Three alternatives were live:

- **Leave it, since the export streams.** ADR-0064 made reading the ledger out
  possible at any size, and this is the argument that the problem is therefore
  solved. It is not: streaming addresses getting the bytes out, not holding
  them, and a device running short of disk is exactly the eviction risk
  [ADR-0065](0065-the-browser-is-asked-once-to-keep-the-ledger-and-its-answer-is-on-screen.md)
  is about.
- **Cap the bytes and refuse an oversized photo.** Cheap to write and easy to
  explain, and it fails the person at the moment they are standing in a shop
  photographing a label. A capture flow that rejects the capture is worse than
  the disease.
- **Store photos outside the ledger, as OPFS files a datom points at.** This is
  the structurally correct answer to binary blobs and it is a much larger
  change: a pointer datom means app state is no longer a pure fold over
  `datoms`, and an export of the ledger alone would no longer carry the photos.
  It stays live as a future record, and bounding the photo is worth doing
  either way, because a bounded photo is smaller wherever it ends up.

**Scope.** What a bounded photo is, and where the bounding happens, for photos
captured from now on. Not the photos already stored. Not EXIF, orientation, or
any transformation past bounding the size. Not the `idx_ave` index, which also
carries these values and is its own problem.

## Decision

### 1. The bound is 1600 px on the longer edge

Whichever edge is longer is scaled to 1600 px and the other follows by the same
ratio, so the aspect ratio survives. A 12 MP phone photo, 4032x3024, becomes
1600x1200: 1.9 megapixels rather than 12.2, a little over six times fewer.

The figure comes from the two readers a label photo has. The second is a vision
model, and Anthropic's vision documentation (verified 2026-08-28) puts the
standard-tier long-edge limit at 1568 px, above which an image is downscaled
before the model ever sees it. Storing more resolution than that buys the
deferred autofill of [ADR-0034](0034-label-photo-food-capture.md) §4 nothing at
all, so 1600 px sits just clear of the limit rather than far above it.

The first reader is a person, on the phone that took the photo, and 1600 px is
roughly twice the short edge of the screen it will be pinched and zoomed on. Put
in the terms the criterion is written in: a label filling the frame spans maybe
10 to 15 cm of packaging, which at this bound is over 100 px per centimetre, so
the millimetre-tall print of an ingredients list lands on the order of ten
pixels of x-height. That is the arithmetic, not the verdict. The verdict is
legibility by eye on a real label, which is a thing to check rather than a thing
to calculate.

### 2. The re-encode is JPEG at quality 0.8

JPEG because every browser's `canvas.toDataURL` supports it. WebP encodes the
same photo smaller, and a browser that does not support the requested type
silently answers a PNG instead, which for a photograph would be larger than what
came in. A silent fallback to the worst outcome is not worth 30 percent.

Quality 0.8 rather than lower because the artefact JPEG produces at low quality
is ringing around high-contrast edges, and high-contrast edges are exactly what
small print is made of. Anthropic's own image guidance (verified 2026-08-28)
warns that heavy compression makes text hard to read and that repeated
compression passes compound it, which is the same failure this is avoiding.

The canvas is also told `imageSmoothingQuality = "high"`, whose default is
`"low"`. At a downscale of six times or more, cheap sampling discards whole rows
of source pixels rather than averaging them, and the rows it discards are the
thin strokes that small print is drawn with. It is the cheapest lever there is
on the legibility this record is trying to protect.

### 3. A photo already inside the bound is stored exactly as it was read

No canvas round trip, no re-encode, nothing lost. A small upload is left alone
rather than put through a lossy pass that could only make it worse, and the
second compression pass the guidance above warns about never happens.

### 4. The reduction lives in the shared helper, and takes one parameter

It happens inside `readImageAsDataUrl`, not at the call sites, so no capture
surface can skip it by accident: the label form's multi-shot reader, the desktop
barcode upload and the manual-entry mini-forms all inherit it without changing.

The helper deliberately takes a `File` and nothing else. One call site reads a
multi-shot capture with `files.map(readImageAsDataUrl)`, which would hand a
second parameter the array index, so anything the reduction needs to be told is
told to `reduceCapturedPhoto` instead.

### 5. A decode that fails rejects, exactly as a read that fails already did

Downscaling means decoding, and a malformed image fails to decode. That
rejection travels the same path the old read failure did, so all three call
sites keep the "couldn't read that image" message they already show, and nothing
half-reduced is ever stored.

This widens what is refused, and deliberately. A file the browser cannot decode
now fails at capture, where before it was stored and failed later, silently, as
an `<img>` that never drew. Anything an `Image` cannot decode is something no
display surface in this app could ever have shown, so refusing it at the door is
the more honest of the two failures.

### 6. The decision is separated from the canvas so it can be tested

`planPhotoReduction` is pure: a source size in, either `keep` or a target size
out. `reduceCapturedPhoto` takes the image machinery as an injected
`PhotoSurface`. The unit runner is Node, where there is no `Image` and no
canvas, and this split is what lets a test cover above the bound, below it, and
a decode failure, without one.

A surface can also be genuinely absent in a browser, and that answers the bytes
that were read. A photo at full size is a worse outcome than a bounded one and a
much better one than no photo.

### 7. Photos already in the ledger are left as they are

Re-encoding a stored value is an `UPDATE` against `datoms`, which is the first
red line in `AGENTS.md` §3. There is no clever way around it: a superseding
datom carrying the smaller photo would append, not replace, and would leave the
original behind and make the ledger bigger. Existing photos stay full size
permanently, and that is a cost this record accepts rather than a problem it
defers.

## Consequences

A newly captured photo costs a fraction of what it did, and the fraction is
governed by pixel count, which drops by six times or more on any modern phone
camera. The byte figure that follows from that is not measured here and should
not be quoted as though it were.

This record amends [ADR-0034](0034-label-photo-food-capture.md) §5 on one
point. That record kept every shot of a multi-photo capture partly because a
future AI call and a possible contribution back to Open Food Facts would want
the full set. The count is untouched and all of those photos are still kept; it
is the resolution of each that is now bounded, chosen for reading a label rather
than for archiving one. If uploading photos to Open Food Facts is ever built,
their image expectations have to be checked against this bound, and it is that
feature's job to check, not this record's to guess.

A high-resolution-tier vision model would accept up to 2576 px and pay roughly
three times the visual tokens for the privilege. A future extractor that turns
out to need dense-document fidelity is the reason to revisit §1, and it is a
one-constant change for photos captured after it.

Two smaller effects. A transparent PNG dropped into a capture field gets a white
background rather than a black one, because the canvas is filled before the
image is drawn, and white is what a label is printed on. And a photo whose
content is dense text at full page width, a screenshot of a menu rather than a
product label, is the case where this bound bites hardest, because the text was
never large in the frame to begin with.

`RecipeBuilder.svelte` reads a recipe image through its own inline
`FileReader`, not through this helper, so it is not bounded by this record. It
is the one capture surface left outside, and folding it into the shared helper
is [#183](https://github.com/palebluebytes/inventoria/issues/183).
