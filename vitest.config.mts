import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// テストの書き方は test-conventions.md。
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['test/e2e/**'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
      thresholds: {
        // 判定は分岐を全部通す（test-conventions.md、src/main/core/CLAUDE.md）
        'src/main/core/**': { branches: 100 },
      },
    },
  },
})
