import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditWranglerToml,
  auditLifecycleRules,
  BACKSTOP_SECONDS,
} from "../../scripts/worker-config-check.mjs";

/**
 * The gate over `wrangler.toml` and `worker/r2-lifecycle.json` (#393).
 *
 * Everything is asserted through the two audits rather than against the TOML
 * reader underneath them, because the verdict is what the build acts on: a
 * reader that returns the wrong shape and a rule that reads the right shape
 * wrongly are the same failure from outside, and only one of them is worth
 * naming.
 *
 * A gate that silently matches nothing reads exactly like a gate that found
 * nothing wrong, so every claim below is paired with an input that must fail.
 */

/** The posture the records ask for, written out so a fixture can break one. */
const POSTURE = [
  "[observability.logs]",
  "invocation_logs = false",
  "",
  "[observability.traces]",
  "enabled = false",
  "",
  "[[r2_buckets]]",
  'binding = "STORE"',
  'bucket_name = "inventoria-store"',
  'jurisdiction = "eu"',
].join("\n");

const pathsOf = (failures: { path: string }[]) => failures.map((f) => f.path);

const without = (line: string, replacement = "") =>
  POSTURE.replace(line, replacement);

describe("what the gate insists the deployed script says", () => {
  it("passes the posture the records claim", () => {
    expect(auditWranglerToml(POSTURE)).toEqual([]);
  });

  // ADR-0096 §15: a Workers trace's R2 binding span carries the object key, so
  // tracing writes down the deposit address of every lane that wakes.
  it("fails when traces are switched on", () => {
    const traced = POSTURE.replace(
      "[observability.traces]\nenabled = false",
      "[observability.traces]\nenabled = true"
    );
    expect(pathsOf(auditWranglerToml(traced))).toEqual([
      "observability.traces.enabled",
    ]);
  });

  // Absence is a failure rather than a pass: a switch that was deleted, or that
  // moved into a shape this reader skips, reads as "nothing wrong" to a gate
  // that only compares what it finds.
  it("fails when the traces switch is missing altogether", () => {
    const gone = without("[observability.traces]\nenabled = false\n");
    const failures = auditWranglerToml(gone);
    expect(pathsOf(failures)).toEqual(["observability.traces.enabled"]);
    expect(failures[0].found).toBe("absent");
  });

  it("fails when the script keeps an invocation log", () => {
    const logged = POSTURE.replace(
      "invocation_logs = false",
      "invocation_logs = true"
    );
    expect(pathsOf(auditWranglerToml(logged))).toEqual([
      "observability.logs.invocation_logs",
    ]);
  });

  it("fails when the store's bucket leaves the EU", () => {
    const moved = POSTURE.replace('jurisdiction = "eu"', "");
    expect(pathsOf(auditWranglerToml(moved))).toEqual([
      "r2_buckets.0.jurisdiction",
    ]);
  });

  it("fails when the binding is not the one the route reaches for", () => {
    const renamed = POSTURE.replace(
      'binding = "STORE"',
      'binding = "DEPOSITS"'
    );
    expect(pathsOf(auditWranglerToml(renamed))).toEqual([
      "r2_buckets.0.binding",
    ]);
  });

  // ADR-0096 §16: one bucket, reached only through our own route.
  it("fails when a second bucket appears beside the store", () => {
    const two = `${POSTURE}\n\n[[r2_buckets]]\nbinding = "SPARE"\n`;
    expect(pathsOf(auditWranglerToml(two))).toEqual(["r2_buckets"]);
  });

  it("still checks the observability posture when the bucket is gone", () => {
    const bucketless = POSTURE.slice(0, POSTURE.indexOf("[[r2_buckets]]"));
    expect(pathsOf(auditWranglerToml(bucketless))).toEqual(["r2_buckets"]);

    const traced = bucketless.replace(
      "[observability.traces]\nenabled = false",
      "[observability.traces]\nenabled = true"
    );
    expect(pathsOf(auditWranglerToml(traced))).toEqual([
      "r2_buckets",
      "observability.traces.enabled",
    ]);
  });
});

