/** localStorage 안전 래퍼. 저장소가 막히거나 가득 차도 앱이 멈추지 않는다. */
export interface SafeStorage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
  readonly available: boolean;
  readonly lastError: string | null;
}

export function createStorage(prefix: string): SafeStorage {
  let available = false;
  let lastError: string | null = null;
  const memory = new Map<string, string>();
  try {
    const probe = `${prefix}__probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    available = true;
  } catch (err) {
    lastError = (err as Error).message;
  }
  return {
    get available() {
      return available;
    },
    get lastError() {
      return lastError;
    },
    get<T>(key: string, fallback: T): T {
      const k = prefix + key;
      try {
        const raw = available ? window.localStorage.getItem(k) : memory.get(k) ?? null;
        if (raw == null) return fallback;
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown): boolean {
      const k = prefix + key;
      const raw = JSON.stringify(value);
      memory.set(k, raw);
      if (!available) return false;
      try {
        window.localStorage.setItem(k, raw);
        return true;
      } catch (err) {
        lastError = (err as Error).message;
        available = false; // 가득 찬 경우: 이후에는 메모리로만 동작
        return false;
      }
    },
    remove(key: string): void {
      const k = prefix + key;
      memory.delete(k);
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* 무시 */
      }
    },
  };
}
