/**
 * A whole send, end to end (ADR-0072 §5, §6 and §7).
 *
 * **Against the real Relay, not a stand-in for it.** Two clients sit on either
 * side of the same `Relay` object that ships to the edge, joined through the
 * fake sockets in `support/relay-room.ts`, so what these tests exercise is the
 * protocol both halves actually speak: the peer word, one sealed frame each
 * way, the room closing itself after two, and the close codes. A hand-written
 * fake relay would only prove the two clients agree with the fake.
 *
 * What the fake cannot reach is the 101 upgrade and the platform's own
 * hibernation, which is why `relay.test.ts` records a workerd run beside it.
 */
import { describe, it, expect } from "vitest";
import {
  Relay,
  CLOSE_NORMAL as RELAY_CLOSE_NORMAL,
  CLOSE_EXPIRED as RELAY_CLOSE_EXPIRED,
  CLOSE_NOT_OPAQUE,
  CLOSE_OVER_CEILING,
  CLOSE_SECOND_FRAME,
  CLOSE_NO_PEER,
  MAX_SOCKETS_PER_ROOM,
  PEER_WORD as RELAY_PEER_WORD,
  ROOM_LIFETIME_MS as RELAY_ROOM_LIFETIME_MS,
} from "../../worker/src/relay";
import worker, { type WorkerEnv } from "../../worker/src/index";
import { fakeRoom, fakeSocket, type FakeSocket } from "./support/relay-room";
import { row } from "./support/ledger-rows";
import { buildMealPayload } from "../../src/lib/p2p/meal-payload";
import {
  MealPayloadRefusedError,
  decodeMealPayload,
} from "../../src/lib/p2p/meal-reader";
import {
  CLOSE_EXPIRED,
  CLOSE_NORMAL,
  FIRST_REFUSAL_CLOSE,
  PEER_WORD,
  RELAY_PATH,
  RELAY_ROOM_PARAM,
  ROOM_LIFETIME_MS,
} from "../../src/lib/p2p/relay-wire";
import {
  isSendCodeSpent,
  mintSendCode,
  SendCodeSpentError,
  type SendCode,
} from "../../src/lib/p2p/send-code";
import { openSealedFrame } from "../../src/lib/p2p/sealed-frame";
import {
  DELIVERED_WORD,
  REJOIN_PAUSE_MS,
  SendFailedError,
  receiveMealPayload,
  sendMealPayload,
  type RelayDial,
  type RelayLinkHandlers,
} from "../../src/lib/p2p/meal-send";

// ---------------------------------------------------------------------------
// One Relay, in this process, with two clients allowed to dial it
// ---------------------------------------------------------------------------

/** The bytes of a frame, copied out of whatever view they arrived in. */
const asArrayBuffer = (frame: Uint8Array): ArrayBuffer =>
  frame.buffer.slice(
    frame.byteOffset,
    frame.byteOffset + frame.byteLength
  ) as ArrayBuffer;

/** What a browser reports when a socket goes away without a close frame. */
const ABNORMAL_CLOSE = 1006;

function localRelay() {
  const room = fakeRoom();
  const relay = new Relay(room.state);
  const joined: { server: FakeSocket; handlers: RelayLinkHandlers }[] = [];
  /** Every frame the relay forwarded: exactly what crossed it, in order. */
  const carried: Uint8Array[] = [];
  /** Anything the room threw while forwarding, which should stay empty. */
  const failures: unknown[] = [];

  const dial: RelayDial = async (_room, handlers) => {
    // §11.1: a third socket is refused, never queued, and a browser sees that
    // as a socket that would not open.
    if (room.state.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      throw new Error("the room already holds two sockets");
    }
    const server = fakeSocket({
      sent: (message) => {
        if (typeof message !== "string") carried.push(new Uint8Array(message));
        handlers.message(message);
      },
      closed: (code) => handlers.closed(code),
    });
    joined.push({ server, handlers });
    await relay.join(server);
    return {
      send: (frame) => {
        void relay
          .webSocketMessage(server, asArrayBuffer(frame))
          .catch((error) => failures.push(error));
      },
      close: () => {
        server.close(RELAY_CLOSE_NORMAL, "the party left");
        void relay
          .webSocketClose(server)
          .catch((error) => failures.push(error));
      },
    };
  };

  return {
    dial,
    relay,
    room,
    carried,
    failures,
    joined,
    /**
     * The transport losing a socket, which is not a party leaving.
     *
     * 1006 is what a browser reports for a connection that went away without a
     * close frame — the one code an endpoint cannot itself send, and the reason
     * the client reads the code at all.
     */
    drop: (which = joined.length - 1) => {
      const { server } = joined[which];
      server.close(ABNORMAL_CLOSE, "the transport dropped it");
      void relay.webSocketClose(server).catch((error) => failures.push(error));
    },
  };
}

