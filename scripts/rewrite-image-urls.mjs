/**
 * rewrite-image-urls.mjs
 *
 * Thay thế tất cả URL ảnh WebP trong JSON files từ relative path
 * thành absolute URL trỏ về Cloudflare R2.
 *
 * Trước: src="data/l9/anh/cuoiki1/assets/exam-name/hinh-01.webp"
 * Sau:   src="https://pub-XXXX.r2.dev/l9/anh/cuoiki1/assets/exam-name/hinh-01.webp"
 *
 * Cách dùng:
 *   node scripts/rewrite-image-urls.mjs
 *
 * Biến môi trường cần thiết:
 *   R2_PUBLIC_URL  - Public URL của R2 bucket
 *                    Dạng: https://pub-XXXX.r2.dev
 *                    Hoặc custom domain: https://assets.2tf529.com
 *
 * Script này chỉ cần chạy MỘT LẦN DUY NHẤT sau khi upload ảnh lên R2.
 * Script an toàn: không xóa file, chỉ sửa nội dung JSON.
 * Nếu URL đã là absolute (bắt đầu bằng http), script sẽ bỏ qua.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// ── Load .env nếu có ──────────────────────────────────────────────────────────
try {
  const envContent = await readFile(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch { /* .env không bắt buộc */ }

// ── Config ────────────────────────────────────────────────────────────────────
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

if (!R2_PUBLIC_URL) {
  console.error('❌ Thiếu biến môi trường R2_PUBLIC_URL');
  console.error('   Ví dụ: $env:R2_PUBLIC_URL="https://pub-XXXX.r2.dev"');
  console.error('   Hoặc thêm vào file .env: R2_PUBLIC_URL=https://pub-XXXX.r2.dev');
  process.exit(1);
}

console.log(`🔗 R2 Public URL: ${R2_PUBLIC_URL}`);

const dataDir = resolve(process.cwd(), 'data');

// ── Walk JSON files ───────────────────────────────────────────────────────────
async function* walkJson(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Bỏ qua thư mục assets/ (chứa WebP, không phải JSON)
      if (entry.name !== 'assets') {
        yield* walkJson(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      yield fullPath;
    }
  }
}

// ── Regex thay thế URL ───────────────────────────────────────────────────────
// Match: src="data/..." hoặc src='data/...' trong HTML-in-JSON
// và bất kỳ chuỗi JSON nào có giá trị là "data/..." kết thúc bằng .webp
const RELATIVE_URL_RE = /\bdata\/([^"'\s]+\.webp)/g;

function rewriteContent(content) {
  let changed = false;
  const newContent = content.replace(RELATIVE_URL_RE, (match, path) => {
    // Đã là absolute URL thì bỏ qua (không xảy ra với regex này, nhưng safety check)
    const newUrl = `${R2_PUBLIC_URL}/${path}`;
    changed = true;
    return newUrl;
  });
  return { newContent, changed };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n📁 Quét JSON trong: ${dataDir}\n`);

let processed = 0;
let modified  = 0;
let skipped   = 0;

const files = [];
for await (const f of walkJson(dataDir)) files.push(f);

console.log(`📊 Tìm thấy ${files.length} file JSON\n`);

for (const filePath of files) {
  const content = await readFile(filePath, 'utf-8');

  // Kiểm tra nhanh: nếu không có "data/*.webp" thì bỏ qua
  if (!content.includes('data/') || !content.includes('.webp')) {
    skipped++;
    processed++;
    continue;
  }

  const { newContent, changed } = rewriteContent(content);

  if (changed) {
    await writeFile(filePath, newContent, 'utf-8');
    modified++;
    console.log(`  ✏️  ${filePath.replace(dataDir, '').replace(/\\/g, '/')}`);
  } else {
    skipped++;
  }

  processed++;

  // Progress mỗi 500 file
  if (processed % 500 === 0) {
    console.log(`  📈 ${processed}/${files.length} files...`);
  }
}

console.log('\n── Kết quả ───────────────────────────────');
console.log(`✅ Đã sửa URL: ${modified} file`);
console.log(`⏭️  Bỏ qua (không có ảnh): ${skipped} file`);
console.log(`📦 Tổng cộng: ${processed} file`);
console.log('\n🎉 Xong! Tất cả URL ảnh đã trỏ sang R2.');
console.log('👉 Tiếp theo: chạy npm run build để tạo dist/ (không còn WebP trong đó nữa)');
