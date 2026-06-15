import { describe, it, expect } from 'vitest'
import { scoreQuestion, scoreExam } from './scoring'
import type { Question } from '@/types'

const single: Question = {
  id: 'q1',
  type: 'single_choice',
  prompt: '1 + 1 = ?',
  choices: [
    { id: 'a', text: '1' },
    { id: 'b', text: '2' },
  ],
  correctChoiceIds: ['b'],
}

const multi: Question = {
  id: 'q2',
  type: 'multiple_choice',
  prompt: 'Chọn số chẵn',
  choices: [
    { id: 'a', text: '2' },
    { id: 'b', text: '3' },
    { id: 'c', text: '4' },
  ],
  correctChoiceIds: ['a', 'c'],
}

const tf: Question = {
  id: 'q3',
  type: 'true_false_group',
  prompt: 'Mệnh đề',
  statements: [
    { id: 's1', text: 'A', answer: true },
    { id: 's2', text: 'B', answer: false },
  ],
}

const short: Question = {
  id: 'q4',
  type: 'short_answer',
  prompt: 'Thủ đô Việt Nam?',
  acceptableAnswers: ['Hà Nội'],
  caseInsensitive: true,
}

describe('single_choice', () => {
  it('correct', () => {
    expect(scoreQuestion(single, 'b').correct).toBe(true)
    expect(scoreQuestion(single, 'b').score).toBe(1)
  })
  it('wrong', () => {
    expect(scoreQuestion(single, 'a').correct).toBe(false)
  })
  it('blank', () => {
    const r = scoreQuestion(single, null)
    expect(r.scored).toBe(true)
    expect(r.correct).toBe(false)
  })
})

describe('multiple_choice', () => {
  it('all correct, no extra', () => {
    expect(scoreQuestion(multi, ['a', 'c']).correct).toBe(true)
  })
  it('missing one is wrong', () => {
    expect(scoreQuestion(multi, ['a']).correct).toBe(false)
  })
  it('extra selection is wrong', () => {
    expect(scoreQuestion(multi, ['a', 'b', 'c']).correct).toBe(false)
  })
  it('partial credit', () => {
    const pc = { ...multi, partialCredit: true }
    // 1 correct hit, 0 wrong => 1/2 of max
    expect(scoreQuestion(pc, ['a']).score).toBeCloseTo(0.5)
    // 1 correct + 1 wrong => (1-1)/2 = 0
    expect(scoreQuestion(pc, ['a', 'b']).score).toBeCloseTo(0)
  })
})

describe('true_false_group', () => {
  it('per statement scoring', () => {
    const r = scoreQuestion(tf, { s1: true, s2: true }) // 1 of 2 correct
    expect(r.score).toBeCloseTo(0.5)
    expect(r.correct).toBe(false)
  })
  it('all correct', () => {
    const r = scoreQuestion(tf, { s1: true, s2: false })
    expect(r.correct).toBe(true)
    expect(r.score).toBe(1)
  })
  it('all_or_nothing', () => {
    const q = { ...tf, groupScoring: 'all_or_nothing' as const }
    expect(scoreQuestion(q, { s1: true, s2: true }).score).toBe(0)
  })
})

describe('short_answer', () => {
  it('exact match', () => {
    const ci = { ...short, caseInsensitive: false }
    expect(scoreQuestion(ci, 'Hà Nội').correct).toBe(true)
  })
  it('normalizes whitespace', () => {
    expect(scoreQuestion(short, '  Hà   Nội  ').correct).toBe(true)
  })
  it('case insensitive', () => {
    expect(scoreQuestion(short, 'hà nội').correct).toBe(true)
  })
  it('acceptable answers array', () => {
    const q = { ...short, acceptableAnswers: ['Hà Nội', 'Ha Noi'], caseInsensitive: true }
    expect(scoreQuestion(q, 'ha noi').correct).toBe(true)
  })
})

describe('no-answer question', () => {
  it('essay_info never scored', () => {
    const q: Question = { id: 'e', type: 'essay_info', prompt: 'Viết đoạn văn' }
    expect(scoreQuestion(q, 'bất kỳ').scored).toBe(false)
  })
  it('single without key not scored', () => {
    const q: Question = { ...single, correctChoiceIds: [] }
    expect(scoreQuestion(q, 'b').scored).toBe(false)
  })
})

describe('immediate mode re-selection', () => {
  it('final answer counts', () => {
    // simulate user changing answer: only final value passed to scoring
    let answer = 'a'
    answer = 'b' // user re-selects
    expect(scoreQuestion(single, answer).correct).toBe(true)
  })
})

describe('scoreExam', () => {
  it('aggregates correctly', () => {
    const r = scoreExam([single, multi, tf, short], {
      q1: 'b',
      q2: ['a', 'c'],
      q3: { s1: true, s2: false },
      q4: 'Hà Nội',
    })
    expect(r.correctCount).toBe(4)
    expect(r.total).toBeCloseTo(r.max)
  })
  it('counts blanks', () => {
    const r = scoreExam([single, multi], { q1: 'b' })
    expect(r.correctCount).toBe(1)
    expect(r.blankCount).toBe(1)
  })
  it('no-answer exam scores nothing', () => {
    const r = scoreExam([single, multi], { q1: 'b', q2: ['a', 'c'] }, false)
    expect(r.scoredCount).toBe(0)
    expect(r.max).toBe(0)
  })
})
