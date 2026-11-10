import { describe, expect, it, vi } from "vitest";
import { MAX_ACTIVE_KEYS, PortalError, addEndpointFor, createKeyFor, overviewFor, removeEndpointFor, revokeKeyFor } from "./developer-portal";
import { MemoryPlatformRepository, hashKey } from "./platform";

const fresh = () => new MemoryPlatformRepository();

describe("developer portal", () => {
  it("makes keys that share one platform id and differ by mode", async () => {
    const p = fresh();
    const a = await createKeyFor(p, "u1", "Acme test", "test");
    const b = await createKeyFor(p, "u1", "Acme live", "live");
    expect(a.record.platformId).toBe(b.record.platformId);
    expect(a.secret.startsWith("tlk_test_")).toBe(true);
    expect(b.secret.startsWith("tlk_live_")).toBe(true);
    expect(await p.findKeyByHash(hashKey(a.secret))).toBeTruthy();
  });

  it("gives different people different platforms and hides keys from others", async () => {
    const p = fresh();
    await createKeyFor(p, "u1", "one", "test");
    const other = await createKeyFor(p, "u2", "two", "test");
    expect((await overviewFor(p, "u1")).keys).toHaveLength(1);
    await expect(revokeKeyFor(p, "u1", other.record.id)).rejects.toBeInstanceOf(PortalError);
  });

  it("caps active keys and lets a revoke free a slot", async () => {
    const p = fresh();
    const made = [];
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) made.push(await createKeyFor(p, "u1", `k${i}`, "test"));
    await expect(createKeyFor(p, "u1", "extra", "test")).rejects.toThrow(/up to 5/);
    await revokeKeyFor(p, "u1", made[0]!.record.id);
    await expect(createKeyFor(p, "u1", "extra", "test")).resolves.toBeTruthy();
    expect((await p.findKeyByHash(hashKey(made[0]!.secret)))?.revokedAt).toBeTruthy();
  });

  it("rejects bad labels and modes", async () => {
    const p = fresh();
    await expect(createKeyFor(p, "u1", "  ", "test")).rejects.toBeInstanceOf(PortalError);
    await expect(createKeyFor(p, "u1", "x".repeat(81), "test")).rejects.toBeInstanceOf(PortalError);
    await expect(createKeyFor(p, "u1", "ok", "prod" as never)).rejects.toBeInstanceOf(PortalError);
  });

  it("needs a key before a webhook, then scopes endpoints to the owner and mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const p = fresh();
      await expect(addEndpointFor(p, "u1", "https://example.com/hook", "test")).rejects.toThrow(/key first/);
      await createKeyFor(p, "u1", "a", "test");
      await createKeyFor(p, "u2", "b", "test");
      const e = await addEndpointFor(p, "u1", "https://example.com/hook", "test");
      const view = await overviewFor(p, "u1");
      expect(view.endpoints).toHaveLength(1);
      expect(view.endpoints[0]).not.toHaveProperty("secret");
      expect((await overviewFor(p, "u2")).endpoints).toHaveLength(0);
      await expect(removeEndpointFor(p, "u2", e.id)).rejects.toBeInstanceOf(PortalError);
      await removeEndpointFor(p, "u1", e.id);
      expect((await overviewFor(p, "u1")).endpoints).toHaveLength(0);
      await expect(addEndpointFor(p, "u1", "http://example.com/hook", "test")).rejects.toBeInstanceOf(PortalError);
      await expect(addEndpointFor(p, "u1", "https://127.0.0.1/hook", "test")).rejects.toBeInstanceOf(PortalError);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
