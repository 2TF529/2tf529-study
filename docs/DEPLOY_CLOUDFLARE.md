# Triển khai lên Cloudflare Pages

## 1. Cấu hình build
Trong Cloudflare Pages, kết nối repository và đặt:

- **Framework preset**: None / Vite
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: 20 trở lên (đặt biến môi trường `NODE_VERSION=20` nếu cần)

## 2. SPA routing
File `public/_redirects` đã có sẵn:

```
/*    /index.html   200
```

Cloudflare Pages copy `_redirects` vào `dist` khi build, giúp mọi route (ví dụ
`/phong-luyen/de/abc`) trả về `index.html` để React Router xử lý, tránh lỗi 404 khi
refresh.

## 3. Gắn domain 2tf529.id.vn (tổng quan)
1. Vào project trên Cloudflare Pages > **Custom domains** > **Set up a domain**.
2. Nhập `2tf529.id.vn`.
3. Làm theo hướng dẫn DNS:
   - Nếu domain đã ở Cloudflare: thêm bản ghi `CNAME` trỏ về `<project>.pages.dev` (Cloudflare tự tạo).
   - Nếu domain ở nhà cung cấp khác (id.vn): thêm bản ghi DNS theo hướng dẫn hiển thị, hoặc đưa nameserver về Cloudflare.
4. Chờ DNS & SSL kích hoạt (thường vài phút).

## 4. Deploy thủ công (tùy chọn)
```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name 2tf529
```

## 5. Kiểm tra sau deploy
- Mở trang chủ, Khóa Học, Phòng Luyện.
- Vào một đề rồi **refresh** để chắc chắn SPA routing hoạt động.
- Kiểm tra dữ liệu tải đúng từ `/data/...`.
