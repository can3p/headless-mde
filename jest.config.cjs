module.exports = {
    preset: "ts-jest",
    testEnvironment: "jest-environment-jsdom",
    verbose: true,
    // the browser suite runs with Playwright: npm run test:browser
    testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
};
