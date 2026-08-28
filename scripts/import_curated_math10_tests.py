#!/usr/bin/env python3
"""Import manually verified Math 10 mini-tests from local official-answer pairs.

The source PDFs have selectable prose but fragmented formula glyph order. This
curated importer keeps the prose, restores only formulas that can be verified
unambiguously, and records the official answer printed in the companion PDF.
It is deliberately deterministic so the same batch can be reproduced/audited.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "l10" / "toan" / "khaosat"


def q(content: str, options: list[str], answer: str, chapter: str, form: str) -> dict:
    assert len(options) == 4 and answer in "ABCD"
    assert len({re.sub(r"\s+", " ", x).strip().lower() for x in options}) == 4
    return {"type": "single", "chuong": chapter, "dang": form, "content": content,
            "options": [f"{letter}. {value}" for letter, value in zip("ABCD", options)], "answer": answer}


PROBABILITY = [
    q("Cho biến cố $A$ với không gian mẫu $\\Omega$. Xác suất của biến cố $A$ là", ["$\\dfrac{n(\\Omega)}{n(A)}$", "$1-\\dfrac{n(A)}{n(\\Omega)}$", "$\\dfrac{n(A)}{n(\\Omega)}$", "$n(\\Omega)-n(A)$"], "A", "Xác suất", "Định nghĩa cổ điển của xác suất"),
    q("Gieo một con xúc xắc cân đối. Xác suất để mặt có số chấm chẵn xuất hiện là", ["$0{,}2$", "$0{,}3$", "$0{,}4$", "$0{,}5$"], "D", "Xác suất", "Định nghĩa cổ điển của xác suất"),
    q("Gieo một con xúc xắc hai lần. Số kết quả thuận lợi cho biến cố tổng số chấm của hai lần gieo bằng $8$ là", ["$12$", "$6$", "$10$", "$5$"], "D", "Xác suất", "Mô tả không gian mẫu"),
    q("Một hộp chứa $11$ quả cầu, gồm $5$ quả xanh và $6$ quả đỏ. Lấy ngẫu nhiên lần lượt $2$ quả không hoàn lại. Xác suất để cả hai lần đều lấy được quả xanh là", ["$\\dfrac{1}{11}$", "$\\dfrac{9}{55}$", "$\\dfrac{2}{11}$", "$\\dfrac{4}{11}$"], "C", "Xác suất", "Xác suất chọn vật"),
    q("Một hộp chứa $3$ quả cầu trắng và $2$ quả cầu đen. Lấy ngẫu nhiên đồng thời hai quả. Xác suất lấy được cả hai quả trắng là", ["$\\dfrac{2}{10}$", "$\\dfrac{5}{10}$", "$\\dfrac{4}{10}$", "$\\dfrac{3}{10}$"], "D", "Xác suất", "Xác suất chọn vật"),
    q("Một con xúc xắc cân đối có sáu mặt ghi lần lượt các số $3,4,5,6,7,8$. Gieo một lần. Số phần tử của không gian mẫu là", ["$5$", "$6$", "$8$", "$3$"], "B", "Xác suất", "Mô tả không gian mẫu"),
    q("Một lớp có $20$ học sinh nam và $15$ học sinh nữ. Chọn ngẫu nhiên $3$ học sinh. Xác suất để ba học sinh được chọn cùng giới tính là", ["$\\dfrac{90}{119}$", "$\\dfrac{29}{119}$", "$\\dfrac{80}{119}$", "$\\dfrac{39}{119}$"], "B", "Xác suất", "Xác suất chọn người"),
    q("Một lớp có $35$ học sinh, trong đó có $5$ học sinh tên Linh. Giáo viên gọi ngẫu nhiên một học sinh lên bảng. Xác suất gọi đúng một học sinh tên Linh là", ["$\\dfrac{1}{175}$", "$\\dfrac{1}{7}$", "$\\dfrac{1}{35}$", "$\\dfrac{1}{5}$"], "B", "Xác suất", "Định nghĩa cổ điển của xác suất"),
    q("Một hộp chứa $11$ quả cầu gồm $5$ quả xanh và $6$ quả đỏ. Chọn ngẫu nhiên đồng thời $2$ quả. Xác suất để hai quả cùng màu là", ["$\\dfrac{8}{11}$", "$\\dfrac{5}{22}$", "$\\dfrac{6}{11}$", "$\\dfrac{5}{11}$"], "D", "Xác suất", "Xác suất chọn vật"),
    q("Một tổ có $6$ học sinh nữ và $8$ học sinh nam. Số cách chọn một cặp gồm một học sinh nam và một học sinh nữ là", ["$28$", "$48$", "$14$", "$8$"], "B", "Quy tắc đếm", "Quy tắc nhân"),
    q("Trên giá có $4$ sách Toán, $3$ sách Vật lí và $2$ sách Hóa học. Lấy ngẫu nhiên $3$ quyển. Xác suất để cả ba đều là sách Toán là", ["$\\dfrac{2}{7}$", "$\\dfrac{1}{21}$", "$\\dfrac{37}{42}$", "$\\dfrac{5}{42}$"], "B", "Xác suất", "Xác suất chọn vật"),
    q("Một lớp có $20$ nam sinh và $15$ nữ sinh. Chọn ngẫu nhiên $4$ học sinh. Xác suất để nhóm được chọn có cả nam và nữ là", ["$\\dfrac{4615}{5236}$", "$\\dfrac{4651}{5236}$", "$\\dfrac{4615}{5263}$", "$\\dfrac{4610}{5236}$"], "A", "Xác suất", "Xác suất chọn người"),
    q("Một hộp có $5$ viên bi xanh, $4$ viên bi đỏ và $2$ viên bi vàng. Lấy ngẫu nhiên đồng thời hai viên. Xác suất lấy được hai viên cùng màu là", ["$\\dfrac{7}{55}$", "$\\dfrac{16}{55}$", "$\\dfrac{2}{11}$", "$\\dfrac{17}{55}$"], "D", "Xác suất", "Xác suất chọn vật"),
    q("Gieo một con xúc xắc cân đối. Xác suất xuất hiện mặt có số chấm chia hết cho $3$ là", ["$\\dfrac{2}{3}$", "$\\dfrac{1}{2}$", "$\\dfrac{1}{3}$", "$\\dfrac{1}{6}$"], "C", "Xác suất", "Định nghĩa cổ điển của xác suất"),
    q("Một hộp chứa $5$ quả cầu mang số lẻ và $6$ quả cầu mang số chẵn. Lấy ngẫu nhiên $2$ quả rồi nhân hai số ghi trên chúng. Xác suất để tích là số lẻ là", ["$\\dfrac{6}{11}$", "$\\dfrac{2}{11}$", "$\\dfrac{1}{3}$", "$\\dfrac{3}{11}$"], "B", "Xác suất", "Xác suất chọn vật"),
]

COMBINATORICS = [
    q("Số hoán vị của $4$ phần tử là", ["$24$", "$12$", "$4$", "$48$"], "A", "Tổ hợp", "Hoán vị"),
    q("Trong loạt sút luân lưu, huấn luyện viên chọn có thứ tự $3$ cầu thủ trong $7$ cầu thủ, mỗi người sút đúng một lần. Có bao nhiêu cách chọn?", ["$70$", "$2187$", "$823543$", "$210$"], "D", "Tổ hợp", "Chỉnh hợp"),
    q("Một lớp có $40$ học sinh. Số cách chọn $3$ học sinh tham gia lao động là", ["$9880$", "$59280$", "$2300$", "$455$"], "A", "Tổ hợp", "Tổ hợp"),
    q("Một tổ có $6$ học sinh nam và $9$ học sinh nữ. Số cách chọn một nam và một nữ là", ["$C_6^1+C_9^1$", "$C_6^1C_{15}^1$", "$C_6^1+C_{15}^1$", "$C_6^1C_9^1$"], "D", "Quy tắc đếm", "Quy tắc nhân"),
    q("Một hộp có $4$ bánh dẻo và $6$ bánh nướng, tất cả có loại nhân khác nhau. Số cách lấy ra $6$ chiếc bánh là", ["$240$", "$151200$", "$14200$", "$210$"], "D", "Tổ hợp", "Tổ hợp"),
    q("Có $10$ y tá và $3$ bác sĩ. Lập nhóm gồm một bác sĩ làm trưởng đoàn, một y tá làm phó đoàn và $5$ y tá làm thành viên. Số cách lập nhóm là", ["$8730$", "$3780$", "$3870$", "$7830$"], "B", "Quy tắc đếm", "Kết hợp quy tắc đếm"),
    q("Có $6$ quả cầu xanh đánh số $1$ đến $6$, $5$ quả đỏ đánh số $1$ đến $5$ và $4$ quả vàng đánh số $1$ đến $4$. Số cách lấy ba quả vừa khác màu vừa khác số là", ["$64$", "$96$", "$128$", "$32$"], "A", "Quy tắc đếm", "Kết hợp quy tắc đếm"),
    q("Có $3$ bức thư và $3$ con tem phân biệt. Dán mỗi bức thư đúng một con tem. Số cách dán là", ["$3$", "$6$", "$1$", "$2!$"], "B", "Tổ hợp", "Hoán vị"),
    q("Một hộp chứa $6$ quả cầu trắng và $4$ quả cầu đen. Số cách lấy $2$ quả cùng màu là", ["$21$", "$42$", "$10$", "$24$"], "A", "Tổ hợp", "Tổ hợp"),
    q("Một giải thể thao trao ba giải nhất, nhì, ba cho ba người khác nhau trong $20$ vận động viên. Có bao nhiêu kết quả trao giải?", ["$1140$", "$6840$", "$1$", "$3$"], "B", "Tổ hợp", "Chỉnh hợp"),
    q("Một đa giác đều $20$ đỉnh nội tiếp đường tròn. Chọn $4$ đỉnh để tạo thành hình chữ nhật. Có bao nhiêu cách chọn?", ["$60$", "$38$", "$45$", "$30$"], "C", "Tổ hợp", "Bài toán đa giác"),
    q("Một đa giác lồi có $44$ đường chéo. Đa giác đó có bao nhiêu cạnh?", ["$8$", "$10$", "$9$", "$11$"], "D", "Tổ hợp", "Bài toán đa giác"),
    q("Cho $A=\\{1,2,3,5,7,9\\}$. Từ $A$ lập các số tự nhiên gồm bốn chữ số khác nhau. Có bao nhiêu số?", ["$720$", "$360$", "$120$", "$24$"], "B", "Tổ hợp", "Lập số tự nhiên"),
    q("Một câu lạc bộ có $16$ thành viên. Chọn ban chấp hành gồm trưởng ban, phó ban, thư kí và thủ quỹ. Số cách chọn là", ["$4$", "$\\dfrac{16!}{4}$", "$\\dfrac{16!}{12!4!}$", "$\\dfrac{16!}{12!}$"], "D", "Tổ hợp", "Chỉnh hợp"),
    q("Cho $15$ điểm trong mặt phẳng, không có ba điểm thẳng hàng. Số tam giác có ba đỉnh trong các điểm đã cho là", ["$3375$", "$2730$", "$455$", "$45$"], "C", "Tổ hợp", "Tổ hợp"),
]

NEWTON = [
    q("Khai triển $(x+1)^{2022}$ có bao nhiêu số hạng?", ["$2022$", "$2023$", "$2021$", "$2024$"], "B", "Nhị thức Newton", "Số số hạng"),
    q("Hệ số của $x^3$ trong khai triển $(2x+1)^5$ là", ["$-80$", "$10$", "$40$", "$80$"], "D", "Nhị thức Newton", "Tìm hệ số"),
    q("Khai triển $(x+1)^n$, với $n\\in\\mathbb{N}^*$, có $18$ số hạng. Giá trị của $n$ là", ["$16$", "$17$", "$15$", "$14$"], "B", "Nhị thức Newton", "Số số hạng"),
    q("Số hạng tổng quát trong khai triển $(a+b)^4$ là", ["$C_5^{k-1}a^{4-k}b^k$", "$C_4^ka^{4-k}b^k$", "$C_5^{k+1}a^{4-k}b^{k+1}$", "$C_4^ka^{4-k}b^{4-k}$"], "B", "Nhị thức Newton", "Số hạng tổng quát"),
    q("Số hạng tổng quát trong khai triển $(2x-3)^4$ là", ["$C_4^k(2x)^{4-k}3^k$", "$C_4^k(2x)^{4-k}(-3)^k$", "$C_4^k(2x)^{4-k}3^{4-k}$", "$C_4^k(2x)^k(-3)^{4-k}$"], "B", "Nhị thức Newton", "Số hạng tổng quát"),
    q("Tổng các hệ số trong khai triển $(2x-3)^4$ bằng", ["$1$", "$-1$", "$81$", "$-81$"], "A", "Nhị thức Newton", "Tổng hệ số"),
    q("Số hạng chứa $x^2$ trong khai triển $P(x)=x^4+(x-2)^4$ là", ["$28x^2$", "$-28x^2$", "$-24x^2$", "$24x^2$"], "B", "Nhị thức Newton", "Tìm số hạng"),
    q("Khai triển của $(3x+4)^5$ là", ["$1620x^5+4320x^4+5760x^3+3840x^2+1024$", "$243x^5+405x^4+4320x^3+5760x^2+3840x+1024$", "$243x^5-1620x^4+4320x^3-5760x^2+3840x-1024$", "$243x^5+1620x^4+4320x^3+5760x^2+3840x+1024$"], "D", "Nhị thức Newton", "Khai triển nhị thức"),
    q("Dân số một tỉnh năm $2022$ khoảng $2$ triệu người, tăng $1{,}5\\%$ mỗi năm. Dân số năm $2027$ xấp xỉ", ["$2.154.568$ người", "$3.400.000$ người", "$3.300.000$ người", "$2.400.000$ người"], "A", "Nhị thức Newton", "Ứng dụng thực tế"),
    q("Tổng $T=C_n^0+C_n^1+\\cdots+C_n^n$ bằng", ["$2^{n+1}$", "$2^{n-1}$", "$2^n$", "$0$"], "C", "Nhị thức Newton", "Tổng hệ số"),
    q("Cho $n$ nguyên dương thỏa mãn $C_n^1+C_n^2+\\cdots+C_n^n=4095$. Giá trị của $n$ là", ["$14$", "$16$", "$13$", "$12$"], "D", "Nhị thức Newton", "Tổng hệ số"),
    q("Dùng ba số hạng đầu trong khai triển để tính gần đúng $(1{,}02)^4$. Kết quả là", ["$1{,}08$", "$1{,}0824$", "$1{,}08243$", "$1{,}082432$"], "B", "Nhị thức Newton", "Tính gần đúng"),
    q("Dùng ba số hạng đầu trong khai triển để tính gần đúng $(2{,}03)^5$. Kết quả là", ["$34{,}473$", "$34{,}47$", "$34{,}47308$", "$34{,}473088$"], "A", "Nhị thức Newton", "Tính gần đúng"),
    q("Dùng bốn số hạng đầu trong khai triển để tính gần đúng $(1{,}03)^5$. Kết quả là", ["$1{,}15$", "$1{,}1592$", "$1{,}159274$", "$1{,}15927407$"], "C", "Nhị thức Newton", "Tính gần đúng"),
    q("Dùng bốn số hạng đầu trong khai triển để tính gần đúng $(4{,}0002)^5$. Kết quả là", ["$1024{,}25$", "$1024{,}256026$", "$1024{,}25602$", "$1024{,}256$"], "B", "Nhị thức Newton", "Tính gần đúng"),
]

EXAMS = [
    ("2026-toan10-test-bien-co-xac-suat-co-dap-an", "Toán 10 - Test biến cố và xác suất theo định nghĩa cổ điển - Có đáp án", PROBABILITY),
    ("2026-toan10-test-hoan-vi-chinh-hop-to-hop-so-01-co-dap-an", "Toán 10 - Test hoán vị, chỉnh hợp và tổ hợp số 01 - Có đáp án", COMBINATORICS),
    ("2026-toan10-test-nhi-thuc-newton-co-dap-an", "Toán 10 - Test nhị thức Newton - Có đáp án", NEWTON),
]


def normalized_title(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", value).strip()


def existing_titles() -> set[str]:
    titles: set[str] = set()
    for path in (ROOT / "data").rglob("*.json"):
        if path.name in {"index.json", "taxonomy.json", "topic-index.json"} or "_template" in path.parts:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, dict) and isinstance(data.get("title"), str):
            titles.add(normalized_title(data["title"]))
    return titles


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    seen = existing_titles()
    created = 0
    for slug, title, questions in EXAMS:
        if normalized_title(title) in seen:
            print(f"SKIP title exists: {title}")
            continue
        for index, question in enumerate(questions, 1):
            question["id"] = index
        payload = {
            "id": slug,
            "grade": "l10",
            "subjectSlug": "toan",
            "examType": "khaosat",
            "year": 2026,
            "code": f"Test {created + 1:02d}",
            "title": title,
            "duration": 25,
            "answerSource": "official",
            "passages": {},
            "questions": questions,
        }
        target = OUT / f"{slug}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"CREATED {target.relative_to(ROOT)} ({len(questions)} câu)")
        seen.add(normalized_title(title))
        created += 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
