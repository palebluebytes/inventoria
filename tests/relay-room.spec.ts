/// <reference types="node" />
import { test, expect } from "@playwright/test";

// **What the relay's room will carry, against the real one** (#391).
//
// `tests/unit/relay.test.ts` proves the same claim against the `Relay` class
// with fake sockets, which is where its decisions live. What it cannot reach is
// workerd: the 101 upgrade, hibernation, and the platform's own message ceiling
// are all outside the class, and ADR-0096 §8's whole argument is that a first
// sync of tens of megabytes across many frames now crosses **this** pipe.
//
// So this opens two raw sockets on the app's own origin and pushes traffic
// through, with no app protocol on top: the room's contents are opaque to the
// relay by design (ADR-0072 §2), so a spec about how much it will carry has no
// business sealing anything. `meal-relay.spec.ts` is the one that crosses a
// meal.
//
// **A fresh room per run**, drawn here rather than by `mintRoomCode`, because
// §11.1 holds at most two sockets and `fullyParallel` would otherwise have one
// run refused on a bound rather than failing on a defect.
//
// The room id crosses in the query and the Worker names the Durable Object by a
// digest of it (ADR-0072's 2026-09-07 Amendment), so both sockets landing in one
// room is also that hash being deterministic and server-side.

/** What one party in the room saw. */
interface PartySaw {
  /** Whether the relay's own word arrived, which is the room being full. */
  peered: boolean;
  /** The byte length of every frame the other party sent, in order. */
  received: number[];
  /** The close, if the room ended; `null` while it is still open. */
  closed: { code: number; reason: string } | null;
}

test.describe("one room, many frames", () => {
  // Two sockets, ~10 MB of traffic and a browser page to open them from.
  test.setTimeout(90_000);

  test("carries frame after frame, and one well past the withdrawn ceiling", async ({
    page,
  }) => {
    // Any page on the app's origin will do: the socket is built from
    // `location.href` the way `openRelaySocket` builds it, which is the whole
    // reason it must leave from here rather than from Node.
    await page.goto("/?mem=1");

    const run: PartySaw = await page.evaluate(async () => {
      const room = `spec-${crypto.randomUUID()}`;
      const url = new URL("/api/relay", location.href);
      url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
      url.searchParams.set("room", room);

      type Party = PartySaw & { socket: WebSocket };
      const watched: Party[] = [];

      const join = () =>
        new Promise<Party>((resolve, reject) => {
          const socket = new WebSocket(url);
          socket.binaryType = "arraybuffer";
          const seen: Party = {
            socket,
            peered: false,
            received: [],
            closed: null,
          };
          socket.onmessage = (event) => {
            if (typeof event.data === "string") seen.peered = true;
            else seen.received.push(event.data.byteLength);
          };
          socket.onclose = (event) => {
            seen.closed = { code: event.code, reason: event.reason };
          };
          socket.onerror = () => reject(new Error("the socket failed to open"));
          socket.onopen = () => {
            watched.push(seen);
            resolve(seen);
          };
        });

      // Polled rather than slept through, because the numbers here are large
      // enough that a fixed pause would be a guess at the runner's speed. It
      // gives up on a deadline instead, and the assertions read what arrived.
      const until = async (enough: () => boolean, ms: number) => {
        const deadline = Date.now() + ms;
        while (!enough() && Date.now() < deadline) {
          await new Promise((wake) => setTimeout(wake, 50));
        }
      };

      const first = await join();
      const second = await join();
      await until(() => first.peered && second.peered, 10_000);

      // Forty each way. ADR-0072 §11.2 allowed two in the room in total, so a
      // relay that still counted would close long before this finished.
      for (let round = 0; round < 40; round++) {
        first.socket.send(new Uint8Array(64 * 1024));
        second.socket.send(new Uint8Array(1024));
      }
      await until(() => second.received.length >= 40, 30_000);

      // Eight times ADR-0072 §11.3's withdrawn 1 MiB wire ceiling, in one
      // frame. The bound that refuses a meal is the recipient's decoded check
      // (ADR-0073 §9) and it is unmoved; nothing counts a byte here.
      first.socket.send(new Uint8Array(8 * 1024 * 1024));
      await until(() => second.received.length >= 41, 30_000);

      const result = {
        peered: first.peered && second.peered,
        received: second.received,
        closed: second.closed,
      };
      for (const seen of watched) seen.socket.close();
      return result;
    });

    // The relay's one word reached both, which is the room being full.
    expect(run.peered).toBe(true);
    // Every frame the other party sent, in order, and the big one last.
    expect(run.received).toHaveLength(41);
    expect(run.received.slice(0, 40)).toEqual(Array(40).fill(64 * 1024));
    expect(run.received.at(-1)).toBe(8 * 1024 * 1024);
    // And the room is still open: the only things that end it now are its five
    // minutes and its own refusals.
    expect(run.closed).toBeNull();
  });
});
