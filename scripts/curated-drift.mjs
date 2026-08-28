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
 * A fourth, `unreachable`, covers a request that never landed. It is not drift,
 * but a run that could not reach OFF has not established anything, and reporting
 * "nothing moved" would be worse than reporting nothing at all.
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
 * The product body of an OFF response, or the fact that there is not one.
 *
 * The gone-ness rules mirror `lookupBarcode` in `src/lib/food/open-food-facts.ts`
 * exactly — HTTP 404, v3's string `"failure"`, v2's integer `0` — because a check
 * that disagreed with the app would report a product the app still finds, or
 * miss one it has already stopped finding.
 */
export function productFromResponse(status, body) {
  if (status === 404) return { found: false, reason: "OFF returned 404" };
  if (status !== 200)
    return { found: false, reason: `OFF returned HTTP ${status}` };
  if (!body || body.status === "failure" || body.status === 0)
    return { found: false, reason: "OFF reports no such product" };
  if (!body.product)
    return { found: false, reason: "OFF returned no product body" };
  return { found: true, product: body.product };
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
    if (!read.found) {
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
 * place a reader learns that nothing was rewritten for them.
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
  if (results.some((result) => result.findings.length > 0))
    lines.push(
      "",
      "Nothing above has been rewritten. A moved panel is a prompt to re-vet the",
      "entry against ADR-0046 §2 — the absence, the single ingredient, the",
      "cross-product consensus, the independent check — and to update the snapshot",
      "and its `captured` date by hand once it still holds, or to drop the entry."
    );
  return lines.join("\n");
}
