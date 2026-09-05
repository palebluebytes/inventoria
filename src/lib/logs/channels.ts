/**
 * The roster: every Log channel this app has, and the only module that knows
 * the list (#221).
 *
 * A channel is **declared and registered in the same act** — `defineChannel`
 * both builds it and puts it in the facility's registry — which is what keeps a
 * channel's whole life in one place (ADR-0092 §1). The cost of that is a
 * registry holding only the channels whose *module something imported*, and
 * until this file existed that something was a view. Two things followed, and
 * neither was intended:
 *
 * - **A channel whose only importer went away vanished**, from the Local Logs
 *   card, from the review sheet and therefore from the export, with nothing
 *   failing and no test noticing. Its records stayed in `localStorage`,
 *   unreachable and unredactable through the UI — the one state ADR-0092 §11's
 *   reviewed export exists to make impossible.
 * - **Registry order was import order**, so the order channels appeared in a
 *   review, and in a file somebody handed over, was incidental.
 *
 * So the roster is stated here, once, and a surface reaches the registry
 * through this module rather than through the facility. That is why
 * {@link channelsOfFacet} is re-exported rather than imported from
 * `log-facility.ts` directly: reading a registry-derived list through the
 * module that fills the registry is what makes the answer independent of what
 * anyone else happened to import. `tests/unit/log-channels.test.ts` holds every
 * half of that — that this module registers every channel by itself, that it
 * imports every module in `src/` declaring one, that the registry comes back in
 * this file's order, and that no caller outside `src/lib/logs/` takes the other
 * door.
 *
 * **This is not a central registry of names.** `defineChannel` deliberately
 * does not take a name from a literal union, and that is unchanged: a union
 * would catch typos only, duplicates would still need the runtime check, and a
 * channel's name would then be declared away from the channel. What is central
 * is the list of *modules*, which is the thing a build cannot derive.
 *
 * Adding a channel is three lines here — the import, the re-export and the
 * array entry, all in the same position — and nothing anywhere else.
 */

import {
  channelsOfFacet as registeredChannelsOfFacet,
  type LogChannel,
} from "./log-facility";
// In the roster's own order, not alphabetically: registration is an import
// side effect, so these three lines and the array below are one statement made
// three times, and `log-channels.test.ts` fails the moment they disagree.
import { SEARCH_CHANNEL } from "./search-log";
import { SCAN_CHANNEL } from "./scan-log";

export { SEARCH_CHANNEL, SCAN_CHANNEL };

/**
 * Every channel, in the order a review and an export present them.
 *
 * **The order is stated here and applied below**, rather than left to the order
 * the registry happened to fill in. Registration order is ES module evaluation
 * order, which follows this file's import statements — so it agrees with this
 * array today and would stop agreeing the moment somebody reordered one without
 * the other. An order that depends on that is the incidental order #221 is
 * about, one file further along.
 */
export const LOG_CHANNELS: readonly LogChannel<unknown>[] = [
  SEARCH_CHANNEL,
  SCAN_CHANNEL,
];

/**
 * The channels one Facet carries, in the roster's order.
 *
 * The membership rule is the facility's and stays there: which channels belong
 * to a Facet is ADR-0092 §13's, argued beside the `domain` field it reads, and
 * reimplementing it here would be two answers to one question. What this adds
 * is the two things the facility cannot know — that the registry it filtered
 * holds every channel, and what order they go in.
 *
 * **A registered channel the roster does not name is still returned**, last. It
 * would be a test's channel or a mistake, and either way making it invisible is
 * the defect this file exists to remove rather than a tidier answer: a channel
 * in the registry is a channel writing records, and a surface that cannot show
 * it cannot redact it either. So the roster decides order, never membership.
 *
 * Reading {@link LOG_CHANNELS} here is also what keeps this module's imports
 * reachable from the screens. A roster whose only exported value nothing
 * consumed would be a module a bundler could one day shake out entirely —
 * `package.json` declares no `sideEffects` today, so nothing does, but the
 * roster should not depend on that staying true.
 */
export function channelsOfFacet(facetId: string): LogChannel<unknown>[] {
  const inFacet = registeredChannelsOfFacet(facetId);
  return [
    ...LOG_CHANNELS.filter((channel) => inFacet.includes(channel)),
    ...inFacet.filter((channel) => !LOG_CHANNELS.includes(channel)),
  ];
}
