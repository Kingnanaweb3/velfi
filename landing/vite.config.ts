import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { en } from './src/i18n/en'
import { zh } from './src/i18n/zh'
import { ko } from './src/i18n/ko'

// velfi.xyz/zh and velfi.xyz/ko get their own copy of index.html with the page
// language, title and link-preview text already in that language, because X,
// Telegram and search engines read the HTML before any script runs.
function languagePages(): Plugin {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  let outDir = 'dist'
  return {
    name: 'velfi-language-pages',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    writeBundle() {
      const base = readFileSync(join(outDir, 'index.html'), 'utf8')
      for (const [code, html, d] of [['zh', 'zh-CN', zh], ['ko', 'ko', ko]] as const) {
        let page = base
          .replace('<html lang="en">', `<html lang="${html}">`)
          .replaceAll(esc(en.metaTitle), esc(d.metaTitle))
          .replaceAll(en.metaTitle, esc(d.metaTitle))
          .replaceAll(esc(en.metaDesc), esc(d.metaDesc))
          .replaceAll(en.metaDesc, esc(d.metaDesc))
          .replace('content="https://velfi.xyz/"', `content="https://velfi.xyz/${code}"`)
        page = page.replace('<meta property="og:site_name"', `<meta property="og:locale" content="${html.replace('-', '_')}" />\n    <meta property="og:site_name"`)
        if (!page.includes(`lang="${html}"`) || !page.includes(esc(d.metaTitle))) throw new Error(`language page ${code}: replacements failed`)
        mkdirSync(join(outDir, code), { recursive: true })
        writeFileSync(join(outDir, code, 'index.html'), page)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), languagePages()],
})
