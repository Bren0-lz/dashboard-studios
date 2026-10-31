/** Cache curto (30–60 s) das leituras do CRM; qualquer gravação limpa tudo. */
export class TtlCache {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return load();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
    value.catch(() => this.entries.delete(key));
    return value;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
