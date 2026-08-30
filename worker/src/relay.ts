/**
 * The Relay: a Durable Object that holds at most two WebSockets for one room
 * and forwards opaque frames between them (ADR-0072 §1, §10, §11, §12).
 *
 * It never inspects a frame's contents, because it cannot: the payload is
 * sealed under a 256-bit key that rides in the Send code and reaches this
 * object by no path (§2). WSS terminates at Cloudflare, so transport TLS is
 * not a confidentiality control here and must never be cited as one — the AEAD
 * seal is the whole binding.
 *
 * Everything this module refuses is a **shape** refusal, since content-based
 * limits are impossible for something that cannot read. The five shapes are
 * numbers rather than "reasonable limits", and each carries its §11 clause
 * below.
 *
 * Nothing here calls the console, and `scripts/worker-closure-check.mjs`
 * enforces that rather than leaving it to review (§9). The script also runs
 * with `invocation_logs = false` for the same reason; `wrangler.toml` carries
 * the argument beside the flag.
 */

/**
 * What the room needs from workerd, named here rather than imported from
 * `@cloudflare/workers-types`.
 *
 * `tsconfig.worker.json` supplies those types when the Worker is checked, but
 * `tsconfig.tests.json` checks this same file against Node and the DOM, and
 * the two global sets cannot both be loaded — they redeclare `Request`,
 * `Response` and `WebSocket` at each other. Naming the six members the room
 * actually touches keeps one file honest under both projects, and it is also
 * the seam the unit tests come in through.
 */
export interface RelaySocket {
  send(message: ArrayBuffer | string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: SocketAttachment): void;
  deserializeAttachment(): SocketAttachment | null;
}

/**
 * The only thing a socket remembers: whether it has spent its one frame.
 *
 * It rides in the hibernation attachment, which §12 blesses explicitly — the
 * rule is a lifetime one rather than an API prohibition, and an attachment
 * dies with its socket.
 */
export interface SocketAttachment {
  spent: boolean;
}

/**
 * Just enough of `DurableObjectState` to hold a room.
 *
 * `get` and `put` are typed to the one thing this room ever stores — a count
 * of the frames that have crossed — rather than to the general key-value shape,
 * so widening what the relay remembers has to be a deliberate edit here.
 */
export interface RelayRoomState {
  getWebSockets(): RelaySocket[];
  acceptWebSocket(ws: RelaySocket): void;
  storage: {
    get(key: string): Promise<number | undefined>;
    put(key: string, value: number): Promise<void>;
    getAlarm(): Promise<number | null>;
    setAlarm(scheduledTime: number): Promise<void>;
    deleteAlarm(): Promise<void>;
    deleteAll(): Promise<void>;
  };
}

/** Just enough of `DurableObjectNamespace` for the route to address a room. */
export interface RelayNamespace {
  idFromName(name: string): RelayRoomId;
  get(id: RelayRoomId): { fetch(request: Request): Promise<Response> };
}

/** An opaque room address: the route mints one and hands it straight back. */
export interface RelayRoomId {
  toString(): string;
}

/**
 * The upgrade itself, stated in the same two projects' terms.
 *
 * `WebSocketPair` is a workerd global the DOM has no equivalent of, and a 101
 * carrying a socket is a workerd `Response` the DOM cannot construct — Node's
 * throws on the status alone. Both are declared here for the reason
 * `RelaySocket` is: the two global type sets cannot both be loaded. The first
 * overload is the upgrade and the second is every other response in this file.
 */
declare const WebSocketPair: {
  new (): { 0: RelaySocket; 1: RelaySocket };
};
declare const Response: {
  new (body: null, init: { status: 101; webSocket: RelaySocket }): Response;
  new (body: string, init: { status: number }): Response;
};

/** §11.1. A third socket is refused, never queued. */
export const MAX_SOCKETS_PER_ROOM = 2;

/**
 * §11.2. One payload frame in each direction, which is two frames in all.
 *
 * It shares a value with the socket cap and not a meaning, so it is its own
 * number: the sockets bound who is in the room, and this bounds how much the
 * room will carry.
 */
export const FRAMES_PER_ROOM = 2;

