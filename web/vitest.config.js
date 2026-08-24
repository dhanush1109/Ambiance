import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest does NOT merge vite.config.js when a vitest.config.js exists, so the
// React plugin is declared here too - component tests elsewhere in src/ need it.
// The default environment is jsdom so any test can touch the DOM; the protocol
// tests are pure and are unaffected by it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Closes jsdom's missing-media-stack gap. Guarded inside the file, so the
    // pure protocol suites load it harmlessly.
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    globals: false,
    restoreMocks: true,
    reporters: ['default'],
  },
});
