/**
 * Can a local log record leave this device by any route but the one the user
 * performed?
 *
 * The property, in the words #213 §5 settled on: **no transport the user did
 * not perform, and the payload that leaves is the payload that was reviewed.**
 * ADR-0053 rests on the distinction between a local record and telemetry, and
 * ADR-0054 §5 says in as many words that the distinction "holds only while it
 * is structurally true". This is where that is made structural.
 *
 * It replaces an assertion that read ONE file — `log-facility.ts` — for five
 * symbols, and could not see the app's actual export in either direction. The
 * egress lived in `LogReviewSheet.svelte`, and `URL.createObjectURL` was not on
 * the list; a string grep can only forbid symbols someone enumerated, which is
 * exactly how it got past. Worse, **the closure ran the wrong way**: the sheet
 * imports the facility, not the reverse, so a walk rooted at `log-facility.ts`
 * walks away from the export however rigorous it is (#213 §2, #223).
 *
 * So there are two roots, and three arms:
 *
 * 1. **The facility is pure.** `tsconfig.logs.json` gives the closure
 *    `src/lib/logs/` genuinely resolves, and no module in it may name a network
 *    or a save API at all. This is the arm that would fail if the facility grew
 *    a transport, or reached one through anything it imports.
 * 2. **The vehicle is one named module, and it exists.**
 *    `tsconfig.logs-views.json` roots at the screen half, so the walk reaches
 *    {@link VEHICLE} and everything a future vehicle might import to help.
 *    Exactly one module in that closure may name an egress API, and it must be
 *    that one. A closure where NOTHING does is a failure too: a gate that
 *    quietly matches nothing reads from the outside like a gate that found
 *    nothing wrong.
 * 3. **No second vehicle in the feature's own directories.** Both closures are
 *    TypeScript, and Svelte components are not in either — `tsc` cannot read
 *    them, and the egress this gate exists because of was inside one. So the
 *    two directories are also read as text, `.svelte` included, and only the
 *    vehicle may name an egress API.
 *
 * The closure comes from `tsc --listFiles`, following
 * `scripts/worker-closure-check.mjs`: what the compiler genuinely resolved,
 * rather than what a regex over import statements guesses. It resolves a
 * dynamic `import()` with a literal specifier too, which is why `import(` is
 * not on the symbol list the way it was on the old one — a module pulled in
 * that way is IN the closure and is read like any other.
 *
 * What this does not claim: that the file the user gets is well-formed, or that
 * the reviewed bytes and the written bytes are one value. The second half of
 * the property is held by the screen instead, which serialises once and renders
 * and hands over the same string — see `LogReviewSheet.svelte`.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..");

/** The one module that may get bytes out of the app on the log's behalf. */
const VEHICLE = "src/lib/views/logs/export-target.ts";

/** The log feature's own directories, read as text so `.svelte` is covered. */
const FEATURE_DIRS = ["src/lib/logs", "src/lib/views/logs"];

/**
 * Every way out of the browser this gate knows, and what to call each in a
 * report.
 *
 * The first five are the old assertion's. The last three are what it was
 * missing: `URL.createObjectURL` is the API this app actually uses to get bytes
 * out, and `showSaveFilePicker` and `navigator.share` are the two a future
 * vehicle would most plausibly reach for. None of the three appears anywhere in
 * `src/` outside the two export targets.
 *
 * The names are matched bare rather than as calls — `fetch`, not `fetch(` — so
 * that stashing one in a variable does not evade the gate. The cost is that a
 * local named `fetch` fails the build, which is the cheap direction to be wrong
 * in.
 */
const EGRESS = [
  { name: "fetch", pattern: /\bfetch\b/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "sendBeacon", pattern: /\bsendBeacon\b/ },
  { name: "WebSocket", pattern: /\bWebSocket\b/ },
  { name: "EventSource", pattern: /\bEventSource\b/ },
  { name: "URL.createObjectURL", pattern: /\bcreateObjectURL\b/ },
  { name: "showSaveFilePicker", pattern: /\bshowSaveFilePicker\b/ },
  { name: "navigator.share", pattern: /\bnavigator\s*\.\s*share\b/ },
];