// ---------------------------------------------------------------------------
// One meal to send
// ---------------------------------------------------------------------------

const oneFoodMeal = () => [
  row("event:consume_a", "event/type", "ConsumeAction"),
  row("event:consume_a", "event/target", "fdc:1"),
  row("fdc:1", "food/name", "Kale, raw"),
];

const aMeal = () =>
  buildMealPayload(["event:consume_a"], async (entities) =>
    oneFoodMeal().filter((r) => entities.includes(r.entity))
  );

const wordIn = async (code: SendCode, frame: Uint8Array) =>
  new TextDecoder().decode(await openSealedFrame(code, frame));

/**
 * Lets whatever a session started reach the room before a test looks at it.
 *
 * Several turns rather than one: sealing a payload is real WebCrypto over a
 * real DEFLATE stream, and neither lands in a single tick.
 */
const settle = async () => {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise((done) => setTimeout(done, 1));
  }
};

const failure = async (send: Promise<unknown>): Promise<SendFailedError> => {
  try {
    await send;
  } catch (error) {
    if (error instanceof SendFailedError) return error;
    throw error;
  }
  throw new Error("the send did not fail");
};

/** A deadline a test can wait out, standing in for the room's five minutes. */
const A_MOMENT_MS = 20;

// ---------------------------------------------------------------------------

describe("a meal crosses, and the relay cannot read it", () => {
  it("lands the meal on the other device", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const receiving = receiveMealPayload(code, { dial: relay.dial });
    await sendMealPayload(code, await aMeal(), { dial: relay.dial });
    const received = await receiving;

    expect(received.roots).toEqual(["event:consume_a"]);
    expect(received.rows.map((r) => `${r.entity} ${r.attribute}`)).toEqual([
      "event:consume_a event/type",
      "event:consume_a event/target",
      "fdc:1 food/name",
    ]);
    expect(relay.failures).toEqual([]);
  });

  it("forwards ciphertext, which only the code opens", async () => {
    const relay = localRelay();
    const code = mintSendCode();
    const ndjson = await aMeal();

    const receiving = receiveMealPayload(code, { dial: relay.dial });
    await sendMealPayload(code, ndjson, { dial: relay.dial });
    await receiving;

    const [payload] = relay.carried;
    expect(new TextDecoder().decode(payload)).not.toContain("inventoria-meal");
    // Not merely compressed: the wire bytes are not a payload to anyone but the
    // holder of the code, and the seal is what makes that true rather than TLS.
    await expect(decodeMealPayload(payload)).rejects.toThrow(
      MealPayloadRefusedError
    );
    expect(await decodeMealPayload(await openSealedFrame(code, payload))).toBe(
      ndjson
    );
  });

  it("crosses in one frame each way, and the reverse one says delivered", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const receiving = receiveMealPayload(code, { dial: relay.dial });
    await sendMealPayload(code, await aMeal(), { dial: relay.dial });
    await receiving;

    expect(relay.carried).toHaveLength(2);
    // §7: delivery, and never acceptance. There is no accept signal on this
    // wire, and this is the whole of what the reverse frame carries.
    expect(await wordIn(code, relay.carried[1])).toBe(DELIVERED_WORD);
  });

  it("leaves the room closed behind it, rather than reopening one", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const receiving = receiveMealPayload(code, { dial: relay.dial });
    await sendMealPayload(code, await aMeal(), { dial: relay.dial });
    await receiving;
    await settle();

    // The relay closes a room after two frames, and neither party rejoins it:
    // a room that ended is not a socket that dropped, and redialling a spent id
    // would open a fresh five-minute room on the edge after every send.
    expect(relay.joined).toHaveLength(2);
    expect(relay.room.state.getWebSockets()).toEqual([]);
  });
});

