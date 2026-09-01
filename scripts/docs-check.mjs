#!/usr/bin/env node
/**
 * Documentation checks. Run with `pnpm docs:check`; also chained into `pnpm check`.
 *
 * Ported from the HTML-era docs/check-docs.sh. The nav-consistency, stale-render and
 * glossary "used-in" checks died with the static site; the rest survive, and three
 * new structural checks are added for the ADR corpus.
 *
 * Two tiers, deliberately:
 *
 *   STRUCTURAL runs over the whole corpus. These are objectively right anywhere and
 *   cost nothing: links resolve, ADR statuses use the closed vocabulary, declared
 *   supersessions are linked back from the record they overtake.
 *
 *   PROSE runs only over the handful of pages written to be read start to finish.
 *   Em-dash and word-tell bans are house style, not truth, and applying them to 43
 *   ADRs and five research notes (which quote primary sources verbatim) would mean
 *   either a rewrite nobody asked for or a baseline file.
 *
 * FAIL sets a non-zero exit. WARN does not.
 */

import { readFileSync } from "node:fs";
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, normalize } from "node:path";

/** Pages written to be read start to finish. Only these get the prose checks. */
const PROSE_PAGES = [
  "README.md",
  "docs/append-only-ledger.md",
  "docs/eavt-vocabulary.md",
  "docs/how-to-add-a-tracked-domain.md",
];

/** Archived material. Superseded by definition, so not held to current standards. */
const EXCLUDED = [
  /^docs\/history\//,
  /^node_modules\//,
  /^worker\/node_modules\//,
];

const WORD_TELLS =
  /\b(crucial|robust|seamless|comprehensive|powerful|delve|leverage|foster|underscore|streamline)\b|It's important to note|In essence/gi;

/** The closed status vocabulary. See docs/adr/README.md. */
const STATUS_RE =
  /^\*\*Status:\*\* (Accepted|Superseded by ADR-\d{4}|Withdrawn)\s*$/;

/** A later record declaring it revises an earlier one. */
const RELATION_RE =
  /\b(?:amend(?:s|ed|ment[^.\n]{0,20})?|supersed(?:e|es|ed|ing))\b[^.\n]{0,90}?ADR[-\s]?(\d{3,4})/gi;

let failures = 0;
let warnings = 0;
const fail = (m) => {
  failures++;
  console.error(`FAIL  ${m}`);
};
const warn = (m) => {
  warnings++;
  console.warn(`warn  ${m}`);
};
const ok = (m) => console.log(`  ok  ${m}`);

// ── corpus ───────────────────────────────────────────────────────────────────

