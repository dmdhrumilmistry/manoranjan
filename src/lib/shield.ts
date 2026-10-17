/**
 * Runtime "shield" layered on top of the build-time CSP:
 *  - blocks programmatic popups/pop-unders (the main ad vector on streaming
 *    sites). The app itself never calls window.open — outbound links are
 *    plain <a target="_blank">.
 *  - forces every external link to open without opener or referrer.
 */
let blocked = 0
export const blockedCount = () => blocked

export function installShield(): void {
  window.open = (url?: string | URL) => {
    blocked++
    console.info('[shield] blocked popup', url ? String(url) : '')
    return null
  }

  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.origin === location.origin) return
      a.rel = 'noopener noreferrer nofollow'
      a.referrerPolicy = 'no-referrer'
      a.target = '_blank'
    },
    true,
  )
}