describe("what burns a code", () => {
  it("burns on one successful delivery, and there is no second send", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const receiving = receiveMealPayload(code, { dial: relay.dial });
    await sendMealPayload(code, await aMeal(), { dial: relay.dial });
    await receiving;

    expect(isSendCodeSpent(code)).toBe(true);
    await expect(
      sendMealPayload(code, await aMeal(), { dial: localRelay().dial })
    ).rejects.toThrow(SendCodeSpentError);
    await expect(
      receiveMealPayload(code, { dial: localRelay().dial })
    ).rejects.toThrow(SendCodeSpentError);
  });

  it("burns on a refusal, and tells the sender it did not land", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const receiving = receiveMealPayload(code, { dial: relay.dial });
    const sending = sendMealPayload(code, "not a meal payload\n", {
      dial: relay.dial,
    });

    // The refusal is judged where the bytes arrive, before anything is shown.
    await expect(receiving).rejects.toThrow(MealPayloadRefusedError);
    // The sender learns that it did not land, and never why: a reason here
    // would be a hostile peer writing on the sender's screen.
    expect((await failure(sending)).failure).toBe("refused");
    expect((await failure(sending)).message).not.toContain("payload");
    expect(isSendCodeSpent(code)).toBe(true);
  });

  it("burns when the sender cancels while waiting", async () => {
    const relay = localRelay();
    const code = mintSendCode();
    const cancelling = new AbortController();

    const sending = sendMealPayload(code, await aMeal(), {
      dial: relay.dial,
      signal: cancelling.signal,
    });
    await settle();
    cancelling.abort();

    expect((await failure(sending)).failure).toBe("cancelled");
    expect(isSendCodeSpent(code)).toBe(true);
    expect(relay.room.state.getWebSockets()).toEqual([]);
  });

  it("burns when the sender cancels before the payload is even sealed", async () => {
    const relay = localRelay();
    const code = mintSendCode();
    const cancelling = new AbortController();
    cancelling.abort();

    const sending = sendMealPayload(code, await aMeal(), {
      dial: relay.dial,
      signal: cancelling.signal,
    });

    expect((await failure(sending)).failure).toBe("cancelled");
    expect(isSendCodeSpent(code)).toBe(true);
  });

  it("burns when the room's five minutes are up", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    // The deadline is a parameter so this test does not wait one out. The
    // number itself is pinned against the relay's below.
    const sending = sendMealPayload(code, await aMeal(), {
      dial: relay.dial,
      lifetimeMs: A_MOMENT_MS,
    });

    expect((await failure(sending)).failure).toBe("expired");
    expect(isSendCodeSpent(code)).toBe(true);
  });

  it("does not burn when the transport drops and the socket comes back", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const sending = sendMealPayload(code, await aMeal(), { dial: relay.dial });
    await settle();
    relay.drop();
    await settle();

    // §6: a reconnect within a live session is not a use of the code, so the
    // sender is still in the room and the code is still good.
    expect(isSendCodeSpent(code)).toBe(false);
    expect(relay.room.state.getWebSockets()).toHaveLength(1);

    const receiving = receiveMealPayload(code, { dial: relay.dial });

    await expect(sending).resolves.toBeUndefined();
    expect((await receiving).roots).toEqual(["event:consume_a"]);
  });

  it("burns when the relay's own five minutes run out, without waiting for its own", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    // A deadline this side will not reach, so what ends the session is the
    // room's alarm rather than the client's backstop.
    const sending = sendMealPayload(code, await aMeal(), {
      dial: relay.dial,
      lifetimeMs: 60_000,
    });
    await settle();
    await relay.relay.alarm();

    expect((await failure(sending)).failure).toBe("expired");
    expect(isSendCodeSpent(code)).toBe(true);
  });

  it("burns when the room closes under one of the relay's own bounds", async () => {
    const relay = localRelay();
    const code = mintSendCode();

    const sending = sendMealPayload(code, await aMeal(), {
      dial: relay.dial,
      lifetimeMs: 60_000,
    });
    await settle();
    // Text is the relay's own register, so a party speaking it closes the room
    // (4004). The sender is told at once rather than waiting out a deadline,
    // and it is not told the room merely timed out.
    await relay.relay.webSocketMessage(relay.joined[0].server, "hello");

    const told = await failure(sending);
    expect(told.failure).toBe("closed");
    expect(told.message).toContain(`${CLOSE_NOT_OPAQUE}`);
    expect(isSendCodeSpent(code)).toBe(true);
  });

  it("does not burn when a recipient gives up waiting, since nothing arrived", async () => {
    const relay = localRelay();
    const code = mintSendCode();
    const leaving = new AbortController();

    const receiving = receiveMealPayload(code, {
      dial: relay.dial,
      signal: leaving.signal,
    });
    await settle();
    leaving.abort();

    expect((await failure(receiving)).failure).toBe("cancelled");
    // §6.3 is the sender cancelling. The sender is still holding a live code.
    expect(isSendCodeSpent(code)).toBe(false);
  });

  it("does not burn when the relay cannot be reached, since nothing crossed", async () => {
    const code = mintSendCode();

    const sending = sendMealPayload(code, await aMeal(), {
      dial: async () => {
        throw new Error("no route to the relay");
      },
    });

    // ADR-0072 §14: the surface steps down to the file export, and the code is
    // still good — an unreachable relay is not one of §6's four conditions.
    expect((await failure(sending)).failure).toBe("unavailable");
    expect(isSendCodeSpent(code)).toBe(false);
  });

  it("stops dialling once the first dial has failed, rather than forever", async () => {
    const code = mintSendCode();
    let dials = 0;

    const sending = sendMealPayload(code, await aMeal(), {
      // What a browser does with an upgrade that never opened: it rejects, and
      // then reports an abnormal close in a later task. §6 says a lost
      // transport is not a use of the code, so a close mid-session is
      // rejoined — but this session has no middle, and the deadline that would
      // have bounded a rejoin is cleared with the failure.
      dial: async (_room, handlers) => {
        dials += 1;
        setTimeout(() => handlers.closed(ABNORMAL_CLOSE), 0);
        throw new Error("no route to the relay");
      },
    });

    expect((await failure(sending)).failure).toBe("unavailable");
    await new Promise((wake) => setTimeout(wake, REJOIN_PAUSE_MS * 2));
    expect(dials).toBe(1);
  });

  it("rejoins at one loop's pace, however many closes it is told about", async () => {
    const code = mintSendCode();
    const relay = localRelay();
    let dials = 0;

    // The room answers once and then never again, reporting an abnormal close
    // on every attempt. Each of those lands where a rejoin is started, so an
    // unguarded loop would leave a second behind on every failure and dial in
    // doubling numbers rather than once a second.
    const dial: RelayDial = async (roomId, handlers) => {
      dials += 1;
      if (dials > 1) {
        setTimeout(() => handlers.closed(ABNORMAL_CLOSE), 0);
        throw new Error("the relay went away");
      }
      const link = await relay.dial(roomId, handlers);
      setTimeout(() => handlers.closed(ABNORMAL_CLOSE), 0);
      return link;
    };

    const receiving = receiveMealPayload(code, {
      dial,
      lifetimeMs: REJOIN_PAUSE_MS * 3,
    });

    expect((await failure(receiving)).failure).toBe("expired");
    // Three pauses, so a loop that runs once gets a handful of attempts. A
    // doubling one passes fifty before the deadline.
    expect(dials).toBeLessThan(10);
  });
});

