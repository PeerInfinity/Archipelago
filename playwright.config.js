import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Directory where your test files are located
  testDir: './tests/e2e',

  // Timeout for each test (in milliseconds)
  // Increased from default 30s to 300s to accommodate running many in-app tests,
  // especially if the app or tests are slow to initialize in CI environments.
  // Yu-Gi-Oh! 2006 with 968 events requires longer timeout.
  timeout: 300000,

  // Expectations timeout (how long to wait for expect() conditions to be met)
  expect: {
    timeout: 10000,
  },

  // Whether to run tests in parallel. Default is true.
  // Set to false if your tests have interdependencies or modify shared state in a way that parallel execution would break.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Number of worker threads to run tests with. Defaults to half of CPU cores.
  // workers: process.env.CI ? 1 : undefined, // Can be adjusted

  // Reporter to use. See https://playwright.dev/docs/test-reporters
  // We'll use the JSON reporter and output to a file.
  reporter: [
    ['list'], // Standard list reporter for console output
    ['json', { outputFile: 'playwright-report.json' }], // JSON reporter
  ],

  use: {
    // Base URL to use in actions like `await page.goto('/')`
    // baseURL: 'http://localhost:8000', // If you set this, your APP_URL in app.spec.js could be relative

    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    trace: 'on-first-retry',

    // Viewport size for the browser
    // viewport: { width: 1280, height: 720 },

    // headless: false, // Uncomment to run tests with a visible browser for debugging
    launchOptions: {
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        // Only use --single-process for non-multiclient tests (it's incompatible with multi-context tests)
        ...(process.env.TEST_GAME && !process.env.DISABLE_SINGLE_PROCESS ? ['--single-process'] : []),
      ],
    },
  },

  /* Configure projects for major browsers - useful if you want to test across multiple browsers */
  // projects: [
  //   {
  //     name: 'chromium',
  //     use: { ...devices['Desktop Chrome'] },
  //   },
  //   {
  //     name: 'firefox',
  //     use: { ...devices['Desktop Firefox'] },
  //   },
  //   {
  //     name: 'webkit',
  //     use: { ...devices['Desktop Safari'] },
  //   },
  // ],

  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  // outputDir: 'test-results/',

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'python -m http.server 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: true, // Always reuse existing server (workflow starts it before tests)
    timeout: 120 * 1000, // Timeout for web server to start
  },
});
