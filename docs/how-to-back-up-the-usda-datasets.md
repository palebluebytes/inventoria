# How to back up the USDA datasets

The base-food search reads two USDA FoodData Central datasets, and one of them is
already discontinued: **SR Legacy's final release was 2018-04** and there will not be
another. [ADR-0045](adr/0045-usda-stays-the-base-food-composition-authority.md) makes
that dataset load-bearing, because it is what fills the fibre and the micronutrient
tail that Foundation does not measure. This backup keeps a copy off USDA
infrastructure so that losing upstream access is an inconvenience rather than a
silent thinning of every food in the app, and so the offline/self-hosted option in
that ADR stays open.

## What is kept

| Archive                                            | Release    | Size    | Records | Why                                                                 |
| -------------------------------------------------- | ---------- | ------- | ------- | ------------------------------------------------------------------- |
| `FoodData_Central_foundation_food_json_*.zip`      | 2026-04-30 | 469 KB  | 363     | The base record of every merged search hit; carries `foodPortions`. |
| `FoodData_Central_sr_legacy_food_json_2018-04.zip` | 2018-04    | 13.5 MB | 7,793   | Frozen and discontinued. The one archive that cannot be re-created. |
| `FoodData_Central_survey_food_json_*.zip`          | 2024-10-31 | 3.8 MB  | 5,432   | Unused by search; kept for its household portions.                  |

Branded Foods is deliberately absent: it is the barcode path's territory, Open Food
Facts covers it (ADR-0034 §8), and it is 3 GB.

**An array length is not a record count.** Foundation's `FoundationFoods` array holds
395 entries and the last 32 of them are literally `null`, so the number above is 363
and reading the length instead overstates the dataset by 9%. The manifest states both,
as `records` and `null_entries`.

Sizes, record counts and SHA-256 digests live in `scripts/usda-backup.manifest.json`,
which is the source of truth the script verifies against. Verification measures the two
counts out of the archive rather than trusting them, so a refresh that leaves the old
number behind fails instead of quietly publishing it.

## Running it

```sh
pnpm usda:backup check     # has USDA published a newer release than the manifest?
pnpm usda:backup fetch     # download into .usda-backup/, then verify every digest
pnpm usda:backup verify    # re-check the local copies
pnpm usda:backup upload    # push to R2, then read each object back and compare
```

A fifth command reads the archives rather than checking them:

```sh
pnpm usda:coverage         # how much of the panel each dataset reports, and the twin pairs
```

It prints the completeness table in [research note #108](research/108-base-food-composition-sources.md), the
`ndbNumber` join behind [ADR-0045](adr/0045-usda-stays-the-base-food-composition-authority.md) §2, and the
gzipped size of the merged panel that record's last consequence sizes an offline
bundle by, measured over the local copies. Re-run it after a refresh: those figures are quoted when sizing
a bundle or a coverage claim, and they move with the release.

`check` needs no credentials and exits non-zero when anything is behind, which is
what the scheduled job below acts on. It fails loudly if it cannot parse USDA's
release index at all, because a broken check that reports "nothing newer" is worse
than no check.

`upload` needs a Cloudflare session. Wrangler lives in `worker/node_modules`, so
authenticate with `worker/node_modules/.bin/wrangler login` (or put
`CLOUDFLARE_API_TOKEN` in `.env` and source it) first; the script refuses to run
rather than half-uploading. Two account-level prerequisites bite once each:

- **R2 must be enabled on the account.** It is opt-in, from the Cloudflare dashboard
  under R2. Until then every R2 call fails with `code: 10042`.
- **An account-scoped API token needs the account id.** Such a token cannot read the
  user-level `/memberships` endpoint wrangler uses to discover it, which surfaces as a
  bare `Authentication failed (9106)`. The script reads the id out of `wrangler whoami`
  and passes it down, so this is handled; set `CLOUDFLARE_ACCOUNT_ID` to override.
  The token itself needs **Workers R2 Storage: Edit**.
  It creates the bucket named in the manifest (`inventoria-usda-backup`, `weur`) if it
  does not exist, uploads each archive under the `fdc/` prefix along with the manifest
  itself, and then downloads each object again to compare digests. An unread backup is
  a rumour.

## Knowing when to refresh

Measured over the 15 releases USDA published between 2019 and 2026, Foundation ships
about every 183 days, nominally April and October, and it slips: the October 2025
release landed on 2025-12-18. FNDDS is biennial, tied to the NHANES two-year cycles
by USDA's own statement. SR Legacy is finished, so it has exactly one release and
always will.

`.github/workflows/usda-mirror-check.yml` therefore runs `check` **quarterly**, on
the 1st of February, May, August and November, a month after each release window
including the late ones. When it finds something newer it opens an issue labelled
`usda-mirror`, and comments on that issue rather than filing a second one if the
refresh is still outstanding. It can also be run by hand from the Actions tab.

Because the app reads the live USDA API, a mirror that lags by a quarter costs
nothing operationally. What it bounds is how current a restore would be.

## Refreshing it

Update the `file`, `release`, `bytes`, `sha256`, `records` and `null_entries` fields
for the affected dataset in the manifest, run `fetch`, then `upload`. `fetch` verifies
what it downloaded, so the two counts are the ones it reports back at you if you guess
them; take them from that failure rather than from the release notes. Archive keys
carry their release date, so a refresh **adds** objects rather than replacing them and
every earlier snapshot stays restorable. The manifest is uploaded twice for the same
reason: a rolling `fdc/manifest.json` and a frozen `fdc/manifest-<retrieved>.json`, so
the older archives stay described once the rolling copy moves on.

A digest mismatch on SR Legacy is never an update. It means the local copy is
damaged.

## Restoring from it

The archives are the same food records the API serves, but **not in the same shape as
a search response**. A bulk record nests its nutrients as
`foodNutrients[].nutrient.id` with `.amount`, where the search API returns a flat
`nutrientId` with `.value`. Anything reading a restored archive therefore needs a thin
adapter into the `FdcFood` shape in `src/lib/food/usda-fdc.ts`; the mapper, the merge
and the panel logic all work unchanged behind it.

That shim is the same piece of work the bundled-offline option would need, which is
why it has not been written speculatively.
