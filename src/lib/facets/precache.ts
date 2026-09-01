/**
 * What one Facet precaches, worked out from the build rather than from a glob
 * (ADR-0077 §2).
 *
 * Two halves, and they are two because the build knows one of them and only a
 * person knows the other:
 *
 *   - **the code half is derived.** Walk the emitted chunks reachable from a
 *     Facet's entry — static imports, dynamic imports, and the CSS each chunk
 *     pulls in — and that set is the Facet's JavaScript and stylesheets, exactly.
 *     A denylist is refused here: it rots on every new view, silently
 *     re-inflating a Facet with every gate green, and the thing this module
 *     exists to defend is a number.
 *   - **the rest is declared**, per Facet, on the roster. Fonts, WASM, the DB
 *     worker, the USDA artifacts and a Facet's icons all reach the browser
 *     without any chunk importing them, so no walk can find them: the DB worker
 *     and SQLite's WASM are emitted beside the graph rather than inside it, and
 *     `usda/`, `fonts/` and `food/icons/` are copied verbatim out of `public/`.
 *     ADR-0077 §3 has each Facet name a **complete** set — a shared base plus
 *     its own additions — never a subset of the root's, because ADR-0076 §2 has
 *     Facets overlap rather than nest and §5 of that record has the two declare
 *     *different* USDA artifacts.
 *
 * Nothing here is Vite-aware, which is what lets the whole of it be checked by a
 * unit test rather than by reading a service worker.
 */
import type { Facet } from "./registry";
import { manifestUrlOf } from "./manifest";

/**
 * Where the build leaves its record of all this, project-relative.
 *
 * **Outside `dist/`, deliberately.** Cloudflare serves that directory whole, so
 * anything written into it is a public build output; this is a private need —
 * three build-time gates reading one number — and ADR-0083 §6 refuses
 * `build.manifest: true` for exactly that reason.
 */
export const FACET_BUNDLE_METADATA_PATH = ".facets/bundle-metadata.json";

/**
 * One emitted JavaScript chunk, in the terms the bundler describes it in.
 *
 * A structural subset of Rolldown's `OutputChunk`, named here so the walk below
 * can be handed a literal in a test. `css` is Vite's `viteMetadata.importedCss`
 * — a chunk's stylesheet is not one of its `imports`, and forgetting it ships a
 * Facet whose offline install has no styles.
 */
export interface BundleChunk {
  /** Emitted file name, relative to the build's output directory. */
  readonly file: string;
  /**
   * The module this chunk is the facade for, if any: project-relative, and for
   * an entry chunk it is the entry HTML rather than the script inside it.
   */
  readonly entryModule: string | null;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly css: readonly string[];
  /** Source module ids, project-relative and free of Vite's `?…` suffixes. */
  readonly modules: readonly string[];
  readonly bytes: number;
}

/** One emitted file inside a Facet's reach, with what it weighs. */
export interface ReachedFile {
  readonly file: string;
  readonly bytes: number;
}

/** What one Facet's entry reaches in the build (ADR-0083 §6). */
export interface FacetBundle {
  readonly facet: string;
  /** The entry HTML, relative to the output directory. */
  readonly entry: string;
  /** Emitted chunks and stylesheets, transitively reachable from that entry. */
  readonly files: readonly ReachedFile[];
  /** Source modules inside those chunks, sorted and deduplicated. */
  readonly modules: readonly string[];
  /** What the code half weighs, which is the sum of {@link files}. */
  readonly bytes: number;
}

/**
 * The build's own record of what each Facet reaches, plus what each one
 * actually precached once the service workers were written.
 *
 * One artifact rather than three walks (ADR-0083 §6): the precache derivation
 * here, the per-Facet size band and ADR-0078 §8's containment check all read
 * this, so "reachable" means one thing rather than three.
 */
export interface FacetBundleMetadata {
  readonly facets: readonly FacetBundle[];
  /** Filled in once each Facet's service worker has been generated. */
  readonly precaches: readonly FacetPrecache[];
}

/** What one Facet's service worker ended up precaching. */
export interface FacetPrecache {
  readonly facet: string;
  readonly urls: readonly ReachedFile[];
  readonly count: number;
  readonly bytes: number;
}

/**
 * The chunk a Facet's entry HTML compiled to.
 *
 * Matched on `entryModule` rather than on the emitted file name, because a name
 * is a bundler convention and this is a fact: Rolldown makes each HTML input's
 * chunk the facade for that HTML file. Matching `root-*.js` instead is the trap
 * ADR-0083 §6 names one level up — it works right up until the naming changes,
 * and then it fails by finding nothing.
 */
