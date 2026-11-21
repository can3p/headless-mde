import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** The project site, built from `site/` and `docs/` */
const SITE_PORT = 4174;

export default defineConfig({
    testDir: 'e2e',
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'retain-on-failure',
    },
    webServer: [
        {
            command: `node e2e/serve.ts ${PORT}`,
            url: `http://127.0.0.1:${PORT}/index.html`,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: `node site/build.ts --serve ${SITE_PORT}`,
            url: `http://127.0.0.1:${SITE_PORT}/index.html`,
            reuseExistingServer: !process.env.CI,
        },
    ],
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
});
