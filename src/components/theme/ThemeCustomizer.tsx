import { useTheme } from './useTheme'
import type { ThemeName, Density } from './themeContext'

const themes: { id: ThemeName; label: string }[] = [
  { id: 'light', label: 'Sáng dịu' },
  { id: 'dark', label: 'Tối dịu' },
  { id: 'sepia', label: 'Sepia / Đọc' },
  { id: 'contrast', label: 'Tương phản cao' },
]

const densities: { id: Density; label: string }[] = [
  { id: 'cozy', label: 'Thoáng' },
  { id: 'compact', label: 'Gọn' },
]

export function ThemeCustomizer() {
  const t = useTheme()

  return (
    <>
      <button
        className="btn btn-primary"
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, borderRadius: 999 }}
        aria-label="Mở tùy chỉnh giao diện (Ctrl+Shift+Y)"
        title="Tùy chỉnh giao diện (Ctrl+Shift+Y)"
        onClick={() => t.setPanelOpen(!t.panelOpen)}
      >
        🎨 Giao diện
      </button>

      {t.panelOpen && (
        <div
          role="dialog"
          aria-label="Tùy chỉnh giao diện"
          className="surface"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 72,
            zIndex: 50,
            width: 280,
            borderRadius: 14,
            padding: 16,
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>Tùy chỉnh giao diện</strong>
            <button className="btn" style={{ padding: '0 8px' }} onClick={() => t.setPanelOpen(false)}>
              ✕
            </button>
          </div>

          <label className="text-muted" style={{ fontSize: 13 }}>
            Chủ đề
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '6px 0 12px' }}>
            {themes.map((th) => (
              <button
                key={th.id}
                className={th.id === t.theme ? 'btn btn-primary' : 'btn'}
                style={{ fontSize: 13, padding: '6px 8px' }}
                onClick={() => t.setTheme(th.id)}
              >
                {th.label}
              </button>
            ))}
          </div>

          <label className="text-muted" style={{ fontSize: 13 }}>
            Mật độ nội dung
          </label>
          <div style={{ display: 'flex', gap: 6, margin: '6px 0 12px' }}>
            {densities.map((d) => (
              <button
                key={d.id}
                className={d.id === t.density ? 'btn btn-primary' : 'btn'}
                style={{ fontSize: 13, flex: 1 }}
                onClick={() => t.setDensity(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <label className="text-muted" style={{ fontSize: 13 }}>
            Cỡ chữ: {(t.fontScale * 100).toFixed(0)}%
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <button className="btn" onClick={() => t.setFontScale(t.fontScale - 0.125)}>
              A-
            </button>
            <input
              type="range"
              min={0.875}
              max={1.375}
              step={0.125}
              value={t.fontScale}
              onChange={(e) => t.setFontScale(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Cỡ chữ"
            />
            <button className="btn" onClick={() => t.setFontScale(t.fontScale + 0.125)}>
              A+
            </button>
          </div>
        </div>
      )}
    </>
  )
}
