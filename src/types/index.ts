// Core domain types for 2TF529 Learning Platform.

export interface Subject {
  id: string
  name: string
  order?: number
}

export interface GradeLevel {
  id: string
  name: string
  order?: number
}

export interface Announcement {
  id: string
  version: number
  title: string
  body: string
  level?: 'info' | 'warning' | 'success'
}

export interface NavItem {
  label: string
  to: string
}

// ---------- Courses ----------

export interface LessonResource {
  label: string
  url: string
}

export interface Lesson {
  id: string
  title: string
  videoUrl?: string
  embedUrl?: string
  documentUrl?: string
  answerUrl?: string
  solutionUrl?: string
  durationLabel?: string
}

export interface CourseSummary {
  id: string
  title: string
  gradeLevel: string
  subjectId: string
  teacher: string
  tags: string[]
  lessonCount: number
}

// ---------- Course tree / outline (v2) ----------

export type TreeNodeType =
  | 'root'
  | 'subject'
  | 'teacher'
  | 'provider'
  | 'course'
  | 'section'
  | 'chapter'
  | 'phase'
  | 'folder'
  | 'lesson'

// Node used in the global /khoa-hoc tree (courses/index.json -> tree).
export interface CourseTreeNode {
  id: string
  type: TreeNodeType
  title?: string
  // course nodes point to a detail file; lesson nodes also carry courseId
  courseId?: string
  lessonId?: string
  children?: CourseTreeNode[]
}

// Node used inside a course detail file (course.outline).
export interface OutlineNode {
  id: string
  type: TreeNodeType
  title?: string
  lessonId?: string
  children?: OutlineNode[]
}

export interface Course extends CourseSummary {
  description?: string
  lessons: Lesson[]
  // v2 optional fields (backward compatible)
  breadcrumbs?: string[]
  outline?: OutlineNode[]
  importSourceId?: string
}

export interface CoursesIndex {
  // v1: flat courses only. v2: optional tree + gradeLevel + schema.
  schema?: string
  gradeLevel?: string
  courses: CourseSummary[]
  tree?: CourseTreeNode[]
}

// ---------- Exams / Questions ----------

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false_group'
  | 'short_answer'
  | 'essay_info'

export interface QuestionImage {
  src: string
  alt?: string
}

export interface Choice {
  id: string
  text: string
}

export interface TrueFalseStatement {
  id: string
  text: string
  answer?: boolean
}

export interface Question {
  id: string
  type: QuestionType
  prompt: string
  images?: QuestionImage[]
  explanation?: string
  // single / multiple choice
  choices?: Choice[]
  correctChoiceIds?: string[]
  partialCredit?: boolean
  // true_false_group
  statements?: TrueFalseStatement[]
  groupScoring?: 'per_statement' | 'all_or_nothing'
  // short answer
  acceptableAnswers?: string[]
  caseInsensitive?: boolean
  points?: number
}

export interface ExamBlock {
  id: string
  title: string
  description?: string
  passage?: string
  questions: Question[]
}

export interface ExamSummary {
  id: string
  title: string
  description?: string
  gradeLevel: string
  subjectId: string
  examSystem: string
  examType: string
  durationMinutes?: number
  hasAnswers: boolean
  sourceName?: string
  year?: number
  topics?: string[]
  tags?: string[]
}

export interface Exam extends ExamSummary {
  blocks: ExamBlock[]
}

export interface ExamsIndex {
  exams: ExamSummary[]
}

// ---------- Answers / Attempt ----------

export type SingleAnswer = string | null
export type MultipleAnswer = string[]
export type ShortAnswer = string
export type TrueFalseAnswer = Record<string, boolean>

export type QuestionAnswer =
  | SingleAnswer
  | MultipleAnswer
  | ShortAnswer
  | TrueFalseAnswer

export interface AttemptState {
  examId: string
  answers: Record<string, QuestionAnswer>
  flagged: string[]
  startedAt: number
  submittedAt?: number
}
