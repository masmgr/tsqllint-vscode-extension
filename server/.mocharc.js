module.exports = {
  spec: [
    "out/__tests__/parseError.test.js",
    "out/__tests__/commands.test.js",
    "out/__tests__/smoke.test.js",
    "out/__tests__/TSQLLintToolsHelper.test.js",
  ],
  ui: "tdd",
  timeout: 10000,
  color: true,
  reporter: "spec",
};
