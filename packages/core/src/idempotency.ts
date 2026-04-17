export type IdempotencyStore = {
  /** Returns false if key was already processed (duplicate). */
  tryConsume(key: string): Promise<boolean>;
  /** Снять ключ (например после ошибки отправки ответа в Telegram — иначе повтор апдейта «молчит»). */
  release(key: string): Promise<void>;
};

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Set<string>();
  private readonly maxKeys: number;

  constructor(maxKeys = 50_000) {
    this.maxKeys = maxKeys;
  }

  async tryConsume(key: string): Promise<boolean> {
    if (this.seen.has(key)) {
      return false;
    }
    if (this.seen.size >= this.maxKeys) {
      this.seen.clear();
    }
    this.seen.add(key);
    return true;
  }

  async release(key: string): Promise<void> {
    this.seen.delete(key);
  }
}
