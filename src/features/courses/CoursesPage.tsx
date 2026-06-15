import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadCoursesIndex, loadSubjects, loadGradeLevels } from '@/lib/data'
import { Loading, ErrorState, EmptyState } from '@/components/States'
import { CourseTree } from './CourseTree'
import type { CourseSummary } from '@/types'

type SortKey = 'title' | 'teacher' | 'gradeLevel' | 'subjectId'
type View = 'tree' | 'cards' | 'table'

export default function CoursesPage() {
  const index = useAsync(loadCoursesIndex, [])
  const subjects = useAsync(loadSubjects, [])
  const grades = useAsync(loadGradeLevels, [])

  const tree = index.data?.tree
  const hasTree = !!tree && tree.length > 0

  const [view, setView] = useState<View>('cards')
  // Default to tree view when the data has a tree.
  useEffect(() => {
    if (hasTree) setView('tree')
  }, [hasTree])

  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [grade, setGrade] = useState('')
  const [teacher, setTeacher] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<SortKey>('title')

  const courses = index.data?.courses ?? []
  const subjectName = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? id
  const gradeName = (id: string) => grades.data?.find((g) => g.id === id)?.name ?? id

  const teachers = useMemo(() => [...new Set(courses.map((c) => c.teacher))].sort(), [courses])
  const tags = useMemo(() => [...new Set(courses.flatMap((c) => c.tags))].sort(), [courses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = courses.filter((c) => {
      if (subject && c.subjectId !== subject) return false
      if (grade && c.gradeLevel !== grade) return false
      if (teacher && c.teacher !== teacher) return false
      if (tag && !c.tags.includes(tag)) return false
      if (q && !`${c.title} ${c.teacher}`.toLowerCase().includes(q)) return false
      return true
    })
    return out.sort((a, b) => String(a[sort]).localeCompare(String(b[sort]), 'vi'))
  }, [courses, search, subject, grade, teacher, tag, sort])

  if (index.loading) return <Loading />
  if (index.error) return <ErrorState message={index.error} onRetry={index.retry} />

  const views: { id: View; label: string }[] = [
    ...(hasTree ? [{ id: 'tree' as const, label: '🌳 Cây khóa học' }] : []),
    { id: 'cards', label: '🔲 Ô khóa học' },
    { id: 'table', label: '📋 Bảng bài học' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Khóa Học</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {views.map((v) => (
            <button
              key={v.id}
              className={v.id === view ? 'btn btn-primary' : 'btn'}
              style={{ fontSize: 13 }}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'tree' && hasTree ? (
        <CourseTree tree={tree} />
      ) : (
        <>
          <div
            className="surface"
            style={{
              borderRadius: 12,
              padding: 'var(--density-pad)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 8,
            }}
          >
            <input
              className="input"
              placeholder="Tìm theo tên khóa / giáo viên…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="select" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Tất cả cấp/lớp</option>
              {grades.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Tất cả môn</option>
              {subjects.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="select" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">Tất cả giáo viên</option>
              {teachers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Tất cả tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="title">Sắp xếp: Tên khóa</option>
              <option value="teacher">Sắp xếp: Giáo viên</option>
              <option value="gradeLevel">Sắp xếp: Lớp</option>
              <option value="subjectId">Sắp xếp: Môn</option>
            </select>
          </div>

          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
            {filtered.length} khóa học
          </p>

          {filtered.length === 0 ? (
            <EmptyState title="Không có khóa học phù hợp">Thử bỏ bớt bộ lọc.</EmptyState>
          ) : view === 'cards' ? (
            <CourseCards courses={filtered} subjectName={subjectName} gradeName={gradeName} />
          ) : (
            <CourseTable courses={filtered} subjectName={subjectName} gradeName={gradeName} />
          )}
        </>
      )}
    </div>
  )
}

function CourseCards({
  courses,
  subjectName,
  gradeName,
}: {
  courses: CourseSummary[]
  subjectName: (id: string) => string
  gradeName: (id: string) => string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--density-gap)' }}>
      {courses.map((c) => (
        <Link
          key={c.id}
          to={`/khoa-hoc/${c.id}`}
          className="surface"
          style={{ borderRadius: 12, padding: 16, textDecoration: 'none', color: 'var(--color-text)', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <strong style={{ fontSize: 16 }}>{c.title}</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span className="badge">{gradeName(c.gradeLevel)}</span>
            <span className="badge">{subjectName(c.subjectId)}</span>
          </div>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {c.teacher} · {c.lessonCount} bài
          </span>
        </Link>
      ))}
    </div>
  )
}

function CourseTable({
  courses,
  subjectName,
  gradeName,
}: {
  courses: CourseSummary[]
  subjectName: (id: string) => string
  gradeName: (id: string) => string
}) {
  return (
    <div className="surface" style={{ borderRadius: 12, overflow: 'auto' }}>
      <table className="course-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--color-surface-2)' }}>
            {['STT', 'Lớp', 'Môn', 'Giáo viên', 'Khóa', 'Số bài', 'Tags', ''].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {courses.map((c, i) => (
            <tr key={c.id} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={td}>{i + 1}</td>
              <td style={td}>{gradeName(c.gradeLevel)}</td>
              <td style={td}>{subjectName(c.subjectId)}</td>
              <td style={td}>{c.teacher}</td>
              <td style={td}>{c.title}</td>
              <td style={td}>{c.lessonCount}</td>
              <td style={td}>
                {c.tags.map((t) => (
                  <span key={t} className="badge" style={{ marginRight: 4 }}>
                    {t}
                  </span>
                ))}
              </td>
              <td style={td}>
                <Link className="btn btn-primary" to={`/khoa-hoc/${c.id}`} style={{ padding: '4px 10px', fontSize: 13 }}>
                  Mở
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 13 }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, verticalAlign: 'top' }
