// localStorage/sessionStorage can throw (private mode, blocked cookies, quota),
// so every access goes through these helpers.

export function readJSON<T>(key: string, fallback: T, store: Storage | null = safeLocal()): T {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown, store: Storage | null = safeLocal()): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: we just lose the cache.
  }
}

export function remove(key: string, store: Storage | null = safeLocal()): void {
  try {
    store?.removeItem(key);
  } catch {
    // ignore
  }
}

function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