/**
 * Where that tally lives for the life of the room.
 *
 * §12 refuses **aggregate** counters — the kind that outlive a room to say
 * something about all of them, and the kind a rate limiter would need. This is
 * the other thing: state for the duration of one room, which is exactly what
 * that section permits, and `deleteAll` takes it with everything else.
 */
const FRAMES_KEY = "frames";

/**
 * §11.3. A crude backstop on wire bytes, and never the bound that refuses a
 * meal — that one is the recipient's check on **decoded** bytes (ADR-0073 §9),
 * and the two must not be conflated in code or in a message. The wire payload
 * is deflated and then sealed, so it is always smaller than its decoded size
 * and this ceiling can only ever be the more permissive of the two. Its job is
 * to stop somebody streaming a gigabyte through the relay, nothing else.
 */
export const WIRE_CEILING_BYTES = 1024 * 1024;

/**
 * §11.4. The same five minutes as the sender's wait ceiling (§6.4) — one clock
 * and one number, not two.
 */
export const ROOM_LIFETIME_MS = 5 * 60 * 1000;

/**
 * The relay's one word, and the only text that ever crosses this wire.
 *
 * A party cannot send its payload until the other is present, because §5
 * forbids store-and-forward at any layer: a frame arriving alone has nowhere
 * to go and cannot be parked. Something has to say when to speak, and it
 * cannot be a frame from the peer, since §11.2 spends the peer's one frame on
 * the delivery acknowledgement. So it is the relay's, and the discipline that
 * keeps it unambiguous is the split below: **the relay originates text and the
 * parties send binary.** A party's text frame is therefore refused rather than
 * dropped, since a dropped frame reaches nobody and says so to no one.
 */
export const PEER_WORD = "peer";

/** A clean end: the room did its job, or a party closed its own socket. */
export const CLOSE_NORMAL = 1000;

// The refusals sit in 4000–4999, the range an application may send. The
// reserved codes a WebSocket close cannot carry (1004, 1005, 1006, 1015) are
// close enough to the meanings wanted here to be worth avoiding by policy.
export const CLOSE_EXPIRED = 4001;
export const CLOSE_OVER_CEILING = 4002;
export const CLOSE_SECOND_FRAME = 4003;
export const CLOSE_NOT_OPAQUE = 4004;
export const CLOSE_NO_PEER = 4005;

export class Relay {
  private readonly state: RelayRoomState;

  constructor(state: RelayRoomState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    // §11.1: refused, never queued. The cap is on *concurrent* sockets, and
    // the relay does not ask who is asking — both parties hold the same key,
    // so there is nothing to authenticate against and no way to tell a
    // reconnecting sender from a squatter. It does not need to: a squatter's
    // entire achievement is occupying a slot (§10).
    if (this.state.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      return new Response("The room already holds two sockets", {
        status: 409,
      });
    }

    const pair = new WebSocketPair();
    await this.join(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /**
   * Take the server half of a new socket into the room, and start the room's
   * five minutes if this is the first one.
   *
   * The deadline is set once and never pushed out. A transport-level reconnect
   * within a live session is not a use of the Send code (§6) and must not buy
   * more time either, or the one clock §11.4 insists on becomes two.
   *
   * **A spent room id is not reusable, and the relay does not try to make it
   * so.** Measured against workerd: a second pair joining an id whose room has
   * already closed gets sockets and then a room that misbehaves — frames go
   * astray and refusals stop arriving. That is not a case the design has,
   * because §6 makes a Send code single-use and §3 refuses a retry on a spent
   * one, so a client reusing an id is already outside the protocol. It is also
   * not a case the relay could refuse cleanly: that would mean remembering
   * spent ids, which is the one thing §12 forbids outright. Draw a new code.
   */
  async join(server: RelaySocket): Promise<void> {
    // Hibernation is what makes an idle five-minute room affordable: the
    // object can be evicted between frames and woken by one.
    this.state.acceptWebSocket(server);

    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + ROOM_LIFETIME_MS);
    }

    const room = this.state.getWebSockets();
    if (room.length === MAX_SOCKETS_PER_ROOM) {
      for (const ws of room) ws.send(PEER_WORD);
    }
  }

