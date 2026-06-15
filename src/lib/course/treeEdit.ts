import type { CourseTreeNode, TreeNodeType } from '@/types'

// Immutable helpers for editing a CourseTreeNode[] in the Admin tree editor.

export function cloneTree(nodes: CourseTreeNode[]): CourseTreeNode[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children ? cloneTree(n.children) : undefined,
  }))
}

interface Located {
  parentList: CourseTreeNode[]
  index: number
  node: CourseTreeNode
}

function locate(nodes: CourseTreeNode[], id: string): Located | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parentList: nodes, index: i, node: nodes[i] }
    const ch = nodes[i].children
    if (ch) {
      const found = locate(ch, id)
      if (found) return found
    }
  }
  return null
}

export function addChild(
  tree: CourseTreeNode[],
  parentId: string | null,
  node: CourseTreeNode,
): CourseTreeNode[] {
  const next = cloneTree(tree)
  if (parentId === null) {
    next.push(node)
    return next
  }
  const loc = locate(next, parentId)
  if (!loc) return next
  loc.node.children = loc.node.children ?? []
  loc.node.children.push(node)
  return next
}

export function renameNode(tree: CourseTreeNode[], id: string, title: string): CourseTreeNode[] {
  const next = cloneTree(tree)
  const loc = locate(next, id)
  if (loc) loc.node.title = title
  return next
}

export function moveUpDown(tree: CourseTreeNode[], id: string, dir: -1 | 1): CourseTreeNode[] {
  const next = cloneTree(tree)
  const loc = locate(next, id)
  if (!loc) return next
  const j = loc.index + dir
  if (j < 0 || j >= loc.parentList.length) return next
  ;[loc.parentList[loc.index], loc.parentList[j]] = [loc.parentList[j], loc.parentList[loc.index]]
  return next
}

export function removeNode(
  tree: CourseTreeNode[],
  id: string,
  mode: 'subtree' | 'promote',
): CourseTreeNode[] {
  const next = cloneTree(tree)
  const loc = locate(next, id)
  if (!loc) return next
  const removed = loc.parentList.splice(loc.index, 1)[0]
  if (mode === 'promote' && removed.children?.length) {
    loc.parentList.splice(loc.index, 0, ...removed.children)
  }
  return next
}

/** Move a node to become a child of newParentId (or root when null). */
export function reparent(
  tree: CourseTreeNode[],
  id: string,
  newParentId: string | null,
): CourseTreeNode[] {
  if (id === newParentId) return tree
  // prevent moving into own descendant
  const src = locate(tree, id)
  if (src && newParentId && locate([src.node], newParentId)) return tree

  const next = cloneTree(tree)
  const loc = locate(next, id)
  if (!loc) return next
  const [node] = loc.parentList.splice(loc.index, 1)
  if (newParentId === null) {
    next.push(node)
    return next
  }
  const target = locate(next, newParentId)
  if (!target) {
    // put it back at root if target missing
    next.push(node)
    return next
  }
  target.node.children = target.node.children ?? []
  target.node.children.push(node)
  return next
}

export interface ValidationIssue {
  id: string
  message: string
}

/** Validate the tree: duplicate ids per parent, course needs courseId, lesson needs lessonId+courseId. */
export function validateTree(tree: CourseTreeNode[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  function walk(nodes: CourseTreeNode[], inCourseId: string | null) {
    const seen = new Set<string>()
    for (const n of nodes) {
      if (seen.has(n.id)) issues.push({ id: n.id, message: `Trùng id "${n.id}" trong cùng tầng cha.` })
      seen.add(n.id)

      const courseId = n.type === 'course' ? n.courseId ?? n.id : inCourseId

      if (n.type === 'course' && !n.courseId) {
        issues.push({ id: n.id, message: `Node khóa "${n.title ?? n.id}" thiếu courseId.` })
      }
      if (n.type === 'lesson') {
        if (!n.lessonId) issues.push({ id: n.id, message: `Bài "${n.title ?? n.id}" thiếu lessonId.` })
        if (!courseId) issues.push({ id: n.id, message: `Bài "${n.title ?? n.id}" không thuộc khóa nào (thiếu courseId).` })
      }
      if (n.children) walk(n.children, courseId)
    }
  }

  walk(tree, null)
  return issues
}

/** Guess a node type from a title (used when user doesn't pick one). */
export function guessType(title: string): TreeNodeType {
  const t = title.normalize('NFC').toUpperCase()
  if (/CHƯƠNG/.test(t)) return 'chapter'
  if (/GIAI ĐOẠN/.test(t)) return 'phase'
  if (/THẦY|CÔ/.test(t)) return 'teacher'
  if (/KHÓA|KHOÁ|CHUYÊN ĐỀ|TỔNG ÔN|LUYỆN ĐỀ|NỀN TẢNG/.test(t)) return 'course'
  if (['TOÁN', 'VĂN', 'ANH', 'LÝ', 'HÓA', 'SINH', 'SỬ', 'ĐỊA', 'HSA', 'TSA', 'V-ACT'].includes(t))
    return 'subject'
  return 'folder'
}
