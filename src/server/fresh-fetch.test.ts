import { afterEach, describe, expect, it, vi } from "vitest";
import { freshFetch } from "./container";

describe("freshFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never lets Next.js reuse an earlier answer: no-store and a signal on every call", async () => {
    const spy = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    await freshFetch("https://x.supabase.co/rest/v1/contracts?id=eq.1", { method: "GET" });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeDefined();
  });

  it("keeps a signal the caller already set", async () => {
    const spy = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", spy);
    const own = new AbortController().signal;
    await freshFetch("https://x", { signal: own });
    expect((spy.mock.calls[0][1] as RequestInit).signal).toBe(own);
  });
});
