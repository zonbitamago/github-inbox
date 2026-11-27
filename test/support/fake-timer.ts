// やり直し・次の問い合わせの予約（auth・ingest の Timer）の偽物。予約を覚え、テストから1つずつ動かす（component-backend.md 9.）。

export interface ScheduledEntry {
  callback: () => void
  delayMs: number
  cancelled: boolean
}

export function createFakeTimer() {
  const scheduled: ScheduledEntry[] = []
  return {
    scheduled,
    schedule(callback: () => void, delayMs: number) {
      const entry = { callback, delayMs, cancelled: false }
      scheduled.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    /** 予約した処理のうち、取り消されていないものを1つ動かし、その待ち時間を返す */
    runNext(): number {
      const entry = scheduled.find((item) => !item.cancelled)
      if (entry === undefined) throw new Error('予約が無い')
      entry.cancelled = true
      entry.callback()
      return entry.delayMs
    },
    pending: () => scheduled.filter((item) => !item.cancelled).length,
    /** 取り消されていない最後の予約の待ち時間 */
    pendingDelay: () => scheduled.findLast((item) => !item.cancelled)?.delayMs,
  }
}

export type FakeTimer = ReturnType<typeof createFakeTimer>
