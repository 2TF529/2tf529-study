# AGENTS.md - Quy tắc cho lập trình viên & AI khi sửa 2TF529

## Sứ mệnh
Xây dựng và duy trì nền tảng học tập **tĩnh** (static), nhẹ, nhanh, tối ưu cho người dùng Việt Nam.

## Tech stack (KHÔNG đổi nếu không có lý do)
- React + Vite + TypeScript
- Tailwind CSS v4 (qua `@tailwindcss/postcss`, dùng `@import "tailwindcss"`)
- React Router v7
- react-markdown + remark-gfm + remark-math + rehype-katex + katex
- Zod cho validate dữ liệu
- Vitest cho unit test

## Kiến trúc (BẮT BUỘC tuân thủ)
- Static frontend **không backend, không database** ở bản MVP.
- Dữ liệu là JSON trong `public/data`, chia nhỏ và **lazy-load**.
- Trang danh sách chỉ tải `index.json`; chi tiết tải khi mở.
- Build output: `dist`.
- Routing client-side; cần `public/_redirects` cho Cloudflare Pages.

## Quy ước code
- Path alias `@/` trỏ tới `src/`.
- Code-split theo route bằng `lazy()` trong `src/App.tsx`.
- Mọi truy cập dữ liệu đi qua `src/lib/data.ts` + `fetchJson` (đã validate Zod).
- Logic chấm điểm tập trung ở `src/lib/practice/scoring.ts` và **phải có test**.
- Giao diện tiếng Việt, ít animation, tôn trọng `prefers-reduced-motion`.
- Dùng biến CSS theme (`--color-*`) thay vì hardcode màu.
- Render nội dung người dùng/đề bằng `<Markdown>` (KaTeX), **không** dùng
  `dangerouslySetInnerHTML` chưa sanitize.

## Bảo mật
- KHÔNG hardcode password/admin secret thật trong frontend.
- `/admin` chỉ là **Content Tools**, không phải auth thật (xem `docs/ADMIN_SECURITY.md`).
- Không commit secret; biến `VITE_*` chỉ cho giá trị công khai.

## Trước khi hoàn thành thay đổi, chạy:
```bash
npm run typecheck
npm run test
npm run build
```
Tất cả phải pass.

## Khi thêm dữ liệu
Theo `docs/CONTENT_GUIDE.md`. Nếu đổi cấu trúc dữ liệu, cập nhật cả Zod schema
(`src/lib/schemas.ts`) và TypeScript types (`src/types`).
