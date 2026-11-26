import { app } from 'electron'
import { createMainWindow } from './app/window'

// 組み立てと立ち上げの順番（component-backend.md 5.1）は S1 以降で足していく。
void app.whenReady().then(() => {
  createMainWindow()
})

// 窓を閉じたら終了する（F-24）。
app.on('window-all-closed', () => {
  app.quit()
})
