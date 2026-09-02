import { vi } from "vitest";
import { render } from "svelte/server";
import type { Component } from "svelte";
import {
  facetOf,
  type Facet,
  type FacetId,
} from "../../../src/lib/facets/registry";

/** What a shell did to the address bar on its way up, and what it drew. */
export interface ShellBoot {
  /** The markup it rendered, or `""` if it threw before its first element. */
  body: string;
  /** Every URL it rewrote the address bar to, in order. */
  cleaned: string[];
}

/**
 * Boots a Facet's shell on `href` under a stubbed `navigator`, and reports what
 * it did about the address bar.
 *
 * **One reader for a question two shells answer differently.** ADR-0084 §5 puts
 * both readings of a receive link on Rations and deletes the root's, and the
 * only way to state that as a pair of claims is to ask both shells the same
 * question the same way. A second copy of the harness would let the two drift
 * until the comparison stopped meaning anything.
 *
 * **A render that throws is caught and the caller's counts still stand**,
 * because everything these tests are about happens at component initialisation,
 * before the first element: `dbClient.init` on one branch and the URL reading on
 * the other. A shell's ordinary path mounts views that subscribe to ledger
 * stores, and there is no ledger here for them to read — which is the same fact
 * ADR-0082 §8 leans on from the other side, that the handover page is safe to
 * skip `init` for precisely because it mounts none of them.
 *
 * **A stubbed `navigator` proves the branch and not the platform** (ADR-0082's
 * Consequences). That a real web clip reports `navigator.standalone === true`
 * is #287's, and no suite can reach it.
 *
 * The caller owns the `vi.mock` of `db.client` and the spy on `init`: a mock
 * factory is hoisted to the file it is written in, so it cannot live here.
 * `vi.unstubAllGlobals()` in an `afterEach` is the caller's too.
 */
export function bootShell(
  shell: Component<{ facet: Facet }>,
  facetId: FacetId,
  href: string,
  navigator: Record<string, unknown>
): ShellBoot {
  const cleaned: string[] = [];
  const url = new URL(href);
  vi.stubGlobal("window", {
    navigator,
    location: { href, origin: url.origin, search: url.search, hash: url.hash },
    history: {
      replaceState: (_state: unknown, _title: string, to: string) =>
        cleaned.push(to),
    },
  });

  let body = "";
  try {
    body = render(shell, { props: { facet: facetOf(facetId) } }).body;
  } catch {
    // See above: the shell wanted a store this test has no ledger for, and
    // whichever branch is under test was taken before the first element.
  }
  return { body, cleaned };
}
