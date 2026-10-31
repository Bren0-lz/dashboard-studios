import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache.js";

describe("cache curto", () => {
  it("reaproveita dentro da validade e recarrega depois", async () => {
    let now = 0;
    const cache = new TtlCache(45_000, () => now);
    const load = vi.fn(async () => now);
    expect(await cache.get("a", load)).toBe(0);
    now = 44_000;
    expect(await cache.get("a", load)).toBe(0);
    now = 46_000;
    expect(await cache.get("a", load)).toBe(46_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("não guarda erro e limpa tudo após gravação", async () => {
    const cache = new TtlCache(45_000);
    await expect(cache.get("x", async () => Promise.reject(new Error("falhou")))).rejects.toThrow();
    await Promise.resolve();
    expect(cache.size).toBe(0);
    await cache.get("y", async () => 1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