const EGRESS_SCAN = new RegExp(
  EGRESS.map(({ pattern }) => pattern.source).join("|"),
  "g"
);

/**
 * Source with its comments taken out: `/* *\/`, `//` to end of line, and
 * `<!-- -->` for the Svelte half.
 *
 * The sibling gate reads raw text and argues that tripping on a comment is the
 * cheap direction to be wrong in. That is true of the relay's own four files
 * and false here, because arm 1 reads a closure of modules whose authors are
 * not writing for this gate: `usda-fdc.ts` says "no network re-fetch
 * (ADR-0016)" in prose and `provenance.ts` says it too. A gate that fails on
 * those is a gate someone switches off.
 *
 * It reads text rather than syntax, so a `//` inside a string literal eats the
 * rest of that line. That direction only loses matches inside a URL, and code
 * that reaches the network is not hiding in the tail of one.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/**
 * Every egress API a module's source names, in the order they appear.
 *
 * Exported so the gate itself can be tested: a matcher that never matches would
 * pass every build silently, which is the failure this whole file exists to
 * prevent one layer down. `relay.test.ts` tests the sibling's matcher for the
 * same reason.
 */
export function findEgressCalls(source) {
  return [...stripComments(source).matchAll(EGRESS_SCAN)].map((match) => {
    const hit = match[0];
    return (
      EGRESS.find(({ pattern }) =>
        new RegExp(`^(?:${pattern.source})$`).test(hit)
      )?.name ?? hit
    );
  });
}

/**
 * The repo's own modules in a project's import closure, library declarations
 * and `node_modules` dropped: they are not this app's code and are not what
 * this guards.
 */
