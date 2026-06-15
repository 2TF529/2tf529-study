# Ảnh cho câu hỏi

Chỉ dùng ảnh khi câu hỏi/hình vẽ quá khó biểu diễn bằng LaTeX/text (hình học, sơ đồ, biểu đồ...).

## Cách thêm ảnh
1. Đặt file ảnh vào thư mục này, ví dụ: `public/assets/questions/hinh-cau-1.png`.
2. Trong JSON đề, thêm vào câu hỏi:

```json
{
  "id": "q10",
  "type": "single_choice",
  "prompt": "Quan sát hình vẽ và chọn đáp án đúng.",
  "images": [
    { "src": "/assets/questions/hinh-cau-1.png", "alt": "Mô tả ngắn cho ảnh" }
  ],
  "choices": [{ "id": "a", "text": "..." }],
  "correctChoiceIds": ["a"]
}
```

## Lưu ý
- `src` bắt đầu bằng `/assets/...` (đường dẫn từ thư mục `public`).
- Luôn điền `alt` để hỗ trợ khả năng tiếp cận.
- Ưu tiên SVG/PNG nhẹ. Nén ảnh trước khi commit.
- File mẫu: `placeholder-chart.svg`.
