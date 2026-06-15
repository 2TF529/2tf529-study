import type { Course, Exam } from '@/types'

export const sampleCourse: Course = {
  id: 'course-mau-1',
  title: 'Khóa mẫu',
  gradeLevel: 'lop-10',
  subjectId: 'toan',
  teacher: 'Thầy/Cô Mẫu',
  tags: ['mẫu'],
  lessonCount: 1,
  description: 'Mô tả khóa học mẫu.',
  lessons: [
    {
      id: 'bai-1',
      title: 'Bài 1: Mở đầu',
      videoUrl: 'https://vk.com/video_ext.php?oid=0&id=0',
      embedUrl: '',
      documentUrl: 'https://drive.google.com/',
      durationLabel: '12:00',
    },
  ],
}

export const sampleExam: Exam = {
  id: 'exam-mau-1',
  title: 'Đề mẫu',
  description: 'Đề mẫu sinh tự động.',
  gradeLevel: 'lop-10',
  subjectId: 'toan',
  examSystem: 'truong',
  examType: 'Giữa kì 1',
  durationMinutes: 45,
  hasAnswers: true,
  sourceName: 'Nội bộ',
  year: 2025,
  topics: ['mẫu'],
  tags: ['mẫu'],
  blocks: [
    {
      id: 'block-1',
      title: 'Trắc nghiệm',
      questions: [
        {
          id: 'q1',
          type: 'single_choice',
          prompt: 'Giá trị của $2 + 2$ là?',
          choices: [
            { id: 'a', text: '3' },
            { id: 'b', text: '4' },
          ],
          correctChoiceIds: ['b'],
          explanation: '$2 + 2 = 4$.',
        },
      ],
    },
  ],
}
