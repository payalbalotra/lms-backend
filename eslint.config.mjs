import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Build output, generated migrations, and roof-bros reference are not ours to lint.
  {
    ignores: [
      'dist/**',
      'drizzle/**',
      'logs/**',
      'coverage/**',
      'roof-bros-backend/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    // Use the TS 6 API while typescript-eslint awaits TS 7 support.
    // See: https://github.com/typescript-eslint/typescript-eslint/issues/10940
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.mjs',
            '*.ts',
            'scripts/*.ts',
            'scripts/*.mjs',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 100,
          defaultProject: './tsconfig.json',
        },
        // @ts-expect-error — alias installed as @typescript/typescript6
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
