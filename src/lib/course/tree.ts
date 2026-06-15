import type { CourseTreeNode, OutlineNode, TreeNodeType } from '@/types'

export type AnyNode = CourseTreeNode | OutlineNode

function children(node: AnyNode): AnyNode[] {
  return (node.children as AnyNode[] | undefined) ?? []
}

/** Depth-first flatten with depth info. */
export function flattenTree<T extends AnyNode>(
  nodes: T[],
  depth = 0,
): { node: T; depth: number }[] {
  const out: { node: T; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    const ch = (n.children as T[] | undefined) ?? []
    if (ch.length) out.push(...flattenTree(ch, depth + 1))
  }
  return out
}

/** Find a node by id anywhere in the tree. */
export function findNode<T extends AnyNode>(nodes: T[], id: string): T | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode((n.children as T[] | undefined) ?? [], id)
    if (found) return found
  }
  return null
}

/** Count lesson-type nodes in subtree(s). */
export function countLessons(nodes: AnyNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.type === 'lesson') count++
    count += countLessons(children(n))
  }
  return count
}

/** Count course-type nodes in subtree(s). */
export function countCourses(nodes: CourseTreeNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.type === 'course') count++
    count += countCourses((n.children ?? []) as CourseTreeNode[])
  }
  return count
}

/** Build the path of titles from root to a given node id (inclusive). */
export function buildBreadcrumbs(nodes: AnyNode[], id: string): string[] | null {
  for (const n of nodes) {
    const title = n.title ?? n.id
    if (n.id === id) return [title]
    const sub = buildBreadcrumbs(children(n), id)
    if (sub) return [title, ...sub]
  }
  return null
}

/** First lesson node found via DFS (for "Học bài đầu tiên"). */
export function firstLesson(nodes: AnyNode[]): AnyNode | null {
  for (const n of nodes) {
    if (n.type === 'lesson') return n
    const sub = firstLesson(children(n))
    if (sub) return sub
  }
  return null
}

/**
 * Search the tree by title. Returns the set of node ids that should be
 * expanded so every match is visible (matches + all their ancestors), plus
 * the set of matched ids.
 */
export interface SearchResult {
  matchedIds: Set<string>
  expandIds: Set<string>
  hasQuery: boolean
}

export function searchTree(nodes: AnyNode[], query: string): SearchResult {
  const matchedIds = new Set<string>()
  const expandIds = new Set<string>()
  const q = query.trim().toLowerCase()
  if (!q) return { matchedIds, expandIds, hasQuery: false }

  function walk(node: AnyNode, ancestors: string[]): boolean {
    const title = (node.title ?? node.id).toLowerCase()
    const selfMatch = title.includes(q)
    let childMatch = false
    for (const c of children(node)) {
      if (walk(c, [...ancestors, node.id])) childMatch = true
    }
    if (selfMatch) matchedIds.add(node.id)
    if (selfMatch || childMatch) {
      // expand all ancestors + this node (so children show)
      ancestors.forEach((a) => expandIds.add(a))
      expandIds.add(node.id)
      return true
    }
    return false
  }

  nodes.forEach((n) => walk(n, []))
  return { matchedIds, expandIds, hasQuery: true }
}

/**
 * Normalize a tree: ensure every node has a stable id, trim titles, and drop
 * empty children arrays. Returns a new tree (does not mutate input).
 */
export function normalizeTree<T extends AnyNode>(nodes: T[], prefix = 'node'): T[] {
  return nodes.map((n, i) => {
    const id = (n.id && n.id.trim()) || `${prefix}-${i}`
    const ch = (n.children as T[] | undefined) ?? []
    const normalized: T = {
      ...n,
      id,
      title: n.title?.trim() ?? n.title,
    }
    const normChildren = ch.length ? normalizeTree(ch, id) : undefined
    if (normChildren) {
      ;(normalized as AnyNode).children = normChildren
    } else {
      delete (normalized as AnyNode).children
    }
    return normalized
  })
}

/** Collect all node ids in the tree (for "expand all"). */
export function allNodeIds(nodes: AnyNode[]): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    ids.push(n.id)
    ids.push(...allNodeIds(children(n)))
  }
  return ids
}

/** Icon + Vietnamese label for a node type. */
export function nodeMeta(type: TreeNodeType): { icon: string; label: string } {
  switch (type) {
    case 'root':
      return { icon: '🏫', label: 'Khóa' }
    case 'subject':
      return { icon: '📘', label: 'Môn' }
    case 'teacher':
      return { icon: '👩‍🏫', label: 'Giáo viên' }
    case 'provider':
      return { icon: '🏷️', label: 'Nguồn' }
    case 'course':
      return { icon: '📚', label: 'Khóa học' }
    case 'section':
      return { icon: '🗂️', label: 'Phần' }
    case 'chapter':
      return { icon: '📑', label: 'Chương' }
    case 'phase':
      return { icon: '🧭', label: 'Giai đoạn' }
    case 'folder':
      return { icon: '📁', label: 'Thư mục' }
    case 'lesson':
      return { icon: '🎬', label: 'Bài học' }
    default:
      return { icon: '•', label: '' }
  }
}
