import { describe, expect, it } from 'vitest'
import { currentSeason, youtubeOf } from './anilist'

describe('youtubeOf', () => {
  it('finds official playlist links and YouTube episodes, ignoring other sites and social links', () => {
    const r = youtubeOf({
      externalLinks: [
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/abc', type: 'STREAMING' },
        { site: 'YouTube', url: 'https://www.youtube.com/@SomeStudio', type: 'SOCIAL' },
        { site: 'YouTube', url: 'https://www.youtube.com/playlist?list=PLabcdef1234', type: 'STREAMING' },
      ],
      streamingEpisodes: [
        { title: 'Episode 1 - Start', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', site: 'YouTube' },
        { title: 'Episode 1', url: 'https://www.crunchyroll.com/watch/x', site: 'Crunchyroll' },
      ],
    })
    expect(r.main).toEqual({ playlistId: 'PLabcdef1234' })
    expect(r.episodes.map((e) => e.ref?.videoId)).toEqual(['aaaaaaaaaaa'])
  })
  it('returns nothing when there is no free release', () => {
    expect(youtubeOf({ externalLinks: [], streamingEpisodes: [] })).toEqual({ main: null, episodes: [] })
  })
})

describe('currentSeason', () => {
  it('maps months to anime seasons', () => {
    expect(currentSeason(new Date(2026, 0, 5))).toEqual({ season: 'WINTER', year: 2026 })
    expect(currentSeason(new Date(2026, 9, 19))).toEqual({ season: 'FALL', year: 2026 })
  })
})
