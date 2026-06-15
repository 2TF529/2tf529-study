import { NavLink, Outlet, Link } from 'react-router-dom'
import { ThemeCustomizer } from '@/components/theme/ThemeCustomizer'

const nav = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/khoa-hoc', label: 'Khóa Học' },
  { to: '/phong-luyen', label: 'Phòng Luyện' },
  { to: '/admin', label: 'Content Tools' },
]

export function Layout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="surface"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <Link to="/" style={{ fontWeight: 800, fontSize: 18, textDecoration: 'none', color: 'var(--color-text)' }}>
            2TF<span style={{ color: 'var(--color-primary)' }}>529</span>
          </Link>
          <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className="btn"
                style={({ isActive }) =>
                  isActive
                    ? { background: 'var(--color-primary)', color: 'var(--color-primary-contrast)', borderColor: 'var(--color-primary)' }
                    : {}
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <Outlet />
      </main>

      <footer className="text-muted" style={{ textAlign: 'center', padding: 16, fontSize: 13 }}>
        2TF529 · Nền tảng học tập tĩnh · Dữ liệu mở rộng qua JSON
      </footer>

      <ThemeCustomizer />
    </div>
  )
}