  async webSocketMessage(
    ws: RelaySocket,
    message: ArrayBuffer | string
  ): Promise<void> {
    // Text is the relay's own register, so a party sending it is speaking a
    // language this wire does not have.
    if (typeof message === "string") {
      return this.closeRoom(CLOSE_NOT_OPAQUE, "a party's frame is binary");
    }

    // §11.5: over a bound the room closes, and is never truncated. A truncated
    // payload reaches the recipient as bytes that fail to open with no
    // explanation, indistinguishable from tampering.
    if (message.byteLength > WIRE_CEILING_BYTES) {
      return this.closeRoom(CLOSE_OVER_CEILING, "over the wire ceiling");
    }

    // §11.2's bound is counted twice, on purpose, because one count alone does
    // not hold it.
    //
    // The attachment is what refuses a *live* socket's second frame, and it is
    // the precise answer: this party has spent its frame. But an attachment
    // dies with its socket, and §11 has a dropped party reclaim the free slot
    // without being identified — so a sender that closes and rejoins arrives
    // with a clean one, and per-socket counting alone would make the room an
    // unbounded pipe for its whole five minutes.
    //
    // The room's own tally is what closes that. It survives a reconnect
    // because it belongs to the room rather than to a socket, and it dies with
    // the room like everything else here. What it cannot do is tell whose
    // frame each was — that is the identity §11 says the relay does not have
    // and does not try to acquire — so the honest guarantee is **at most two
    // frames cross a room**, not one from each named party.
    const forwarded = (await this.state.storage.get(FRAMES_KEY)) ?? 0;
    if (forwarded >= FRAMES_PER_ROOM || ws.deserializeAttachment()?.spent) {
      return this.closeRoom(
        CLOSE_SECOND_FRAME,
        "one frame in each direction, and yours is spent"
      );
    }

    const room = this.state.getWebSockets();
    const peer = room.find((other) => other !== ws);
    if (!peer) {
      return this.closeRoom(CLOSE_NO_PEER, "nobody to forward to");
    }

    ws.serializeAttachment({ spent: true });
    await this.state.storage.put(FRAMES_KEY, forwarded + 1);
    peer.send(message);

    // The reverse direction carries §7's delivery acknowledgement and nothing
    // else, so once both frames have crossed there is nothing left for the
    // room to do.
    if (forwarded + 1 === FRAMES_PER_ROOM) {
      await this.closeRoom(CLOSE_NORMAL, "delivered");
    }
  }

  /**
   * A dropped party frees its slot, and that is all that happens: §11 says
   * reconnection survives and is not authenticated, so there is nothing to
   * record and nobody to tell. Closing our half completes the handshake, which
   * is what actually frees the slot.
   */
  async webSocketClose(ws: RelaySocket): Promise<void> {
    ws.close(CLOSE_NORMAL, "the socket closed");
  }

  async webSocketError(ws: RelaySocket): Promise<void> {
    ws.close(CLOSE_NORMAL, "the socket failed");
  }

  async alarm(): Promise<void> {
    await this.closeRoom(CLOSE_EXPIRED, "the room's five minutes are up");
  }

  /**
   * §12: the relay may hold state for the duration of a room, and nothing that
   * outlives one. Clearing here is what makes §8's bar true by construction
   * rather than by policy — after this, no record anywhere says the room
   * existed, so there is nothing to correlate, subpoena or leak.
   *
   * `deleteAll` leaves the alarm alone, so the alarm goes separately.
   *
   * **A closed room is not the same thing as a client that noticed.** Measured
   * against workerd under `wrangler dev` on 2026-08-30: a party whose client
   * has never sent a frame can sit in `CLOSING` after this runs, while the room
   * has already released its slot — two fresh sockets are admitted into the
   * same room immediately afterwards, and a party that had sent closes cleanly
   * every time. So a recipient waiting through a refusal cannot be relied on to
   * see a close event, and the client half wants its own deadline rather than
   * trusting the socket to tell it. The relay has done all it can here: the
   * close frame is sent, and the rest is the client's teardown.
   */
  private async closeRoom(code: number, reason: string): Promise<void> {
    for (const ws of this.state.getWebSockets()) ws.close(code, reason);
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }
}
