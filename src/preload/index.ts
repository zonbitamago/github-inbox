// 画面に出すのは ipc-contract.md の2つの関数だけ（S-08、ADR-007）。ipcRenderer そのものは出さない。
// 契約に無いチャンネルは、メインに届く前に断る。
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { isInvokeChannel, isPushChannel, type GithubInboxApi } from '../shared/ipc-contract'

// GithubInboxApi の関数はチャンネルごとに型が決まる総称の関数で、ipcRenderer の型からは作れないため、型の主張で合わせる。
// 中身は契約に無いチャンネルを断る。値の検査はメインが契約のスキーマで行う
const api: GithubInboxApi = {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- 総称の関数の型に合わせるため（上の説明）
  invoke: ((channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!isInvokeChannel(channel)) return Promise.reject(new Error('unknown_channel'))
    return ipcRenderer.invoke(channel, args[0])
  }) as GithubInboxApi['invoke'],
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- 総称の関数の型に合わせるため（上の説明）
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
