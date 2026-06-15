import { useCallback, useEffect, useState } from 'react'
import { session } from '@/lib/storage'
import type { AttemptState, QuestionAnswer } from '@/types'

// Attempts are session-scoped (sessionStorage) so refresh resumes the run.
function key(examId: string) {
  return `tf529.attempt.${examId}`
}

export function useAttempt(examId: string) {
  const [attempt, setAttempt] = useState<AttemptState>(() =>
    session.getJson<AttemptState>(key(examId), {
      examId,
      answers: {},
      flagged: [],
      startedAt: Date.now(),
    }),
  )

  useEffect(() => {
    session.setJson(key(examId), attempt)
  }, [examId, attempt])

  const setAnswer = useCallback((qId: string, answer: QuestionAnswer) => {
    setAttempt((a) => ({ ...a, answers: { ...a.answers, [qId]: answer } }))
  }, [])

  const toggleFlag = useCallback((qId: string) => {
    setAttempt((a) => ({
      ...a,
      flagged: a.flagged.includes(qId)
        ? a.flagged.filter((id) => id !== qId)
        : [...a.flagged, qId],
    }))
  }, [])

  const submit = useCallback(() => {
    setAttempt((a) => ({ ...a, submittedAt: Date.now() }))
  }, [])

  const reset = useCallback(() => {
    const fresh: AttemptState = { examId, answers: {}, flagged: [], startedAt: Date.now() }
    session.setJson(key(examId), fresh)
    setAttempt(fresh)
  }, [examId])

  return { attempt, setAnswer, toggleFlag, submit, reset }
}
