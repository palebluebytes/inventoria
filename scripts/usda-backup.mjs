#!/usr/bin/env node
/**
 * Off-USDA backup of the FoodData Central bulk archives (ADR-0045), and the
 * pinned local copy of the vocabulary source beside them (ADR-0049 §2).
 *
 * Why this exists: the base-food search reads two USDA datasets, and one of them
 * (SR Legacy) is discontinued — its final release was 2018-04 and there will not
 * be another. It supplies the fibre and the micronutrient tail that ADR-0045 §2
 * fills Foundation from, so losing upstream access would silently thin every
 * merged food. A copy held off USDA infrastructure is also what makes the
 * self-hosted / bundled option in that ADR possible later.
 *
 *   node scripts/usda-backup.mjs check    # has USDA published a newer release?
 *   node scripts/usda-backup.mjs fetch    # download, then verify against the manifest
 *   node scripts/usda-backup.mjs verify   # re-check local copies only
 *   node scripts/usda-backup.mjs upload   # push to R2 and read each object back
 *
 * Flags: --dir <path> (default .usda-backup), --bucket <name>, --skip-readback.
 *
 * The vocabulary source is Open Food Facts' ingredients taxonomy: unversioned,
 * live, and pinned by digest rather than by a release name, since OFF publishes
 * no releases to compare against. It is fetched and verified with the archives
 * and deliberately NOT uploaded — ADR-0049 §2 declines the off-vendor mirror
 * because OFF maintains the file, where SR Legacy is discontinued.
 *
 * `upload` shells out to the wrangler in worker/node_modules and needs a logged-in
 * Cloudflare session (`wrangler login`) or CLOUDFLARE_API_TOKEN in the environment.
 * Nothing here writes to the ledger, the app, or any USDA endpoint beyond a GET.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { countArchiveRecords } from "./usda-archive.mjs";
import {
  compareToPublished,
  fetchPublishedArchives,
} from "./usda-releases.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");
const WRANGLER = join(ROOT, "worker", "node_modules", ".bin", "wrangler");

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--")) ?? "verify";
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

let failures = 0;
const ok = (m) => console.log(`  ok  ${m}`);
const fail = (m) => {
  failures++;
  console.error(`FAIL  ${m}`);
};

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const dir = resolve(ROOT, flag("dir", ".usda-backup"));
const bucket = flag("bucket", manifest.bucket);

/** sha256 of a local file, hex. */
async function digest(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

/** Verifies one archive against its manifest entry. Returns true when sound. */
async function verifyOne(archive) {
  const path = join(dir, archive.file);
  const zip = await readFile(path).catch(() => null);
  if (zip === null) {
    fail(`${archive.file}: not present in ${dir} (run \`fetch\` first)`);
    return false;
  }
  if (zip.length !== archive.bytes) {
    fail(
      `${archive.file}: ${zip.length} bytes, manifest says ${archive.bytes}`
    );
    return false;
  }
  const sha256 = createHash("sha256").update(zip).digest("hex");
  if (sha256 !== archive.sha256) {
    // A checksum mismatch is never a formatting nit: either the file is damaged
    // or USDA re-cut a release under the same name. Both need a human.
    fail(`${archive.file}: sha256 ${sha256}, manifest says ${archive.sha256}`);
    return false;
  }
  // The digest already proves the bytes are the ones the manifest describes, so
  // this is not a second integrity check: it is what keeps the DESCRIPTION
  // honest. `records` is read by humans sizing a bundle or a coverage claim,
  // nothing else consumed it, and it silently drifted 9% out on Foundation for
  // exactly that reason.
  const counted = await countArchiveRecords(zip, archive.root_key);
  if (!counted.found) {
    fail(
      `${archive.file}: no "${archive.root_key}" array inside; the archive's shape has changed`
    );
    return false;
  }
  if (
    counted.records !== archive.records ||
    counted.null_entries !== archive.null_entries
  ) {
    fail(
      `${archive.file}: ${counted.records} records and ${counted.null_entries} null entries, ` +
        `manifest says ${archive.records} and ${archive.null_entries}`
    );
    return false;
  }
  ok(
    `${archive.file} (${archive.dataset}, ${archive.release}, ${counted.records} records)`
  );
  return true;
}

/**
 * Verifies the local copy of the vocabulary source against its manifest entry.
 *
 * Bytes and digest only: there is no record count to keep honest, and no release
 * index to ask, because OFF publishes this file at one unversioned URL and
 * rewrites it in place. The digest is therefore the whole of the drift detector,
 * and a mismatch means OFF has moved — which is news, not damage. The remedy is
 * to re-pin and regenerate, so the map's diff is what gets reviewed (ADR-0049 §2).
 */
async function verifyVocabulary() {
  const { file, bytes, sha256, dataset } = manifest.vocabulary;
  const body = await readFile(join(dir, file)).catch(() => null);
  if (body === null) {
    fail(`${file}: not present in ${dir} (run \`fetch\` first)`);
    return false;
  }
  if (body.length !== bytes) {
    fail(`${file}: ${body.length} bytes, manifest says ${bytes}`);
    return false;
  }
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== sha256) {
    fail(
      `${file}: sha256 ${digest}, manifest says ${sha256}. OFF rewrites this ` +
        "file in place, so re-pin the manifest and regenerate rather than " +
        "assuming damage."
    );
    return false;
  }
  ok(`${file} (${dataset}, fetched ${manifest.vocabulary.fetched})`);
  return true;
}

