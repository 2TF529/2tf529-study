import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadExamsIndex, loadSubjects, loadGradeLevels } from '@/lib/data'
import { Loading, ErrorState, EmptyState } from '@/components/States'
import type { ExamSummary } from '@/types'

export default function PracticePage() {
  const index = useAsync(loadExamsIndex, [])
  const subjects = useAsync(loadSubjects, [])
  const grades = useAsync(loadGradeLevels, [])

  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [examType, setExamType] = useState('')
  const [answerFilter, setAnswerFilter] = useState<'' | 'yes' | 'no'>('')
  const [search, setSearch] = useState('')

  const exams = index.data?.exams ?? []
  const subjectName = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? id
  const gradeName = (id: string) => grades.data?.find((g) => g.id === id)?.name ?? id

  const examTypes = useMemo(() => [...new Set(exams.map((e) => e.examType))].sort(), [exams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exams.filter((e) => {
      if (grade && e.gradeLevel !== grade) return false
      if (subject && e.subjectId !== subject) return false
      if (examType && e.examType !== examType) return false
      if (answerFilter === 'yes' && !e.hasAnswers) return false
      if (answerFilter === 'no' && e.hasAnswers) return false
      if (q && !e.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [exams, grade, subject, examType, answerFilter, search])

  if (index.loading) return <Loading />
  if (index.error) return <ErrorState message={index.error} onRetry={index.retry} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Phòng Luyện</h1>
        <Link to="/phong-luyen/random" className="btn btn-primary">
          🎲 Luyện Random
        </Link>
      </div>

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
        <input className="input" placeholder="Tìm đề…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Tất cả lớp/cấp</option>
          {grades.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Tất cả môn/kỳ thi</option>
          {subjects.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="select" value={examType} onChange={(e) => setExamType(e.target.value)}>
          <option value="">Tất cả loại đề</option>
          {examTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={answerFilter}
          onChange={(e) => setAnswerFilter(e.target.value as '' | 'yes' | 'no')}
        >
          <option value="">Đáp án: tất cả</option>
          <option value="yes">Có đáp án</option>
          <option value="no">Chưa có đáp án</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Không có đề phù hợp">Thử bỏ bớt bộ lọc.</EmptyState>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 'var(--density-gap)',
          }}
        >
          {filtered.map((e) => (
            <ExamCard key={e.id} exam={e} subjectName={subjectName} gradeName={gradeName} />
          ))}
        </div>
      )}
    </div>
  )
}

function ExamCard({
  exam,
  subjectName,
  gradeName,
}: {
  exam: ExamSummary
  subjectName: (id: string) => string
  gradeName: (id: string) => string
}) {
  return (
    <Link
      to={`/phong-luyen/de/${exam.id}`}
      className="surface"
      style={{
        borderRadius: 12,
        padding: 16,
        textDecoration: 'none',
        color: 'var(--color-text)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <strong style={{ fontSize: 16 }}>{exam.title}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <span className="badge">{gradeName(exam.gradeLevel)}</span>
        <span className="badge">{subjectName(exam.subjectId)}</span>
        <span className="badge">{exam.examType}</span>
        {exam.year && <span className="badge">{exam.year}</span>}
        <span className={exam.hasAnswers ? 'badge badge-success' : 'badge badge-danger'}>
          {exam.hasAnswers ? 'Có đáp án' : 'Chưa có đáp án'}
        </span>
      </div>
      {exam.sourceName && (
        <span className="text-muted" style={{ fontSize: 13 }}>
          Nguồn: {exam.sourceName}
        </span>
      )}
      {exam.durationMinutes && (
        <span className="text-muted" style={{ fontSize: 13 }}>
          ⏱ {exam.durationMinutes} phút
        </span>
      )}
    </Link>
  )
}
