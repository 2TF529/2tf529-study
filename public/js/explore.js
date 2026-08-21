// explore.js - lọc & tìm kiếm đề thi trên bộ index.json (metadata nhẹ, không chứa câu hỏi)

let taxonomy = null;
let allExams = [];
let activeGroup = "";
let visibleLimit = 40;
const PAGE_SIZE = 40;
let keywordTimer = null;

const LANGUAGE_EXAM_TYPES = ["ielts", "toeic", "hsk", "topik", "jlpt"];

function qs(id) { return document.getElementById(id); }

async function init() {
  const params = new URLSearchParams(window.location.search);
  const urlGrade = params.get("grade") || "";
  activeGroup = params.get("group") || "";

  // Chiến lược tải thông minh:
  // - Nếu URL có ?grade=l12 → chỉ tải chunk l12 (~854KB thay vì 2MB)
  // - Nếu không có grade filter → tải tất cả 4 chunks song song
  const CHUNKS = ["l9", "l10", "l11", "l12"];
  const VALID_GRADES = new Set(CHUNKS);

  async function loadChunk(grade) {
    const url = `data/chunks/explore-${grade}.json`;
    const res = await fetch(url);
    return res.json();
  }

  async function loadExams(grade) {
    let raw = [];
    if (grade && VALID_GRADES.has(grade)) {
      // Tải 1 chunk theo grade → cực nhanh
      raw = await loadChunk(grade);
    } else {
      // Không có grade → tải tất cả song song, gộp lại
      const chunks = await Promise.all(CHUNKS.map(loadChunk));
      raw = chunks.flat();
    }
    return raw.map(e => ({
      id: e[0], grade: e[1], subjectSlug: e[2], examType: e[3], year: e[4],
      code: e[5], title: e[6], duration: e[7], questionCount: e[8], answerSource: e[9]
    }));
  }

  const [taxRes, exams] = await Promise.all([
    fetch("data/taxonomy.json").then(r => r.json()),
    loadExams(urlGrade)
  ]);
  taxonomy = taxRes;
  allExams = exams;

  fillSelect("f-grade", taxonomy.grades);
  const examTypeOptions = activeGroup === "ngoai-ngu"
    ? Object.fromEntries(LANGUAGE_EXAM_TYPES.map(slug => [slug, taxonomy.examTypes[slug]]))
    : taxonomy.examTypes;

  fillSelect("f-subject", taxonomy.subjects);
  fillSelect("f-type", examTypeOptions);

  // Đọc filter từ URL (?grade=l12&type=totnghiep&subject=toan&q=...)
  if (params.get("grade")) qs("f-grade").value = params.get("grade");
  if (params.get("subject")) qs("f-subject").value = params.get("subject");
  if (params.get("type")) qs("f-type").value = params.get("type");
  if (params.get("answer")) qs("f-answer").value = params.get("answer");
  if (params.get("q")) qs("f-keyword").value = params.get("q");

  // Khi đổi grade filter → tải lại chunk tương ứng (không cần reload trang)
  qs("f-grade").addEventListener("change", async () => {
    const newGrade = qs("f-grade").value;
    visibleLimit = PAGE_SIZE;
    if (newGrade && VALID_GRADES.has(newGrade) && allExams[0]?.grade !== newGrade) {
      // Nếu chuyển sang grade khác và chunk chưa được load → reload
      qs("exam-list").innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
      allExams = await loadExams(newGrade);
    }
    render();
  });

  ["f-subject", "f-type", "f-answer", "f-sort"].forEach(id => {
    const el = qs(id);
    if (el) el.addEventListener("change", () => { visibleLimit = PAGE_SIZE; render(); });
  });
  qs("f-keyword").addEventListener("input", () => {
    clearTimeout(keywordTimer);
    keywordTimer = setTimeout(() => { visibleLimit = PAGE_SIZE; render(); }, 160);
  });

  render();
}

