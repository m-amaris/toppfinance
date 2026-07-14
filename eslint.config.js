import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Global ignores - only source files, not built artifacts
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'node_modules/**',
      '**/prisma/migrations/**',
      '**/*.config.{ts,js}',
      'apps/web/dist/**',
      'apps/api/dist/**',
      'backups/**',
      'apps/shared/tests/**', // Test files have their own patterns
    ],
  },

  // Base TypeScript recommended config (relaxed for pragmatic codebase)
  tseslint.configs.recommended,

  // Custom rules for Phase 0 - pragmatic, don't fail on unused vars that match pattern
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off', // Too noisy for existing codebase
      '@typescript-eslint/no-explicit-any': 'off', // Many existing usages
    },
  },

  // Source files only - apply globals
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
  }
)