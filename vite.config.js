import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/aura-lite/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: ['canvg', 'html2canvas', 'dompurify'],
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/storage'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  }
})
