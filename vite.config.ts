
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Detta säkerställer att alla filer hittas oavsett undermapp på GitHub Pages
  build: {
    outDir: 'dist',
  }
});
