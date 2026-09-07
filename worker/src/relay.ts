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
 * limits are impossible for something that cannot read. **The shapes that
 * bound a room are two — two sockets and five minutes** (ADR-0096 §8), and
 * they are numbers rather than "reasonable limits". The rest of what this file
 * refuses is register rather than volume: the parties send binary, the relay
 * originates text, and a frame with nobody to forward it to has nowhere to go.
 *
 * **ADR-0072 §11.2's one frame each way and §11.3's byte ceiling are gone, for
 * every room.** A pairing first sync is tens of megabytes across many frames,
 * and the relay may not be told which kind of room it is holding, because
 * telling it would hand the operator a free classification of a surface three
 * decisions were spent keeping it out of. **The five-minute clock is the byte
 * bound now**, and §11's abuse argument is re-made against the wider pipe in
 * ADR-0096 §8 rather than inherited from here.
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
 * `Response` and `WebSocket` at each other. Naming the two members the room
 * actually touches keeps one file honest under both projects, and it is also
 * the seam the unit tests come in through.
 *
 * It was four until ADR-0096 §8: a socket carried a hibernation attachment
 * saying whether it had spent its one frame, and there is no such thing to
 * remember now.
 */
export interface RelaySocket {
  send(message: ArrayBuffer | string): void;
  close(code?: number, reason?: string): void;
}

/**
 * Just enough of `DurableObjectState` to hold a room.
 *
 * **There is no `get` and no `put`**, and their absence is the enforcement
 * rather than a tidy-up. A room now holds an alarm and nothing else: the frame
 * tally went with the rule it enforced, and a Durable Object's storage is
 * billed in rows written, so a write per frame would turn an unbounded frame
 * count into a metered one and become the design's binding limit by a factor
 * of roughly fifty (#372 §3.5). Remembering anything again has to be a
 * deliberate edit to this interface.
 */
export interface RelayRoomState {
  getWebSockets(): RelaySocket[];
  acceptWebSocket(ws: RelaySocket): void;
  storage: {
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
 * §11.4, and now the only other bound. The same five minutes as the sender's
 * wait ceiling (§6.4) — one clock and one number, not two.
 *
 * Since ADR-0096 §8 it is also the byte bound: nothing counts what crosses, so
 * how much can cross is however much fits in five minutes.
 */
export const ROOM_LIFETIME_MS = 5 * 60 * 1000;

/**
 * The relay's one word, and the only text that ever crosses this wire.
 *
 * A party cannot send its payload until the other is present, because §5
 * forbids store-and-forward at any layer: a frame arriving alone has nowhere
 * to go and cannot be parked. Something has to say when to speak, and it
 * cannot be a frame from the peer, for the same reason — a readiness frame
 * sent into an empty room is exactly the frame that cannot be parked. So it is
 * the relay's, and the discipline that keeps it unambiguous is the split
 * below: **the relay originates text and the parties send binary.** A party's
 * text frame is therefore refused rather than dropped, since a dropped frame
 * reaches nobody and says so to no one.
 */
export const PEER_WORD = "peer";

/** A clean end: the room did its job, or a party closed its own socket. */
export const CLOSE_NORMAL = 1000;

// The refusals sit in 4000–4999, the range an application may send. The
// reserved codes a WebSocket close cannot carry (1004, 1005, 1006, 1015) are
// close enough to the meanings wanted here to be worth avoiding by policy.
//
// **4002 and 4003 are retired, not free.** They were the wire ceiling and the
// second frame, and both bounds went with ADR-0096 §8. The gap stays a gap: a
// client reads a 4000-range code as *the room chose to close*, and giving one
// of these a second meaning would make a session log from before this change
// say something it never said.
export const CLOSE_EXPIRED = 4001;
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

  /**
   * Forward one frame to the other party, and count nothing.
   *
   * **This method touches no storage, and that is a decision rather than a
   * consequence.** What was here was a read and a write of the room's frame
   * tally per frame, enforcing a rule ADR-0096 §8 withdrew; kept as a metric or
   * a debug aid it would price a first sync at a storage row per chunk.
   *
   * Nothing is remembered about a socket either, so a rejoining party arrives
   * indistinguishable from the one it replaces — which §11 already said it was.
   *
   * **A room now always runs its five minutes, and the cost is named here
   * rather than discovered on a bill.** The tally is what used to close a
   * finished meal send on its second frame, so a successful send released its
   * object at once. Nothing replaces it: a room ends on its alarm, or on one of
   * the two refusals below, and **a party leaving ends nothing** — `webSocketClose`
   * frees a slot and never reaches `closeRoom`. So a delivered meal now costs
   * one alarm invocation where it used to fire none, against two storage rows
   * saved, and an idle room bills no duration because hibernation means no
   * JavaScript is running in it.
   *
   * **Closing the room the moment it empties is refused**, rather than
   * overlooked: §11 has a dropped party reclaim its slot unidentified, so a
   * party alone in a room whose socket blipped would come back to find the room
   * gone.
   */
  async webSocketMessage(
    ws: RelaySocket,
    message: ArrayBuffer | string
  ): Promise<void> {
    // Text is the relay's own register, so a party sending it is speaking a
    // language this wire does not have.
    if (typeof message === "string") {
      return this.closeRoom(CLOSE_NOT_OPAQUE, "a party's frame is binary");
    }

    // §5 forbids store-and-forward at any layer, so a frame that arrives with
    // nobody to forward it to cannot be parked. It is refused rather than
    // dropped, for §11.5's reason rather than under its rule: a dropped frame
    // reaches nobody and says so to no one, which is the same silence a
    // truncated payload arrives as.
    const peer = this.state.getWebSockets().find((other) => other !== ws);
    if (!peer) {
      return this.closeRoom(CLOSE_NO_PEER, "nobody to forward to");
    }

    peer.send(message);
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
   * outlives one. That rule is ours and it holds, and this is where it is kept.
   *
   * **What it does not buy is a claim about records anywhere else**, which is
   * what §12 used to say here and ADR-0072's 2026-09-07 Amendment corrected: the
   * platform's own Durable Object analytics retain the object's name, one row
   * per frame, and minute-resolution timing, for an undocumented window and
   * behind no switch we hold. `worker/src/index.ts` hashes the room id before
   * naming the object for exactly that reason. A bar phrased as *no record
   * anywhere* is a disclosure claim, and a disclosure claim about a platform is
   * never met by construction.
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
