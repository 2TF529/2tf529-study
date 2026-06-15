import { fetchJson, dataUrl } from './fetchJson'
import {
  announcementsSchema,
  coursesIndexSchema,
  courseSchema,
  examsIndexSchema,
  examSchema,
  gradeLevelsSchema,
  subjectsSchema,
} from './schemas'
import type {
  Announcement,
  Course,
  CoursesIndex,
  Exam,
  ExamsIndex,
  GradeLevel,
  Subject,
} from '@/types'

export async function loadSubjects(): Promise<Subject[]> {
  const d = await fetchJson(dataUrl('site/subjects.json'), subjectsSchema)
  return d.subjects
}

export async function loadGradeLevels(): Promise<GradeLevel[]> {
  const d = await fetchJson(dataUrl('site/grade-levels.json'), gradeLevelsSchema)
  return d.gradeLevels
}

export async function loadAnnouncements(): Promise<Announcement[]> {
  const d = await fetchJson(dataUrl('site/announcements.json'), announcementsSchema)
  return d.announcements
}

export async function loadCoursesIndex(): Promise<CoursesIndex> {
  return fetchJson(dataUrl('courses/index.json'), coursesIndexSchema)
}

export async function loadCourse(id: string): Promise<Course> {
  return fetchJson(dataUrl(`courses/${id}.json`), courseSchema)
}

export async function loadExamsIndex(): Promise<ExamsIndex> {
  return fetchJson(dataUrl('exams/index.json'), examsIndexSchema)
}

export async function loadExam(id: string): Promise<Exam> {
  return fetchJson(dataUrl(`exams/${id}.json`), examSchema)
}
