module.exports = {
  testDir: './tests-e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:7777',
    browserName: 'chromium',
  },
};
