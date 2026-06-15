import type { ZodType } from 'zod'

export class DataError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'DataError'
  }
}

/**
 * Fetch and validate a JSON file from /public/data.
 * Throws DataError with a friendly Vietnamese message on failure.
 */
export async function fetchJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch (err) {
    throw new DataError(`Không thể tải dữ liệu từ "${path}". Kiểm tra kết nối mạng.`, err)
  }

  if (!res.ok) {
    throw new DataError(`Không tìm thấy dữ liệu "${path}" (mã ${res.status}).`)
  }

  let raw: unknown
  try {
    raw = await res.json()
  } catch (err) {
    throw new DataError(`Dữ liệu "${path}" không phải JSON hợp lệ.`, err)
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new DataError(
      `Dữ liệu "${path}" sai định dạng: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .slice(0, 3)
        .join('; ')}`,
      parsed.error,
    )
  }
  return parsed.data
}

// Base path aware data url helper (respects Vite base if changed later).
export function dataUrl(rel: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/$/, '')}/data/${rel.replace(/^\//, '')}`
}