// Tracked **and** untracked-but-not-ignored. A new record is a file before it is
// a commit, and a gate that only sees `git ls-files` passes an unstaged ADR by not
// knowing it exists — which is silence at exactly the moment somebody is writing
// the thing the checks are for. `--exclude-standard` keeps `.gitignore` honoured,
// so `node_modules` and `dist` stay out.
const gitMd = (...args) =>
  execFileSync("git", ["ls-files", ...args, "*.md"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

const tracked = [
  ...new Set([...gitMd(), ...gitMd("--others", "--exclude-standard")]),
]
  .sort()
  .filter((f) => !EXCLUDED.some((re) => re.test(f)));

const read = (f) => readFileSync(f, "utf8");

/** Blank out fenced code blocks and inline code spans, preserving line numbers. */
function maskCode(text) {
  const lines = text.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return "";
      }
      if (inFence) return "";
      return line.replace(/`[^`]*`/g, "");
    })
    .join("\n");
}

/** GitHub's heading-slug rule, near enough for our headings. */
function slug(heading) {
  return heading
    .replace(/`/g, "")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

const anchorsOf = (text) =>
  new Set(
    text
      .split("\n")
      .filter((l) => /^#{1,6}\s+/.test(l))
      .map((l) => slug(l.replace(/^#{1,6}\s+/, "")))
  );

// ── STRUCTURAL 1: relative links and anchors resolve ─────────────────────────

const anchorCache = new Map();
const anchorsFor = (path) => {
  if (!anchorCache.has(path)) anchorCache.set(path, anchorsOf(read(path)));
  return anchorCache.get(path);
};

let badLinks = 0;
for (const file of tracked) {
  const text = maskCode(read(file));
  const dir = dirname(file);
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) {
      if (target.startsWith("#")) {
        const frag = decodeURIComponent(target.slice(1));
        if (frag && !anchorsFor(file).has(frag)) {
          fail(`${file}: anchor "#${frag}" does not match any heading`);
          badLinks++;
        }
      }
      continue;
    }
    const [pathPart, frag] = target.split("#");
    const resolved = normalize(join(dir, decodeURIComponent(pathPart)));
    if (!existsSync(resolved)) {
      fail(`${file}: link target does not exist: ${target}`);
      badLinks++;
      continue;
    }
    if (frag && statSync(resolved).isFile() && resolved.endsWith(".md")) {
      if (!anchorsFor(resolved).has(decodeURIComponent(frag))) {
        fail(`${file}: anchor "#${frag}" not found in ${pathPart}`);
        badLinks++;
      }
    }
  }
}
if (!badLinks)
  ok(`all relative links and anchors resolve (${tracked.length} files)`);

// ── the ADR corpus ───────────────────────────────────────────────────────────

const adrs = new Map();
// Two records that share a number: one of them used to disappear.
//
// `adrs` is keyed by the number in the filename, so a second `0079-*.md` simply
// overwrote the first, and the loser then sat outside every check below with
// nothing said about it. That is not hypothetical: parallel unmerged arcs assign
// numbers from what is free *today*, and two arcs both reached 0076, then both
// reached 0079 and 0080. A collision must be loud at the merge that creates it,
// because it is the merge that has both records in one tree for the first time.
const duplicates = new Map();
for (const file of tracked.filter((f) => /^docs\/adr\/\d{4}-.*\.md$/.test(f))) {
  const text = read(file);
  const n = Number(file.slice("docs/adr/".length, "docs/adr/".length + 4));
  if (adrs.has(n)) duplicates.set(n, [adrs.get(n).file, file]);
  const m = text.match(/\*\*Status:\*\*[\s\S]*?(?=\n\s*\n)/);
  adrs.set(n, {
    file,
    header: m ? m[0] : "",
    body: m ? text.slice(m.index + m[0].length) : text,
    statusLine: text.split("\n").find((l) => l.startsWith("**Status:**")) ?? "",
  });
}

// ── STRUCTURAL 1b: one record per number ─────────────────────────────────────

for (const [n, files] of [...duplicates].sort((a, b) => a[0] - b[0])) {
  fail(
    `docs/adr: ADR-${String(n).padStart(4, "0")} is claimed by two records, and ` +
      `only the second is checked at all:\n      ${files.join("\n      ")}`
  );
}
if (!duplicates.size) ok(`every ADR number names exactly one record`);

// ── STRUCTURAL 2: status uses the closed vocabulary ──────────────────────────

let badStatus = 0;
for (const [, adr] of [...adrs].sort((a, b) => a[0] - b[0])) {
  if (!adr.statusLine) {
    fail(`${adr.file}: no **Status:** line`);
    badStatus++;
  } else if (!STATUS_RE.test(adr.statusLine.replace(/\s+$/, ""))) {
    fail(
      `${adr.file}: status is not one of Accepted / Superseded by ADR-NNNN / Withdrawn\n` +
        `        got: ${adr.statusLine.trim()}`
    );
    badStatus++;
  }
  const target = adr.statusLine.match(/Superseded by ADR-(\d{4})/);
  if (target && !adrs.has(Number(target[1]))) {
    fail(`${adr.file}: superseded by ADR-${target[1]}, which does not exist`);
    badStatus++;
  }
}
if (!badStatus) ok(`all ${adrs.size} ADR statuses use the closed vocabulary`);

// ── STRUCTURAL 3: declared supersessions are linked back ─────────────────────
// If a record says it amends or supersedes another, the older of the two must
// name the newer in its header. A reader landing on the overtaken record is the
// one who would otherwise implement a design that was explicitly overturned.

const pairs = new Set();
const claim = (n, t) => {
  const m = Number(t);
  if (m !== n && adrs.has(m)) pairs.add(`${Math.min(n, m)}:${Math.max(n, m)}`);
};
for (const [n, adr] of adrs) {
  // The header declares too, and only through `**Amends:**` (#261).
  //
  // The convention `docs/adr/README.md` documents is a header trailer, and that
  // block is exactly what `body` excludes — so scanning the body alone meant a
  // record declaring its relationship the documented way created no obligation,
  // and the gate reported `ok` for a backlink that was not there.
  //
  // **`**Amended by:**` is not read here, and that is the whole subtlety.** It is
  // the backlink rather than a declaration, so reading it would at best re-derive
  // a pair already satisfied by construction, and at worst invent one: ADR-0049's
  // trailer names *the #144 Amendment below* as the amending record and mentions
  // ADR-0042 only in a subordinate clause, as the corpus whose own #144 amendment
  // left rows behind. The loose prose regex reads that as "0049 amends 0042",
  // which is false. Hence the narrow, anchored grammar: the line must *begin* with
  // the trailer, and only its first ADR reference is the target.
  for (const line of adr.header.split("\n")) {
    const m = line.match(/^\*\*Amends:\*\*[^\n]*?ADR[-\s]?(\d{3,4})/i);
    if (m) claim(n, m[1]);
  }
  for (const [, t] of adr.body.matchAll(RELATION_RE)) claim(n, t);
}
let badBacklinks = 0;
for (const pair of [...pairs].sort()) {
  const [older, newer] = pair.split(":").map(Number);
  if (!new RegExp(`ADR-0*${newer}\\b`).test(adrs.get(older).header)) {
    fail(
      `${adrs.get(older).file}: ADR-${String(newer).padStart(4, "0")} declares it revises this ` +
        `record, but this record's header does not name it (add **Amended by:** or **Status:** Superseded by)`
    );
    badBacklinks++;
  }
}
if (!badBacklinks)
  ok(`all ${pairs.size} declared ADR relationships are linked from both ends`);

// ── PROSE 1: no em-dashes outside code ───────────────────────────────────────

let emDashes = 0;
for (const file of PROSE_PAGES) {
  maskCode(read(file))
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("—")) {
        fail(`${file}:${i + 1}: em-dash in prose`);
        emDashes++;
      }
    });
}
if (!emDashes) ok(`no em-dashes in the ${PROSE_PAGES.length} prose pages`);

