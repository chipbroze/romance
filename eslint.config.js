import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// ------------------------- Helpers & Plugins ----------------------------- //
/**
 * Disallows direct imports from 'node:test'.
 *
 * All test files must import from '#test' instead, which wraps node:test
 * to support structured metadata options (e.g. { slow: true }) for
 * selective test filtering via environment variables.
 *
 * Correct:   import { it, describe } from '#test'
 * Incorrect: import { it, describe } from 'node:test'
 */

const require_test_helper = {
  meta: {
    type: 'problem',
    docs: {
      description: "Require '#test' wrapper instead of 'node:test' directly",
    },
    messages: {
      use_test_helper:
        "Import from '#test' instead of 'node:test' directly. " +
        'The #test wrapper is required for slow-test filtering to work.',
    },
    schema: [],
  },
  create (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'node:test') {
          context.report({ node, messageId: 'use_test_helper' })
        }
      },
      ImportExpression(node) {
        if (node.source.value === 'node:test') {
          context.report({ node, messageId: 'use_test_helper' })
        }
      }
    }
  }
};


// --------------------------- Master Config ------------------------------- //

export default [
  // Apply global javascript recommended rules
  js.configs.recommended,
  // Apply global typescript recommended rules
  ...tseslint.configs.recommended,
  // Custom configuration block (combining options and rules)
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser
    },
    rules: {
      "no-console": "off",
      "max-len": ["warn", { "code": 100 }],
      "@typescript-eslint/no-use-before-define": ["error", {
        variables: true,
        functions: false,
        classes: false,
        allowNamedExports: true
      }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/member-ordering": ['error', {
        classes: [
          'field',
          'constructor',
          'method'
        ]
      }],
    }
  }, {
    plugins: {
      local: {
        rules: {
          'require-test-helper': require_test_helper,
        },
      },
    },
    files: ['tests/**/*.js'],
    ignores: ['tests/helpers/test.js'],
    rules: {
      'local/require-test-helper': 'error',
      // Warns when a type can be easily inferred by the compiler
      "@typescript-eslint/no-inferrable-types": "warn",
      // Warns when an "as" cast is redundant
      "@typescript-eslint/no-unnecessary-type-assertion": 'warn',
    },
  }
];
