/**
 * Has a curated stand-in's pinned OFF record moved? (ADR-0046, #117)
 *
 * Why this exists: ADR-0046 §4 snapshots each stand-in's OFF record into the
 * repo rather than fetching it per search, and accepts silent staleness as the
 * price — "a snapshot that drifts is wrong slowly and visibly at review, where a
 * live value is wrong instantly and invisibly". Visible at review only happens
 * if something looks. This is what looks, quarterly, from
 * `scripts/curated-snapshot-check.mjs`.
 *
 * Three failures are worth telling apart, because each needs a different answer
 * from a human:
 *
 *  - the product is GONE (delisted, or the barcode now 404s), which is the worst
 *    case: search keeps answering from the snapshot while the record behind it
 *    no longer exists;
 *  - the PANEL moved: a macro, or the serving size a portion is logged in,
 *    and the panel is what the user eats off;
 *  - the record is no longer SINGLE-INGREDIENT, which retroactively fails
 *    ADR-0046 §2's second admission.
 *
 * A fourth, `unreachable`, covers an entry OFF never answered for — a request
 * that did not land, or one it turned away with a 429, a 5xx or a status this
 * check cannot explain. It is not drift and it is not evidence of any: reporting
 * "nothing moved" would be worse than reporting nothing at all, and reporting it
 * as GONE (which this did until #205) is worse still, because it spends a
 * human's review pass re-vetting a record that never changed.
 *
 * Nothing here ever rewrites a snapshot. Pulling the new values in silently is
 * precisely what §4 declined to do, and a changed panel needs §2's consensus
 * check re-run before it can be trusted again.
 *
 * Deliberately NOT checked: OFF's NOVA rating, which ADR-0046's consequences
 * lean on for the processing badge. It is a real candidate for a later pass;
 * the three failures above are the ones #117 scoped.
 *
 * Plain Node built-ins only — the check runs on a bare GitHub runner with no
 * install step — and every impure edge (the fetch, the wait) arrives as a
 * parameter so the rules can be tested without a network.
 */

/**
 * How far a value may move before it counts as drift: half a percent of the
 * pinned value, never less than a tenth of a unit. OFF publishes macros to one
 * decimal, so the floor is the resolution of the source itself, and the relative
 * term keeps the rule honest across a panel spanning 0 g of sodium and 652 kcal.
 */
const DRIFT_EPSILON = { relative: 0.005, absolute: 0.1 };

/** How long to wait between two OFF requests, in ms (their rate guidance). */
const REQUEST_INTERVAL_MS = 1000;

/** The separators an ingredients list uses, in every form OFF records them. */
const INGREDIENT_SEPARATOR = /,|;|\+|&|\band\b/;

/**
 * How many ingredients an OFF `ingredients_text` names. One is the admission
 * ADR-0046 §2 requires; zero means the record can no longer evidence it either
 * way. Text, not taxonomy: OFF's parsed ingredient list is absent on many
 * records, and the admission was made against the text a human read.
 *
 * A segment counts only if it contains a letter, so the annotations that trail a
 * single ingredient ("cacao nibs, 100%") do not read as a second one. The rule
 * still over-splits on some phrasings, and errs that way on purpose: a wasted
 * look costs a human five minutes, where a missed compound product leaves an
 * ingredient's panel standing on a record ADR-0046 §2 would no longer admit.
 */
export function countIngredients(text) {
  if (typeof text !== "string") return 0;
  return text.split(INGREDIENT_SEPARATOR).filter((part) => /\p{L}/u.test(part))
    .length;
}

/**
 * Whether an HTTP status means OFF failed to answer rather than answered.
 *
 * Restates `serviceDidNotAnswer` in `src/lib/food/open-food-facts.ts` word for
 * word — `429` from OFF's rate limiter, and any `5xx` — and by hand, because
 * this check runs on a bare GitHub runner where the app's module cannot be
 * imported.
 *
 * `tests/unit/curated-drift.test.ts` holds the two copies against one written-out
 * list of statuses, so narrowing either one fails the same rows. It cannot catch
 * a status ADDED to the app's copy and not to this one; nothing can, short of the
 * import that runner forbids. What it does guarantee is the consequence that
 * matters — a status this reads as unreachable is never reported as a delisting.
 */
function serviceDidNotAnswer(status) {
  return status === 429 || status >= 500;
}

/**
 * What one OFF response says about a pinned record.
 *
 * The kinds are the finding kinds, deliberately: two of the three go straight
 * out as the finding they name, and a second word for one concept would only
 * invite the two vocabularies to part company.
 *
 * @typedef {{ kind: "product", product: Record<string, unknown> }
 *   | { kind: "delisted" | "unreachable", reason: string }} RecordRead
 */

