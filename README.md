# 2TF529 Learning Platform

Nền tảng học tập **tĩnh** (static), nhẹ và nhanh: kho **Khóa Học** (video) và **Phòng Luyện**
(đề trắc nghiệm), hỗ trợ Markdown + LaTeX. Không backend, không database ở bản MVP. Deploy lên
Cloudflare Pages, domain dự kiến `2tf529.id.vn`.

## Tech stack
React + Vite + TypeScript · Tailwind CSS v4 · React Router v7 · react-markdown + KaTeX · Zod · Vitest.

## Bắt đầu
```bash
npm install
npm run dev        # chạy môi trường phát triển
```
Mở địa chỉ Vite in ra (mặc định http://localhost:5173).

## Lệnh
| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy dev server |
| `npm run build` | Typecheck + build ra `dist/` |
| `npm run preview` | Xem thử bản build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run test` | Chạy unit test (Vitest) cho scoring engine |

## Tính năng
- **Trang chủ**: banner thông báo (tắt theo `id`+`version`), 2 nút lớn, theme customizer.
- **Theme**: Sáng / Tối / Sepia / Tương phản cao, chỉnh cỡ chữ, mật độ (thoáng/gọn), lưu
  `localStorage`. Phím tắt mở panel: **Ctrl/Cmd + Shift + Y**. Tôn trọng `prefers-reduced-motion`.
- **Khóa Học** (`/khoa-hoc`): bảng kiểu bảng tính (sticky header, search, filter, sort);
  trang xem video kiểu playlist với fallback "Mở video trên VK".
- **Phòng Luyện** (`/phong-luyen`): lọc theo lớp/môn/loại đề/đáp án; thẻ đề có badge.
  - Làm đề đầy đủ (`/phong-luyen/de/:examId`): timer, sidebar câu hỏi, đánh dấu câu,
    autosave `sessionStorage`, nộp bài + review.
  - Toggle **"Biết đúng/sai ngay"**.
  - **Luyện Random** (`/phong-luyen/random`): chọn môn/số câu/seed.
- **Content Tools** (`/admin`): import/validate (Zod)/format/export JSON, tạo mẫu. KHÔNG phải
  auth thật (xem `docs/ADMIN_SECURITY.md`).
- **Chấm điểm**: `src/lib/practice/scoring.ts` (có test Vitest).

## Cấu trúc thư mục
```
public/data/        # Dữ liệu JSON (lazy-load)
  site/             # subjects, grade-levels, announcements, navigation
  courses/          # index.json + từng khóa học
  exams/            # index.json + từng đề
  question-bank/
public/assets/      # ảnh cho câu hỏi
public/_redirects   # SPA routing cho Cloudflare Pages
src/
  components/ features/ lib/ types/
docs/               # CONTENT_GUIDE, ADMIN_SECURITY, DEPLOY_CLOUDFLARE
```

## Thêm dữ liệu
Xem `docs/CONTENT_GUIDE.md`. Tóm tắt: thêm vào `index.json` + tạo file chi tiết trong
`public/data/...`, rồi validate ở `/admin`.

## Deploy Cloudflare Pages
- Build command: `npm run build`
- Output directory: `dist`
- `public/_redirects` đã cấu hình SPA routing.
- Gắn domain: xem `docs/DEPLOY_CLOUDFLARE.md`.

## Assumptions (lựa chọn mặc định trong MVP)
- Tailwind v4 (đã có sẵn trong `package.json`) dùng `@tailwindcss/postcss`.
- **Luyện Random** chỉ lấy câu từ các đề có `hasAnswers: true` để có thể chấm.
- `essay_info` và câu thiếu đáp án **không tính điểm**.
- Điểm hiển thị quy về thang 10 từ tổng `points` (mặc định mỗi câu 1 điểm).
- Kết quả làm bài lưu theo **session** (`sessionStorage`); theme lưu `localStorage`.
- VK không đảm bảo nhúng iframe → luôn có fallback link.

## Điểm bạn cần tự thay dữ liệu thật sau này
- Toàn bộ `public/data/**` hiện là **dữ liệu mẫu**.
- `videoUrl`/`embedUrl` VK và link Google Drive đang là **placeholder**.
- Ảnh `public/assets/questions/placeholder-chart.svg` là placeholder.
- Domain trong `robots.txt` / `.env.example` để là `2tf529.id.vn` (đổi nếu khác).

## Bảo mật
Không hardcode secret thật. `/admin` không bảo mật. Chi tiết: `docs/ADMIN_SECURITY.md`.