async function fetchAll() {
  await mkdir(dir, { recursive: true });
  for (const archive of manifest.archives) {
    const url = `${manifest.base_url}/${archive.file}`;
    process.stdout.write(`  .. ${archive.file}\n`);
    const response = await fetch(url);
    if (!response.ok) {
      fail(`${archive.file}: ${url} returned ${response.status}`);
      continue;
    }
    await writeFile(
      join(dir, archive.file),
      Buffer.from(await response.arrayBuffer())
    );
  }
  // Its own absolute URL rather than `base_url`: the taxonomy is somebody
  // else's file on somebody else's host, and joining it to USDA's base would
  // read as though it were one of theirs.
  const { file, url } = manifest.vocabulary;
  process.stdout.write(`  .. ${file}\n`);
  const response = await fetch(url);
  if (!response.ok) fail(`${file}: ${url} returned ${response.status}`);
  else
    await writeFile(join(dir, file), Buffer.from(await response.arrayBuffer()));
}

/**
 * Asks USDA what it currently publishes and compares that to the manifest.
 *
 * The cadence this serves, measured over the 15 releases published between 2019
 * and 2026: Foundation ships roughly every 183 days, nominally April and October,
 * and slips (the October 2025 release landed in December). FNDDS is biennial by
 * USDA's own statement. SR Legacy is finished, so a NEWER SR Legacy release would
 * be news rather than routine and is reported the same way.
 *
 * Exits non-zero when anything is stale, so a scheduled job can act on it — and
 * so can `pnpm usda:bundle`, which refuses to generate against a manifest that
 * is behind (ADR-0047 §12).
 */
async function check() {
  let published;
  try {
    published = await fetchPublishedArchives(manifest.release_index);
  } catch (error) {
    fail(error.message);
    return;
  }
  for (const verdict of compareToPublished(manifest.archives, published))
    if (verdict.state === "current") ok(verdict.message);
    else fail(verdict.message);
}

/**
 * Account id every wrangler call runs under. An ACCOUNT-scoped API token cannot
 * read the user-level `/memberships` endpoint wrangler otherwise uses to discover
 * it, so every R2 command fails with a bare "Authentication failed (9106)" until
 * the id is supplied. Resolved once, from the environment or from `whoami`.
 */
let accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

function wrangler(argv) {
  const run = spawnSync(WRANGLER, argv, {
    cwd: join(ROOT, "worker"),
    encoding: "utf8",
    env: accountId
      ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId }
      : process.env,
  });
  return {
    code: run.status,
    out: `${run.stdout ?? ""}${run.stderr ?? ""}`,
  };
}

