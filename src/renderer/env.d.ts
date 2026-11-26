import type { GithubInboxApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    /** preload が公開した関数（ipc-contract.md 1.） */
    githubInbox: GithubInboxApi
  }
}

export {}
