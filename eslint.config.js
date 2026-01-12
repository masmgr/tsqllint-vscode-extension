const ignoreAllRules = false;

const baseIgnores = [
  "**/out/**",
  "**/*.d.ts",
  ".vscode-test/**",
  "node_modules/**",
  "scripts/**",
  "eslint.config.js",
  ".eslintrc.js",
];

if (ignoreAllRules) {
  module.exports = [
    { ignores: baseIgnores },
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: require("@typescript-eslint/parser"),
        parserOptions: {
          sourceType: "module",
        },
      },
      rules: {},
    },
  ];
} else {
  const { FlatCompat } = require("@eslint/eslintrc");

  const compat = new FlatCompat({ baseDirectory: __dirname });
  const legacyConfig = compat.config(require("./.eslintrc.js")).map((config) => ({
    ...config,
    files: ["**/*.ts"],
  }));

  module.exports = [{ ignores: baseIgnores }, ...legacyConfig];
}
