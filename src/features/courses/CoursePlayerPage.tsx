import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadCourse } from '@/lib/data'
import { Loading, ErrorState, EmptyState } from '@/components/States'
import { local } from '@/lib/storage'
import type { Lesson } from '@/types'

export default function CoursePlayerPage() {
  const { courseId = '', lessonId = '' } = useParams()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { data: course, loading, error, retry } = useAsync(() => loadCourse(courseId), [courseId])

  const current = course?.lessons.find((l) => l.id === lessonId) ?? course?.lessons[0]

  // Save reading progress for "Tiếp tục học".
  useEffect(() => {
    if (course && current) local.set(`tf529.progress.${courseId}`, current.id)
  }, [course, current, courseId])

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} onRetry={retry} />
  if (!course || course.lessons.length === 0 || !current)
    return <EmptyState title="Khóa học chưa có bài học" />

  if (lessonId === '_' || !course.lessons.some((l) => l.id === lessonId)) {
    // normalize URL to a concrete lesson
    navigate(`/khoa-hoc/${courseId}/${current.id}`, { replace: true })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Link to={`/khoa-hoc/${courseId}`} className="text-muted" style={{ fontSize: 14 }}>
        ← Về khóa học
      </Link>
      <h1 style={{ margin: 0, fontSize: 22 }}>{course.title}</h1>
      <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
        Giáo viên: {course.teacher}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: collapsed ? '1fr' : 'minmax(0, 1fr) 300px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VideoPlayer lesson={current} />
          <h2 style={{ margin: 0, fontSize: 18 }}>{current.title}</h2>
          <LessonResources lesson={current} />
        </div>

        <aside className="surface" style={{ borderRadius: 12, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              background: 'var(--color-surface-2)',
            }}
          >
            <strong style={{ fontSize: 14 }}>Danh sách bài ({course.lessons.length})</strong>
            <button className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? 'Hiện' : 'Thu gọn'}
            </button>
          </div>
          {!collapsed && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 460, overflow: 'auto' }}>
              {course.lessons.map((l, i) => (
                <li key={l.id}>
                  <Link
                    to={`/khoa-hoc/${courseId}/${l.id}`}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '10px 12px',
                      textDecoration: 'none',
                      color: 'var(--color-text)',
                      borderTop: '1px solid var(--color-border)',
                      background: l.id === current.id ? 'var(--color-surface-2)' : 'transparent',
                    }}
                  >
                    <span className="text-muted">{i + 1}.</span>
                    <span style={{ fontSize: 14 }}>{l.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  )
}

function VideoPlayer({ lesson }: { lesson: Lesson }) {
  const [iframeFailed, setIframeFailed] = useState(false)

  if (lesson.embedUrl && !iframeFailed) {
    return (
      <div
        style={{
          position: 'relative',
          paddingTop: '56.25%',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <iframe
          src={lesson.embedUrl}
          title={lesson.title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          onError={() => setIframeFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    )
  }

  // Fallback when no embed or iframe failed.
  return (
    <div
      className="surface"
      style={{ borderRadius: 12, padding: 32, textAlign: 'center', display: 'grid', gap: 12 }}
    >
      <span style={{ fontSize: 40 }}>▶️</span>
      <p className="text-muted" style={{ margin: 0 }}>
        Video này không nhúng được trực tiếp.
      </p>
      {lesson.videoUrl ? (
        <a className="btn btn-primary" href={lesson.videoUrl} target="_blank" rel="noreferrer" style={{ justifySelf: 'center' }}>
          Mở video trên VK
        </a>
      ) : (
        <span className="text-muted">Chưa có link video.</span>
      )}
    </div>
  )
}

function LessonResources({ lesson }: { lesson: Lesson }) {
  const links: { label: string; url?: string }[] = [
    { label: '📄 Tài liệu', url: lesson.documentUrl },
    { label: '✅ Đáp án', url: lesson.answerUrl },
    { label: '🎬 Link chữa', url: lesson.solutionUrl },
  ].filter((l) => l.url)

  if (links.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {links.map((l) => (
        <a key={l.label} className="btn" href={l.url} target="_blank" rel="noreferrer">
          {l.label}
        </a>
      ))}
    </div>
  )
}
