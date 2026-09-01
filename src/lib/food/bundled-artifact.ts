/**
 * What a Facet says when it asks for a bundled artifact it does not precache
 * and nothing answers (ADR-0077 §5, #307).
 *
 * Three heavy food artifacts ship with the build and only Rations precaches all
 * three: it owes ADR-0047 §11's promise whole (ADR-0077 §4), so it cannot reach
 * anything here. The root gave up two of them to pay for the split — the
 * Nutrient store a staged food's panel is read out of, and the barcode reader's
 * WASM — so a cold offline Inventoria reaches this routinely rather than
 * exceptionally, and the honest thing to say is that the file is on the network
 * and this app did not keep a copy.
 *
 * The sentence lives here rather than in the screens that show it because it is
 * ONE promise said in two places: ADR-0077 §5 has the root say it needs a
 * network *once*, and two copies of that sentence are two explanations of the
 * same fact a month from now. What a screen still owns is the recovery clause,
 * which genuinely differs — a staged food falls back to the search row's four
 * macros, an undecodable photo falls back to typing the digits.
 */

/**
 * A bundled artifact this Facet does not hold and could not fetch.
 *
 * Thrown for a **transport** failure only — nothing answered at all. A response
 * that arrives and is not `ok` is a different fault: the file is on the origin,
 * something served it, and its status is worth reading. That one stays a plain
 * `Error` naming the file, which is the shape a broken build has always had.
 *
 * It is the same distinction `OffUnreachableError` keeps for a service that did
 * not answer, and for the same reason: a fault the user can act on is not a
 * fault they can only read.
 */
export class ArtifactUnreachableError extends Error {
  /**
   * What the user loses, written as the subject of the sentence
   * {@link needsNetworkLine} builds.
   *
   * Deliberately NOT the glossary's name for the artifact. `CONTEXT.md` calls
   * these the **Nutrient store** and the **Search index**, which is what a
   * reader of this repo needs and the opposite of what somebody staging a
   * banana needs. The field is named for the job it does rather than for the
   * file, so the two cannot be mistaken for each other.
   */
  readonly subject: string;
  /** The URL that went unanswered — for a console, not for a screen. */
  readonly url: string;

  constructor(subject: string, url: string, cause: unknown) {
    super(`${subject} could not be reached (${url})`, { cause });
    this.name = "ArtifactUnreachableError";
    this.subject = subject;
    this.url = url;
  }
}

/**
 * The line a screen shows for one of these.
 *
 * **It names the network as the cause, because the network is the cause.** The
 * file is deployed and reachable; the only reason nothing answered is that this
 * Facet chose not to keep a copy of it (ADR-0077 §5).
 *
 * There is no sentence it replaces. Both paths swallowed the failure whole: a
 * staged food quietly kept the search row's four macros, and an undecodable
 * photo was reported as a photo with no barcode in it. Silence is what made
 * this worth building — the user was told nothing, or told something false, and
 * in the staging case they then logged four figures for ever (ADR-0022).
 *
 * `recovery` is the screen's own: what the user can still do on the screen they
 * are standing on.
 */
export function needsNetworkLine(
  error: ArtifactUnreachableError,
  recovery: string
): string {
  return `${error.subject} needs a network here — it isn’t kept on this device. ${recovery}`;
}
