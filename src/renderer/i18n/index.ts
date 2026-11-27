import type { Language } from '../../shared/domain'
import { useMainSnapshot } from '../main-store/use-main-store'
import { en } from './en'
import { ja } from './ja'

export type MessageKey = keyof typeof ja

const messages: Record<Language, Record<MessageKey, string>> = { ja, en }

export function translate(language: Language, key: MessageKey): string {
  return messages[language][key]
}

/** 今の言語（設定。読み込む前は日本語） */
export function useLanguage(): Language {
  return useMainSnapshot().appState?.settings.language ?? 'ja'
}

/** 文言の {名前} を値で置き換える（件数など） */
export function fillMessage(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  )
}

export function useT(): (key: MessageKey) => string {
  const language = useLanguage()
  return (key) => translate(language, key)
}
