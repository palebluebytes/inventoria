#!/usr/bin/env node
/**
 * What the deployed script *says* about itself. Run with
 * `pnpm check:worker-config`; also chained into `pnpm check`.
 *
 * `scripts/worker-closure-check.mjs` pins what the Worker compiles in and holds
 * the relay to silence. This holds the other half: the two files that configure
 * the deployment rather than implement it, `wrangler.toml` and
 * `worker/r2-lifecycle.json`. Both carry claims that ADR-0072 and ADR-0096 make
 * in the user's name, and neither is reachable from a test of the code.
 *
 * **Why a gate and not a comment.** ADR-0096 §1 says the store's bar is
 * explicitly *not* met by construction — five clauses, five different
 * mechanisms — so the record names what holds each one up and this file is
 * where two of them are actually held. And both switches below are the kind
 * that get flipped during a debugging session and left: `wrangler.toml` already
 * carried the whole argument for `invocation_logs = false` as prose, which is a
 * posture enforced by review, which is a posture that lasts until the first
 * incident.
 *
 * **The traces switch is the store's, and it is the one with teeth.**
 * `docs/research/266-r2-key-name-logging.md` measured every pipeline that can
 * write down an R2 object key. Workers Traces is the one that is opt-in and off:
 * its R2 binding spans carry `cloudflare.r2.request.key`, so turning traces on
 * records the deposit address of every lane that wakes. (`workers_trace_events`
 * — the invocation log below — has no binding field at all, which is why
 * ADR-0072 §9 cannot be cited for R2 and this file gates both separately.)
 *
 * What no gate here can reach: three of ADR-0096 §1's five clauses live on the
 * bucket, not in this repo — versioning off, no event notifications, not
 * public. `docs/how-to-operate-the-store.md` carries those as commands with a
 * verification each.
 *
 * It reads `wrangler.toml` by name. Moving the config to `wrangler.jsonc` makes
 * that read throw, which fails the build loudly rather than passing it quietly,
 * and is the direction to be wrong in.
 *
 * FAIL sets a non-zero exit.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** ADR-0096 §1's backstop, in the seconds an R2 lifecycle condition wants. */
export const BACKSTOP_SECONDS = 30 * 86400;

/**
 * One claim the configuration does not keep.
 *
 * @typedef {{ path: string, expected: string, found: string, why: string }} Failure
 */

/**
 * The scalars in a wrangler TOML config, as a nested object.
 *
 * Scalars only, and deliberately: this gate asks about four keys, all of them a
 * string or a boolean, and a full TOML parser would be a dependency and a lot of
 * machinery guarding one small file. Arrays and inline tables are skipped
 * rather than half-read, which is safe because **a key this gate wants and
 * cannot read is a failure, not a pass** — moving one into an inline table
 * makes it absent, and absence fails below.
 *
 * Not exported: the tests come in through the audits, so what is asserted is
 * the gate's verdict rather than the shape of a table nobody else reads.
 */
function readScalars(source) {
  const root = {};
  let table = root;
  let open = 0;

  for (const raw of source.split("\n")) {
    const line = stripComment(raw).trim();
    if (open > 0) {
      open += depth(line);
      continue;
    }
    if (!line) continue;

    const array = line.match(/^\[\[([\w.-]+)\]\]$/);
    if (array) {
      const holder = descend(root, array[1].split("."), true);
      table = {};
      holder.push(table);
      continue;
    }

    const header = line.match(/^\[([\w.-]+)\]$/);
    if (header) {
      table = descend(root, header[1].split("."), false);
      continue;
    }

    const pair = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!pair) continue;
    open += depth(pair[2]);
    const value = scalar(pair[2].trim());
    if (value !== undefined) table[pair[1]] = value;
  }

  return root;
}

/** Everything before the first `#` that is not inside a quoted string. */
function stripComment(line) {
  let quoted = false;
  for (let at = 0; at < line.length; at++) {
    if (line[at] === '"') quoted = !quoted;
    else if (line[at] === "#" && !quoted) return line.slice(0, at);
  }
  return line;
}

