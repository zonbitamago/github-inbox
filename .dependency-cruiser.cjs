// コードの構造の検査（Java の ArchUnit にあたる）。どのフォルダがどこを読んでよいかは
// component-backend.md 3.1 と component-frontend.md 7. の表が正で、ここはその機械の写し。
// ここに無い向きの import は違反になる（新しいフォルダを作るときは、先に設計書の表を直す。coding-standards.md 2.）。
// 決まりを変えるときは技術者に聞き、PR の本文で申告する（build-plan.md 6.3）。

/** from のフォルダが読んでよい先（同じフォルダの中と src/shared/ は、下の決まりでいつでも読める） */
const MAIN = {
  'src/main/core/': [],
  'src/main/log/': ['src/main/core/'],
  'src/main/store/': ['src/main/core/', 'src/main/log/'],
  // トークンは auth から受け取らず、組み立て（index.ts）が渡す（component-backend.md 4.）
  'src/main/github/': ['src/main/core/', 'src/main/log/'],
  'src/main/auth/': ['src/main/github/', 'src/main/store/', 'src/main/core/', 'src/main/log/'],
  'src/main/notify/': ['src/main/core/', 'src/main/log/'],
  'src/main/ingest/': [
    'src/main/github/',
    'src/main/store/',
    'src/main/notify/',
    'src/main/core/',
    'src/main/log/',
  ],
  'src/main/pr-list/': ['src/main/github/', 'src/main/core/', 'src/main/log/'],
  'src/main/app/': ['src/main/github/', 'src/main/core/', 'src/main/log/'],
  'src/main/ipc/': ['src/main/log/'],
}

const RENDERER = {
  'src/renderer/main-store/': [],
  'src/renderer/i18n/': ['src/renderer/main-store/'],
  // ui/ は業務の言葉を知らない（coding-standards.md 2.）
  'src/renderer/ui/': [],
  'src/renderer/pages/': [
    'src/renderer/features/',
    'src/renderer/ui/',
    'src/renderer/main-store/',
    'src/renderer/i18n/',
  ],
}

const escapeRegex = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const anyOf = (paths) => `^(${paths.map(escapeRegex).join('|')})`

const folderRules = (table) =>
  Object.entries(table)
    .filter(([, to]) => to.length > 0)
    .map(([from, to]) => ({ from: { path: `^${escapeRegex(from)}` }, to: { path: anyOf(to) } }))

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  allowedSeverity: 'error',
  allowed: [
    // npm の部品・Node.js の組み込みは、ESLint で見る（coding-standards.md 9.）
    { from: {}, to: { pathNot: '^src/' } },
    // 同じフォルダの中（main・renderer の1段目のフォルダ。features/ は下の決まりで Feature ごとに分ける）
    {
      from: { path: '^src/(main|renderer)/([^/]+)/', pathNot: '^src/renderer/features/' },
      to: { path: '^src/$1/$2/' },
    },
    // 画面の Feature は、自分の Feature の中だけを読む（Feature どうしは読まない）
    {
      from: { path: '^src/renderer/features/([^/]+)/' },
      to: { path: '^src/renderer/features/$1/' },
    },
    // src/shared/ は画面とメインの契約。src/shared/ の外は読まない
    { from: { path: '^src/(main|preload|renderer)/' }, to: { path: '^src/shared/' } },
    { from: { path: '^src/shared/' }, to: { path: '^src/shared/' } },
    // メインの組み立て（index.ts）は、メインのフォルダをつなぐ
    {
      from: { path: '^src/main/index\\.ts$' },
      to: { path: anyOf(Object.keys(MAIN)) },
    },
    ...folderRules(MAIN),
    // 画面の入口（main.tsx・App.tsx）
    {
      from: { path: '^src/renderer/main\\.tsx$' },
      to: {
        path: anyOf(['src/renderer/App.tsx', 'src/renderer/main-store/', 'src/renderer/styles/']),
      },
    },
    {
      from: { path: '^src/renderer/App\\.tsx$' },
      to: {
        path: anyOf([
          'src/renderer/App.module.css',
          'src/renderer/pages/',
          'src/renderer/main-store/',
          'src/renderer/i18n/',
        ]),
      },
    },
    {
      from: { path: '^src/renderer/features/' },
      to: { path: anyOf(['src/renderer/ui/', 'src/renderer/main-store/', 'src/renderer/i18n/']) },
    },
    ...folderRules(RENDERER),
  ],
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環した import は、部品の向き（設計書の表）を崩す',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: '読み先が見つからない import',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // テストは対象の隣に置くため、部品の向きの外にする（テストの読み先は ESLint で見る）
    exclude: { path: '\\.test\\.tsx?$' },
    // 型だけの import も向きに数える
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.json', '.css'] },
  },
}
