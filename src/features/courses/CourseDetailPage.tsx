import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadCourse } from '@/lib/data'
import { Loading, ErrorState, EmptyState } from '@/components/States'
import { useDebounced } from '@/lib/useDebounced'
import { firstLesson, nodeMeta, searchTree, allNodeIds } from '@/lib/course/tree'
import { local } from '@/lib/storage'
import type { Course, Lesson, OutlineNode } from '@/types'

function progressKey(courseId: string) {
  return `tf529.progress.${courseId}`
}

export default function CourseDetailPage() {
  const { courseId = '' } = useParams()
  const { data: course, loading, error, retry } = useAsync(() => loadCourse(courseId), [courseId])

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} onRetry={retry} />
  if (!course) return <EmptyState title="Không tìm thấy khóa học" />
  return <CourseDetail course={course} />
}

function CourseDetail({ course }: { course: Course }) {
  const navigate = useNavigate()
  const lessonsById = useMemo(() => {
    const m = new Map<string, Lesson>()
    course.lessons.forEach((l) => m.set(l.id, l))
    return m
  }, [course.lessons])

  const hasOutline = !!course.outline && course.outline.length > 0
  const [rawQuery, setRawQuery] = useState('')
  const query = useDebounced(rawQuery, 200)
  const search = useMemo(
    () => (hasOutline ? searchTree(course.outline!, query) : null),
    [hasOutline, course.outline, query],
  )
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(hasOutline ? allNodeIds(course.outline!) : []),
  )

  const savedLessonId = local.get(progressKey(course.id))

  function openLesson(lessonId: string) {
    local.set(progressKey(course.id), lessonId)
    navigate(`/khoa-hoc/${course.id}/${lessonId}`)
  }

  function studyFirst() {
    if (hasOutline) {
      const f = firstLesson(course.outline!)
      if (f?.lessonId) return openLesson(f.lessonId)
      if (f) return openLesson(f.id)
    }
    if (course.lessons[0]) openLesson(course.lessons[0].id)
  }

  const crumbs = course.breadcrumbs ?? [course.gradeLevel, course.title]
  const effectiveExpanded = search?.hasQuery ? search.expandIds : expanded

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Link to="/khoa-hoc" className="text-muted" style={{ fontSize: 14 }}>
        ← Về danh sách khóa học
      </Link>

      <nav className="text-muted" style={{ fontSize: 13 }}>
        {crumbs.join('  /  ')}
      </nav>

      <h1 style={{ margin: 0, fontSize: 22 }}>{course.title}</h1>
      <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
        {course.teacher} · {course.lessons.length} bài
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={studyFirst} disabled={course.lessons.length === 0}>
          ▶️ Học bài đầu tiên
        </button>
        {savedLessonId && lessonsById.has(savedLessonId) && (
          <button className="btn" onClick={() => openLesson(savedLessonId)}>
            ⏯ Tiếp tục học: {lessonsById.get(savedLessonId)?.title}
          </button>
        )}
      </div>

      {hasOutline ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder="Tìm trong khóa…"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
            />
            <button className="btn" disabled={!!search?.hasQuery} onClick={() => setExpanded(new Set(allNodeIds(course.outline!)))}>
              Mở tất cả
            </button>
            <button className="btn" disabled={!!search?.hasQuery} onClick={() => setExpanded(new Set())}>
              Thu gọn tất cả
            </button>
          </div>

          <div className="surface" style={{ borderRadius: 12, padding: 8 }}>
            {course.outline!.map((n) => (
              <OutlineRow
                key={n.id}
                node={n}
                depth={0}
                expandedIds={effectiveExpanded}
                matchedIds={search?.matchedIds ?? new Set()}
                lessonsById={lessonsById}
                onToggle={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
                searchActive={!!search?.hasQuery}
                onOpen={openLesson}
              />
            ))}
          </div>
        </>
      ) : (
        <FlatLessonList lessons={course.lessons} onOpen={openLesson} />
      )}
    </div>
  )
}

function OutlineRow({
  node,
  depth,
  expandedIds,
  matchedIds,
  lessonsById,
  onToggle,
  searchActive,
  onOpen,
}: {
  node: OutlineNode
  depth: number
  expandedIds: Set<string>
  matchedIds: Set<string>
  lessonsById: Map<string, Lesson>
  onToggle: (id: string) => void
  searchActive: boolean
  onOpen: (lessonId: string) => void
}) {
  const meta = nodeMeta(node.type)
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const open = expandedIds.has(node.id)
  const isLesson = node.type === 'lesson'
  const lessonId = node.lessonId ?? node.id
  const lesson = isLesson ? lessonsById.get(lessonId) : undefined
  const hasLink = !!(lesson?.videoUrl || lesson?.embedUrl || lesson?.documentUrl)
  const isMatch = matchedIds.has(node.id)

  if (isLesson) {
    const title = node.title ?? lesson?.title ?? node.id
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          paddingLeft: 8 + depth * 18,
          background: isMatch ? 'var(--color-surface-2)' : 'transparent',
          borderRadius: 8,
        }}
      >
        <span aria-hidden>{meta.icon}</span>
        <span style={{ fontSize: 14, flex: 1 }}>{title}</span>
        {hasLink ? (
          <button className="btn btn-primary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => onOpen(lessonId)}>
            Vào bài
          </button>
        ) : (
          <span className="badge" title="Bài học chưa có link">
            Chưa có link, bổ sung sau
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          paddingLeft: 8 + depth * 18,
          borderRadius: 8,
          cursor: hasChildren ? 'pointer' : 'default',
          background: isMatch ? 'var(--color-surface-2)' : 'transparent',
        }}
        onClick={() => hasChildren && !searchActive && onToggle(node.id)}
      >
        <span style={{ width: 16, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        <span aria-hidden>{meta.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{node.title ?? node.id}</span>
      </div>
      {hasChildren && open && (
        <div>
          {children.map((c) => (
            <OutlineRow
              key={c.id}
              node={c}
              depth={depth + 1}
              expandedIds={expandedIds}
              matchedIds={matchedIds}
              lessonsById={lessonsById}
              onToggle={onToggle}
              searchActive={searchActive}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FlatLessonList({ lessons, onOpen }: { lessons: Lesson[]; onOpen: (id: string) => void }) {
  if (lessons.length === 0) return <EmptyState title="Khóa học chưa có bài học" />
  return (
    <div className="surface" style={{ borderRadius: 12, overflow: 'hidden' }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lessons.map((l, i) => {
          const hasLink = !!(l.videoUrl || l.embedUrl || l.documentUrl)
          return (
            <li
              key={l.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
              }}
            >
              <span className="text-muted">{i + 1}.</span>
              <span style={{ fontSize: 14, flex: 1 }}>{l.title}</span>
              {hasLink ? (
                <button className="btn btn-primary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => onOpen(l.id)}>
                  Vào bài
                </button>
              ) : (
                <span className="badge">Chưa có link, bổ sung sau</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