function closureOf(project) {
  let out;
  try {
    out = execFileSync(
      "node_modules/.bin/tsc",
      ["--noEmit", "-p", project, "--listFiles"],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
  } catch (error) {
    // A non-zero tsc means those files do not typecheck, so the closure is
    // unknown. That is a real failure and worth reporting as itself rather than
    // as an egress violation. Only the diagnostics are worth showing —
    // `--listFiles` prints the closure on stdout even when the compile fails,
    // and most of it is lib.d.ts.
    const diagnostics = (error.stdout || "")
      .split("\n")
      .filter((line) => /error TS\d+:/.test(line));
    console.error(
      `  ERR ${project} does not typecheck; its closure is unknown\n`
    );
    console.error(
      diagnostics.length > 0
        ? diagnostics.map((line) => `      ${line}`).join("\n")
        : error.message
    );
    console.error("");
    process.exit(1);
  }

  return out
    .split("\n")
    .filter(Boolean)
    .map((f) => relative(repoRoot, f))
    .filter(
      (f) => !f.startsWith("..") && !f.split(sep).includes("node_modules")
    )
    .sort();
}

/** Which of a set of files name an egress API, and which ones they name. */
function egressIn(files) {
  return files
    .map((file) => ({
      file,
      calls: findEgressCalls(readFileSync(resolve(repoRoot, file), "utf8")),
    }))
    .filter(({ calls }) => calls.length > 0);
}

function fail(lines) {
  for (const line of lines) console.error(line);
  console.error("");
  process.exit(1);
}

/**
 * Arm 1: nothing `src/lib/logs/` resolves may name a way out of the browser.
 *
 * An empty closure is a failure for the reason arm 2's absent vehicle is: the
 * directory could have moved and this would still print `ok`.
 */
function checkFacilityIsPure() {
  const closure = closureOf("tsconfig.logs.json");
  const own = closure.filter((f) => f.startsWith("src/lib/logs/"));

  if (own.length === 0)
    fail([
      `\n  ERR no module under src/lib/logs/ is in tsconfig.logs.json's closure\n`,
      `      Either the facility moved, in which case move this pin with it, or`,
      `      it is gone, in which case ADR-0054 §5 needs revisiting.`,
    ]);

  const found = egressIn(closure);
  if (found.length > 0)
    fail([
      `\n  ERR the log facility's import closure reaches a way out of the browser:\n`,
      ...found.map(({ file, calls }) => `      ${file}: ${calls.join(", ")}`),
      ``,
      `      ADR-0053 rests on a local record not being telemetry, and ADR-0054 §5`,
      `      holds that only while it is structurally true. The export vehicle is`,
      `      ${VEHICLE},`,
      `      outside this closure, and it is the only place bytes may leave.`,
    ]);

  console.log(
    `  ok  the log facility's closure is ${closure.length} module(s) and names no egress API`
  );
  for (const f of closure) console.log(`      ${f}`);
}

/**
 * Arm 2: the vehicle is exactly one module, it is the named one, and it is
 * really there.
 *
 * Rooted at the screen half rather than at the facility, which is the whole
 * point: this walk runs TOWARDS the export. A helper the vehicle imports from
 * anywhere in the repo is inside this closure and is held to the same rule,
 * which is what arm 3's directory scan cannot see.
 */
function checkVehicleIsAlone() {
  const closure = closureOf("tsconfig.logs-views.json");

  if (!closure.includes(VEHICLE))
    fail([
      `\n  ERR ${VEHICLE} is not in the screen half's closure\n`,
      `      The one module allowed to get bytes out was renamed, moved or`,
      `      deleted. Move this pin with it, or the gate is watching nothing.`,
    ]);

  const found = egressIn(closure);
  const strays = found.filter(({ file }) => file !== VEHICLE);
  if (strays.length > 0)
    fail([
      `\n  ERR the log export has a second way out besides ${VEHICLE}:\n`,
      ...strays.map(({ file, calls }) => `      ${file}: ${calls.join(", ")}`),
      ``,
      `      The vehicle is one named module so that swapping it is an edit to`,
      `      one file (#213 §6). A second one is a place the app can send that`,
      `      the review does not govern.`,
    ]);

  if (!found.some(({ file }) => file === VEHICLE))
    fail([
      `\n  ERR ${VEHICLE} names no egress API at all\n`,
      `      It is the module that exists to perform one. Either the export`,
      `      moved somewhere this gate is not looking, or this pin is stale.`,
    ]);

  console.log(
    `  ok  the log export's vehicle is ${VEHICLE} alone, across ${closure.length} module(s)`
  );
}

/**
 * Arm 3: nothing else in the log feature's own directories names an egress API.
 *
 * Text, not a closure, and that is not a fallback: `.svelte` files are where
 * this gate's original failure lived, and no TypeScript project can see them.
 * A component that grew its own `Blob` and anchor back would typecheck, ship,
 * and be invisible to both arms above.
 */
function checkNoSecondVehicleInTheFeature() {
  const files = FEATURE_DIRS.flatMap((dir) =>
    readdirSync(resolve(repoRoot, dir), {
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
  ).sort();

  const strays = egressIn(files).filter(({ file }) => file !== VEHICLE);
  if (strays.length > 0)
    fail([
      `\n  ERR a module in the log feature gets bytes out without being the vehicle:\n`,
      ...strays.map(({ file, calls }) => `      ${file}: ${calls.join(", ")}`),
      ``,
      `      Everything that decides WHAT is written is pure and lives in`,
      `      src/lib/logs/log-facility.ts; the save dialog, the Blob and the`,
      `      anchor live in ${VEHICLE}`,
      `      and nowhere else (ADR-0064 §6's placement, #223's fence).`,
    ]);

  console.log(
    `  ok  ${files.length} file(s) under ${FEATURE_DIRS.join(" and ")}, and only the vehicle names an egress API`
  );
}

function main() {
  checkFacilityIsPure();
  checkVehicleIsAlone();
  checkNoSecondVehicleInTheFeature();
}

// Only when run, never on import: `findEgressCalls` is unit-tested, and
// spawning tsc twice is not something a test suite should be made to do.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
