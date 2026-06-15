import { z } from 'zod'

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().optional(),
})

export const gradeLevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().optional(),
})

export const announcementSchema = z.object({
  id: z.string(),
  version: z.number(),
  title: z.string(),
  body: z.string(),
  level: z.enum(['info', 'warning', 'success']).optional(),
})

export const subjectsSchema = z.object({ subjects: z.array(subjectSchema) })
export const gradeLevelsSchema = z.object({ gradeLevels: z.array(gradeLevelSchema) })
export const announcementsSchema = z.object({ announcements: z.array(announcementSchema) })

// ----- Courses -----

export const lessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  videoUrl: z.string().optional(),
  embedUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  answerUrl: z.string().optional(),
  solutionUrl: z.string().optional(),
  durationLabel: z.string().optional(),
})

export const courseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  gradeLevel: z.string(),
  subjectId: z.string(),
  teacher: z.string(),
  tags: z.array(z.string()).default([]),
  lessonCount: z.number(),
})

export const treeNodeTypeSchema = z.enum([
  'root',
  'subject',
  'teacher',
  'provider',
  'course',
  'section',
  'chapter',
  'phase',
  'folder',
  'lesson',
])

// Recursive schema for global course tree nodes.
export type CourseTreeNodeInput = {
  id: string
  type: z.infer<typeof treeNodeTypeSchema>
  title?: string
  courseId?: string
  lessonId?: string
  children?: CourseTreeNodeInput[]
}

export const courseTreeNodeSchema: z.ZodType<CourseTreeNodeInput> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: treeNodeTypeSchema,
    title: z.string().optional(),
    courseId: z.string().optional(),
    lessonId: z.string().optional(),
    children: z.array(courseTreeNodeSchema).optional(),
  }),
)

// Recursive schema for course detail outline nodes.
export type OutlineNodeInput = {
  id: string
  type: z.infer<typeof treeNodeTypeSchema>
  title?: string
  lessonId?: string
  children?: OutlineNodeInput[]
}

export const outlineNodeSchema: z.ZodType<OutlineNodeInput> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: treeNodeTypeSchema,
    title: z.string().optional(),
    lessonId: z.string().optional(),
    children: z.array(outlineNodeSchema).optional(),
  }),
)

export const courseSchema = courseSummarySchema.extend({
  description: z.string().optional(),
  lessons: z.array(lessonSchema),
  breadcrumbs: z.array(z.string()).optional(),
  outline: z.array(outlineNodeSchema).optional(),
  importSourceId: z.string().optional(),
})

export const coursesIndexSchema = z.object({
  schema: z.string().optional(),
  gradeLevel: z.string().optional(),
  courses: z.array(courseSummarySchema).default([]),
  tree: z.array(courseTreeNodeSchema).optional(),
})

// ----- Exams -----

export const choiceSchema = z.object({ id: z.string(), text: z.string() })

export const tfStatementSchema = z.object({
  id: z.string(),
  text: z.string(),
  answer: z.boolean().optional(),
})

export const questionImageSchema = z.object({
  src: z.string(),
  alt: z.string().optional(),
})

export const questionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'single_choice',
    'multiple_choice',
    'true_false_group',
    'short_answer',
    'essay_info',
  ]),
  prompt: z.string(),
  images: z.array(questionImageSchema).optional(),
  explanation: z.string().optional(),
  choices: z.array(choiceSchema).optional(),
  correctChoiceIds: z.array(z.string()).optional(),
  partialCredit: z.boolean().optional(),
  statements: z.array(tfStatementSchema).optional(),
  groupScoring: z.enum(['per_statement', 'all_or_nothing']).optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  caseInsensitive: z.boolean().optional(),
  points: z.number().optional(),
})

export const examBlockSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  passage: z.string().optional(),
  questions: z.array(questionSchema),
})

export const examSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  gradeLevel: z.string(),
  subjectId: z.string(),
  examSystem: z.string(),
  examType: z.string(),
  durationMinutes: z.number().optional(),
  hasAnswers: z.boolean(),
  sourceName: z.string().optional(),
  year: z.number().optional(),
  topics: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

export const examSchema = examSummarySchema.extend({
  blocks: z.array(examBlockSchema),
})

export const examsIndexSchema = z.object({ exams: z.array(examSummarySchema) })
