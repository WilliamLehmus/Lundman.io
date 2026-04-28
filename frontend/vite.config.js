import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      allow: ['..']
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
