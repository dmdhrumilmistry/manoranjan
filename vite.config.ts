/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Content-Security-Policy injected only into production builds (the dev
 * server needs inline scripts for HMR). This is the app's primary
 * ad/tracker shield: no third-party scripts can execute, only the
 * privacy-enhanced YouTube host may be framed, and forms/plugins are off.
 *
 * connect/img/media must stay open to https: because Jellyfin servers and
 * Audius content nodes live on user/network-chosen hosts.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "font-src 'self'",
  'frame-src https://www.youtube-nocookie.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function securityHeaders(): Plugin {
  return {
    name: 'manoranjan-security-headers',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--security-meta-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  // Relative base + HashRouter = works on any GitHub Pages path (user or project site) without config.
  base: './',
  plugins: [react(), securityHeaders()],
  // hls.js (~570 kB) is lazy-loaded only for HLS streams, so it never weighs on first load.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 600 },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
})
