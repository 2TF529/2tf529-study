import type { CourseTreeNode, TreeNodeType } from '@/types'

/**
 * Notion Markdown -> course tree parser that PRESERVES hierarchy.
 * No external deps. Handles headings, markdown tables, and `---` separated rows.
 */

const SUBJECTS = [
  'TOÁN',
  'VĂN',
  'NGỮ VĂN',
  'ANH',
  'TIẾNG ANH',
  'LÝ',
  'VẬT LÍ',
  'HÓA',
  'HÓA HỌC',
  'SINH',
  'SINH HỌC',
  'SỬ',
  'LỊCH SỬ',
  'ĐỊA',
  'ĐỊA LÍ',
  'HSA',
  'TSA',
  'V-ACT',
]

// Vietnamese-aware slug (keeps ascii after removing diacritics).
export function slugify(input: string): string {
  const map: Record<string, string> = { đ: 'd', Đ: 'd' }
  const replaced = input.replace(/[đĐ]/g, (c) => map[c] ?? c)
  return replaced
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

function upper(s: string): string {
  return s.normalize('NFC').toUpperCase()
}

function isSubjectHeading(title: string): boolean {
  const t = upper(title.trim())
  return SUBJECTS.includes(t)
}

function isTeacherHeading(title: string): boolean {
  const t = upper(title)
  return /THẦY|CÔ/.test(t) || (t.includes(' - ') && SUBJECTS.some((s) => t.startsWith(s + ' -')))
}

function isCourseHeading(title: string): boolean {
  const t = upper(title)
  return /KHÓA|KHOÁ|CHUYÊN ĐỀ|TỔNG ÔN|LUYỆN ĐỀ|NỀN TẢNG/.test(t)
}

function classifyHeading(level: number, title: string): TreeNodeType {
  if (isSubjectHeading(title)) return 'subject'
  if (level === 1) {
    if (isTeacherHeading(title)) return 'provider'
    if (isCourseHeading(title)) return 'course'
    return 'provider'
  }
  if (level === 2) return isCourseHeading(title) ? 'course' : 'course'
  // deeper headings are structural
  if (isCourseHeading(title)) return 'section'
  return 'section'
}

// Detect chapter/phase vs generic section by keyword.
function sectionType(title: string): TreeNodeType {
  const t = upper(title)
  if (/CHƯƠNG/.test(t)) return 'chapter'
  if (/GIAI ĐOẠN|GIÃI ĐOẠN|GIAI ĐOAN/.test(t)) return 'phase'
  return 'section'
}

interface ParsedRow {
  cells: string[]
}

function parseTableRow(line: string): ParsedRow | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  // skip separator rows like |---|---|
  if (/^\|[\s:-]+\|?$/.test(trimmed.replace(/\|/g, '|'))) {
    if (/^[\s|:-]+$/.test(trimmed)) return null
  }
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
  if (cells.every((c) => /^[-:\s]*$/.test(c))) return null
  return { cells }
}

export function extractUrl(cell: string): string | undefined {
  // markdown link [text](url) or bare url
  const md = cell.match(/\]\((https?:\/\/[^)]+)\)/)
  if (md) return md[1]
  const bare = cell.match(/https?:\/\/\S+/)
  return bare ? bare[0] : undefined
}

function stripBold(s: string): { text: string; bold: boolean } {
  const m = s.match(/^\*\*(.+?)\*\*$/)
  if (m) return { text: m[1].trim(), bold: true }
  return { text: s.trim(), bold: false }
}

export interface ParseStats {
  subjects: number
  teachers: number
  courses: number
  sections: number
  lessons: number
  lessonsWithUrl: number
  lessonsMissingLink: number
}

export interface ParseResult {
  tree: CourseTreeNode[]
  stats: ParseStats
}

/**
 * Parse Notion markdown into a course tree.
 * `rootTitle` becomes the single root node (e.g. "Khóa 12 - 2026").
 */
