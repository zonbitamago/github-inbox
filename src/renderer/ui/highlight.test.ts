import { describe, expect, it } from 'vitest'
import { highlightParts, type TextPart } from './highlight'

const plain = (text: string): TextPart => ({ text, highlighted: false })
const mark = (text: string): TextPart => ({ text, highlighted: true })

// D-032: 文字で探した語を、行の中で強調する
describe('探した語を強調する範囲（D-032）', () => {
  it.each([
    ['語が無ければ強調しない', 'ログイン画面', [], [plain('ログイン画面')]],
    ['当たらなければ強調しない', 'ログイン画面', ['検索'], [plain('ログイン画面')]],
    [
      '当たった所だけ',
      'ログイン画面の文言',
      ['画面'],
      [plain('ログイン'), mark('画面'), plain('の文言')],
    ],
    [
      '大文字と小文字は区別しない（元の文字のまま出す）',
      'Fix Typo',
      ['typo'],
      [plain('Fix '), mark('Typo')],
    ],
    ['同じ語が何度も', 'app/app', ['app'], [mark('app'), plain('/'), mark('app')]],
    [
      '複数の語',
      'example-org/api #7',
      ['api', '#7'],
      [plain('example-org/'), mark('api'), plain(' '), mark('#7')],
    ],
    ['重なる語は1つにまとめる', 'abcdef', ['abc', 'cde'], [mark('abcde'), plain('f')]],
    ['続く語も1つにまとめる', 'abcdef', ['abc', 'def'], [mark('abcdef')]],
    ['全部が当たる', 'carol', ['carol'], [mark('carol')]],
    ['空の文字', '', ['a'], [plain('')]],
    [
      '小文字にすると長さが変わる文字を含むなら強調しない',
      'İstanbul',
      ['stan'],
      [plain('İstanbul')],
    ],
  ] satisfies [string, string, string[], TextPart[]][])('%s', (_name, text, words, expected) => {
    expect(highlightParts(text, words)).toEqual(expected)
  })
})
