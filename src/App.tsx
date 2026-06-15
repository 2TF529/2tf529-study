  import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Layout } from '@/components/layout/Layout'
import { Loading } from '@/components/States'

const HomePage = lazy(() => import('@/features/home/HomePage'))
const CoursesPage = lazy(() => import('@/features/courses/CoursesPage'))
const CourseDetailPage = lazy(() => import('@/features/courses/CourseDetailPage'))
const CoursePlayerPage = lazy(() => import('@/features/courses/CoursePlayerPage'))
const PracticePage = lazy(() => import('@/features/practice/PracticePage'))
const ExamTakingPage = lazy(() => import('@/features/practice/ExamTakingPage'))
const RandomPracticePage = lazy(() => import('@/features/practice/RandomPracticePage'))
const AdminPage = lazy(() => import('@/features/admin/AdminPage'))
const NotFoundPage = lazy(() => import('@/features/home/NotFoundPage'))

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="khoa-hoc" element={<CoursesPage />} />
              <Route path="khoa-hoc/:courseId" element={<CourseDetailPage />} />
              <Route path="khoa-hoc/:courseId/:lessonId" element={<CoursePlayerPage />} />
              <Route path="phong-luyen" element={<PracticePage />} />
              <Route path="phong-luyen/random" element={<RandomPracticePage />} />
              <Route path="phong-luyen/de/:examId" element={<ExamTakingPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}
