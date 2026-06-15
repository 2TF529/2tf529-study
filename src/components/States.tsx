import type { ReactNode } from 'react'

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="text-muted" style={{ padding: 'var(--density-pad)', textAlign: 'center' }}>
      {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="surface"
      style={{ padding: 20, borderRadius: 12, textAlign: 'center', borderColor: 'var(--color-danger)' }}
    >
      <p style={{ marginTop: 0 }}>😕 Có lỗi khi tải dữ liệu</p>
      <p className="text-muted" style={{ fontSize: 14 }}>
        {message}
      </p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="surface" style={{ padding: 24, borderRadius: 12, textAlign: 'center' }}>
      <p style={{ marginTop: 0, fontWeight: 600 }}>{title}</p>
      {children && (
        <div className="text-muted" style={{ fontSize: 14 }}>
          {children}
        </div>
      )}
    </div>
  )
}
