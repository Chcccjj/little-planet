import { defineConfig } from 'vite'

// Relative base so the build can be hosted on a subpath later (PR 5).
export default defineConfig({
  base: './',
  build: {
    // three's own tree-shaken chunk is ~530 kB minified (~132 kB gzip).
    // The app chunk is separate; this only raises the limit past that vendor file.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Keep three in its own chunk so the app chunk stays small and the
        // default 500 kB warning is not tripped by the renderer.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
})
