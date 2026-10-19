import { describe, expect, it } from 'vitest'
import { embedUrl, parseYouTube } from './youtube'

describe('parseYouTube', () => {
  it('parses watch, short, embed and playlist links', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' })
    expect(parseYouTube('https://youtu.be/dQw4w9WgXcQ?t=3')).toEqual({ videoId: 'dQw4w9WgXcQ' })
    expect(parseYouTube('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' })
    expect(parseYouTube('https://www.youtube.com/playlist?list=PL0123456789abcdef')).toEqual({ playlistId: 'PL0123456789abcdef' })
    expect(parseYouTube('https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefgh')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      playlistId: 'PLabcdefgh',
    })
  })
  it('rejects channels and other sites', () => {
    expect(parseYouTube('https://www.youtube.com/@MuseAsia')).toBeNull()
    expect(parseYouTube('https://www.crunchyroll.com/series/x')).toBeNull()
    expect(parseYouTube('not a url')).toBeNull()
  })
})

describe('embedUrl', () => {
  it('builds privacy-enhanced embeds with the JS API enabled', () => {
    const v = new URL(embedUrl({ videoId: 'abcdefghijk' }, 'https://x.github.io'))
    expect(v.origin).toBe('https://www.youtube-nocookie.com')
    expect(v.pathname).toBe('/embed/abcdefghijk')
    expect(v.searchParams.get('enablejsapi')).toBe('1')
    expect(v.searchParams.get('origin')).toBe('https://x.github.io')
    expect(new URL(embedUrl({ playlistId: 'PLxyz12345' }, 'o')).pathname).toBe('/embed/videoseries')
  })
})
