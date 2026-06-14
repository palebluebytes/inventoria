import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../../worker/src/index";

const MB = 1024 * 1024;

/** A Response whose body streams `chunks` with no content-length header. */
function streamingResponse(chunks: Uint8Array[], contentType: string): Response {
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
  new Request(`https://proxy.example/?url=${encodeURIComponent(target)}`);

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
