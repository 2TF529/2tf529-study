/**
 * upload-webp-to-r2.mjs
 *
 * Upload toàn bộ ảnh WebP từ data/**/assets/ lên Cloudflare R2.
 * Sử dụng S3-compatible API của R2 thông qua @aws-sdk/client-s3.
 *
 * Cách dùng:
 *   node scripts/upload-webp-to-r2.mjs
 *
 * Biến môi trường cần thiết (đặt trong .env hoặc export trước khi chạy):
 *   R2_ACCOUNT_ID     - Cloudflare Account ID (tìm ở dash.cloudflare.com)
 *   R2_ACCESS_KEY_ID  - R2 API token Access Key ID
 *   R2_SECRET_KEY     - R2 API token Secret Key
 *   R2_BUCKET_NAME    - Tên bucket R2 (vd: 2tf529-assets)
 *
 * Để lấy R2 credentials:
 *   1. Vào dash.cloudflare.com → R2 → Manage R2 API Tokens
 *   2. Create API Token với quyền Object Read & Write
 *   3. Copy Access Key ID và Secret Access Key
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Load .env nếu có ──────────────────────────────────────────────────────────
try {
  const envPath = resolve(process.cwd(), '.env');
  const envContent = await readFile(envPath, 'utf-8');
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

// ── Validate env vars ─────────────────────────────────────────────────────────
const ACCOUNT_ID   = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY   = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY   = process.env.R2_SECRET_KEY;
const BUCKET_NAME  = process.env.R2_BUCKET_NAME;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET_NAME) {
  console.error('❌ Thiếu biến môi trường. Cần đặt:');
  console.error('   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_KEY, R2_BUCKET_NAME');
  console.error('\nCách đặt nhanh:');
  console.error('   $env:R2_ACCOUNT_ID="xxx"; $env:R2_ACCESS_KEY_ID="yyy"; ...');
  console.error('\nHoặc tạo file .env trong thư mục gốc project.');
  process.exit(1);
}

// ── S3 Client trỏ vào R2 ─────────────────────────────────────────────────────
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});

// ── Tìm tất cả file WebP trong data/ ─────────────────────────────────────────
const dataDir = resolve(process.cwd(), 'data');

async function* walkWebp(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkWebp(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.webp')) {
      yield fullPath;
    }
  }
}

// ── Upload với concurrency giới hạn ──────────────────────────────────────────
const CONCURRENCY = 20; // số file upload song song

async function uploadFile(localPath) {
  // R2 key = đường dẫn tương đối từ data/, bỏ "data/"
  const relPath = relative(dataDir, localPath).replace(/\\/g, '/');
  const r2Key   = relPath; // vd: l9/anh/cuoiki1/assets/exam-name/hinh-01.webp

  const content = await readFile(localPath);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: r2Key,
    Body: content,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable', // cache 1 năm vì ảnh không đổi
  }));

  return r2Key;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`🚀 Bắt đầu upload WebP lên R2 bucket: ${BUCKET_NAME}`);
console.log(`📁 Source: ${dataDir}\n`);

const files = [];
for await (const f of walkWebp(dataDir)) files.push(f);

console.log(`📊 Tìm thấy ${files.length} file WebP\n`);

let uploaded = 0;
let skipped  = 0;
let failed   = 0;
const errors = [];

// Chia thành batch để upload song song
for (let i = 0; i < files.length; i += CONCURRENCY) {
  const batch = files.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(uploadFile));

  for (const result of results) {
    if (result.status === 'fulfilled') {
      uploaded++;
    } else {
      failed++;
      errors.push(result.reason?.message ?? String(result.reason));
    }
  }

  // Progress report mỗi 200 file
  if ((i + CONCURRENCY) % 200 < CONCURRENCY || i + CONCURRENCY >= files.length) {
    const done = Math.min(i + CONCURRENCY, files.length);
    const pct  = Math.round((done / files.length) * 100);
    console.log(`  ✅ ${done}/${files.length} (${pct}%) — uploaded: ${uploaded}, failed: ${failed}`);
  }
}

console.log('\n── Kết quả ───────────────────────────────');
console.log(`✅ Uploaded: ${uploaded}`);
console.log(`❌ Failed:   ${failed}`);

if (errors.length > 0) {
  console.error('\nLỗi chi tiết:');
  errors.slice(0, 20).forEach(e => console.error(' •', e));
  if (errors.length > 20) console.error(`  ... và ${errors.length - 20} lỗi khác`);
  process.exit(1);
}

console.log(`\n🎉 Hoàn thành! Ảnh đã có trên R2: https://pub-xxx.r2.dev/ (hoặc custom domain)`);
console.log('👉 Tiếp theo: chạy node scripts/rewrite-image-urls.mjs để cập nhật URL trong JSON');
