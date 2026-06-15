import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadExam } from '@/lib/data'
import { Loading, ErrorState } from '@/components/States'
import { Markdown } from '@/components/Markdown'
import { QuestionView } from './QuestionView'
import { useAttempt } from './useAttempt'
import { Timer } from './Timer'
import { scoreExam } from '@/lib/practice/scoring'
import type { Exam, Question } from '@/types'

export default function ExamTakingPage() {
  const { examId = '' } = useParams()
  const { data: exam, loading, error, retry } = useAsync(() => loadExam(examId), [examId])

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} onRetry={retry} />
  if (!exam) return null
  return <ExamRunner exam={exam} />
}

function ExamRunner({ exam }: { exam: Exam }) {
  const { attempt, setAnswer, toggleFlag, submit, reset } = useAttempt(exam.id)
  const [immediate, setImmediate] = useState(false)
  const submitted = !!attempt.submittedAt

  const questions = useMemo<Question[]>(
    () => exam.blocks.flatMap((b) => b.questions),
    [exam],
  )

  const result = useMemo(
    () => (submitted ? scoreExam(questions, attempt.answers, exam.hasAnswers) : null),
    [submitted, questions, attempt.answers, exam.hasAnswers],
  )

  const answeredCount = questions.filter((q) => {
    const a = attempt.answers[q.id]
    if (a == null) return false
    if (typeof a === 'string') return a.trim() !== ''
    if (Array.isArray(a)) return a.length > 0
    return Object.keys(a).length > 0
  }).length

  const handleSubmit = () => {
    if (window.confirm('Nộp bài? Bạn sẽ không thể sửa sau khi nộp.')) submit()
  }

  let counter = 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Link to="/phong-luyen" className="text-muted" style={{ fontSize: 14 }}>
        ← Về Phòng Luyện
      </Link>

      <div className="surface" style={{ borderRadius: 12, padding: 'var(--density-pad)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>{exam.title}</h1>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {answeredCount}/{questions.length} câu · {exam.hasAnswers ? 'Có đáp án' : 'Chưa có đáp án'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {exam.durationMinutes && !submitted && (
            <Timer startedAt={attempt.startedAt} minutes={exam.durationMinutes} onExpire={submit} />
          )}
          {exam.hasAnswers && !submitted && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
              Biết đúng/sai ngay
            </label>
          )}
        </div>
      </div>

      {result && <ResultPanel exam={exam} result={result} onRetry={reset} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {exam.blocks.map((block) => (
            <section key={block.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{block.title}</h2>
              {block.description && (
                <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
                  {block.description}
                </p>
              )}
              {block.passage && (
                <div className="surface-2" style={{ borderRadius: 8, padding: 12, fontSize: 14 }}>
                  <Markdown>{block.passage}</Markdown>
                </div>
              )}
              {block.questions.map((q) => {
                const idx = counter++
                return (
                  <div key={q.id} id={`q-${q.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {!submitted && (
                        <button
                          className="btn"
                          style={{ padding: '2px 8px', fontSize: 12, marginBottom: -8, zIndex: 1, position: 'relative' }}
                          onClick={() => toggleFlag(q.id)}
                        >
                          {attempt.flagged.includes(q.id) ? '★ Bỏ đánh dấu' : '☆ Đánh dấu'}
                        </button>
                      )}
                    </div>
                    <QuestionView
                      index={idx}
                      question={q}
                      answer={attempt.answers[q.id]}
                      onChange={(a) => setAnswer(q.id, a)}
                      reveal={submitted || (immediate && exam.hasAnswers)}
                      locked={submitted}
                    />
                  </div>
                )
              })}
            </section>
          ))}

          {!submitted && (
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={handleSubmit}>
              Nộp bài
            </button>
          )}
        </div>

        <aside className="surface" style={{ borderRadius: 12, padding: 12, position: 'sticky', top: 72 }}>
          <strong style={{ fontSize: 14 }}>Câu hỏi</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 8 }}>
            {questions.map((q, i) => {
              const answered = attempt.answers[q.id] != null
              const flagged = attempt.flagged.includes(q.id)
              return (
                <a
                  key={q.id}
                  href={`#q-${q.id}`}
                  className="btn"
                  style={{
                    padding: 0,
                    height: 30,
                    fontSize: 12,
                    borderColor: flagged ? 'var(--color-danger)' : 'var(--color-border)',
                    background: answered ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: answered ? 'var(--color-primary-contrast)' : 'var(--color-text)',
                  }}
                >
                  {i + 1}
                </a>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}

function ResultPanel({
  exam,
  result,
  onRetry,
}: {
  exam: Exam
  result: ReturnType<typeof scoreExam>
  onRetry: () => void
}) {
  if (!exam.hasAnswers) {
    return (
      <div className="surface" style={{ borderRadius: 12, padding: 16, borderLeft: '4px solid var(--color-danger)' }}>
        <strong>Đã lưu bài làm của bạn.</strong>
        <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
          Đề này chưa có đáp án nên không tính điểm. Bạn có thể xem lại bài làm bên dưới.
        </p>
      </div>
    )
  }
  const scaled = result.max > 0 ? (result.total / result.max) * 10 : 0
  return (
    <div className="surface" style={{ borderRadius: 12, padding: 16, borderLeft: '4px solid var(--color-success)', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{scaled.toFixed(2)}/10</div>
        <span className="text-muted" style={{ fontSize: 13 }}>
          {result.total.toFixed(2)}/{result.max} điểm thô
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <span className="badge badge-success">Đúng: {result.correctCount}</span>
        <span className="badge badge-danger">Sai: {result.wrongCount}</span>
        <span className="badge">Bỏ trống: {result.blankCount}</span>
      </div>
      <button className="btn" style={{ marginLeft: 'auto' }} onClick={onRetry}>
        Làm lại
      </button>
    </div>
  )
}
