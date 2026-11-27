// Electron の Notification を、notifier の使う形（DesktopNotificationHandle）に包む。
// 包んだものを notifier が持っている間は、Electron の Notification も手放されない（クリックを受け取れる）。
import { Notification } from 'electron'
import type { DesktopNotificationText } from './desktop-notification-text'
import type { DesktopNotificationHandle } from './notifier'

export function createElectronDesktopNotification(
  text: DesktopNotificationText,
): DesktopNotificationHandle {
  const native = new Notification({ title: text.title, body: text.body })
  return {
    on(name, listener) {
      // Electron の型はイベントの名前ごとに分かれているため、名前ごとに渡す
      switch (name) {
        case 'show':
          native.on('show', () => listener())
          return
        case 'click':
          native.on('click', () => listener())
          return
        case 'close':
          native.on('close', () => listener())
          return
        case 'failed':
          // 失敗の文言（OS が返したもの）は使わない。理由はアプリケーションフォルダの内外で判定する（component-backend.md 5.4）
          native.on('failed', () => listener())
          return
      }
    },
    show: () => native.show(),
  }
}

export const isDesktopNotificationSupported = (): boolean => Notification.isSupported()
