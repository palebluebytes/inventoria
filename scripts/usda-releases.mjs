/**
 * What USDA currently publishes, against what the manifest pins — for
 * `scripts/usda-backup.mjs check` and for the staleness gate in
 * `scripts/usda-bundle.mjs` (ADR-0047 §12).
 *
 * Why this is its own module: the mirror stopped being insurance when ADR-0047
 * made it the source of two committed artifacts, so "is the manifest behind
 * USDA?" is now asked by two callers instead of one. Asked two ways it would
 * eventually be answered two ways, and the failure mode is silent — a bundle
 * generated from a release nobody noticed had moved.
 *
 * Node built-ins only, like the scripts either side of it: the mirror check runs
 * on a bare GitHub runner with no `pnpm install`.
 */

/**
 * Splits an archive filename into its family and its release date, so a manifest
 * entry can be matched against whatever USDA has published since. Foundation and
 * Survey releases are dated to the day; SR Legacy's lone release is dated to the
 * month.
 */
export function splitRelease(file) {
  const m = /^(.*_)(\d{4}-\d{2}(?:-\d{2})?)\.zip$/.exec(file);
  return m ? { family: m[1], release: m[2] } : null;
}

/**
 * Asks USDA what it currently publishes: every archive filename linked from the
 * release index.
 *
 * Throws rather than returning an empty list when the page yields nothing.
 * Reading "no newer release" out of a page we failed to parse would turn a
 * broken check into a false all-clear, the one outcome a mirror cannot afford.
 */
export async function fetchPublishedArchives(release_index) {
  const response = await fetch(release_index);
  if (!response.ok)
    throw new Error(`${release_index} returned ${response.status}`);
  const published = [
    ...(await response.text()).matchAll(/\/fdc-datasets\/([^"'<> ]+\.zip)/g),
  ].map((m) => m[1]);
  if (published.length === 0)
    throw new Error(
      `no archive links found at ${release_index}; the page layout has changed`
    );
  return published;
}

/**
 * How each manifest archive stands against what USDA publishes, one verdict per
 * archive in the order given.
 *
 * `state` is `current`, `stale` (USDA publishes a later release of the same
 * family), `unpublished` (nothing of that family is published at all), or
 * `unreadable` (the manifest filename carries no release date). Every state but
 * `current` is a failure for both callers; they are named apart so the message
 * can say which.
 */
export function compareToPublished(archives, published) {
  const families = published.map(splitRelease).filter(Boolean);
  return archives.map((archive) => {
    const mine = splitRelease(archive.file);
    if (!mine)
      return {
        dataset: archive.dataset,
        state: "unreadable",
        message: `${archive.file}: cannot read a release date out of the filename`,
      };
    const newest = families
      .filter((candidate) => candidate.family === mine.family)
      .map((candidate) => candidate.release)
      .sort()
      .at(-1);
    if (!newest)
      return {
        dataset: archive.dataset,
        state: "unpublished",
        message: `${archive.dataset}: nothing matching ${mine.family}* is published`,
      };
    if (newest > mine.release)
      return {
        dataset: archive.dataset,
        state: "stale",
        message: `${archive.dataset}: mirror holds ${mine.release}, USDA now publishes ${newest}`,
      };
    return {
      dataset: archive.dataset,
      state: "current",
      message: `${archive.dataset} is current (${mine.release})`,
    };
  });
}
