import { describe, expect, it } from 'vitest'
import { guessLang, toVtt } from './subtitles'

describe('toVtt', () => {
  it('converts SRT timestamps and adds header', () => {
    const srt = '﻿1\r\n00:00:01,500 --> 00:00:03,000\r\n{\\an8}Hello\r\n'
    expect(toVtt(srt)).toBe('WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nHello\n')
  })
  it('leaves VTT untouched', () => {
    expect(toVtt('WEBVTT\n\n00:01.000 --> 00:02.000\nHi')).toBe('WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n')
  })
})

describe('guessLang', () => {
  it('detects common language tags', () => {
    expect(guessLang('Movie.en.srt')).toEqual({ lang: 'en', label: 'English' })
    expect(guessLang('movie_hindi.vtt').lang).toBe('hi')
    expect(guessLang('Movie.srt')).toEqual({ lang: 'und', label: 'Movie' })
  })
})
