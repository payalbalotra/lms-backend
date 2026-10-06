import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Build output and generated migrations are not ours to lint.
  { ignores: ['dist/**', 'drizzle/**', 'logs/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
);
