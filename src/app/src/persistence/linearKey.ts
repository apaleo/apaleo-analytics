/** Personal Linear API key. Issue payloads are not stored under this key. */
export const LINEAR_API_KEY = 'twig.analytics.linear.apiKey'

export type LinearKeyWrite = 'saved' | 'cleared' | 'unavailable'

export function readLinearApiKey(storage: Storage | null = browserStorage()): string | null {
  if (storage === null) return null
  try {
    const value = storage.getItem(LINEAR_API_KEY)
    if (value === null) return null
    const normalized = normalizeKey(value)
    return normalized.length > 0 ? normalized : null
  } catch {
    return null
  }
}

/** Stores the trimmed key. A leading "Bearer " is removed. An empty value clears the key. */
export function writeLinearApiKey(key: string, storage: Storage | null = browserStorage()): LinearKeyWrite {
  if (storage === null) return 'unavailable'
  const normalized = normalizeKey(key)
  try {
    if (normalized.length === 0) {
      storage.removeItem(LINEAR_API_KEY)
      return 'cleared'
    }
    storage.setItem(LINEAR_API_KEY, normalized)
    return 'saved'
  } catch {
    return 'unavailable'
  }
}

export function clearLinearApiKey(storage: Storage | null = browserStorage()): void {
  if (storage === null) return
  try {
    storage.removeItem(LINEAR_API_KEY)
  } catch {
    // Private mode can reject the write. The in-memory field can still be cleared.
  }
}

function normalizeKey(key: string): string {
  return key.trim().replace(/^Bearer\s+/i, '').trim()
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}
