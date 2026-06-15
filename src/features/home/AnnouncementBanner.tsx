import { useState } from 'react'
import { local } from '@/lib/storage'
import { Markdown } from '@/components/Markdown'
import type { Announcement } from '@/types'

// Dismissals are keyed by id + version, so bumping the version re-shows it.
function dismissKey(a: Announcement) {
  return `tf529.ann.${a.id}.v${a.version}`
}

export function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const [dismissed, setDismissed] = useState(() => local.get(dismissKey(announcement)) === '1')
  if (dismissed) return null

  const level = announcement.level ?? 'info'
  const accent =
    level === 'warning'
      ? 'var(--color-danger)'
      : level === 'success'
        ? 'var(--color-success)'
        : 'var(--color-primary)'

  return (
    <div
      className="surface"
      role="status"
      style={{ borderRadius: 12, padding: 16, borderLeft: `4px solid ${accent}` }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{announcement.title}</strong>
        <button
          className="btn"
          style={{ padding: '2px 8px', fontSize: 12 }}
          onClick={() => {
            local.set(dismissKey(announcement), '1')
            setDismissed(true)
          }}
          title="Tắt thông báo này (cho phiên bản hiện tại)"
        >
          Tắt
        </button>
      </div>
      <div className="text-muted" style={{ fontSize: 14, marginTop: 4 }}>
        <Markdown>{announcement.body}</Markdown>
      </div>
    </div>
  )
}