export function parseNotionMarkdown(markdown: string, rootTitle = 'Khóa 12 - 2026'): ParseResult {
  const root: CourseTreeNode = { id: slugify(rootTitle) || 'root', type: 'root', title: rootTitle, children: [] }

  // Stack of [node, headingLevel]. headingLevel 0 = root.
  const stack: { node: CourseTreeNode; level: number }[] = [{ node: root, level: 0 }]
  const usedIds = new Set<string>([root.id])

  function uniqueId(base: string): string {
    let id = base || 'node'
    let i = 2
    while (usedIds.has(id)) id = `${base}-${i++}`
    usedIds.add(id)
    return id
  }

  function currentCourse(): CourseTreeNode | null {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].node.type === 'course') return stack[i].node
    }
    return null
  }

  function push(parent: CourseTreeNode, node: CourseTreeNode, level: number) {
    parent.children = parent.children ?? []
    parent.children.push(node)
    stack.push({ node, level })
  }

  const headerKeywords = { lecture: /BÀI GIẢNG/i, doc: /TÀI LIỆU/i }
  let inTableHeader = false

  const lines = markdown.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      inTableHeader = false
      continue
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      inTableHeader = false
      const level = h[1].length
      const title = h[2].replace(/\*\*/g, '').trim()
      const type = classifyHeading(level, title)

      // Pop stack to a parent with a lower heading level than this one.
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }
      const parent = stack[stack.length - 1].node
      const node: CourseTreeNode = { id: uniqueId(slugify(title)), type, title }
      if (type === 'course') node.courseId = node.id
      push(parent, node, level)
      continue
    }

    // Table rows
    const row = parseTableRow(line)
    if (row) {
      // header row detection
      if (
        !inTableHeader &&
        row.cells.some((c) => headerKeywords.lecture.test(c) || headerKeywords.doc.test(c) || /STT|TÊN|BÀI/i.test(c))
      ) {
        inTableHeader = true
        continue
      }

      const parent = stack[stack.length - 1].node
      const firstCell = stripBold(row.cells[0] ?? '')
      const restEmpty = row.cells.slice(1).every((c) => c === '' || c === '—' || c === '-')

      // Section/chapter row: bold first cell, rest empty.
      if (firstCell.bold && restEmpty && firstCell.text) {
        // pop to current course (sections live under course or under a section)
        const course = currentCourse()
        const secParent = course ?? parent
        const node: CourseTreeNode = {
          id: uniqueId(slugify(firstCell.text)),
          type: sectionType(firstCell.text),
          title: firstCell.text,
          children: [],
        }
        // ensure stack reflects we are now inside this section
        // attach under course-level
        secParent.children = secParent.children ?? []
        secParent.children.push(node)
        // replace top section context
        while (stack.length > 1 && stack[stack.length - 1].node.type !== 'course' && /section|chapter|phase|folder/.test(stack[stack.length - 1].node.type)) {
          stack.pop()
        }
        stack.push({ node, level: 99 })
        continue
      }

      // Single-cell uppercase heading-like row => section
      if (row.cells.length === 1 && firstCell.text && upper(firstCell.text) === firstCell.text && !/^\d+$/.test(firstCell.text)) {
        const node: CourseTreeNode = {
          id: uniqueId(slugify(firstCell.text)),
          type: sectionType(firstCell.text),
          title: firstCell.text,
          children: [],
        }
        const course = currentCourse() ?? parent
        course.children = course.children ?? []
        course.children.push(node)
        while (stack.length > 1 && /section|chapter|phase|folder/.test(stack[stack.length - 1].node.type)) stack.pop()
        stack.push({ node, level: 99 })
        continue
      }

      // Lesson row
      const hasIndex = /^\d+$/.test(firstCell.text)
      const titleCell = hasIndex ? (row.cells[1] ?? '') : row.cells.find((c) => c) ?? ''
      const lessonTitle = stripBold(titleCell).text || firstCell.text
      if (!lessonTitle) continue

      const node: CourseTreeNode = {
        id: uniqueId(slugify(lessonTitle)),
        type: 'lesson',
        title: lessonTitle,
      }
      const course = currentCourse()
      if (course) node.courseId = course.courseId ?? course.id
      parent.children = parent.children ?? []
      parent.children.push(node)
      continue
    }

    // `---` separator or plain line
    if (/^-{3,}$/.test(line)) {
      inTableHeader = false
      continue
    }

    // Plain bullet/line under a course => treat as lesson; uppercase => section.
    const bullet = line.replace(/^[-*]\s+/, '')
    if (bullet && currentCourse()) {
      const parent = stack[stack.length - 1].node
      if (upper(bullet) === bullet && bullet.length > 2 && !/^\d+\./.test(bullet)) {
        const node: CourseTreeNode = { id: uniqueId(slugify(bullet)), type: sectionType(bullet), title: bullet, children: [] }
        const course = currentCourse() ?? parent
        course.children = course.children ?? []
        course.children.push(node)
        while (stack.length > 1 && /section|chapter|phase|folder/.test(stack[stack.length - 1].node.type)) stack.pop()
        stack.push({ node, level: 99 })
      } else {
        const course = currentCourse()
        const node: CourseTreeNode = { id: uniqueId(slugify(bullet)), type: 'lesson', title: bullet }
        if (course) node.courseId = course.courseId ?? course.id
        parent.children = parent.children ?? []
        parent.children.push(node)
      }
    }
  }

  const stats = collectStats([root])
  return { tree: [root], stats }
}

export function collectStats(tree: CourseTreeNode[]): ParseStats {
  const stats: ParseStats = {
    subjects: 0,
    teachers: 0,
    courses: 0,
    sections: 0,
    lessons: 0,
    lessonsWithUrl: 0,
    lessonsMissingLink: 0,
  }
  function walk(nodes: CourseTreeNode[]) {
    for (const n of nodes) {
      if (n.type === 'subject') stats.subjects++
      else if (n.type === 'teacher' || n.type === 'provider') stats.teachers++
      else if (n.type === 'course') stats.courses++
      else if (n.type === 'section' || n.type === 'chapter' || n.type === 'phase' || n.type === 'folder')
        stats.sections++
      else if (n.type === 'lesson') {
        stats.lessons++
        // tree lessons don't carry urls; treated as missing here
        stats.lessonsMissingLink++
      }
      if (n.children) walk(n.children)
    }
  }
  walk(tree)
  return stats
}
