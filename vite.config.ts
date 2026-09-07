import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.JOURNAL_WEB_PORT || 4330),
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.JOURNAL_API_PORT || 4329}`,
      '/uploads': `http://127.0.0.1:${process.env.JOURNAL_API_PORT || 4329}`,
    },
  },
  plugins: [vinext()],
});