/** How far a fragment opens or closes a bracketed value. */
function depth(fragment) {
  let net = 0;
  for (const character of fragment) {
    if (character === "[" || character === "{") net++;
    if (character === "]" || character === "}") net--;
  }
  return net;
}

/** The table a header names, created along the way. */
function descend(root, path, asArray) {
  let at = root;
  for (const [index, segment] of path.entries()) {
    const last = index === path.length - 1;
    if (last && asArray) {
      at[segment] ??= [];
      return at[segment];
    }
    at[segment] ??= {};
    at = Array.isArray(at[segment]) ? at[segment].at(-1) : at[segment];
  }
  return at;
}

/** A TOML string, boolean or integer; `undefined` for anything else. */
function scalar(text) {
  const string = text.match(/^"([^"]*)"$/);
  if (string) return string[1];
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  return undefined;
}

/**
 * The claims `wrangler.toml` has to keep making, each with the record that
 * makes it and each failing when the key is gone as well as when it is wrong.
 *
 * The first two are re-checked under every `[env.<name>]` block, because
 * wrangler lets a named environment override the top level and a switch flipped
 * "just in staging" is exactly the flip this gate exists to catch.
 */
const CLAIMS = [
  {
    path: "observability.traces.enabled",
    expected: false,
    why:
      "ADR-0096 §15: a Workers trace's R2 binding span carries " +
      "`cloudflare.r2.request.key`, so tracing writes down the deposit address " +
      "of every lane that wakes (docs/research/266-r2-key-name-logging.md §2).",
  },
  {
    path: "observability.logs.invocation_logs",
    expected: false,
    why:
      "ADR-0072 §9: an invocation log is an automatic per-request record, and " +
      "for the relay each one says that two devices met, when, and from where.",
  },
  {
    path: "r2_buckets.0.binding",
    expected: "STORE",
    why: "`worker/src/index.ts` reaches for `env.STORE` and nothing else.",
  },
  {
    path: "r2_buckets.0.jurisdiction",
    expected: "eu",
    why:
      "ADR-0096 §15 states residency in the record rather than leaving it to " +
      "implementation, because it is a claim the bar sentence makes.",
  },
];

/** Follow a dotted path through the parsed config; `undefined` if absent. */
function at(config, path) {
  return path
    .split(".")
    .reduce((held, segment) => (held ?? {})[segment], config);
}

/**
 * Every posture claim a wrangler config fails, with what was found instead.
 *
 * @param {string} source the TOML text
 * @returns {Failure[]}
 */
export function auditWranglerToml(source) {
  const config = readScalars(source);
  const failures = [];

  const buckets = config.r2_buckets;
  if (!Array.isArray(buckets) || buckets.length !== 1) {
    failures.push({
      path: "r2_buckets",
      expected: "exactly one bucket binding, the store's",
      found: Array.isArray(buckets) ? `${buckets.length}` : "absent",
      why:
        "ADR-0096 §16: the store is reached only through our own route, so " +
        "this script binds one bucket and the whole provider surface is " +
        "`worker/src/store.ts`. A second binding is a second store nothing in " +
        "the records speaks for. (The account holds other buckets — " +
        "`inventoria-usda-backup` — and they are not bound to this script.)",
    });
    // Every remaining bucket claim would fail for this same reason, and saying
    // so three more times buries the one thing to fix.
    return failures.concat(
      audit(config, CLAIMS.slice(0, 2)),
      auditEnvironments(config)
    );
  }

  return failures.concat(audit(config, CLAIMS), auditEnvironments(config));
}

