import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Some tools like Vitest VSCode extensions, have trouble with resolving relative paths,
// as they use the directory of the test file as `cwd`, which makes them believe that
// `setupFiles` live next to the test file itself. This forces them to always resolve correctly.
const dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: ['.'],
    }),
  ],
  resolve: {
    alias: {
      '@ui': resolve(__dirname, './../../packages/ui/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom', // TODO(kamil): This should be set per test via header in .tsx files only
    setupFiles: [
      resolve(dirname, './tests/vitestSetup.ts'),
      resolve(dirname, './tests/setup/polyfills.ts'),
      resolve(dirname, './tests/setup/radix.js'),
    ],
    // Don't look for tests in the nextjs output directory
    exclude: [...configDefaults.exclude, `.next/*`],
    reporters: [['default']],
    coverage: {
      reporter: ['lcov', 'text', 'html', 'json'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.bench.ts',
        '**/base64url.ts', // [Jordi] Tests for this file exist in https://github.com/supabase-community/base64url-js/blob/main/src/base64url.test.ts so we can ignore.
        '**/.tests/helpers/**',
        '**/.tests/fixtures/**',
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
      ],
      include: [
        'lib/**/*.ts',
        'lib/**/*.tsx',
        'components/**/*.tsx',
        'pages/api/**/*.ts',
        'data/**/*.ts',
      ],
      // Coverage thresholds - Sprint 4 targets
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      // Enable all coverage reporters for comprehensive analysis
      all: true,
      // Show uncovered lines in reports
      skipFull: false,
    },
  },
})
