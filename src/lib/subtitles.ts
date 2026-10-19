/**
 * Subtitle helpers. Browsers only render WebVTT, so SRT (the most common
 * format for downloaded subtitles) is converted on the fly. Tracks are always
 * served from blob: URLs, which keeps them same-origin and avoids needing CORS
 * on the video element itself.
 */

export function toVtt(input: string): string {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (/^WEBVTT/.test(text)) return text + '\n'
  const body = text
    // 00:01:02,345 → 00:01:02.345
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2')
    // Strip SSA-style override tags some SRT files carry: {\an8}
    .replace(/\{\\[^}]*\}/g, '')
  return `WEBVTT\n\n${body}\n`
}

export const isSubtitleFile = (name: string) => /\.(srt|vtt)$/i.test(name)

/** Best-effort language guess from a file name like "Movie.en.srt" or "movie_english.vtt". */
export function guessLang(name: string): { lang: string; label: string } {
  const n = name.toLowerCase()
  const table: [RegExp, string, string][] = [
    [/(^|[._\s-])(en|eng|english)([._\s-]|$)/, 'en', 'English'],
    [/(^|[._\s-])(hi|hin|hindi)([._\s-]|$)/, 'hi', 'Hindi'],
    [/(^|[._\s-])(es|spa|spanish)([._\s-]|$)/, 'es', 'Spanish'],
    [/(^|[._\s-])(fr|fre|fra|french)([._\s-]|$)/, 'fr', 'French'],
    [/(^|[._\s-])(de|ger|deu|german)([._\s-]|$)/, 'de', 'German'],
    [/(^|[._\s-])(ja|jpn|japanese)([._\s-]|$)/, 'ja', 'Japanese'],
    [/(^|[._\s-])(pt|por|portuguese)([._\s-]|$)/, 'pt', 'Portuguese'],
    [/(^|[._\s-])(it|ita|italian)([._\s-]|$)/, 'it', 'Italian'],
  ]
  for (const [re, lang, label] of table) if (re.test(n)) return { lang, label }
  return { lang: 'und', label: name.replace(/\.(srt|vtt)$/i, '') }
}

export async function fetchAsVttBlob(src: string): Promise<string> {
  const res = await fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error(`Subtitle HTTP ${res.status}`)
  return vttBlobUrl(await res.text())
}

export const vttBlobUrl = (text: string) => URL.createObjectURL(new Blob([toVtt(text)], { type: 'text/vtt' }))
