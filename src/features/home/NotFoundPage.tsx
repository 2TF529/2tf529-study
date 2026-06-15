import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="surface" style={{ borderRadius: 16, padding: 40, textAlign: 'center' }}>
      <h1 style={{ marginTop: 0 }}>404</h1>
      <p className="text-muted">Không tìm thấy trang bạn yêu cầu.</p>
      <Link to="/" className="btn btn-primary">
        Về trang chủ
      </Link>
    </div>
  )
}
