import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['frontend/**/*.test.js', 'test_json/unit/**/*.test.js'],

    // Environment settings
    environment: 'node',

    // Reporter configuration
    reporters: ['default'],

    // Coverage configuration (run with: npm run test:unit:coverage)
    coverage: {
      provider: 'v8',
      include: ['frontend/modules/shared/ruleEngine.js'],
      exclude: ['**/*.test.js', '**/test-*.js'],
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      // Thresholds can be enabled once baseline is established
      // thresholds: {
      //   lines: 80,
      //   functions: 80,
      //   branches: 80,
      //   statements: 80,
      // },
    },

    // Global test settings
    globals: false,

    // Timeout for tests
    testTimeout: 10000,

    // Benchmark configuration
    benchmark: {
      include: ['frontend/**/*.bench.js'],
      reporters: ['default'],
      outputJson: './benchmark-results.json',
    },
  },
});
