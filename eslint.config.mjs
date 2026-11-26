// 機械で強制する決まり（coding-standards.md 9.）。決まりを変えるときは技術者に聞き、PR の本文で申告する（build-plan.md 6.3）。
import { readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const nodeModules = ['electron', 'node:*', ...builtinModules]

// 日本語の文字（ひらがな・カタカナ・漢字）。画面の文言を部品に直接書いていないかを見る（coding-standards.md 4.）
const JAPANESE = '/[\\u3040-\\u30ff\\u3400-\\u9fff]/'

// ---- no-restricted-syntax・no-restricted-globals は、後の設定が前の設定を丸ごと置き換えるため、組み合わせて渡す ----

const OPEN_EXTERNAL = {
  selector: "MemberExpression[property.name='openExternal']",
  message: '外で開くのは src/main/app/external.ts だけ（security-rules.md S-06）',
}

// GitHub から取った文字を HTML として扱わない（security-rules.md S-05）
const HTML_SINKS = [
  {
    selector:
      'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
    message: 'HTML として書き込まない。文字として出す（security-rules.md S-05）',
  },
  {
    selector:
      'CallExpression > MemberExpression.callee[property.name=/^(insertAdjacentHTML|write|writeln)$/]',
    message: 'HTML として書き込まない。文字として出す（security-rules.md S-05）',
  },
]

// 判定は時計・乱数に触れない。今の時刻は引数の now で受け取る（ADR-011、coding-standards.md 2.）
const CORE_SYNTAX = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'core は時計に触れない。今の時刻は引数の now で受け取る（ADR-011）',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'core は時計に触れない。今の時刻は引数の now で受け取る（ADR-011）',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'core は乱数を使わない（ADR-011）',
  },
]

// 画面の部品は関数だけ（coding-standards.md 1.）。文言は i18n/ のキーを使う（coding-standards.md 4.）
const RENDERER_SYNTAX = [
  {
    selector: 'ClassDeclaration[superClass.property.name=/^(Component|PureComponent)$/]',
    message: 'React の部品は関数で書く（coding-standards.md 1.）',
  },
  {
    selector: 'ClassDeclaration[superClass.name=/^(Component|PureComponent)$/]',
    message: 'React の部品は関数で書く（coding-standards.md 1.）',
  },
]
const RENDERER_TEXT_SYNTAX = [
  {
    // 開発者向けの例外のメッセージは画面に出さないので除く
    selector: `Literal[value=${JAPANESE}]:not(NewExpression[callee.name='Error'] > Literal)`,
    message: '画面の文言は i18n/ のキーを使う（coding-standards.md 4.）',
  },
  {
    selector: `TemplateElement[value.raw=${JAPANESE}]:not(NewExpression[callee.name='Error'] > TemplateLiteral > TemplateElement)`,
    message: '画面の文言は i18n/ のキーを使う（coding-standards.md 4.）',
  },
]

const FETCH = {
  name: 'fetch',
  message: 'fetch は src/main/github/ だけで使う（coding-standards.md 2.）',
}
const CORE_GLOBALS = [
  'process',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'performance',
  'crypto',
].map((name) => ({ name, message: 'core は I/O・時計・乱数を持たない（ADR-011）' }))

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
  {
    // 要らなくなった無効化のコメントを残さない
    linterOptions: { reportUnusedDisableDirectives: 'error' },
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
      'no-restricted-syntax': ['error', OPEN_EXTERNAL, ...HTML_SINKS],
      // GitHub につなぐのは src/main/github/ だけ（DR-13）
      'no-restricted-globals': ['error', FETCH],
      // 識別子は英語（coding-standards.md 3.）
      'id-match': [
        'error',
        '^[A-Za-z_$][A-Za-z0-9_$]*$',
        { properties: true, onlyDeclarations: true },
      ],
      // `notification` を単独で名前に使わない。デスクトップ通知か GitHub の通知かを書く（coding-standards.md 3.）
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: null,
          // desktopNotification・githubNotification のように前に付いていれば通す
          custom: {
            regex:
              '(^|[a-z0-9_])(?<!(desktop|Desktop|github|Github|GitHub))[Nn]otifications?($|[A-Z0-9_])',
            match: false,
          },
        },
        // 引用符の要る名前（IPC のチャンネル名など契約の文字列）と、外の部品から import する名前は対象にしない
        { selector: 'default', modifiers: ['requiresQuotes'], format: null },
        { selector: 'import', format: null },
      ],
    },
  },
  {
    // 外から来る値は zod で検査し、型の主張（as）でごまかさない（coding-standards.md 4.）。
    // どうしても要るときは、理由を書いた無効化のコメントを付ける（理由はテストで確かめる）
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/main/app/external.ts'],
    rules: { 'no-restricted-syntax': ['error', ...HTML_SINKS] },
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
    files: ['src/main/core/**/*.ts'],
    ignores: ['src/main/core/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', OPEN_EXTERNAL, ...HTML_SINKS, ...CORE_SYNTAX],
      'no-restricted-globals': ['error', FETCH, ...CORE_GLOBALS],
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
      'no-restricted-syntax': ['error', OPEN_EXTERNAL, ...HTML_SINKS, ...RENDERER_SYNTAX],
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
  {
    // 部品の書き方（coding-standards.md 4.・7.）。i18n/ は文言の置き場なので除く。テストは画面の文字を確かめるので除く
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['src/renderer/**/*.test.{ts,tsx}', 'src/renderer/i18n/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        OPEN_EXTERNAL,
        ...HTML_SINKS,
        ...RENDERER_SYNTAX,
        ...RENDERER_TEXT_SYNTAX,
      ],
      // JSX の中に文字を直接書かない
      'react/jsx-no-literals': 'error',
      // 1ファイルに部品1つ
      'react/no-multi-comp': ['error', { ignoreStateless: false }],
      // 色・余白は CSS Modules とトークンで書き、style で直接書かない（design-system.md 5.）
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
    },
  },
  ...featureBoundaries,
)
