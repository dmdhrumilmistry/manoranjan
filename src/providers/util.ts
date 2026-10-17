export const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

/** Strip HTML to plain text without ever inserting it into the DOM. */
export function plainText(v: unknown): string {
  const s = asArray(v as string | string[]).join('\n')
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export const yearOf = (v: unknown): number | undefined => {
  const m = String(v ?? '').match(/\b(18|19|20)\d{2}\b/)
  return m ? Number(m[0]) : undefined
}

/** log-scaled 0..1 popularity from a raw count. */
export const popularityFrom = (count: number | undefined, scale = 1e6) =>
  count ? Math.min(1, Math.log10(1 + count) / Math.log10(1 + scale)) : undefined