// ── PROSE 2: no word-tells ───────────────────────────────────────────────────

let tells = 0;
for (const file of PROSE_PAGES) {
  maskCode(read(file))
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(WORD_TELLS)) {
        fail(`${file}:${i + 1}: word-tell "${m[0]}"`);
        tells++;
      }
    });
}
if (!tells) ok("no word-tells in the prose pages");

// ── PROSE 3: paragraphs past four sentences (warn only) ──────────────────────

let longParas = 0;
for (const file of PROSE_PAGES) {
  const text = maskCode(read(file));
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p || /^[#|>\-*\d]/.test(p)) continue;
    const n = (
      p.replace(/e\.g\.|i\.e\.|vs\.|etc\./g, "").match(/[.!?]+(\s|$)/g) || []
    ).length;
    if (n > 4) {
      warn(`${file}: paragraph of ~${n} sentences: "${p.slice(0, 60)}..."`);
      longParas++;
    }
  }
}
if (!longParas) ok("no paragraph past four sentences in the prose pages");

// ── report ───────────────────────────────────────────────────────────────────

console.log(
  `\nchecked ${tracked.length} markdown files (structural) and ` +
    `${PROSE_PAGES.length} (prose); ${adrs.size} ADRs.\n` +
    `docs/history/ is excluded as archived.`
);
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log(
  warnings ? `\npassed with ${warnings} warning(s).` : "\nall checks passed."
);
