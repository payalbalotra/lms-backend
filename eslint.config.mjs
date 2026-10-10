import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

// Node.js globals for the plain JavaScript files (scripts, e2e tests).
const nodeGlobals = Object.fromEntries(
  [
    'process',
    'console',
    'Buffer',
    'URL',
    'fetch',
    'FormData',
    'Blob',
    'performance',
    'setTimeout',
    'clearTimeout',
  ].map((name) => [name, 'readonly']),
);

export default tseslint.config(
  // Build output and generated migrations are not ours to lint.
  { ignores: ['dist/**', 'drizzle/**', 'logs/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