async function upload() {
  const whoami = wrangler(["whoami"]);
  if (whoami.code !== 0 || /Not logged in/i.test(whoami.out)) {
    fail(
      "wrangler is not authenticated. Run `worker/node_modules/.bin/wrangler login`, " +
        "or set CLOUDFLARE_API_TOKEN, then re-run."
    );
    return;
  }
  if (!accountId) {
    // `whoami` prints the account table even for a token that cannot enumerate
    // memberships, so the id is readable here even though wrangler's own
    // discovery is about to fail without it.
    accountId = whoami.out.match(/\b[0-9a-f]{32}\b/)?.[0] ?? "";
    if (!accountId) {
      fail(
        "could not determine the Cloudflare account id. Set CLOUDFLARE_ACCOUNT_ID and re-run."
      );
      return;
    }
  }

  const buckets = wrangler(["r2", "bucket", "list"]);
  if (/code: 10042/.test(buckets.out)) {
    // R2 is opt-in per account and the opt-in is a dashboard action, not an API
    // one, so no amount of retrying here will help.
    fail(
      "R2 is not enabled on this Cloudflare account. Enable it once at " +
        "https://dash.cloudflare.com -> R2, then re-run this command."
    );
    return;
  }
  if (/Authentication error|code: 10000/.test(buckets.out)) {
    fail(
      "the API token cannot read R2. It needs the 'Workers R2 Storage: Edit' permission."
    );
    return;
  }
  if (!buckets.out.includes(bucket)) {
    const created = wrangler([
      "r2",
      "bucket",
      "create",
      bucket,
      "--location",
      "weur",
    ]);
    if (created.code !== 0) {
      fail(`could not create bucket ${bucket}:\n${created.out}`);
      return;
    }
    ok(`created bucket ${bucket} (weur)`);
  }

  const uploads = [
    ...manifest.archives.map((a) => ({
      file: a.file,
      path: join(dir, a.file),
    })),
    // Twice: a rolling pointer, and a frozen copy stamped with the retrieval
    // date. Archive keys carry their release date, so a refresh ADDS keys rather
    // than replacing them and the bucket accumulates snapshots; without the
    // stamped manifest, the older archives would sit there undescribed once the
    // rolling one moved on.
    { file: "manifest.json", path: MANIFEST_PATH },
    { file: `manifest-${manifest.retrieved}.json`, path: MANIFEST_PATH },
  ];

  for (const { file, path } of uploads) {
    const key = `${manifest.prefix}/${file}`;
    const put = wrangler([
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--file",
      path,
      "--content-type",
      file.endsWith(".json") ? "application/json" : "application/zip",
    ]);
    if (put.code !== 0) {
      fail(`upload of ${key} failed:\n${put.out}`);
      continue;
    }
    if (has("skip-readback")) {
      ok(`uploaded ${key}`);
      continue;
    }
    // An unread backup is a rumour: pull the object back and compare digests.
    const readback = join(dir, `.readback-${file}`);
    const get = wrangler([
      "r2",
      "object",
      "get",
      `${bucket}/${key}`,
      "--file",
      readback,
    ]);
    if (get.code !== 0) {
      fail(`read-back of ${key} failed:\n${get.out}`);
      continue;
    }
    const [local, remote] = [await digest(path), await digest(readback)];
    await rm(readback, { force: true });
    if (local !== remote) fail(`${key}: read-back digest differs from local`);
    else ok(`uploaded and verified ${key}`);
  }
}

switch (command) {
  case "check":
    await check();
    break;
  case "fetch":
    await fetchAll();
    for (const archive of manifest.archives) await verifyOne(archive);
    await verifyVocabulary();
    break;
  case "verify":
    for (const archive of manifest.archives) await verifyOne(archive);
    await verifyVocabulary();
    break;
  case "upload":
    await upload();
    break;
  default:
    fail(
      `unknown command "${command}" (expected check, fetch, verify or upload)`
    );
}

const scope =
  command === "check"
    ? `${manifest.archives.length} datasets against USDA's published releases`
    : command === "upload"
      ? `${manifest.archives.length} archives, bucket ${bucket}`
      : `${manifest.archives.length} archives and the vocabulary source`;
console.log(
  failures === 0
    ? `\n${command} complete: ${scope}.`
    : `\n${command} finished with ${failures} failure(s).`
);
process.exit(failures === 0 ? 0 : 1);
