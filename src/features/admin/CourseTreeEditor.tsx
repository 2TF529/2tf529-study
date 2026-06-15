import { useMemo, useState } from 'react'
import type { CourseTreeNode, TreeNodeType } from '@/types'
import { nodeMeta, allNodeIds, flattenTree } from '@/lib/course/tree'
import {
  addChild,
  guessType,
  moveUpDown,
  removeNode,
  renameNode,
  reparent,
  validateTree,
} from '@/lib/course/treeEdit'
import { slugify } from '@/lib/import/notionMarkdown'

const TYPE_OPTIONS: { value: TreeNodeType | ''; label: string }[] = [
  { value: '', label: 'Tự đoán' },
  { value: 'subject', label: 'Môn' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'course', label: 'Khóa' },
  { value: 'chapter', label: 'Chương' },
  { value: 'phase', label: 'Giai đoạn' },
  { value: 'folder', label: 'Folder' },
]

function newId(title: string): string {
  return `${slugify(title) || 'tang'}-${Math.random().toString(36).slice(2, 6)}`
}

/** Editable tree with add/rename/move/delete + undo + validation. */
export function CourseTreeEditor({
  tree,
  onChange,
}: {
  tree: CourseTreeNode[]
  onChange: (next: CourseTreeNode[]) => void
}) {
  const [history, setHistory] = useState<CourseTreeNode[][]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allNodeIds(tree)))

  const issues = useMemo(() => validateTree(tree), [tree])
  const allNodes = useMemo(() => flattenTree(tree as CourseTreeNode[]), [tree])

  function commit(next: CourseTreeNode[]) {
    setHistory((h) => [...h.slice(-30), tree])
    onChange(next)
  }
  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      onChange(prev)
      return h.slice(0, -1)
    })
  }

  function addNode(parentId: string | null) {
    const title = window.prompt('Tên tầng/khóa/bài:')?.trim()
    if (!title) return
    const typeStr = window.prompt(
      'Loại (subject/teacher/course/chapter/phase/folder/lesson) — bỏ trống để tự đoán:',
      '',
    )?.trim()
    const type = (typeStr as TreeNodeType) || guessType(title)
    const node: CourseTreeNode = { id: newId(title), type, title }
    if (type === 'course') node.courseId = node.id
    if (type === 'lesson') {
      node.lessonId = window.prompt('lessonId của bài:')?.trim() || node.id
      const cid = window.prompt('courseId chứa bài này:')?.trim()
      if (cid) node.courseId = cid
    }
    commit(addChild(tree, parentId, node))
    setExpanded((e) => new Set([...e, parentId ?? '', node.id]))
  }

  function rename(id: string, currentTitle: string) {
    const title = window.prompt('Đổi tên:', currentTitle)?.trim()
    if (title) commit(renameNode(tree, id, title))
  }

  function del(node: CourseTreeNode) {
    const hasChildren = !!node.children?.length
    if (!hasChildren) {
      if (window.confirm(`Xóa "${node.title ?? node.id}"?`)) commit(removeNode(tree, node.id, 'subtree'))
      return
    }
    const choice = window.prompt(
      `Tầng "${node.title}" có nội dung con.\nGõ "all" để xóa cả tầng và nội dung bên trong.\nGõ "promote" để chuyển nội dung con lên tầng cha.`,
      'promote',
    )
    if (choice === 'all') commit(removeNode(tree, node.id, 'subtree'))
    else if (choice === 'promote') commit(removeNode(tree, node.id, 'promote'))
  }

  function moveInto(id: string) {
    const targets = allNodes
      .filter((x) => x.node.id !== id && x.node.type !== 'lesson')
      .map((x) => `${x.node.id} (${x.node.title ?? ''})`)
      .join('\n')
    const target = window.prompt(`Nhập id tầng đích (hoặc "root"):\n\n${targets}`)?.trim()
    if (!target) return
    commit(reparent(tree, id, target === 'root' ? null : target))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => addNode(null)}>
          + Thêm tầng gốc
        </button>
        <button className="btn" onClick={undo} disabled={history.length === 0}>
          ↩ Undo
        </button>
        <button className="btn" onClick={() => setExpanded(new Set(allNodeIds(tree)))}>
          Mở tất cả
        </button>
        <button className="btn" onClick={() => setExpanded(new Set())}>
          Thu gọn
        </button>
        <span className="badge" style={{ marginLeft: 'auto' }}>
          {TYPE_OPTIONS.length - 1} loại tầng
        </span>
      </div>

      {issues.length > 0 && (
        <div className="surface" style={{ borderRadius: 8, padding: 10, borderLeft: '4px solid var(--color-danger)', fontSize: 13 }}>
          <strong>⚠️ {issues.length} vấn đề:</strong>
          <ul style={{ margin: '4px 0 0' }}>
            {issues.slice(0, 8).map((iss, i) => (
              <li key={i}>{iss.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="surface" style={{ borderRadius: 12, padding: 8 }}>
        {tree.length === 0 ? (
          <p className="text-muted" style={{ padding: 8, margin: 0 }}>
            Chưa có cây. Bấm “Thêm tầng gốc” hoặc import từ Notion.
          </p>
        ) : (
          tree.map((n) => (
            <EditableNode
              key={n.id}
              node={n}
              depth={0}
              expandedIds={expanded}
              onToggle={(id) =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }
              onAdd={addNode}
              onRename={rename}
              onDelete={del}
              onMove={(id, dir) => commit(moveUpDown(tree, id, dir))}
              onMoveInto={moveInto}
            />
          ))
        )}
      </div>
    </div>
  )
}

function EditableNode({
  node,
  depth,
  expandedIds,
  onToggle,
  onAdd,
  onRename,
  onDelete,
  onMove,
  onMoveInto,
}: {
  node: CourseTreeNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onAdd: (parentId: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (node: CourseTreeNode) => void
  onMove: (id: string, dir: -1 | 1) => void
  onMoveInto: (id: string) => void
}) {
  const meta = nodeMeta(node.type)
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const open = expandedIds.has(node.id)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          paddingLeft: 8 + depth * 16,
          borderRadius: 8,
        }}
      >
        <span
          style={{ width: 16, cursor: 'pointer', color: 'var(--color-text-muted)' }}
          onClick={() => hasChildren && onToggle(node.id)}
        >
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        <span aria-hidden title={meta.label}>
          {meta.icon}
        </span>
        <span style={{ fontSize: 13, flex: 1 }}>{node.title ?? node.id}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {node.type}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn title="Thêm tầng con" onClick={() => onAdd(node.id)}>＋</IconBtn>
          <IconBtn title="Đổi tên" onClick={() => onRename(node.id, node.title ?? '')}>✎</IconBtn>
          <IconBtn title="Lên" onClick={() => onMove(node.id, -1)}>↑</IconBtn>
          <IconBtn title="Xuống" onClick={() => onMove(node.id, 1)}>↓</IconBtn>
          <IconBtn title="Chuyển vào tầng khác" onClick={() => onMoveInto(node.id)}>⇄</IconBtn>
          <IconBtn title="Xóa" onClick={() => onDelete(node)}>🗑</IconBtn>
        </div>
      </div>
      {hasChildren && open && (
        <div>
          {children.map((c) => (
            <EditableNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onAdd={onAdd}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              onMoveInto={onMoveInto}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn" title={title} style={{ padding: '0 6px', fontSize: 12, height: 24 }} onClick={onClick}>
      {children}
    </button>
  )
}
