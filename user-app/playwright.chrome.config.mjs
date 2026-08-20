import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

/**
 * Chrome-channel variant of the default Playwright config.
 *
 * Why: `npx playwright install chromium` (headless shell) fails to download on
 * some machines/network setups, so these tests run against the locally
 * installed Google Chrome instead.
 *
 *   npx playwright test --config=playwright.chrome.config.mjs
 */
export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    channel: 'chrome',
  },
});
