/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:vue/vue3-recommended",
    "prettier",
  ],
  parser: "vue-eslint-parser",
  parserOptions: {
    parser: "@typescript-eslint/parser",
    sourceType: "module",
    extraFileExtensions: [".vue"],
  },
  rules: {
    "vue/multi-word-component-names": "off",
  },
  ignorePatterns: [
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
    "coverage",
    "*.cjs",
  ],
};
