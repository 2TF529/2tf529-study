# Bảo mật & Quản trị nội dung

## Vì sao static frontend KHÔNG thể bảo mật admin password thật?
2TF529 là **static site** (chỉ HTML/CSS/JS chạy trên trình duyệt, không có backend).
Mọi thứ tải về máy người dùng đều có thể đọc được, bao gồm:
- Mã JS sau khi build.
- Mọi biến `VITE_*` được nhúng vào bundle.
- Mọi file trong `public/`.

Do đó, **không có cách nào** giấu mật khẩu/admin secret thật trong frontend. Bất kỳ
"đăng nhập admin" nào chỉ bằng JS phía client đều có thể bị bỏ qua. Trang `/admin`
trong dự án này được gọi là **Content Tools**: chỉ để soạn/validate/preview JSON, KHÔNG
phải cổng bảo mật.

## Cách cập nhật nội dung an toàn (quy trình khuyến nghị)
1. Sửa hoặc thêm file JSON/Markdown trong `public/data/` (và ảnh trong `public/assets/`).
2. Dùng `/admin` (Content Tools) để **Validate schema** trước khi commit.
3. Commit & push lên Git (GitHub/GitLab).
4. Cloudflare Pages tự build lại và deploy.

Quyền ghi nội dung = quyền push vào repository. Hãy bảo vệ repo bằng quyền truy cập Git.

## Nếu sau này muốn admin login THẬT
Cần thêm backend/dịch vụ xác thực, ví dụ:
- **Supabase** (Auth + Postgres)
- **Firebase** (Auth + Firestore)
- **Cloudflare D1 + Access / Workers** cho auth phía server

Khi đó việc xác thực và phân quyền phải chạy ở phía server, không phải client.

## .env
Xem `.env.example`. Không bao giờ commit secret thật. Biến `VITE_*` chỉ dùng cho
giá trị công khai (tên site, URL...).
