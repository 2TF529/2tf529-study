import { useState } from 'react'
import type { CourseTreeNode } from '@/types'
import { parseNotionMarkdown, collectStats, type ParseStats } from '@/lib/import/notionMarkdown'
import { CourseTree } from '@/features/courses/CourseTree'
import { MemoryRouter } from 'react-router-dom'

export const NOTION_SOURCE_ID = 'notion-thpt-2k8-2026'

type Mode = 'new' | 'merge' | 'replace'

export function NotionImporter({
  currentTree,
  onApply,
}: {
  currentTree: CourseTreeNode[]
  onApply: (tree: CourseTreeNode[], mode: Mode) => void
}) {
  const [markdown, setMarkdown] = useState('')
  const [rootTitle, setRootTitle] = useState('Khóa 12 - 2026')
  const [preview, setPreview] = useState<CourseTreeNode[] | null>(null)
  const [stats, setStats] = useState<ParseStats | null>(null)
  const [mode, setMode] = useState<Mode>('new')

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Always read as UTF-8 text.
    const reader = new FileReader()
    reader.onload = () => setMarkdown(String(reader.result ?? ''))
    reader.readAsText(file, 'utf-8')
  }

  function runPreview() {
    const result = parseNotionMarkdown(markdown, rootTitle)
    setPreview(result.tree)
    setStats(result.stats)
  }

  function apply() {
    if (!preview) return
    if (mode === 'merge') {
      onApply([...currentTree, ...preview], 'merge')
    } else {
      onApply(preview, mode)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ maxWidth: 240 }}
          value={rootTitle}
          onChange={(e) => setRootTitle(e.target.value)}
          placeholder="Tên gốc (Khóa 12 - 2026)"
        />
        <label className="btn">
          Chọn file .md
          <input type="file" accept=".md,.markdown,text/markdown" style={{ display: 'none' }} onChange={onFile} />
        </label>
        <button className="btn btn-primary" onClick={runPreview} disabled={!markdown.trim()}>
          Xem trước cây
        </button>
      </div>

      <textarea
        className="input"
        style={{ fontFamily: 'monospace', minHeight: 180, fontSize: 13 }}
        placeholder="Dán nội dung Markdown export từ Notion vào đây…"
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />

      {stats && (
        <div className="surface-2" style={{ borderRadius: 8, padding: 10, fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>📘 {stats.subjects} môn</span>
          <span>👩‍🏫 {stats.teachers} GV/nguồn</span>
          <span>📚 {stats.courses} khóa</span>
          <span>📑 {stats.sections} chương/phần</span>
          <span>🎬 {stats.lessons} bài</span>
          {stats.lessonsMissingLink > 0 && (
            <span style={{ color: 'var(--color-text-muted)' }}>⚠️ {stats.lessonsMissingLink} bài chưa có link (bổ sung sau)</span>
          )}
        </div>
      )}

      {preview && (
        <>
          <strong style={{ fontSize: 14 }}>Xem trước cây phân tầng</strong>
          <div className="surface" style={{ borderRadius: 12, padding: 8, maxHeight: 360, overflow: 'auto' }}>
            {/* MemoryRouter isolates navigation so preview links don't change the real route */}
            <MemoryRouter>
              <CourseTree tree={preview} />
            </MemoryRouter>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="select" style={{ maxWidth: 280 }} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="new">Import thành cây mới (thay thế cây hiện tại)</option>
              <option value="merge">Merge vào cây hiện có</option>
              <option value="replace">Replace dữ liệu importSourceId = {NOTION_SOURCE_ID}</option>
            </select>
            <button className="btn btn-primary" onClick={apply}>
              Áp dụng vào cây
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            Sau khi áp dụng, qua tab “Cây khóa học” để chỉnh và Export JSON dán vào{' '}
            <code>public/data/courses/index.json</code>.
          </p>
        </>
      )}
    </div>
  )
}
