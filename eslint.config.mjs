// eslint.config.mjs
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Ignore generated/build stuff
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "out/**",
      "generated/**"
    ]
  },

  // Lint all TypeScript files, no project mode
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
        // NOTE: no `project`, no `tsconfigRootDir`, no `projectService`
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "no-console": "off"
    }
  }
];
