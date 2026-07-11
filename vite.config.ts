import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // 静的ホスティング(GitHub Pages等)でも動くよう相対パスにする
  plugins: [react(), tailwindcss()],
})
