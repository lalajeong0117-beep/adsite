const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium"
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3100/convert",
    reuseExistingServer: !process.env.CI,
    env: { PORT: "3100" },
    timeout: 30000
  }
});