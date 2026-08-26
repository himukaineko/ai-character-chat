import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  base: './', // 静的ホスティング(GitHub Pages等)でも動くよう相対パスにする
  plugins: [react(), tailwindcss()],
  // 機能追加(アプリ名・バージョン表示): package.jsonのversionをビルド時に埋め込む。
  // アプリ側で手書きせずここから配ることで、バージョンの二重管理を防ぐ
  // (実際の参照は src/lib/appInfo.ts 経由で行う)。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
