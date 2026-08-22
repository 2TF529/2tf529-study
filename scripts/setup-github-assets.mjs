/**
 * setup-github-assets.mjs
 *
 * Script tự động:
 *   1. Khởi tạo git repo mới trong thư mục tạm
 *   2. Copy toàn bộ WebP vào repo đó (giữ nguyên cấu trúc thư mục)
 *   3. Commit và push lên GitHub repo 2TF529/2tf529-assets
 *   4. Rewrite URL trong tất cả JSON files sang jsDelivr CDN URL
 *
 * TRƯỚC KHI CHẠY:
 *   1. Tạo repo trống tên "2tf529-assets" tại: https://github.com/new
 *      - Public repo
 *      - KHÔNG tick "Add README"
 *   2. Chạy script này: node scripts/setup-github-assets.mjs
 *
 * jsDelivr URL format:
 *   https://cdn.jsdelivr.net/gh/2TF529/2tf529-assets@main/{path}
 */

import { cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { execSync, spawn } from 'node:child_process';

const GITHUB_USER  = '2TF529';
const ASSETS_REPO  = '2tf529-assets';
const BRANCH       = 'main';
const JSDELIVR_BASE = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${ASSETS_REPO}@${BRANCH}`;

const dataDir    = resolve(process.cwd(), 'data');
const tmpRepoDir = resolve(process.cwd(), '.tmp_assets_repo');

// ── Helper: run shell command ─────────────────────────────────────────────────
function run(cmd, cwd = process.cwd()) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

// ── Bước 1: Chuẩn bị thư mục repo tạm ───────────────────────────────────────
console.log('\n📁 Bước 1: Chuẩn bị repo tạm...');
await rm(tmpRepoDir, { recursive: true, force: true });
await mkdir(tmpRepoDir, { recursive: true });

run('git init', tmpRepoDir);
run(`git remote add origin https://github.com/${GITHUB_USER}/${ASSETS_REPO}.git`, tmpRepoDir);
run('git checkout -b main', tmpRepoDir);

// Tạo .gitattributes để tránh CRLF conversion cho binary files
await writeFile(join(tmpRepoDir, '.gitattributes'), '*.webp binary\n');

// ── Bước 2: Copy WebP files vào repo ─────────────────────────────────────────
console.log('\n🖼️  Bước 2: Copy WebP files...');

async function* walkWebp(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkWebp(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.webp')) yield fullPath;
  }
}

let count = 0;
for await (const webpPath of walkWebp(dataDir)) {
  const relPath = relative(dataDir, webpPath); // vd: l9/anh/cuoiki1/assets/exam/hinh-01.webp
  const destPath = join(tmpRepoDir, relPath);
  await mkdir(resolve(destPath, '..'), { recursive: true });
  await cp(webpPath, destPath);
  count++;
  if (count % 500 === 0) console.log(`  Đã copy ${count} files...`);
}
console.log(`  ✅ Tổng cộng ${count} file WebP`);

// ── Bước 3: Commit và push ────────────────────────────────────────────────────
console.log('\n🚀 Bước 3: Commit và push lên GitHub...');
run('git config user.email "quanh1929@gmail.com"', tmpRepoDir);
run('git config user.name "2TF529"', tmpRepoDir);
run('git add -A', tmpRepoDir);
run(`git commit -m "chore: add ${count} WebP assets for 2tf529-study"`, tmpRepoDir);

console.log('\n  Đang push... (có thể mất vài phút tùy tốc độ mạng)');
run('git push -u origin main', tmpRepoDir);

// ── Bước 4: Rewrite URL trong JSON ───────────────────────────────────────────
console.log('\n✏️  Bước 4: Cập nhật URL ảnh trong JSON...');

async function* walkJson(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'assets') yield* walkJson(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      yield fullPath;
    }
  }
}

const RELATIVE_URL_RE = /\bdata\/([^"'\s]+\.webp)/g;

let jsonModified = 0;
let jsonSkipped  = 0;

for await (const filePath of walkJson(dataDir)) {
  const content = await readFile(filePath, 'utf-8');

  if (!content.includes('data/') || !content.includes('.webp')) {
    jsonSkipped++;
    continue;
  }

  const newContent = content.replace(RELATIVE_URL_RE, (_, path) => `${JSDELIVR_BASE}/${path}`);

  if (newContent !== content) {
    await writeFile(filePath, newContent, 'utf-8');
    jsonModified++;
  } else {
    jsonSkipped++;
  }
}

console.log(`  ✅ Đã sửa URL trong ${jsonModified} JSON files`);
console.log(`  ⏭️  Bỏ qua ${jsonSkipped} files (không có ảnh)`);

// ── Dọn dẹp ──────────────────────────────────────────────────────────────────
console.log('\n🧹 Dọn dẹp thư mục tạm...');
await rm(tmpRepoDir, { recursive: true, force: true });

// ── Kết quả ───────────────────────────────────────────────────────────────────
console.log(`
╔════════════════════════════════════════════════════════╗
║  🎉 Hoàn thành!                                        ║
╠════════════════════════════════════════════════════════╣
║  ✅ ${count} ảnh WebP → github.com/${GITHUB_USER}/${ASSETS_REPO}
║  ✅ URL trong JSON → jsDelivr CDN                      ║
║  🔗 CDN URL: ${JSDELIVR_BASE}
╠════════════════════════════════════════════════════════╣
║  Bước tiếp theo:                                       ║
║    npm run build   → dist/ chỉ còn ~10k JSON files    ║
║    git add data/ && git commit && git push             ║
║    → Cloudflare auto-deploy thành công!                ║
╚════════════════════════════════════════════════════════╝
`);
