import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 資源一律用相對路徑引用:GitHub Pages 把網站放在 /<repo>/ 子路徑底下,
  // 絕對路徑的 /assets/... 會指到網域根目錄而載不到
  base: './',
  plugins: [react()],
})
