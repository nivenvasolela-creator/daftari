import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works on GitHub Pages under /daftari/ and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
});
