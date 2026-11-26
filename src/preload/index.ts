import { contextBridge } from 'electron'

// 画面に出すのは ipc-contract.md の関数だけ（S-08）。ipcRenderer そのものは出さない。
// 中身は B1（src/shared/ipc-contract.ts）の後に足す。
contextBridge.exposeInMainWorld('githubInbox', {})
