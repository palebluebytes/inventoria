import { describe, it, expect, vi, afterEach } from "vitest";
import worker, { type WorkerEnv } from "../../worker/src/index";

const MB = 1024 * 1024;

/** A Response whose body streams `chunks` with no content-length header. */
function streamingResponse(
  chunks: Uint8Array[],
  contentType: string
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

/**
 * The bindings the script is deployed with. A proxy request never touches the
 * relay namespace; a relay request never gets past it, since the fake answers
 * every room with the same sentinel and records which one it was asked for.
 */
function fakeEnv() {
  const rooms: string[] = [];
  const socket = new Response("upgraded");
  const env: WorkerEnv = {
    RELAY: {
      idFromName: (name) => {
        rooms.push(name);
        return { toString: () => name };
      },
      get: () => ({ fetch: async () => socket }),
    },
  };
  return { env, rooms, socket };
}

const proxyRequest = (target: string) =>
  new Request(
    `https://proxy.example/api/proxy?url=${encodeURIComponent(target)}`
  );

describe("worker proxy size cap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a chunked body that exceeds 5MB even without content-length", async () => {
    const chunks = Array.from({ length: 6 }, () => new Uint8Array(MB));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse(chunks, "text/html"))
    );

    const res = await worker.fetch(
      proxyRequest("https://example.com/huge"),
      fakeEnv().env
    );

    expect(res.status).toBe(413);
  });

  it("cleans and returns an in-budget html body", async () => {
    const body = new TextEncoder().encode(
      "<script>evil()</script><h1>kept</h1>"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamingResponse([body], "text/html"))
    );

    const res = await worker.fetch(
      proxyRequest("https://example.com/page"),
      fakeEnv().env
    );
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain("kept");
    expect(text).not.toContain("evil()");
  });
});

// The Worker shares an origin with the static site, so the path is what tells a
// scrape apart from a page load. These two statuses are also how you tell a
// deployed proxy from an absent one from outside: an origin with no Worker
// 404s `/api/proxy`, while a live one answers 400 because the target is what is
// missing, not the route.
describe("worker routing", () => {
  it("404s a path that is not the proxy", async () => {
    const res = await worker.fetch(
      new Request("https://proxy.example/some/page"),
      fakeEnv().env
    );

    expect(res.status).toBe(404);
  });

  it("404s the origin root, which the static assets own", async () => {
    const res = await worker.fetch(
      new Request("https://proxy.example/"),
      fakeEnv().env
    );

    expect(res.status).toBe(404);
  });

  it("400s the proxy path itself when no target is given", async () => {
    const res = await worker.fetch(
      new Request("https://proxy.example/api/proxy"),
      fakeEnv().env
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing target URL");
  });
});

// ADR-0072 §9: the relay is a second route on the same script, so the path is
// again what tells one job from the other. What the route decides is small —
// which room, and whether it was named at all — because §10 puts the minting
// on the client and leaves the relay nothing to validate.
describe("relay routing", () => {
  const relayRequest = (query: string) =>
    new Request(`https://proxy.example/api/relay${query}`, {
      headers: { Upgrade: "websocket" },
    });

  it("400s the relay path when no room is named", async () => {
    const res = await worker.fetch(relayRequest(""), fakeEnv().env);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing room id");
  });

  it("hands the socket to the room the send code names", async () => {
    const { env, rooms, socket } = fakeEnv();

    const res = await worker.fetch(relayRequest("?room=Ck9x2p"), env);

    expect(rooms).toEqual(["Ck9x2p"]);
    expect(res).toBe(socket);
  });

  it("accepts any room id it is handed, since guessing one buys only a socket", async () => {
    const { env, rooms } = fakeEnv();

    await worker.fetch(relayRequest("?room=a"), env);

    expect(rooms).toEqual(["a"]);
  });
});
