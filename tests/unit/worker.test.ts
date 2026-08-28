import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../../worker/src/index";

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

    const res = await worker.fetch(proxyRequest("https://example.com/huge"));

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

    const res = await worker.fetch(proxyRequest("https://example.com/page"));
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
      new Request("https://proxy.example/some/page")
    );

    expect(res.status).toBe(404);
  });

  it("404s the origin root, which the static assets own", async () => {
    const res = await worker.fetch(new Request("https://proxy.example/"));

    expect(res.status).toBe(404);
  });

  it("400s the proxy path itself when no target is given", async () => {
    const res = await worker.fetch(
      new Request("https://proxy.example/api/proxy")
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing target URL");
  });
});
