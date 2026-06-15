import { useEffect, useState } from 'react'

export function Timer({
  startedAt,
  minutes,
  onExpire,
}: {
  startedAt: number
  minutes: number
  onExpire: () => void
}) {
  const endAt = startedAt + minutes * 60_000
  const [remaining, setRemaining] = useState(() => Math.max(0, endAt - Date.now()))

  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, endAt - Date.now())
      setRemaining(left)
      if (left <= 0) {
        clearInterval(id)
        onExpire()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [endAt, onExpire])

  const total = Math.floor(remaining / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  const low = remaining < 60_000

  return (
    <span
      className="badge"
      style={{ fontSize: 15, color: low ? 'var(--color-danger)' : 'var(--color-text)' }}
    >
      ⏱ {mm}:{ss}
    </span>
  )
}