describe("reading the file the switches actually live in", () => {
  it("keeps two tables of the same shape apart", () => {
    const swapped = [
      "[observability.logs]",
      "enabled = false",
      "[observability.traces]",
      "enabled = false",
      "invocation_logs = false",
      "[[r2_buckets]]",
      'binding = "STORE"',
      'jurisdiction = "eu"',
    ].join("\n");
    // `invocation_logs` sits under traces here, so the log switch is absent.
    expect(pathsOf(auditWranglerToml(swapped))).toEqual([
      "observability.logs.invocation_logs",
    ]);
  });

  it("does not read an assignment inside a comment", () => {
    const commented = `# enabled = true, until 2026-09\n${POSTURE}`;
    expect(auditWranglerToml(commented)).toEqual([]);
  });

  // A continuation line inside a multi-line value looks exactly like an
  // assignment, and attributing one to the surrounding table would let a
  // switched-on trace read as a switched-off one, or the reverse.
  it("skips the inside of a value that spans lines", () => {
    const spanning = POSTURE.replace(
      "[observability.traces]\nenabled = false",
      [
        "[observability.traces]",
        "sinks = [",
        "  { enabled = true },",
        "]",
      ].join("\n")
    );
    expect(pathsOf(auditWranglerToml(spanning))).toEqual([
      "observability.traces.enabled",
    ]);
  });

  it("does not treat a hash inside a string as a comment", () => {
    const hashed = POSTURE.replace(
      'bucket_name = "inventoria-store"',
      'bucket_name = "inventoria#store"'
    );
    expect(auditWranglerToml(hashed)).toEqual([]);
  });
});

describe("what the gate insists the lifecycle file says", () => {
  const backstop = () => ({
    rules: [
      {
        id: "backstop-expiry-30-days",
        enabled: true,
        conditions: {} as { prefix?: string },
        deleteObjectsTransition: {
          condition: { maxAge: BACKSTOP_SECONDS as number, type: "Age" },
        },
      },
    ],
  });

  it("passes a 30-day expiry over every prefix", () => {
    expect(auditLifecycleRules(backstop())).toEqual([]);
  });

  it("fails a rule that is switched off", () => {
    const off = backstop();
    off.rules[0].enabled = false;
    expect(auditLifecycleRules(off)).toHaveLength(1);
  });

  it("fails a longer horizon than the bar sentence promises", () => {
    const long = backstop();
    long.rules[0].deleteObjectsTransition.condition.maxAge = 90 * 86400;
    expect(auditLifecycleRules(long)).toHaveLength(1);
  });

  // "None older than 30 days" bounds everything in the bucket, including a blob
  // a stranger wrote at an invented key, so a rule that reaches only our own
  // addresses does not carry the clause.
  it("fails a rule narrowed to a prefix", () => {
    const narrowed = backstop();
    narrowed.rules[0].conditions.prefix = "lane/";
    expect(auditLifecycleRules(narrowed)).toHaveLength(1);
  });

  it("fails a file with no expiry in it", () => {
    expect(auditLifecycleRules({ rules: [] })).toHaveLength(1);
    expect(auditLifecycleRules({})).toHaveLength(1);
  });
});

describe("the repo's own files", () => {
  it("state the posture and the horizon", () => {
    expect(auditWranglerToml(readFileSync("wrangler.toml", "utf8"))).toEqual(
      []
    );
    expect(
      auditLifecycleRules(
        JSON.parse(readFileSync("worker/r2-lifecycle.json", "utf8"))
      )
    ).toEqual([]);
  });
});

describe("a named environment cannot override the posture", () => {
  // wrangler resolves `observability` as `rawEnv ?? topLevel`, so declaring any
  // part of it in an environment replaces the whole top-level block — the log
  // switch this environment never mentions falls back to wrangler's own
  // default, which is on.
  it("fails an environment that switches traces on, and the log switch it dropped with them", () => {
    const staged = `${POSTURE}\n\n[env.staging.observability.traces]\nenabled = true\n`;
    expect(pathsOf(auditWranglerToml(staged))).toEqual([
      "env.staging.observability.traces.enabled",
      "env.staging.observability.logs.invocation_logs",
    ]);
  });

  // The other half of the same rule: an environment that declares no
  // observability of its own inherits the top level, which is already gated.
  // Failing it here would be the gate crying wolf.
  it("passes an environment that says nothing about observability", () => {
    const staged = `${POSTURE}\n\n[env.staging]\nname = "inventoria-staging"\n`;
    expect(auditWranglerToml(staged)).toEqual([]);
  });

  it("passes an environment that restates the posture", () => {
    const staged = [
      POSTURE,
      "",
      "[env.staging.observability.logs]",
      "invocation_logs = false",
      "",
      "[env.staging.observability.traces]",
      "enabled = false",
    ].join("\n");
    expect(auditWranglerToml(staged)).toEqual([]);
  });
});
