import type { Question, QuestionAnswer, TrueFalseAnswer } from '@/types'

export interface QuestionResult {
  questionId: string
  scored: boolean // false when the question has no answer key
  correct: boolean
  score: number // 0..maxScore
  maxScore: number
}

export interface ExamResult {
  total: number
  max: number
  correctCount: number
  wrongCount: number
  blankCount: number
  scoredCount: number
  perQuestion: QuestionResult[]
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

function isBlank(answer: QuestionAnswer | undefined): boolean {
  if (answer == null) return true
  if (typeof answer === 'string') return answer.trim() === ''
  if (Array.isArray(answer)) return answer.length === 0
  return Object.keys(answer).length === 0
}

/** Score a single question against its answer key. */
export function scoreQuestion(
  question: Question,
  answer: QuestionAnswer | undefined,
): QuestionResult {
  const maxScore = question.points ?? 1
  const base = { questionId: question.id, maxScore }

  // essay_info is never auto-scored.
  if (question.type === 'essay_info') {
    return { ...base, scored: false, correct: false, score: 0 }
  }

  const blank = isBlank(answer)

  switch (question.type) {
    case 'single_choice': {
      const key = question.correctChoiceIds
      if (!key || key.length === 0) return { ...base, scored: false, correct: false, score: 0 }
      if (blank) return { ...base, scored: true, correct: false, score: 0 }
      const correct = answer === key[0]
      return { ...base, scored: true, correct, score: correct ? maxScore : 0 }
    }

    case 'multiple_choice': {
      const key = question.correctChoiceIds
      if (!key) return { ...base, scored: false, correct: false, score: 0 }
      if (blank) return { ...base, scored: true, correct: false, score: 0 }
      const selected = new Set(answer as string[])
      const keySet = new Set(key)
      const allCorrectSelected = key.every((id) => selected.has(id))
      const noExtra = [...selected].every((id) => keySet.has(id))

      if (question.partialCredit) {
        const correctHits = key.filter((id) => selected.has(id)).length
        const wrongHits = [...selected].filter((id) => !keySet.has(id)).length
        const raw = Math.max(0, correctHits - wrongHits)
        const score = (raw / key.length) * maxScore
        return {
          ...base,
          scored: true,
          correct: allCorrectSelected && noExtra,
          score,
        }
      }

      const correct = allCorrectSelected && noExtra
      return { ...base, scored: true, correct, score: correct ? maxScore : 0 }
    }

    case 'true_false_group': {
      const statements = question.statements ?? []
      const hasKey = statements.some((s) => typeof s.answer === 'boolean')
      if (!hasKey) return { ...base, scored: false, correct: false, score: 0 }
      const given = (answer as TrueFalseAnswer) ?? {}
      const total = statements.length
      let hits = 0
      for (const s of statements) {
        if (typeof s.answer !== 'boolean') continue
        if (given[s.id] === s.answer) hits++
      }
      const allCorrect = hits === total

      if (question.groupScoring === 'all_or_nothing') {
        return { ...base, scored: true, correct: allCorrect, score: allCorrect ? maxScore : 0 }
      }
      // per_statement (default)
      const score = total > 0 ? (hits / total) * maxScore : 0
      return { ...base, scored: true, correct: allCorrect, score }
    }

    case 'short_answer': {
      const accept = question.acceptableAnswers
      if (!accept || accept.length === 0)
        return { ...base, scored: false, correct: false, score: 0 }
      if (blank) return { ...base, scored: true, correct: false, score: 0 }
      const given = normalize(String(answer))
      const ci = question.caseInsensitive ?? false
      const correct = accept.some((a) => {
        const target = normalize(a)
        return ci ? target.toLowerCase() === given.toLowerCase() : target === given
      })
      return { ...base, scored: true, correct, score: correct ? maxScore : 0 }
    }

    default:
      return { ...base, scored: false, correct: false, score: 0 }
  }
}

/** Score a whole exam. When hasAnswers=false, nothing is scored. */
export function scoreExam(
  questions: Question[],
  answers: Record<string, QuestionAnswer>,
  hasAnswers = true,
): ExamResult {
  let total = 0
  let max = 0
  let correctCount = 0
  let wrongCount = 0
  let blankCount = 0
  let scoredCount = 0
  const perQuestion: QuestionResult[] = []

  for (const q of questions) {
    const answer = answers[q.id]
    if (!hasAnswers) {
      perQuestion.push({
        questionId: q.id,
        scored: false,
        correct: false,
        score: 0,
        maxScore: q.points ?? 1,
      })
      continue
    }

    const r = scoreQuestion(q, answer)
    perQuestion.push(r)
    if (!r.scored) continue

    scoredCount++
    max += r.maxScore
    total += r.score

    if (isBlank(answer)) {
      blankCount++
    } else if (r.correct) {
      correctCount++
    } else {
      wrongCount++
    }
  }

  return { total, max, correctCount, wrongCount, blankCount, scoredCount, perQuestion }
}
