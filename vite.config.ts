import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import componentTagger from './plugins/component-tagger';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(), 
    componentTagger(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'events', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer',
      process: 'process/browser',
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    hmr: {
      overlay: false,
      timeout: 15000,
    },
    watch: {
      // Use polling instead of native file system events (more reliable for some environments)
      usePolling: true,
      // Wait 500ms before triggering a rebuild (gives time for all files to be flushed)
      interval: 500,
      // Additional delay between file change detection and reload
      binaryInterval: 500,
    },
  },
});
