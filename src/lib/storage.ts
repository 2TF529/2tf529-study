// Safe wrappers around web storage (handles SSR / privacy mode).

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function safeSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value)
  } catch {
    /* ignore quota / disabled storage */
  }
}

export const local = {
  get: (k: string) => safeGet(localStorage, k),
  set: (k: string, v: string) => safeSet(localStorage, k, v),
  getJson<T>(k: string, fallback: T): T {
    const raw = safeGet(localStorage, k)
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },
  setJson(k: string, v: unknown) {
    safeSet(localStorage, k, JSON.stringify(v))
  },
}

export const session = {
  getJson<T>(k: string, fallback: T): T {
    const raw = safeGet(sessionStorage, k)
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },
  setJson(k: string, v: unknown) {
    safeSet(sessionStorage, k, JSON.stringify(v))
  },
  remove(k: string) {
    try {
      sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}
