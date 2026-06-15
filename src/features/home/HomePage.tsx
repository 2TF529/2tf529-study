import { Link } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadAnnouncements } from '@/lib/data'
import { AnnouncementBanner } from './AnnouncementBanner'

export default function HomePage() {
  const { data: announcements } = useAsync(loadAnnouncements, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap)' }}>
      {announcements?.map((a) => (
        <AnnouncementBanner key={a.id} announcement={a} />
      ))}

      <section
        className="surface"
        style={{ borderRadius: 16, padding: 'clamp(24px, 5vw, 48px)', textAlign: 'center' }}
      >
        <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 38px)' }}>
          Học nhanh, luyện chắc cùng <span style={{ color: 'var(--color-primary)' }}>2TF529</span>
        </h1>
        <p className="text-muted" style={{ maxWidth: 560, margin: '12px auto 0' }}>
          Nền tảng học tập tĩnh: kho khóa học video và phòng luyện đề trắc nghiệm, hỗ trợ công thức
          Toán/Lý/Hóa bằng LaTeX. Miễn phí, nhẹ và nhanh.
        </p>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--density-gap)',
        }}
      >
        <BigButton
          to="/khoa-hoc"
          emoji="📚"
          title="Khóa Học"
          desc="Xem video bài giảng theo môn, giáo viên và khóa học."
        />
        <BigButton
          to="/phong-luyen"
          emoji="📝"
          title="Phòng Luyện"
          desc="Làm đề thi, biết đúng/sai ngay, luyện random theo chủ đề."
        />
      </div>
    </div>
  )
}

function BigButton({
  to,
  emoji,
  title,
  desc,
}: {
  to: string
  emoji: string
  title: string
  desc: string
}) {
  return (
    <Link
      to={to}
      className="surface"
      style={{
        textDecoration: 'none',
        color: 'var(--color-text)',
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 40 }}>{emoji}</span>
      <strong style={{ fontSize: 22 }}>{title}</strong>
      <span className="text-muted" style={{ fontSize: 14 }}>
        {desc}
      </span>
    </Link>
  )
}
