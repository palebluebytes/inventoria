/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
 *
 * The stubbed state machine all three variants drive. There is no relay, no
 * seal and no ledger write: every transition is a timer, and what a transition
 * DOES is chosen by the rig's outcome select so a reviewer can walk into any
 * failure on purpose rather than waiting for one.
 *
 * The states are not invented here — they are the ones the map already fixed:
 * a send is synchronous and both-present (#199 §4), the sender learns delivery
 * and never acceptance (#199 §7), a refusal burns the code (#199 §6), a payload
 * is judged at RECEIVE rather than at accept (#197 §5), and the inbox holds
 * three and refuses rather than evicts (#199 §13, #197 §5).
 */

import { INCOMING, type ProtoPayload } from "./proto-fixture";

export type Variant = "A" | "B" | "C" | "D";
export const VARIANTS: Variant[] = ["A", "B", "C", "D"];

export const VARIANT_NAME: Record<Variant, string> = {
  A: "A — A way out in the header",
  B: "B — One handover, two doors",
  C: "C — The exchange takes the screen",
  D: "D — In the meal's own numbers",
};

/** The inbox depth (#199 §13). Ceiling × depth must fit the localStorage budget. */
export const INBOX_DEPTH = 3;

/** The payload ceiling in decoded bytes (#199 §13). */
export const CEILING_BYTES = 1024 * 1024;

// ── Refusals ──────────────────────────────────────────────────────────────
//
// #197 §5's seven, plus the ceiling, plus the one the seal adds: a party who
// does not hold the key cannot open the payload, and that is a SECURITY refusal
// rather than a network error (#198's fingerprint-mismatch case, restated for
// #200's relay, where the seal does the work DTLS used to).
//
// Each refusal carries three widths of wording, because whether a user sees one
// message or nine is exactly the design call this ticket has to make:
//   `cause` — the technical reading, for a details disclosure
//   `group` — the smallest honest grouping
//   `plain` — its own sentence, in the app's voice

export type RefusalGroup =
  | "not-a-meal"
  | "not-intact"
  | "too-big"
  | "not-yours";

export interface Refusal {
  id: string;
  group: RefusalGroup;
  cause: string;
  plain: string;
}

export const REFUSALS: Refusal[] = [
  {
    id: "artifact",
    group: "not-a-meal",
    cause: "envelope declares artifact `ledger-export`, not `meal`",
    plain: "This is a whole ledger, not a meal. Settings › Import reads those.",
  },
  {
    id: "version",
    group: "not-a-meal",
    cause: "envelope version 3, this build reads 1",
    plain: "This meal was sent by a newer Inventoria than this one.",
  },
  {
    id: "malformed",
    group: "not-intact",
    cause: "line 44 is not JSON",
    plain: "This meal did not arrive whole.",
  },
  {
    id: "missing-root",
    group: "not-intact",
    cause: "declared root `event:consume_9f2…` is absent from the payload",
    plain: "This meal is missing part of itself.",
  },
  {
    id: "outside-closure",
    group: "not-a-meal",
    cause: "`habit:water` is reachable from no declared root",
    plain: "This carries something that is not part of the meal.",
  },
  {
    id: "dangling-ref",
    group: "not-intact",
    cause:
      "`event/target` points at `food:custom_1a3…`, which did not come with it",
    plain: "This meal names a food that did not come with it.",
  },
  {
    id: "forbidden-attr",
    group: "not-a-meal",
    cause: "`settings/off_username` is not an attribute a meal may carry",
    plain: "This carries something a meal may not carry.",
  },
  {
    id: "ceiling",
    group: "too-big",
    cause: "1.4 MiB decoded, against a 1 MiB ceiling",
    plain: "This meal is bigger than this app will accept.",
  },
  {
    id: "seal",
    group: "not-yours",
    cause: "AES-GCM tag did not verify under the key in the code",
    plain: "This did not come from the code you scanned.",
  },
];

export const GROUP_LINE: Record<RefusalGroup, string> = {
  "not-a-meal": "This is not a meal Inventoria can read.",
  "not-intact": "This meal did not arrive whole.",
  "too-big": "This meal is bigger than this app will accept.",
  "not-yours": "This did not come from the code you scanned.",
};

/** The one line variant A shows for everything except the security refusal. */
export const ONE_LINE = "This is not a meal Inventoria can read.";

// ── What the rig makes happen ─────────────────────────────────────────────

export type Outcome = "delivered" | "inbox-full" | "relay-down" | "refused";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  delivered: "they get it",
  "inbox-full": "their inbox is full",
  "relay-down": "the relay is unreachable",
  refused: "they refuse it",
};

export type SendPhase =
  | "picking"
  | "showing"
  | "delivered"
  | "inbox-full"
  | "relay-down"
  | "refused";

export type ReceivePhase = "entry" | "verifying" | "held" | "refused";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function token(n: number): string {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) s += B64[bytes[i] & 63];
  return s;
}

/** The code, both carriers (#200 §7). 22 chars of room + 43 of key is 128 and
 *  256 bits; the whole link is 101 characters, which #198 read as QR version 5
 *  in 931 ms. The secret sits in the fragment so it reaches no server. */
export function mintCode() {
  const room = token(22);
  const key = token(43);
  return {
    room,
    key,
    link: `https://inventoria.app/receive#r=${room}&k=${key}`,
  };
}

export interface SendSession {
  meal_type: string;
  /** The label the sender's own screen used, e.g. "Sunday 4 January". */
  day: string;
  rows: number;
  calories: number;
  code: ReturnType<typeof mintCode>;
  phase: SendPhase;
  /** Set when the send failed on a refusal, so the screen can say which. */
  refusal: Refusal | null;
}

export class Proto {
  variant = $state<Variant>("A");
  /**
   * Which standing surface is open, if any. It lives here rather than in the
   * host because the CONTROL that opens it is injected into the real food
   * screen while the SURFACE is rendered by the prototype host, and the two
   * have no parent between them worth threading a binding through.
   *
   * `"inbox"` is variant A's, `"handover"` is B's, `"receive"` is C's takeover.
   */
  uiOpen = $state<null | "inbox" | "handover" | "receive">(null);
  /** What the rig makes the far end do. */
  outcome = $state<Outcome>("delivered");

  // ── the sending half ────────────────────────────────────────────────────
  send = $state<SendSession | null>(null);

  /**
   * Variant D: which meal's figures are expanded, and from which day.
   *
   * The control that opens it is the meal's own subtotal line inside the real
   * dashboard; the panel is rendered by the prototype. The date travels with it
   * because the panel recomputes from the ledger rather than being handed a
   * total, so it needs to know which day it is reading.
   */
  mealPanel = $state<{ meal_type: string; date: Date } | null>(null);

  /**
   * Variant D: a payload that has just arrived and is being decided ON, with no
   * inbox behind it.
   *
   * A held payload and a held payload you are looking at are the same thing
   * when there is no list to go back to — which is the whole of what D changes
   * about receiving, and the tension it exposes: #199 §13 still says three are
   * held and #197 §5 still says a fourth is refused rather than evicting one,
   * so an abandoned accept goes somewhere D draws no way back to.
   */
  arriving = $state<ProtoPayload | null>(null);

  // ── the receiving half ──────────────────────────────────────────────────
  inbox = $state<ProtoPayload[]>([]);
  receivePhase = $state<ReceivePhase | null>(null);
  receiveRefusal = $state<Refusal | null>(null);
  /** The held payload the recipient is reading before deciding. */
  reading = $state<ProtoPayload | null>(null);
  /** What accept just did, so the screen can say it landed. */
  landed = $state<{ payload: ProtoPayload; meal_type: string } | null>(null);

  #timer: ReturnType<typeof setTimeout> | null = null;

  #after(ms: number, fn: () => void) {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(fn, ms);
  }

  // ── sending ─────────────────────────────────────────────────────────────

  /** Variant B and C open on a meal picker; A arrives already knowing the meal. */
  openPicker() {
    this.send = {
      meal_type: "",
      day: "",
      rows: 0,
      calories: 0,
      code: mintCode(),
      phase: "picking",
      refusal: null,
    };
  }

  startSend(meal_type: string, day: string, rows: number, calories: number) {
    this.send = {
      meal_type,
      day,
      rows,
      calories,
      code: mintCode(),
      phase: "showing",
      refusal: null,
    };
    // #198 measured the sender's wait as 10.4 s, all of it human, and then 79 ms.
    // Two and a half seconds is the same shape at review speed.
    this.#after(2500, () => this.resolveSend());
  }

  /** What the far end did. Called by the timer, or by the rig on demand. */
  resolveSend() {
    if (!this.send || this.send.phase !== "showing") return;
    switch (this.outcome) {
      case "delivered":
        this.send.phase = "delivered";
        break;
      case "inbox-full":
        this.send.phase = "inbox-full";
        break;
      case "relay-down":
        this.send.phase = "relay-down";
        break;
      case "refused":
        this.send.refusal = REFUSALS[0];
        this.send.phase = "refused";
        break;
    }
  }

  /** A refusal burns the code (#199 §6) — a new send mints a new one. */
  sendAgain() {
    if (!this.send) return;
    this.startSend(
      this.send.meal_type,
      this.send.day,
      this.send.rows,
      this.send.calories
    );
  }

  closeSend() {
    if (this.#timer) clearTimeout(this.#timer);
    this.send = null;
  }

  // ── receiving ───────────────────────────────────────────────────────────

  openReceive() {
    this.receivePhase = "entry";
    this.receiveRefusal = null;
  }

  /** Scan or paste — never type (#199 §3). Both land here. */
  codeTaken(refusal: Refusal | null = null) {
    this.receivePhase = "verifying";
    // #198: 904 ms from reading the code to a verified meal.
    this.#after(900, () => {
      if (refusal) {
        this.receiveRefusal = refusal;
        this.receivePhase = "refused";
        return;
      }
      if (this.inbox.length >= INBOX_DEPTH) {
        // Refuses rather than evicts — but this is the RECIPIENT's screen, and
        // the state the map cares about is the one the SENDER sees. Kept here
        // so the rig can reach it from both ends.
        this.receiveRefusal = {
          id: "inbox-full",
          group: "too-big",
          cause: `inbox holds ${INBOX_DEPTH}`,
          plain: "Your inbox is full. Deal with what is in it first.",
        };
        this.receivePhase = "refused";
        return;
      }
      const next = INCOMING[this.inbox.length % INCOMING.length];
      this.inbox = [
        ...this.inbox,
        { ...next, id: `${next.id}-${this.inbox.length}` },
      ];
      this.receivePhase = "held";
    });
  }

  closeReceive() {
    if (this.#timer) clearTimeout(this.#timer);
    this.receivePhase = null;
    this.receiveRefusal = null;
  }

  read(p: ProtoPayload) {
    this.reading = p;
  }

  /** Accept re-mints: their clock, their Meal Type (#197 §2.1, §2.2). */
  accept(p: ProtoPayload, meal_type: string) {
    this.inbox = this.inbox.filter((x) => x.id !== p.id);
    this.reading = null;
    this.landed = { payload: p, meal_type };
    this.#after(6000, () => (this.landed = null));
  }

  discard(p: ProtoPayload) {
    this.inbox = this.inbox.filter((x) => x.id !== p.id);
    this.reading = null;
  }

  /**
   * Variant D: a meal arrives with no inbox in front of it — because a link was
   * opened, or because the barcode scanner was pointed at a code and found a
   * meal rather than a barcode. Either way you are looking at it, now.
   */
  arrive(which = 0) {
    this.arriving = INCOMING[which % INCOMING.length];
  }

  acceptArriving(meal_type: string) {
    const p = this.arriving;
    if (!p) return;
    this.arriving = null;
    this.landed = { payload: p, meal_type };
    this.#after(6000, () => (this.landed = null));
  }

  /** Rig: fill the inbox so the full case is one tap away. */
  fillInbox() {
    this.inbox = INCOMING.slice(0, INBOX_DEPTH).map((p, i) => ({
      ...p,
      id: `${p.id}-${i}`,
    }));
  }

  reset() {
    if (this.#timer) clearTimeout(this.#timer);
    this.send = null;
    this.inbox = [];
    this.receivePhase = null;
    this.receiveRefusal = null;
    this.reading = null;
    this.landed = null;
    this.mealPanel = null;
    this.arriving = null;
  }
}

/** One instance for the session — the prototype is a single screen's rig. */
export const proto = new Proto();

/** `?variant=A|B|C` on the food screen, dev only. Null means "ship as normal". */
export function readVariant(): Variant | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("variant");
  return v && (VARIANTS as string[]).includes(v.toUpperCase())
    ? (v.toUpperCase() as Variant)
    : null;
}
