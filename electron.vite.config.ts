import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

// 開発中だけ CSP を緩める（security-rules.md S-04）。
// 配布物の CSP は src/renderer/index.html の meta が正で、ここでは書き換えない。
// 開発サーバーでは、Vite が差し込むスタイル（<style>）と、開発サーバーとの WebSocket が要るため、その分だけ足す。
// React の即時反映のインラインのスクリプトは CSP の meta より前に差し込まれるため、script-src は緩めない。
const CSP_META = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/

function relaxCspInDev(): Plugin {
  return {
    name: 'github-inbox:relax-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!CSP_META.test(html)) {
        throw new Error('index.html に CSP の meta が見つからない（security-rules.md S-04）')
      }
      return html.replace(CSP_META, (_all, head: string, policy: string, tail: string) => {
        const relaxed = policy
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
          .replace("connect-src 'none'", "connect-src 'self' ws://localhost:*")
        return `${head}${relaxed}${tail}`
      })
    },
  }
}

export default defineConfig({
  main: {},
  preload: {
    // sandbox: true（S-03）の preload は node_modules を読めないため、使う部品を1つのファイルにまとめる
    build: { externalizeDeps: false },
  },
  renderer: {
    plugins: [react(), relaxCspInDev()],
  },
})
