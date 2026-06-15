# Hướng dẫn thêm nội dung (khóa học, đề thi, câu hỏi)

Tất cả nội dung là **JSON** trong `public/data/`. Trang danh sách chỉ tải `index.json`;
chi tiết khóa/đề được lazy-load khi mở. Sau khi sửa, dùng `/admin` (Content Tools) để
**Validate schema**.

## 1. Môn & Cấp/Lớp
- `public/data/site/subjects.json`: danh sách môn/kỳ thi (`id`, `name`).
- `public/data/site/grade-levels.json`: danh sách lớp/cấp.
- Thêm môn/kỳ thi mới = thêm một phần tử vào mảng. `id` dùng để liên kết với khóa/đề.

## 2. Thông báo (banner)
`public/data/site/announcements.json`:
```json
{ "id": "khai-giang", "version": 1, "title": "...", "body": "**Markdown** ok", "level": "info" }
```
- Người dùng tắt banner sẽ không thấy lại **cho tới khi bạn tăng `version`** (hoặc đổi `id`).
- `level`: `info | warning | success`.

## 3. Thêm khóa học
1. Thêm tóm tắt vào `public/data/courses/index.json` (mảng `courses`).
2. Tạo file chi tiết `public/data/courses/<id>.json` với mảng `lessons`.
3. `lessonCount` nên khớp số bài.

Mỗi bài học hỗ trợ: `videoUrl`, `embedUrl` (iframe), `documentUrl`, `answerUrl`,
`solutionUrl`, `durationLabel`.
- Nếu `embedUrl` nhúng được → hiển thị iframe.
- Nếu không có/embed lỗi → hiện nút **"Mở video trên VK"** dùng `videoUrl`.

## 4. Thêm đề thi
1. Thêm tóm tắt vào `public/data/exams/index.json` (mảng `exams`).
2. Tạo file `public/data/exams/<id>.json` với mảng `blocks`.

Metadata bắt buộc: `id, title, gradeLevel, subjectId, examSystem, examType, hasAnswers, blocks`.
- `hasAnswers: false` → đề chỉ lưu bài làm, không chấm điểm.
- `durationMinutes` → bật đồng hồ đếm ngược.
- Block giúp mô phỏng cấu trúc đề (Trắc nghiệm / Đúng-Sai / Trả lời ngắn / Tự luận; hoặc
  HSA: Định tính / Định lượng / Khoa học / Tiếng Anh).

## 5. Các dạng câu hỏi
| type | Ý nghĩa | Trường đáp án |
| --- | --- | --- |
| `single_choice` | 1 đáp án | `choices`, `correctChoiceIds` (1 phần tử) |
| `multiple_choice` | nhiều đáp án | `choices`, `correctChoiceIds`, `partialCredit?` |
| `true_false_group` | nhóm Đúng/Sai | `statements[].answer`, `groupScoring?` |
| `short_answer` | trả lời ngắn | `acceptableAnswers`, `caseInsensitive?` |
| `essay_info` | tự luận/đọc hiểu, không chấm | (không có đáp án) |

- Câu không có đáp án (hoặc `hasAnswers: false`) sẽ **không tính điểm**.
- `points` mặc định = 1.

## 6. LaTeX & Markdown
Mọi `prompt`, `text`, `explanation`, `passage` hỗ trợ Markdown + LaTeX (KaTeX):
- Inline: `$x^2 + y^2$`
- Block: `$$\int_0^1 x^2\,dx$$`
- Lưu ý JSON: dấu `\` phải escape thành `\\` (ví dụ `\\sqrt{16}`).

## 7. Ảnh
Xem `public/assets/questions/README.md`. Chỉ dùng ảnh khi không thể diễn đạt bằng text/LaTeX.

## 8. Tài liệu/đáp án ngoài
Thường là Google Drive/link ngoài → app chỉ mở tab mới (`target="_blank"`).
