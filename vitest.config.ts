// Vitest configuration for @nanalogue/node test suite.
// Configures test timeouts and global test utilities.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
