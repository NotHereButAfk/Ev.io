import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173
  },
  build: {
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        login:    resolve(__dirname, 'login.html'),
        register: resolve(__dirname, 'register.html'),
      },
    },
  },
});
