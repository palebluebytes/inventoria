/**
 * What does the Cloudflare Worker actually compile in?
 *
 * `worker/src/index.ts` is bundled by wrangler at deploy time, so every module
 * it imports — transitively — ships to the edge and runs under workerd. That
 * runtime has no DOM, no `window`, no `localStorage` and no Svelte, and it is a
 * short import away: the Worker already reaches back into `src/lib/ingestion/`
 * to share the SSRF guard and response policy with the Vite dev proxy, and one
 * more `import` from there into a store or a view would pull the app's browser
 * half along with it. Nothing in the roster would notice. `pnpm check`
 * typechecks the Worker against Node's lib, not workerd's, and a build that
 * bundles a `window` reference is perfectly valid TypeScript — it fails when a
 * scrape hits production.
 *
 * So this pins the closure instead of the symptom. The Worker may import from
 * its own directory and from the ingestion modules it deliberately shares; a
 * module from anywhere else is the error, whether or not it happens to touch
 * the DOM today.
 *
 * The closure comes from `tsc --listFiles`, which reports what the compiler
 * genuinely resolved rather than what a regex over import statements guesses.
 */
import { execFileSync } from "node:child_process";
import { relative, resolve, sep } from "node:path";

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

function listClosure() {
  const out = execFileSync(
    "node_modules/.bin/tsc",
    ["--noEmit", "-p", "worker/tsconfig.json", "--listFiles"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return out.split("\n").filter(Boolean);
}

let files;
try {
  files = listClosure();
} catch (error) {
  // A non-zero tsc means the Worker does not typecheck. That is a real failure
  // and worth reporting as itself, not as a closure violation.
  //
  // `--listFiles` prints the closure on stdout even when the compile fails, and
  // most of it is lib.d.ts. Only the diagnostics are worth showing: a wall of
  // TypeScript's own declaration paths buries the one line that says what broke.
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

// Library declarations and anything pulled from node_modules are not the app's
// own code and are not what this guards.
const ownFiles = files
  .map((f) => relative(repoRoot, f))
  .filter((f) => !f.startsWith("..") && !f.split(sep).includes("node_modules"));

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
