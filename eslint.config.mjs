// 機械で強制する決まり（coding-standards.md 9.）。決まりを緩めるときは技術者に聞く。
import { readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const nodeModules = ['electron', 'node:*', ...builtinModules]

// 画面の Feature（component-frontend.md 7.）。Feature どうしは import しない。
function listFeatures() {
  try {
    return readdirSync('src/renderer/features', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    // Feature がまだ1つも無いときは、決まりを作るものが無い
    return []
  }
}
const features = listFeatures()

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const featureBoundaries = features.map((self) => {
  const others = features.filter((name) => name !== self).map(escapeRegex)
  return {
    files: [`src/renderer/features/${self}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeModules.filter((name) => !name.includes('*')),
          patterns: [
            {
              group: ['electron', 'node:*'],
              message: '画面から Electron・Node.js を使わない（ADR-007）',
            },
            ...(others.length === 0
              ? []
              : [
                  {
                    regex: `(^|/)(features/)?(${others.join('|')})(/|$)`,
                    message:
                      '画面の Feature どうしは import しない。共有するものは main-store/ か ui/ に置く（component-frontend.md 7.）',
                  },
                ]),
          ],
        },
      ],
    },
  }
})

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'coverage/**', 'node_modules/**', 'docs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ログの仕組みを使う（coding-standards.md 9.、security-rules.md S-09）
      'no-console': 'error',
      // `shell.openExternal` は src/main/app/external.ts だけで呼ぶ（S-06）
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='openExternal']",
          message: '外で開くのは src/main/app/external.ts だけ（security-rules.md S-06）',
        },
      ],
      // GitHub につなぐのは src/main/github/ だけ（DR-13）
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'fetch は src/main/github/ だけで使う（coding-standards.md 2.）',
        },
      ],
    },
  },
  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/main/app/external.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/main/github/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // 開発の道具（記録・置き換えなど）は、結果を端末に出す
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // 判定は I/O を持たない（ADR-011、src/main/core/CLAUDE.md）
    files: ['src/main/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeModules.filter((name) => !name.includes('*')),
          patterns: [
            { group: ['electron', 'node:*'], message: 'core は I/O を持たない（ADR-011）' },
            {
              regex: '^\\.\\./(?!\\.\\./shared(/|$))',
              message:
                'core が import してよいのは src/shared/ と core の中だけ（src/main/core/CLAUDE.md）',
            },
          ],
        },
      ],
    },
  },
  {
    // 判定のテストは、記録した応答（test/fixtures）とテストの補助（test/support）を読んでよい
    files: ['src/main/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeModules.filter((name) => !name.includes('*')),
          patterns: [
            { group: ['electron', 'node:*'], message: 'core は I/O を持たない（ADR-011）' },
            {
              regex: '^\\.\\./(?!\\.\\./shared(/|$)|\\.\\./\\.\\./test/(fixtures|support)/)',
              message:
                'core のテストが import してよいのは src/shared/・core の中・test/fixtures・test/support だけ',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: globals.browser,
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      // GitHub から取った文字を HTML として扱わない（security-rules.md S-05）
      'react/no-danger': 'error',
      // 画面から Electron・Node.js を使わない（ADR-007）
      'no-restricted-imports': [
        'error',
        {
          paths: nodeModules.filter((name) => !name.includes('*')),
          patterns: [
            {
              group: ['electron', 'node:*'],
              message: '画面から Electron・Node.js を使わない（ADR-007）',
            },
          ],
        },
      ],
    },
  },
  ...featureBoundaries,
)
