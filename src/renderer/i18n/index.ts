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

export function useT(): (key: MessageKey) => string {
  const language = useLanguage()
  return (key) => translate(language, key)
}
