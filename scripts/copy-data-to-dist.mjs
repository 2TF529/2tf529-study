import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const source = resolve('data');
const destination = resolve('dist', 'data');

// public/data is a local junction and Git cannot preserve it on Cloudflare's
// Linux build host. Always materialize the canonical data directory in dist.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

// Bỏ qua thư mục assets/ chứa ảnh WebP — ảnh đã được lưu trên Cloudflare R2.
// Chỉ copy JSON và các file index để giữ số lượng static asset < 20,000.
const assetsSegment = `${sep}assets${sep}`;
await cp(source, destination, {
  recursive: true,
  force: true,
  filter: (src) => {
    // Cho phép thư mục gốc và các thư mục không phải assets
    // Chặn bất kỳ path nào chứa /assets/ hoặc \assets\
    return !src.includes(assetsSegment) && !src.endsWith(`${sep}assets`);
  },
});

console.log(`Copied exam data to ${destination} (WebP assets excluded — served from R2)`);
