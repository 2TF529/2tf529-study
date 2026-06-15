import { Markdown } from '@/components/Markdown'
import { scoreQuestion } from '@/lib/practice/scoring'
import type { Question, QuestionAnswer, TrueFalseAnswer } from '@/types'

interface Props {
  index: number
  question: Question
  answer: QuestionAnswer | undefined
  onChange: (answer: QuestionAnswer) => void
  // reveal correctness inline (immediate mode) or in review mode
  reveal?: boolean
  // fully locked (review after submit)
  locked?: boolean
}

export function QuestionView({ index, question, answer, onChange, reveal, locked }: Props) {
  const result = reveal ? scoreQuestion(question, answer) : null

  return (
    <div className="surface" style={{ borderRadius: 12, padding: 'var(--density-pad)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <span className="badge">Câu {index + 1}</span>
        {reveal && result?.scored && (
          <span className={result.correct ? 'badge badge-success' : 'badge badge-danger'}>
            {result.correct ? 'Đúng' : 'Chưa đúng'}
          </span>
        )}
      </div>

      <div style={{ fontWeight: 500 }}>
        <Markdown>{question.prompt}</Markdown>
      </div>

      {question.images?.map((img, i) => (
        <img key={i} src={img.src} alt={img.alt ?? ''} style={{ maxWidth: '100%', borderRadius: 8, margin: '8px 0' }} />
      ))}

      <div style={{ marginTop: 10 }}>
        {renderBody({ question, answer, onChange, locked: locked || (reveal ?? false), result })}
      </div>

      {reveal && question.explanation && (
        <div className="surface-2" style={{ borderRadius: 8, padding: 10, marginTop: 10, fontSize: 14 }}>
          <strong>Giải thích: </strong>
          <Markdown>{question.explanation}</Markdown>
        </div>
      )}
    </div>
  )
}

function renderBody({
  question,
  answer,
  onChange,
  locked,
  result,
}: {
  question: Question
  answer: QuestionAnswer | undefined
  onChange: (a: QuestionAnswer) => void
  locked: boolean
  result: ReturnType<typeof scoreQuestion> | null
}) {
  switch (question.type) {
    case 'single_choice':
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          {question.choices?.map((c) => {
            const selected = answer === c.id
            const isKey = result && question.correctChoiceIds?.includes(c.id)
            return (
              <ChoiceRow
                key={c.id}
                selected={selected}
                correct={!!isKey}
                showKey={!!result}
                disabled={locked}
                onClick={() => onChange(c.id)}
              >
                <Markdown>{c.text}</Markdown>
              </ChoiceRow>
            )
          })}
        </div>
      )

    case 'multiple_choice': {
      const arr = (answer as string[]) ?? []
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          {question.choices?.map((c) => {
            const selected = arr.includes(c.id)
            const isKey = result && question.correctChoiceIds?.includes(c.id)
            return (
              <ChoiceRow
                key={c.id}
                selected={selected}
                correct={!!isKey}
                showKey={!!result}
                disabled={locked}
                onClick={() =>
                  onChange(selected ? arr.filter((x) => x !== c.id) : [...arr, c.id])
                }
              >
                <Markdown>{c.text}</Markdown>
              </ChoiceRow>
            )
          })}
        </div>
      )
    }

    case 'true_false_group': {
      const given = (answer as TrueFalseAnswer) ?? {}
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          {question.statements?.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 14 }}>
                <Markdown>{s.text}</Markdown>
              </div>
              {(['Đúng', 'Sai'] as const).map((label, i) => {
                const val = i === 0
                const sel = given[s.id] === val
                const keyMatch = result && s.answer === val
                return (
                  <button
                    key={label}
                    disabled={locked}
                    className={sel ? 'btn btn-primary' : 'btn'}
                    style={{
                      padding: '4px 12px',
                      fontSize: 13,
                      ...(keyMatch ? { borderColor: 'var(--color-success)' } : {}),
                    }}
                    onClick={() => onChange({ ...given, [s.id]: val })}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )
    }

    case 'short_answer':
      return (
        <input
          className="input"
          placeholder="Nhập câu trả lời…"
          disabled={locked}
          value={(answer as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'essay_info':
      return (
        <textarea
          className="input"
          rows={5}
          placeholder="Phần này không chấm tự động. Bạn có thể tự làm để tham khảo."
          value={(answer as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    default:
      return null
  }
}

function ChoiceRow({
  selected,
  correct,
  showKey,
  disabled,
  onClick,
  children,
}: {
  selected: boolean
  correct: boolean
  showKey: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  let border = 'var(--color-border)'
  if (showKey && correct) border = 'var(--color-success)'
  else if (showKey && selected && !correct) border = 'var(--color-danger)'
  else if (selected) border = 'var(--color-primary)'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="surface"
      style={{
        textAlign: 'left',
        borderRadius: 8,
        padding: '8px 12px',
        borderColor: border,
        borderWidth: 2,
        cursor: disabled ? 'default' : 'pointer',
        background: selected ? 'var(--color-surface-2)' : 'var(--color-surface)',
        color: 'var(--color-text)',
      }}
    >
      {children}
    </button>
  )
}
