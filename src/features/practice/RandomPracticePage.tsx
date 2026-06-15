import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/lib/useAsync'
import { loadExamsIndex, loadExam, loadSubjects } from '@/lib/data'
import { Loading, ErrorState, EmptyState } from '@/components/States'
import { QuestionView } from './QuestionView'
import { seededShuffle, newSeed } from '@/lib/random'
import { scoreQuestion } from '@/lib/practice/scoring'
import type { Question, QuestionAnswer } from '@/types'

interface BankItem {
  question: Question
  subjectId: string
}

export default function RandomPracticePage() {
  const index = useAsync(loadExamsIndex, [])
  const subjects = useAsync(loadSubjects, [])

  const [subject, setSubject] = useState('')
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(() => newSeed())
  const [bank, setBank] = useState<BankItem[] | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({})

  const exams = index.data?.exams ?? []
  const subjectName = (id: string) => subjects.data?.find((s) => s.id === id)?.name ?? id

  // Only pull from exams that have answers (so practice is checkable).
  const candidateExams = useMemo(
    () => exams.filter((e) => e.hasAnswers && (!subject || e.subjectId === subject)),
    [exams, subject],
  )

  async function build() {
    setBuilding(true)
    setBuildError(null)
    setAnswers({})
    try {
      const loaded = await Promise.all(candidateExams.map((e) => loadExam(e.id)))
      const all: BankItem[] = loaded.flatMap((ex) =>
        ex.blocks
          .flatMap((b) => b.questions)
          .filter((q) => q.type !== 'essay_info')
          .map((q) => ({ question: q, subjectId: ex.subjectId })),
      )
      const picked = seededShuffle(all, seed).slice(0, count)
      setBank(picked)
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Lỗi tạo đề random')
    } finally {
      setBuilding(false)
    }
  }

  if (index.loading) return <Loading />
  if (index.error) return <ErrorState message={index.error} onRetry={index.retry} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap)' }}>
      <Link to="/phong-luyen" className="text-muted" style={{ fontSize: 14 }}>
        ← Về Phòng Luyện
      </Link>
      <h1 style={{ margin: 0 }}>Luyện Random</h1>

      <div
        className="surface"
        style={{ borderRadius: 12, padding: 'var(--density-pad)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}
      >
        <label style={{ fontSize: 13 }}>
          Môn/kỳ thi
          <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Tất cả</option>
            {subjects.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Số câu
          <input
            className="input"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value))))}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Seed (ổn định lượt random)
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
            <button className="btn" onClick={() => setSeed(newSeed())} title="Seed mới">
              🎲
            </button>
          </div>
        </label>
        <button className="btn btn-primary" onClick={build} disabled={building || candidateExams.length === 0}>
          {building ? 'Đang tạo…' : 'Tạo đề random'}
        </button>
      </div>

      {candidateExams.length === 0 && (
        <EmptyState title="Chưa có đề có đáp án để random">Thêm đề có đáp án vào ngân hàng.</EmptyState>
      )}

      {buildError && <ErrorState message={buildError} onRetry={build} />}

      {bank && bank.length === 0 && <EmptyState title="Không lấy được câu hỏi nào" />}

      {bank && bank.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
            {bank.length} câu · môn {subject ? subjectName(subject) : 'tất cả'}
          </p>
          {bank.map((item, i) => {
            const answer = answers[item.question.id]
            const result = scoreQuestion(item.question, answer)
            return (
              <div key={`${item.question.id}-${i}`}>
                <QuestionView
                  index={i}
                  question={item.question}
                  answer={answer}
                  onChange={(a) => setAnswers((prev) => ({ ...prev, [item.question.id]: a }))}
                  reveal={answer != null && result.scored}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
