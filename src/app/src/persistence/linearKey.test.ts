import { describe, expect, it } from 'vitest'
import { PREFERENCES_KEY } from './preferences.ts'
import { LINEAR_API_KEY, clearLinearApiKey, readLinearApiKey, writeLinearApiKey } from './linearKey.ts'

describe('Linear API key storage', () => {
  it('saves a trimmed key without a Bearer prefix and leaves preferences untouched', () => {
    const storage = memoryStorage()
    storage.setItem(PREFERENCES_KEY, '{"theme":"dark"}')

    expect(writeLinearApiKey('  Bearer lin_api_abc  ', storage)).toBe('saved')
    expect(readLinearApiKey(storage)).toBe('lin_api_abc')
    expect(storage.getItem(PREFERENCES_KEY)).toBe('{"theme":"dark"}')
    expect(storage.getItem(LINEAR_API_KEY)).toBe('lin_api_abc')

    expect(writeLinearApiKey('   ', storage)).toBe('cleared')
    expect(readLinearApiKey(storage)).toBeNull()

    writeLinearApiKey('lin_api_xyz', storage)
    clearLinearApiKey(storage)
    expect(readLinearApiKey(storage)).toBeNull()
    expect(storage.getItem(PREFERENCES_KEY)).toBe('{"theme":"dark"}')
  })

  it('returns null when nothing is stored', () => {
    expect(readLinearApiKey(memoryStorage())).toBeNull()
  })
})

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}
