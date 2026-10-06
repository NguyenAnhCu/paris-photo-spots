import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'storage', 'db/import/.cache'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Layering (routes → service → repository): routes never talk to the database directly.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/db/pool.js', '**/*.repository.js'],
              message: 'Routes call services; only services use repositories.',
            },
          ],
        },
      ],
    },
  },
  {
    // The rule above only applies to route files; everything else may import the pool / repositories.
    files: ['**/*.ts'],
    ignores: ['src/modules/**/*.routes.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Health check is the documented exception: it pings the pool directly.
    files: ['src/modules/health/health.routes.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
