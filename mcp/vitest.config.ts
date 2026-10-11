import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Contracts are imported as source from the server's vendored shared (see tsconfig paths).
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared/index.ts'),
      // The shared source imports 'zod'; pin it to this package's copy so one zod instance is
      // used and server/node_modules is never needed.
      zod: path.resolve(__dirname, 'node_modules/zod'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