/**
 * The same observability claims again, in every named environment that has an
 * `observability` block of its own — and in no other.
 *
 * The two halves of that both come from wrangler's own `inheritable()`, which
 * resolves the key as `rawEnv.observability ?? topLevelEnv.observability`.
 * **Inherited, so an environment that says nothing is already covered** by the
 * top-level claims, and failing it would be a gate crying wolf. **Replaced
 * wholesale rather than merged, so an environment that says anything says
 * everything**: `[env.staging.observability.traces]` alone drops the top-level
 * `invocation_logs = false` back to wrangler's default, which is on.
 *
 * There are no named environments today. This is what keeps that a fact rather
 * than an observation: a switch flipped "just in staging" is exactly the flip
 * this gate exists to catch.
 */
function auditEnvironments(config) {
  const named = config.env;
  if (!named || typeof named !== "object") return [];

  return Object.keys(named)
    .filter((environment) => named[environment]?.observability !== undefined)
    .flatMap((environment) =>
      audit(
        config,
        CLAIMS.filter((claim) => claim.path.startsWith("observability.")).map(
          (claim) => ({ ...claim, path: `env.${environment}.${claim.path}` })
        )
      )
    );
}

function audit(config, claims) {
  const failures = [];
  for (const claim of claims) {
    const found = at(config, claim.path);
    if (found !== claim.expected) {
      failures.push({
        path: claim.path,
        expected: JSON.stringify(claim.expected),
        found: found === undefined ? "absent" : JSON.stringify(found),
        why: claim.why,
      });
    }
  }
  return failures;
}

/**
 * ADR-0096 §1's third clause: _none older than 30 days_, held up by "the
 * bucket's lifecycle rule, which runs whether or not anyone is alive".
 *
 * The file is what gets applied (`wrangler r2 bucket lifecycle set --file`), so
 * it is what can be checked here. That the account actually carries it is
 * `docs/how-to-operate-the-store.md`'s verification step and is not a thing a
 * build can know.
 *
 * The rule has to reach **every prefix**, because the clause bounds everything
 * in the bucket including a blob a stranger wrote at an invented key — a rule
 * narrowed to a prefix carries the clause for our own addresses only, which is
 * exactly the seam §1 rewrote its bar sentence to avoid.
 *
 * @param {unknown} file the parsed contents of `worker/r2-lifecycle.json`
 * @returns {Failure[]}
 */
export function auditLifecycleRules(file) {
  const rules = Array.isArray(file?.rules) ? file.rules : [];
  const backstop = rules.find(
    (rule) =>
      rule.enabled === true &&
      !rule.conditions?.prefix &&
      rule.deleteObjectsTransition?.condition?.type === "Age" &&
      rule.deleteObjectsTransition?.condition?.maxAge === BACKSTOP_SECONDS
  );

  if (backstop) return [];
  return [
    {
      path: "rules",
      expected: `an enabled expiry at ${BACKSTOP_SECONDS}s over every prefix`,
      found: rules.length === 0 ? "no rules" : `${rules.length} rule(s)`,
      why:
        "ADR-0096 §1: none older than 30 days, held up by a lifecycle rule " +
        "that runs whether or not anyone is alive.",
    },
  ];
}

function report(label, failures) {
  if (failures.length === 0) {
    console.log(`  ok  ${label}`);
    return 0;
  }
  console.error(`\n  ERR ${label}:\n`);
  for (const failure of failures) {
    console.error(
      `      ${failure.path}: expected ${failure.expected}, found ${failure.found}`
    );
    console.error(`      ${failure.why}\n`);
  }
  return failures.length;
}

function main() {
  const lifecycle = JSON.parse(
    readFileSync("worker/r2-lifecycle.json", "utf8")
  );

  const failures =
    report(
      "the deployed script keeps no trace and no invocation log, and binds one bucket, in the EU",
      auditWranglerToml(readFileSync("wrangler.toml", "utf8"))
    ) +
    report(
      "the store's lifecycle file expires every object after 30 days",
      auditLifecycleRules(lifecycle)
    );

  if (failures > 0) {
    console.error(`${failures} failure(s).`);
    process.exit(1);
  }
}

// Only when run, never on import: the audits are unit-tested, and reading the
// repo's own files is not something a test suite should be made to do twice.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