export function entryChunkOf(
  chunks: readonly BundleChunk[],
  entryModule: string
): BundleChunk | undefined {
  return chunks.find((chunk) => chunk.entryModule === entryModule);
}

/**
 * Every emitted chunk and stylesheet reachable from one chunk.
 *
 * Dynamic imports count. A lazily-imported view is still part of the Facet —
 * ADR-0077's whole saving is `NotesView` being *un*reachable from Rations, not
 * being loaded late in the root — and a precache that stopped at the static
 * graph would leave the root's Notes tab blank on a cold offline install.
 */
export function reachableFrom(
  chunks: readonly BundleChunk[],
  from: BundleChunk
): ReachedFile[] {
  const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
  const seen = new Map<string, number>();
  const queue = [from];

  while (queue.length > 0) {
    const chunk = queue.shift()!;
    if (seen.has(chunk.file)) continue;
    seen.set(chunk.file, chunk.bytes);
    for (const css of chunk.css) seen.set(css, seen.get(css) ?? 0);
    for (const next of [...chunk.imports, ...chunk.dynamicImports]) {
      const target = byFile.get(next);
      if (target && !seen.has(target.file)) queue.push(target);
    }
  }

  return [...seen].map(([file, bytes]) => ({ file, bytes }));
}

/**
 * The stylesheets' weights, which the walk above cannot know.
 *
 * A chunk carries its own byte count; a CSS file is an emitted asset and has
 * none, so it arrives at zero and is filled in here from the sizes the caller
 * measured. Left unfilled, a Facet's recorded weight would silently omit every
 * stylesheet — 178 KB of the root's — and the band that reads it would be a
 * band around the wrong number.
 */
export function withAssetSizes(
  files: readonly ReachedFile[],
  sizeOf: (file: string) => number
): ReachedFile[] {
  return files.map((entry) => ({
    file: entry.file,
    bytes: entry.bytes || sizeOf(entry.file),
  }));
}

/** One Facet's half of {@link FacetBundleMetadata}. */
export function bundleFor(
  facet: Facet,
  entry: string,
  chunks: readonly BundleChunk[],
  sizeOf: (file: string) => number
): FacetBundle {
  const root = entryChunkOf(chunks, entry);
  // A Facet on the roster with no entry chunk is a build that dropped an app.
  // Returning an empty set here would hand the precache derivation a Facet that
  // caches nothing, which installs and then cannot start — so it throws, and
  // names the Facet rather than the file (ADR-0083 §1).
  if (!root) {
    throw new Error(
      `no entry chunk for the ${facet.name} Facet — nothing in the bundle is the facade for ${entry}`
    );
  }

  const files = withAssetSizes(reachableFrom(chunks, root), sizeOf);
  const reached = new Set(files.map((f) => f.file));
  const modules = new Set<string>();
  for (const chunk of chunks) {
    if (!reached.has(chunk.file)) continue;
    for (const module of chunk.modules) modules.add(module);
  }

  return {
    facet: facet.id,
    entry,
    files,
    modules: [...modules].sort(),
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
  };
}

/**
 * Whether a declaration matches an emitted file.
 *
 * `*` stands for a run of characters inside one path segment, which is all the
 * roster's declarations need and deliberately no more: every hashed name the
 * build emits differs from its neighbours within a segment, so a pattern that
 * could cross `/` would let `assets/*` quietly claim `food/icons/` the day the
 * output layout moves.
 */
export function matchesDeclaration(pattern: string, file: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${expression}$`).test(file);
}

/**
 * Everything one Facet precaches: the derived code half, its own entry document
 * and manifest, and every emitted file its declaration claims.
 *
 * The candidate list is whatever the build emitted. Passing it in rather than
 * globbing keeps the decision here and the file system out, and it is what lets
 * a test hand this module a build that does not exist.
 */
export function precacheUrlsFor(
  facet: Facet,
  bundle: FacetBundle,
  candidates: readonly string[]
): Set<string> {
  const urls = new Set(bundle.files.map((f) => f.file));
  urls.add(bundle.entry);
  // Its own manifest, and only its own. Derived rather than declared: a Facet
  // that had to remember to name its manifest could forget, and then it would
  // install from the network or not at all.
  urls.add(manifestUrlOf(facet).replace(/^\//, ""));
  for (const candidate of candidates) {
    if (facet.precache.some((p) => matchesDeclaration(p, candidate))) {
      urls.add(candidate);
    }
  }
  return urls;
}