/**
 * Which of those three one OFF response is: the product, the reason the record
 * is no longer listed, or the reason this run learned nothing about it.
 *
 * The `delisted` rules mirror `lookupBarcode` in
 * `src/lib/food/open-food-facts.ts` on the three shapes that mean gone — HTTP
 * 404, v3's string `"failure"`, v2's integer `0` — because a check that
 * disagreed with the app would report a product the app still finds, or miss one
 * it has already stopped finding.
 *
 * The third answer exists because the second used to swallow it (#205). Every
 * non-200 folded into gone, so a 502 in the quarterly run named a curated
 * stand-in delisted and sent a human back through ADR-0046 §2's four admissions
 * against a record nothing had happened to. A status is only evidence about the
 * food when OFF answered about the food.
 *
 * The app splits the statuses this returns `unreachable` for into two, keeping a
 * `400` or a `403` as a fault with no name (#204), and that divergence is
 * deliberate. There the branches end in two different things to offer a user —
 * a capture form, or a retry — so a fault that earns neither needs its own way
 * out. Here they end in two different things to ask a reviewer, and an
 * unexplained refusal asks the same one an outage does: do not re-vet, the
 * record was never read. It still says which it was, because a 403 run after run
 * is OFF turning this caller away and a 502 run after run is not.
 *
 * @returns {RecordRead}
 */
export function productFromResponse(status, body) {
  if (serviceDidNotAnswer(status))
    return {
      kind: "unreachable",
      reason: `OFF did not answer (HTTP ${status})`,
    };
  if (status === 404) return { kind: "delisted", reason: "OFF returned 404" };
  if (status !== 200)
    return {
      kind: "unreachable",
      reason: `OFF refused the request (HTTP ${status})`,
    };
  if (!body || body.status === "failure" || body.status === 0)
    return { kind: "delisted", reason: "OFF reports no such product" };
  if (!body.product)
    return { kind: "delisted", reason: "OFF returned no product body" };
  return { kind: "product", product: body.product };
}

/** True when a value has moved further than {@link DRIFT_EPSILON} allows. */
function hasDrifted(pinned, current) {
  const tolerance = Math.max(
    DRIFT_EPSILON.absolute,
    Math.abs(pinned) * DRIFT_EPSILON.relative
  );
  return Math.abs(current - pinned) > tolerance;
}

/**
 * What has become of one pinned number: nothing, or the single finding that
 * says how it moved, stopped being reported, or stopped being a number at all.
 *
 * The pinned side is trusted — it is this repo's own hand-vetted table — while
 * the current side is guarded, because OFF is a third-party JSON boundary that
 * has served strings where numbers belong. A value that stopped being a number
 * is as much a reason to re-vet as one that moved.
 */
function valueFindings(name, pinnedValue, currentValue) {
  if (pinnedValue === undefined) return [];
  if (currentValue === undefined || currentValue === null)
    return [
      {
        kind: "panel",
        message: `${name}: ${pinnedValue} pinned, no longer reported by OFF`,
      },
    ];
  const now = Number(currentValue);
  if (!Number.isFinite(now))
    return [
      {
        kind: "panel",
        message: `${name}: ${pinnedValue} pinned, OFF now reports ${JSON.stringify(currentValue)}`,
      },
    ];
  if (!hasDrifted(pinnedValue, now)) return [];
  return [
    {
      kind: "panel",
      message: `${name}: ${pinnedValue} pinned, ${now} on OFF today`,
    },
  ];
}

/**
 * One thing that has moved, and what kind of thing it is. The four kinds are
 * the whole vocabulary: a panel value, the ingredients text, a product OFF no
 * longer lists, and a request that never reached OFF at all.
 *
 * @typedef {{ kind: "panel" | "ingredients" | "delisted" | "unreachable", message: string }} Finding
 */

/**
 * Everything that has moved between the pinned snapshot's product and the one
 * OFF serves today, as `{ kind, message }` findings.
 *
 * The comparison runs over the nutriments the SNAPSHOT carries, not the union
 * with OFF's. The snapshot is a trimmed capture (ADR-0046 §4), so a nutriment
 * OFF reports and it does not is the ordinary case rather than staleness; one
 * newly reported upstream is an enrichment to pick up at the next re-vet, and
 * flagging it every quarter would bury the findings that mean something.
 */
export function driftFindings(snapshotProduct, currentProduct) {
  /** @type {Finding[]} */
  const findings = [];
  const pinned = snapshotProduct.nutriments ?? {};
  const current = currentProduct.nutriments ?? {};

  for (const [name, pinnedValue] of Object.entries(pinned))
    findings.push(...valueFindings(name, pinnedValue, current[name]));

  // The serving fields are part of the panel too, and the mapper turns them into
  // a `food/portions` entry (ADR-0030 §2/§5): an OFF edit to `serving_quantity`
  // changes how many grams a logged serving weighs, which is as much "what the
  // user eats off" as a macro is. `serving_size` is the human label beside it,
  // compared as text because that is what it is.
  findings.push(
    ...valueFindings(
      "serving_quantity",
      snapshotProduct.serving_quantity,
      currentProduct.serving_quantity
    )
  );
  const pinnedLabel = snapshotProduct.serving_size;
  if (pinnedLabel !== undefined && currentProduct.serving_size !== pinnedLabel)
    findings.push({
      kind: "panel",
      message: `serving_size: "${pinnedLabel}" pinned, ${JSON.stringify(currentProduct.serving_size) ?? "nothing"} on OFF today`,
    });

  const ingredients = currentProduct.ingredients_text;
  const count = countIngredients(ingredients);
  if (count === 0)
    findings.push({
      kind: "ingredients",
      message:
        "the record no longer carries an ingredients text, so it cannot evidence ADR-0046 §2's single-ingredient admission",
    });
  else if (count > 1)
    findings.push({
      kind: "ingredients",
      message: `the record is no longer single-ingredient: "${ingredients}" (${count} ingredients)`,
    });

  return findings;
}

