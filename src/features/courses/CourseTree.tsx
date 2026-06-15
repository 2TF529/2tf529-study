import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CourseTreeNode } from '@/types'
import {
  allNodeIds,
  buildBreadcrumbs,
  countCourses,
  countLessons,
  nodeMeta,
  searchTree,
} from '@/lib/course/tree'
import { useDebounced } from '@/lib/useDebounced'

/** Read-only "Cây khóa học" with nested accordion + search + breadcrumbs. */
export function CourseTree({ tree }: { tree: CourseTreeNode[] }) {
  const navigate = useNavigate()
  const [rawQuery, setRawQuery] = useState('')
  const query = useDebounced(rawQuery, 200)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((n) => n.id)))
  const [crumbs, setCrumbs] = useState<string[] | null>(null)

  const search = useMemo(() => searchTree(tree, query), [tree, query])
  const totalCourses = useMemo(() => countCourses(tree), [tree])
  const totalLessons = useMemo(() => countLessons(tree), [tree])

  // When searching, expansion is driven by the search result.
  const effectiveExpanded = search.hasQuery ? search.expandIds : expanded

  function toggle(id: string) {
    if (search.hasQuery) return // search controls expansion
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onActivate(node: CourseTreeNode) {
    setCrumbs(buildBreadcrumbs(tree, node.id))
    if (node.type === 'course' && (node.courseId || node.id)) {
      navigate(`/khoa-hoc/${node.courseId ?? node.id}`)
    } else if (node.type === 'lesson' && node.courseId) {
      navigate(`/khoa-hoc/${node.courseId}/${node.lessonId ?? node.id}`)
    } else {
      toggle(node.id)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Tìm trong cây (môn, khóa, bài…)"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
        />
        <button className="btn" onClick={() => setExpanded(new Set(allNodeIds(tree)))} disabled={search.hasQuery}>
          Mở tất cả
        </button>
        <button className="btn" onClick={() => setExpanded(new Set())} disabled={search.hasQuery}>
          Thu gọn tất cả
        </button>
        <span className="text-muted" style={{ fontSize: 13, marginLeft: 'auto' }}>
          {totalCourses} khóa · {totalLessons} bài
        </span>
      </div>

      {crumbs && (
        <div className="surface-2" style={{ borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
          {crumbs.join('  /  ')}
        </div>
      )}

      <div className="surface" style={{ borderRadius: 12, padding: 8 }}>
        {tree.map((n) => (
          <TreeNode
            key={n.id}
            node={n}
            depth={0}
            expandedIds={effectiveExpanded}
            matchedIds={search.matchedIds}
            onToggle={toggle}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  expandedIds,
  matchedIds,
  onToggle,
  onActivate,
}: {
  node: CourseTreeNode
  depth: number
  expandedIds: Set<string>
  matchedIds: Set<string>
  onToggle: (id: string) => void
  onActivate: (node: CourseTreeNode) => void
}) {
  const meta = nodeMeta(node.type)
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const open = expandedIds.has(node.id)
  const isMatch = matchedIds.has(node.id)
  const clickable = node.type === 'course' || (node.type === 'lesson' && node.courseId)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          paddingLeft: 8 + depth * 18,
          borderRadius: 8,
          cursor: hasChildren || clickable ? 'pointer' : 'default',
          background: isMatch ? 'var(--color-surface-2)' : 'transparent',
        }}
        onClick={() => (hasChildren && !clickable ? onToggle(node.id) : onActivate(node))}
      >
        <span style={{ width: 16, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        <span aria-hidden>{meta.icon}</span>
        <span style={{ fontSize: 14, fontWeight: node.type === 'lesson' ? 400 : 600 }}>
          {node.title ?? node.id}
        </span>
        {clickable && (
          <span className="badge" style={{ marginLeft: 'auto' }}>
            {node.type === 'course' ? 'Mở khóa' : 'Vào bài'}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expandedIds={expandedIds}
              matchedIds={matchedIds}
              onToggle={onToggle}
              onActivate={onActivate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
