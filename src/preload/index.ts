// 画面に出すのは ipc-contract.md の2つの関数だけ（S-08、ADR-007）。ipcRenderer そのものは出さない。
// 契約に無いチャンネルは、メインに届く前に断る。
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { isInvokeChannel, isPushChannel, type GithubInboxApi } from '../shared/ipc-contract'

const api: GithubInboxApi = {
  invoke: ((channel: string, ...args: unknown[]) => {
    if (!isInvokeChannel(channel)) return Promise.reject(new Error('unknown_channel'))
    return ipcRenderer.invoke(channel, args[0]) as Promise<unknown>
  }) as GithubInboxApi['invoke'],
  on: ((channel: string, listener: (payload: unknown) => void) => {
    if (!isPushChannel(channel)) throw new Error('unknown_channel')
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  }) as GithubInboxApi['on'],
}

contextBridge.exposeInMainWorld('githubInbox', api)
