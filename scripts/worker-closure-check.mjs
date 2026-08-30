/**
 * What does the Cloudflare Worker actually compile in?
 *
 * `worker/src/index.ts` is bundled by wrangler at deploy time, so every module
 * it imports — transitively — ships to the edge and runs under workerd. That
 * runtime has no DOM, no `window`, no `localStorage` and no Svelte, and it is a
 * short import away: the Worker already reaches back into `src/lib/ingestion/`
 * to share the SSRF guard and response policy with the Vite dev proxy, and one
 * more `import` from there into a store or a view would pull the app's browser
 * half along with it.
 *
 * `tsconfig.worker.json` catches the loud half of that: it types the Worker
 * against workerd's lib, so an imported `window` or `localStorage` is a
 * compile error. What it cannot catch is app code that happens to be
 * DOM-free. A pure module full of nutrition arithmetic typechecks perfectly
 * against workerd and still has no business being bundled to the edge, and
 * once one is in, the next import is judged against a boundary that has
 * already moved.
 *
 * So this pins the closure rather than the symptom. The Worker may import from
 * its own directory and from the ingestion modules it deliberately shares; a
 * module from anywhere else is the error, whether or not it happens to touch
 * the DOM today.
 *
 * The closure comes from `tsc --listFiles`, which reports what the compiler
 * genuinely resolved rather than what a regex over import statements guesses.
 *
 * It carries a second pin for the relay (ADR-0072 §9). The relay is a route on
 * this same script, and the script runs with `invocation_logs = false` so that
 * no automatic per-request record is kept of two people meeting. `console.log`
 * still works, which is exactly the problem: a posture enforced only by review
 * is a posture that lasts until the first debugging session. So the relay's own
 * modules are read here and a call to the console is the error.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..");

/**
 * Where the Worker is allowed to import from.
 *
 * `src/lib/ingestion/` is listed as a directory rather than as the three files
 * the closure holds today, because sharing a fourth module with the dev proxy
 * is a normal thing to do and should not need this file edited. Reaching into
 * `src/lib/stores/`, `src/lib/views/` or `src/lib/db/` is not.
 */
const ALLOWED_PREFIXES = ["worker/src/", "src/lib/ingestion/"];

/**
 * Which of those modules are the relay's, and so may not reach the console.
 *
 * A prefix rather than the one file, so splitting the room across a second
 * module does not silently leave half of it ungated. The proxy is deliberately
 * outside it: its failures already reach its caller as an HTTP status and a
 * message, and ADR-0072 §9 scopes the no-record posture to the relay.
 */
const RELAY_PREFIX = "worker/src/relay";

/**
 * Every `console.<member>` call in a module's source, in the order they appear.
 *
 * Exported so the gate itself can be tested: a matcher that never matches would
 * pass every build silently, which is the failure this whole file exists to
 * prevent one layer down.
 *
 * It reads source text rather than syntax, so a comment writing the call out in
 * full would fail the build too. That is the cheap direction to be wrong in —
 * rewording a comment costs nothing, and a parser here would be a lot of
 * machinery guarding one small file.
 */
export function findConsoleCalls(source) {
  return [...source.matchAll(/\bconsole\s*\.\s*(\w+)\s*\(/g)].map(
    (match) => `console.${match[1]}`
  );
}

function listClosure() {
  const out = execFileSync(
    "node_modules/.bin/tsc",
    ["--noEmit", "-p", "tsconfig.worker.json", "--listFiles"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return out.split("\n").filter(Boolean);
}

function main() {
  let files;
  try {
    files = listClosure();
  } catch (error) {
    // A non-zero tsc means the Worker does not typecheck. That is a real
    // failure and worth reporting as itself, not as a closure violation.
    //
    // `--listFiles` prints the closure on stdout even when the compile fails,
    // and most of it is lib.d.ts. Only the diagnostics are worth showing: a
    // wall of TypeScript's own declaration paths buries the one line that says
    // what broke.
    const diagnostics = (error.stdout || "")
      .split("\n")
      .filter((line) => /error TS\d+:/.test(line));
    console.error(
      "  ERR the worker does not typecheck; its closure is unknown\n"
    );
    console.error(
      diagnostics.length > 0
        ? diagnostics.map((line) => `      ${line}`).join("\n")
        : error.message
    );
    console.error("");
    process.exit(1);
  }

  // Library declarations and anything pulled from node_modules are not the
  // app's own code and are not what this guards.
  const ownFiles = files
    .map((f) => relative(repoRoot, f))
    .filter(
      (f) => !f.startsWith("..") && !f.split(sep).includes("node_modules")
    );

  const strays = ownFiles.filter(
    (f) => !ALLOWED_PREFIXES.some((prefix) => f.startsWith(prefix))
  );

  if (strays.length > 0) {
    console.error(
      `  ERR the worker's import closure reaches ${strays.length} module(s) outside the shared ingestion code:\n`
    );
    for (const f of strays) console.error(`      ${f}`);
    console.error(
      `\n      Everything here is bundled into the Worker and runs under workerd,`
    );
    console.error(
      `      which has no DOM. Allowed roots: ${ALLOWED_PREFIXES.join(", ")}.`
    );
    console.error(
      `      Either move the shared code into src/lib/ingestion/ or stop importing it.\n`
    );
    process.exit(1);
  }

  console.log(
    `  ok  the worker's closure is ${ownFiles.length} module(s), all within ${ALLOWED_PREFIXES.join(" and ")}`
  );
  for (const f of ownFiles.sort()) console.log(`      ${f}`);

  checkRelayIsSilent(ownFiles);
}

/**
 * ADR-0072 §9: the relay keeps no record of two people meeting, and a
 * `console.log` left behind after a debugging session is such a record.
 *
 * An absent relay is a failure rather than a pass. A gate that quietly matches
 * nothing — because the module was renamed, or moved out of the closure — reads
 * from the outside exactly like a gate that found nothing wrong.
 */
function checkRelayIsSilent(ownFiles) {
  const relayFiles = ownFiles.filter((f) => f.startsWith(RELAY_PREFIX));

  if (relayFiles.length === 0) {
    console.error(
      `\n  ERR no relay module in the worker's closure: nothing starts with ${RELAY_PREFIX}\n`
    );
    console.error(
      `      Either the relay moved, in which case move this pin with it, or it`
    );
    console.error(
      `      left the closure, in which case ADR-0072 §9 needs revisiting.\n`
    );
    process.exit(1);
  }

  const talkative = relayFiles
    .map((f) => ({
      file: f,
      calls: findConsoleCalls(readFileSync(resolve(repoRoot, f), "utf8")),
    }))
    .filter(({ calls }) => calls.length > 0);

  if (talkative.length > 0) {
    console.error(`\n  ERR the relay reaches for the console:\n`);
    for (const { file, calls } of talkative)
      console.error(`      ${file}: ${calls.join(", ")}`);
    console.error(
      `\n      The script runs with invocation_logs off so that no automatic`
    );
    console.error(
      `      record is kept of two people meeting (ADR-0072 §9), and console`
    );
    console.error(
      `      output would put one back. Take the diagnostic out.\n`
    );
    process.exit(1);
  }

  console.log(
    `  ok  the relay is silent: ${relayFiles.length} module(s) under ${RELAY_PREFIX} call no console`
  );
}

// Only when run, never on import: `findConsoleCalls` is unit-tested, and
// spawning tsc over the Worker's closure is not something a test suite should
// be made to do.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