/**
 * Re-fetches every pinned entry and reports what has moved, one result per
 * entry, in order.
 *
 * `fetchProduct` and `pause` are parameters rather than imports so the rules can
 * be exercised without a network, and so the rate limit is a decision of this
 * function rather than a property of whatever fetcher is passed in. The pause
 * falls BETWEEN requests: OFF asks callers to rate-limit, and a list this short
 * spends a few seconds a quarter honouring it.
 */
export async function checkStandIns(entries, { fetchProduct, pause = sleep }) {
  const results = [];
  for (const entry of entries) {
    if (results.length > 0) await pause(REQUEST_INTERVAL_MS);
    const code = entry.snapshot.code;
    const result = {
      food: entry.food,
      code,
      captured: entry.captured,
      /** @type {Finding[]} */
      findings: [],
    };
    results.push(result);

    let response;
    try {
      response = await fetchProduct(code);
    } catch (error) {
      result.findings.push({
        kind: "unreachable",
        message: `could not reach OFF: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const read = productFromResponse(response.status, response.body);
    if (read.kind === "unreachable") {
      // Not a `delisted` finding, and the difference is the whole of #205: a
      // request OFF never answered says nothing about the record behind it. The
      // line's own label and the report's closing advice say so; the message
      // only has to name the status, which is all that was learned.
      result.findings.push({ kind: "unreachable", message: read.reason });
      continue;
    }
    if (read.kind === "delisted") {
      result.findings.push({
        kind: "delisted",
        message: `${read.reason} — the stand-in still answers searches from its snapshot`,
      });
      continue;
    }
    result.findings.push(
      ...driftFindings(entry.snapshot.product, read.product)
    );
  }
  return results;
}

/** Waits, the only impure thing this module does by default. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a finding asks a human to re-vet the entry against ADR-0046 §2, as
 * opposed to asking for the run to be repeated.
 *
 * The one line every reader of this report has to draw (#205), and drawn once
 * here because two callers draw it: the closing advice below, and the exit
 * summary in `curated-snapshot-check.mjs`. `unreachable` is the whole of the
 * far side — OFF said nothing about the record, so nothing about the record is
 * in question.
 *
 * @param {Finding} finding
 */
export function needsReVetting(finding) {
  return finding.kind !== "unreachable";
}

/** What each kind of finding means to whoever reads the report. */
const KIND_LABEL = {
  delisted: "GONE",
  panel: "PANEL",
  ingredients: "ADMISSION",
  unreachable: "UNCHECKED",
};

/**
 * The run as text, in the shape `usda-backup.mjs` prints: one line per entry,
 * `ok` for a clean one, and the findings indented under a failing one.
 *
 * It closes by saying what the job did NOT do, because the report is the only
 * place a reader learns that nothing was rewritten for them — and it closes with
 * one paragraph per kind of answer the run actually produced, because a reader
 * has two different jobs and needs to know which lines carry which (#205). A
 * finding about a record OFF served asks for a re-vet; a line saying OFF was
 * never heard from asks for another run, and asking for a re-vet on the strength
 * of one would spend the review attention ADR-0046 §4 is banking on.
 */
export function formatReport(results) {
  const lines = [];
  for (const result of results) {
    const where = `${result.food} (${result.code}, captured ${result.captured})`;
    if (result.findings.length === 0) {
      lines.push(`  ok  ${where}`);
      continue;
    }
    lines.push(`FAIL  ${where}`);
    for (const finding of result.findings)
      lines.push(`      ${KIND_LABEL[finding.kind]}  ${finding.message}`);
  }

  const findings = results.flatMap((result) => result.findings);
  if (findings.some(needsReVetting))
    lines.push(
      "",
      "Nothing above has been rewritten. A moved panel is a prompt to re-vet the",
      "entry against ADR-0046 §2 — the absence, the single ingredient, the",
      "cross-product consensus, the independent check — and to update the snapshot",
      "and its `captured` date by hand once it still holds, or to drop the entry."
    );
  if (findings.some((finding) => !needsReVetting(finding)))
    lines.push(
      "",
      "An UNCHECKED line is not a finding about the food. Open Food Facts served",
      "no record for that entry — it was busy, down, or turned the request away —",
      "so the run established nothing either way, and that snapshot has been",
      "neither confirmed nor contradicted. Start the check again; if the same",
      "status comes back run after run, it is the check that needs looking at,",
      "not the stand-in."
    );
  return lines.join("\n");
}