function fillSelect(id, dict) {
  const sel = qs(id);
  Object.entries(dict).forEach(([slug, label]) => {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

// Sinh màu ổn định cho từng môn học từ chuỗi slug (không cần khai báo tay khi thêm môn mới)
function subjectColor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { color: `hsl(${hue}, 58%, 36%)`, tint: `hsl(${hue}, 70%, 95%)` };
}

function render() {
  const grade = qs("f-grade").value;
  const subject = qs("f-subject").value;
  const type = qs("f-type").value;
  const answer = qs("f-answer") ? qs("f-answer").value : "";
  const keyword = qs("f-keyword").value.trim().toLowerCase();
  const sort = qs("f-sort").value;
  const ignoreGrade = activeGroup === "ngoai-ngu" || LANGUAGE_EXAM_TYPES.includes(type);

  const ANSWER_PRIORITY = { official: 0, ai: 1, partial: 2, missing: 3 };
  const getRank = src => ANSWER_PRIORITY[src] !== undefined ? ANSWER_PRIORITY[src] : 9;

  // Lọc hoàn toàn ở client - với vài chục nghìn đề vẫn chạy dưới 10ms
  let filtered = allExams.filter(e => {
    if (activeGroup === "ngoai-ngu" && !LANGUAGE_EXAM_TYPES.includes(e.examType)) return false;
    if (grade && !ignoreGrade && e.grade !== grade) return false;
    if (subject && e.subjectSlug !== subject) return false;
    if (type && e.examType !== type) return false;
    if (answer) {
      if (answer === "official" && e.answerSource !== "official") return false;
      if (answer === "ai" && e.answerSource !== "ai") return false;
      if (answer === "has_answer" && !["official", "ai"].includes(e.answerSource)) return false;
      if (answer === "missing" && !["missing", "partial"].includes(e.answerSource)) return false;
    }
    if (keyword && !e.title.toLowerCase().includes(keyword)) return false;
    return true;
  });

  if (sort === "name") {
    filtered = [...filtered].sort((a, b) => getRank(a.answerSource) - getRank(b.answerSource) || a.title.localeCompare(b.title, "vi"));
  } else if (sort === "oldest") {
    filtered = [...filtered].sort((a, b) => getRank(a.answerSource) - getRank(b.answerSource) || a.year - b.year);
  } else if (sort === "newest") {
    filtered = [...filtered].sort((a, b) => b.year - a.year);
  } else {
    // priority: official -> ai -> partial -> missing, then newest year
    filtered = [...filtered].sort((a, b) => getRank(a.answerSource) - getRank(b.answerSource) || b.year - a.year);
  }

  qs("result-count").textContent = `Tìm thấy ${filtered.length} đề thi`;

  const listEl = qs("exam-list");
  listEl.innerHTML = "";

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Không có đề thi nào khớp bộ lọc.<br>Thử bỏ bớt điều kiện lọc ở trên.<br><button class="btn secondary" id="reset-filters" style="margin-top:12px;">Xóa bộ lọc</button></div>`;
    qs("reset-filters").addEventListener("click", () => {
      ["f-grade", "f-subject", "f-type", "f-answer"].forEach(id => {
        if (qs(id)) qs(id).value = "";
      });
      qs("f-keyword").value = "";
      visibleLimit = PAGE_SIZE;
      render();
    });
    return;
  }

  const visible = filtered.slice(0, visibleLimit);
  const fragment = document.createDocumentFragment();
  visible.forEach(e => {
    const gradeLabel = LANGUAGE_EXAM_TYPES.includes(e.examType)
      ? "Mọi lớp"
      : (taxonomy.grades[e.grade] || e.grade);
    const subjectLabel = taxonomy.subjects[e.subjectSlug] || e.subjectSlug;
    const typeLabel = taxonomy.examTypes[e.examType] || e.examType;
    const { color, tint } = subjectColor(e.subjectSlug);

    const item = document.createElement("div");
    item.className = "exam-item";
    item.style.setProperty("--subject-color", color);
    item.style.setProperty("--subject-color-tint", tint);
    const answerBadge = e.answerSource === "official"
      ? `<span class="answer-badge official">✓ Đáp án chuẩn</span>`
      : e.answerSource === "partial"
        ? `<span class="answer-badge partial">Đáp án chuẩn một phần</span>`
      : e.answerSource === "missing"
        ? `<span class="answer-badge missing">Chưa có đáp án</span>`
        : `<span class="answer-badge ai">⚠ Đáp án AI - chưa kiểm chứng</span>`;
    item.innerHTML = `
      <div>
        <div class="exam-title">${e.title}</div>
        <div class="meta">
          <span class="subject-tag">${subjectLabel}</span>
          <span class="sep">·</span>${gradeLabel}
          <span class="sep">·</span>${typeLabel}
          <span class="sep">·</span>Năm ${e.year}${e.code ? " · " + e.code : ""}
          <span class="sep">·</span><span class="mono">${e.questionCount} câu · ${e.duration} phút</span>
          <span class="sep">·</span>${answerBadge}
        </div>
      </div>
      <a class="btn" href="thi.html?id=${e.id}">Bắt đầu thi</a>
    `;
    fragment.appendChild(item);
  });
  listEl.appendChild(fragment);

  if (visible.length < filtered.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "btn secondary load-more";
    more.textContent = `Xem thêm ${Math.min(PAGE_SIZE, filtered.length - visible.length)} đề`;
    more.addEventListener("click", () => {
      visibleLimit += PAGE_SIZE;
      render();
    });
    listEl.appendChild(more);
  }
}

init();
