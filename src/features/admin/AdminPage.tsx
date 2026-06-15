import { useState } from 'react'
import { courseSchema, examSchema } from '@/lib/schemas'
import { sampleCourse, sampleExam } from './samples'

type Kind = 'course' | 'exam'

export default function AdminPage() {
  const [kind, setKind] = useState<Kind>('exam')
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const schema = kind === 'course' ? courseSchema : examSchema

  function validate() {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setMessage({ ok: false, text: 'JSON không hợp lệ (lỗi cú pháp).' })
      return
    }
    const r = schema.safeParse(parsed)
    if (r.success) {
      setMessage({ ok: true, text: '✅ Dữ liệu hợp lệ theo schema. Bạn có thể copy vào public/data.' })
    } else {
      setMessage({
        ok: false,
        text:
          '❌ Sai schema:\n' +
          r.error.issues.map((i) => `• ${i.path.join('.') || '(gốc)'}: ${i.message}`).join('\n'),
      })
    }
  }

  function loadSample() {
    const sample = kind === 'course' ? sampleCourse : sampleExam
    setText(JSON.stringify(sample, null, 2))
    setMessage(null)
  }

  function format() {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2))
      setMessage({ ok: true, text: 'Đã format JSON.' })
    } catch {
      setMessage({ ok: false, text: 'Không format được: JSON lỗi.' })
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setMessage({ ok: true, text: 'Đã copy vào clipboard.' })
    } catch {
      setMessage({ ok: false, text: 'Trình duyệt chặn copy. Hãy chọn và Ctrl+C thủ công.' })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--density-gap)' }}>
      <h1 style={{ margin: 0 }}>Content Tools</h1>

      <div className="surface" style={{ borderRadius: 12, padding: 16, borderLeft: '4px solid var(--color-danger)' }}>
        <strong>⚠️ Đây KHÔNG phải trang quản trị bảo mật.</strong>
        <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
          Đây là công cụ soạn/validate JSON chạy hoàn toàn trong trình duyệt. Không có đăng nhập
          thật. Để cập nhật nội dung, sửa file JSON trong <code>public/data</code> rồi deploy lại.
          Xem <code>docs/ADMIN_SECURITY.md</code>.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="select" style={{ maxWidth: 200 }} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="exam">Đề thi (exam)</option>
          <option value="course">Khóa học (course)</option>
        </select>
        <button className="btn" onClick={loadSample}>
          Tạo mẫu
        </button>
        <button className="btn" onClick={format}>
          Format
        </button>
        <button className="btn btn-primary" onClick={validate}>
          Validate schema
        </button>
        <button className="btn" onClick={copy}>
          Copy JSON
        </button>
      </div>

      <textarea
        className="input"
        style={{ fontFamily: 'monospace', minHeight: 360, fontSize: 13 }}
        placeholder="Dán JSON khóa học/đề thi vào đây hoặc bấm “Tạo mẫu”…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {message && (
        <pre
          className="surface"
          style={{
            whiteSpace: 'pre-wrap',
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            margin: 0,
            borderLeft: `4px solid ${message.ok ? 'var(--color-success)' : 'var(--color-danger)'}`,
          }}
        >
          {message.text}
        </pre>
      )}
    </div>
  )
}