describe("the wire the client speaks is the relay's own", () => {
  it("says the same word and counts the same five minutes", () => {
    expect(PEER_WORD).toBe(RELAY_PEER_WORD);
    expect(ROOM_LIFETIME_MS).toBe(RELAY_ROOM_LIFETIME_MS);
  });

  it("reads the same close codes the relay writes", () => {
    expect(CLOSE_NORMAL).toBe(RELAY_CLOSE_NORMAL);
    expect(CLOSE_EXPIRED).toBe(RELAY_CLOSE_EXPIRED);
    // Every refusal the relay can send is one the client counts as the room
    // ending, or it would rejoin a room that is gone.
    for (const refusal of [
      RELAY_CLOSE_EXPIRED,
      CLOSE_OVER_CEILING,
      CLOSE_SECOND_FRAME,
      CLOSE_NOT_OPAQUE,
      CLOSE_NO_PEER,
    ]) {
      expect(refusal).toBeGreaterThanOrEqual(FIRST_REFUSAL_CLOSE);
    }
  });

  it("addresses the room the code names, through the deployed route", async () => {
    const code = mintSendCode();
    const url = new URL(RELAY_PATH, "https://inventoria.example");
    url.searchParams.set(RELAY_ROOM_PARAM, code.room);
    const rooms: string[] = [];
    const env: WorkerEnv = {
      RELAY: {
        idFromName: (name) => {
          rooms.push(name);
          return { toString: () => name };
        },
        get: () => ({ fetch: async () => new Response("upgraded") }),
      },
    };

    await worker.fetch(new Request(url, { headers: { Upgrade: "ws" } }), env);

    expect(rooms).toEqual([code.room]);
  });
});
