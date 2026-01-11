const { defineConfig } = require("@vscode/test-cli");

module.exports = defineConfig({
  files: "client/out/test/**/*.test.js",
  version: "stable",
  launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
  mocha: {
    ui: "tdd",
    timeout: 20000,
    color: true,
  },
});
