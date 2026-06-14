import { describe, it, expect } from "vitest";
import { checkProxyTarget } from "../../src/lib/ingestion/url-guard";

describe("checkProxyTarget (SSRF guard)", () => {
  it("allows normal public http(s) URLs", () => {
    for (const u of [
      "https://example.com/product/123",
      "http://shop.example.co.uk/item?id=9",
    ]) {
      const r = checkProxyTarget(u);
      expect(r.ok).toBe(true);
    }
  });

  it("accepts a percent-encoded target (as the proxy receives it)", () => {
    const r = checkProxyTarget(encodeURIComponent("https://example.com/a b"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.hostname).toBe("example.com");
  });

  it("rejects non-http(s) schemes", () => {
    for (const u of [
      "file:///etc/passwd",
      "gopher://example.com",
      "ftp://example.com/x",
      "data:text/html,<h1>x</h1>",
    ]) {
      expect(checkProxyTarget(u).ok).toBe(false);
    }
  });

  it("rejects loopback and localhost", () => {
    for (const u of [
      "http://localhost/admin",
      "http://127.0.0.1:8080/",
      "http://127.1.2.3/",
      "http://[::1]/",
      "http://app.localhost/",
    ]) {
      expect(checkProxyTarget(u).ok).toBe(false);
    }
  });

  it("rejects cloud metadata and private ranges", () => {
    for (const u of [
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://172.16.4.4/",
      "http://172.31.255.1/",
      "http://192.168.1.1/",
      "http://100.64.0.1/",
    ]) {
      expect(checkProxyTarget(u).ok).toBe(false);
    }
  });

  it("rejects IPv4 tunnelled inside IPv6 (mapped / compatible / NAT64)", () => {
    for (const u of [
      // IPv4-mapped, both as written and as the URL parser normalizes it.
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[0:0:0:0:0:ffff:127.0.0.1]/",
      "http://[::ffff:169.254.169.254]/", // metadata via mapped form
      "http://[::ffff:10.0.0.1]/",
      "http://[::ffff:192.168.1.1]/",
      // NAT64 64:ff9b::/96 translating to loopback / metadata.
      "http://[64:ff9b::7f00:1]/",
      "http://[64:ff9b::a9fe:a9fe]/",
    ]) {
      expect(checkProxyTarget(u).ok, u).toBe(false);
    }
  });

  it("still allows IPv4-mapped IPv6 pointing at a public address", () => {
    expect(checkProxyTarget("http://[::ffff:8.8.8.8]/").ok).toBe(true);
  });

  it("rejects internal/local TLDs", () => {
    expect(checkProxyTarget("http://db.internal/").ok).toBe(false);
    expect(checkProxyTarget("http://printer.local/").ok).toBe(false);
  });

  it("allows public ranges that merely look adjacent to private ones", () => {
    expect(checkProxyTarget("http://172.32.0.1/").ok).toBe(true); // outside /12
    expect(checkProxyTarget("http://11.0.0.1/").ok).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(checkProxyTarget("not a url").ok).toBe(false);
    expect(checkProxyTarget("").ok).toBe(false);
  });
});
