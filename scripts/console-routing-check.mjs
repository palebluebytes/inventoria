/**
 * Does every `console.*` in the app go through the log facility?
 *
 * ADR-0092 §5.3's whole shape is **one call site that records and prints**:
 * `appError` / `appWarn` / `appDebug` call the matching `console.*` method and
 * write a record, so "which of these survive as records and which stay
 * devtools-only" stops being a question. That property lasts exactly as long as
 * nobody types `console.error` out of habit — and a bare `console.error` looks
 * right, works, and is invisible in review.
 *
 * There is no ESLint in this repo to hang a `no-console` rule on: no config, no
 * `lint` script, no dependency. So this is the gate, in the same shape as the
 * four it joins in `pnpm check` — a text scan with an allowlist, where every
 * entry carries the reason it is there rather than the fact that somebody
 * wanted the build to pass.
 *
 * **Text rather than a closure**, and here that is the right instrument rather
 * than a fallback. `.svelte` files hold seven of the sites this ticket moved
 * and no TypeScript project can see them; and what is being checked is the
 * *spelling at the call site*, which is a fact about source, not about types.
 *
 * The allowlist is per file, not per line. A line number is a thing that goes
 * stale on the next edit above it, and `db.client.ts`'s exemption is one line in
 * a file whose other five are routed — so the reason is written here and the
 * count is pinned, which fails when a sixth appears rather than when the file
 * moves.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..");

/** Where the app's shipped source lives. Tests are somebody else's rules. */
const SOURCE_DIR = "src";

/**
 * Which files may name the console, how many times, and why.
 *
 * `calls` is exact rather than a ceiling. A ceiling lets a file drift up to it
 * silently, and the whole point of this gate is that an unrouted call is
 * invisible unless something counts.
 */
const ALLOWED = [
  {
    file: "src/lib/logs/app-log.ts",
    calls: 4,
    why: "it IS the routing: one console method per level, ADR-0092 §5.3",
  },
  {
    file: "src/lib/db/db.worker.ts",
    calls: 10,
    why: [
      "a Worker has no localStorage, so these cannot reach the facility at all.",
      "Eight calls plus the two print:/printErr: bindings handed to sqlite. The",
      "one fact worth keeping crosses on the init reply as a StorageMode and is",
      "recorded from db.client.ts (ADR-0092 §5.3, as amended 2026-09-05).",
    ].join(" "),
  },
  {
    file: "src/lib/db/db.client.ts",
    calls: 1,
    why: [
      "the per-message trace inside onmessage fires once per database query",
      "rather than once per boot. Recorded, it would turn the 100-record ring",
      "over roughly every fifty queries so it never holds a boot, and would put",
      "a localStorage write on the DB message path. The file's other five lines",
      "are routed.",
    ].join(" "),
  },
  {
    file: "src/lib/food/plate-estimator.ts",
    calls: 1,
    why: "a [DEFERRED STUB] marker for an unbuilt feature, not an event: recording it would write a record every time somebody opens the camera",
  },
  {
    file: "src/lib/food/ai-autofill.ts",
    calls: 1,
    why: "a [DEFERRED STUB] marker for an unbuilt feature, not an event",
  },
];

const CONSOLE_SCAN = /\bconsole\s*\.\s*[A-Za-z]/g;

/**
 * Comments stripped before the scan, for `log-egress-check.mjs`'s reason: this
 * decision is argued in prose in half a dozen files, `app-log.ts`'s own header
 * names `console.*` four times, and a gate that fails on its own documentation
 * is a gate somebody switches off.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/** How many times a module's source names the console. */
export function countConsoleCalls(source) {
  return [...stripComments(source).matchAll(CONSOLE_SCAN)].length;
}

function sourceFiles() {
  return readdirSync(resolve(repoRoot, SOURCE_DIR), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(repoRoot, join(entry.parentPath, entry.name)).replaceAll(
        sep,
        "/"
      )
    )
    .filter((file) => /\.(ts|svelte)$/.test(file))
    .sort();
}

function fail(lines) {
  for (const line of lines) console.error(line);
  console.error("");
  process.exit(1);
}

function main() {
  const allowed = new Map(ALLOWED.map((entry) => [entry.file, entry]));
  const counted = new Map();

  for (const file of sourceFiles()) {
    const calls = countConsoleCalls(
      readFileSync(resolve(repoRoot, file), "utf8")
    );
    if (calls > 0) counted.set(file, calls);
  }

  const strays = [...counted].filter(([file]) => !allowed.has(file));
  if (strays.length > 0)
    fail([
      `\n  ERR a module calls the console without going through the facility:\n`,
      ...strays.map(([file, calls]) => `      ${file}: ${calls} call(s)`),
      ``,
      `      Use appError / appWarn / appInfo / appDebug from src/lib/logs/app-log.ts.`,
      `      They call the matching console method AND write a record, which is`,
      `      the whole of ADR-0092 §5.3: one call site, both outputs.`,
      ``,
      `      If this site genuinely cannot be routed — a Worker, an unbuilt`,
      `      feature's marker — add it to ALLOWED in this file with the reason.`,
    ]);

  const drifted = ALLOWED.filter(
    (entry) => (counted.get(entry.file) ?? 0) !== entry.calls
  );
  if (drifted.length > 0)
    fail([
      `\n  ERR an allowlisted file no longer holds the calls it was allowed:\n`,
      ...drifted.map(
        (entry) =>
          `      ${entry.file}: ${entry.calls} allowed, ${counted.get(entry.file) ?? 0} found`
      ),
      ``,
      `      The count is exact on purpose. A ceiling lets an exempted file`,
      `      drift up to it silently, which is the failure this gate exists to`,
      `      catch. If the change is right, move the number and say why in the`,
      `      entry's \`why\`.`,
    ]);

  console.log(
    `  ok  ${counted.size} file(s) name the console, all allowlisted with a reason`
  );
  for (const entry of ALLOWED)
    console.log(`      ${entry.file} (${entry.calls}) — ${entry.why}`);
}

// Only when run, never on import: the matcher is unit-tested, and a gate that
// walks the tree on import is a gate a test file cannot load.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
