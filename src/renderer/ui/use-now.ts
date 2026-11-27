import { useEffect, useState } from 'react'

/** 今の時刻を、決めた間隔で進める（「5分前」の表し方を古くしないため） */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
