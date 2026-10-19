import { describe, expect, it } from 'vitest'
import { preferredIndex } from './playerPrefs'

describe('preferredIndex', () => {
  it('matches exact and by resolution', () => {
    expect(preferredIndex(['Original', '1080p', '720p'], '720p')).toBe(2)
    expect(preferredIndex(['HD 720p', 'Standard 480p'], '720p')).toBe(0)
    expect(preferredIndex(['Original', '480p'], 'Original')).toBe(0)
  })
  it('falls back to the first source', () => {
    expect(preferredIndex(['a', 'b'], '4320p')).toBe(0)
    expect(preferredIndex(['a', 'b'], null)).toBe(0)
  })
})
