// exam.js - logic giao diện làm bài thi
// Cấu trúc đề thi (xem README.md để biết chi tiết cách thêm đề mới):
// { id, title, subject, duration, passages: {passageId: "html nội dung đoạn văn"},
//   questions: [{ id, type: "single"|"true_false"|"short_answer", content, passageId?,
//                 options?, statements?, answer }] }

let taxonomy = null;
let examMeta = null;
let examData = null;
let isPractice = false;
let currentIndex = 0;
let answers = {};      // { questionId: answer }
let flagged = new Set();
let timeLeft = 0;
let timerInterval = null;
let submitted = false;
const LANGUAGE_EXAM_TYPES = ["ielts", "toeic", "hsk", "topik", "jlpt", "vstep", "aptis"];

// typesetMath — Dùng KaTeX (nhanh hơn MathJax 10x, chỉ ~150KB)
function typesetMath(container) {
  var el = container || document.body;
  if (window.renderMathInElement) {
    // KaTeX auto-render: xử lý tất cả $...$ và \(...\) và \[...\] trong element
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,        // Không crash nếu công thức sai cú pháp
      errorColor: '#cc0000',      // Tô màu đỏ nếu lỗi
      strict: false,
      trust: false,
      output: 'html'             // HTML nhanh hơn mathml
    });
  } else if (typeof window.loadKaTeX === 'function') {
    // KaTeX chưa load — gọi lazy loader rồi render
    window.loadKaTeX().then(function() {
      if (window.renderMathInElement) typesetMath(el);
    });
  }
}


function isOfficialAnswer() {
  return (examData.answerSource || examMeta.answerSource || "ai") === "official";
}

function isMissingAnswer() {
  return (examData.answerSource || examMeta.answerSource || "ai") === "missing";
}

function isPartialAnswer() {
  return (examData.answerSource || examMeta.answerSource || "ai") === "partial";
}

// Runtime Answer Obfuscation & Memory Protection
const _K = 0x5a;
function _encode(val) {
  if (val === null || val === undefined) return null;
  return btoa(unescape(encodeURIComponent(JSON.stringify(val)))).split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ _K)).join('');
}
function _decode(val) {
  if (val === null || val === undefined) return null;
  try {
    const raw = val.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ _K)).join('');
    return JSON.parse(decodeURIComponent(escape(atob(raw))));
  } catch (e) {
    return val;
  }
}

function hasQuestionAnswer(q) {
  const ans = q.answer !== undefined ? q.answer : _decode(q._secAns);
  if (q.type === "true_false") return Array.isArray(ans) && ans.length === (q.statements || []).length;
  return ans !== undefined && ans !== null && String(ans).trim() !== "";
}


function renderAnswerNotice() {}

async function init() {
  const params = new URLSearchParams(window.location.search);
  isPractice = params.get("practice") === "1";

  try {
    const taxRes = await fetch("data/taxonomy.json");
    taxonomy = await taxRes.json();

    let gradeLabel, subjectLabel, typeLabel;

    if (isPractice) {
      const raw = sessionStorage.getItem("practiceExam");
      if (!raw) {
        document.getElementById("exam-loading").innerHTML =
          '<p>Không tìm thấy phiên ôn tập. Quay lại <a href="on-tap.html">trang Ôn theo dạng + chương</a> để bắt đầu.</p>';
        return;
      }
      examData = JSON.parse(raw);
      examMeta = { grade: examData.grade, subjectSlug: examData.subjectSlug, examType: "ontap", id: examData.id };
      gradeLabel = LANGUAGE_EXAM_TYPES.includes(examMeta.examType)
        ? "Mọi lớp"
        : (taxonomy.grades[examMeta.grade] || examMeta.grade);
      subjectLabel = taxonomy.subjects[examMeta.subjectSlug] || examMeta.subjectSlug;
      typeLabel = "Ôn theo dạng + chương";
    } else {
      const examId = params.get("id");
      if (!examId) {
        document.getElementById("exam-loading").innerHTML = "<p>Thiếu mã đề thi (id).</p>";
        return;
      }

      let filePath = params.get("file");
      if (!filePath) {
        try {
          const mapRes = await fetch("data/id-map.json", { cache: "no-store" });
          const idMap = await mapRes.json();
          filePath = idMap[examId];
        } catch (e) {}
      }

      if (!filePath) {
        const indexRes = await fetch("data/index.json", { cache: "no-store" });
        const indexList = await indexRes.json();
        examMeta = indexList.find(e => e.id === examId);
        if (examMeta) filePath = examMeta.file;
      }

      if (!filePath) {
        document.getElementById("exam-loading").innerHTML = "<p>Không tìm thấy đề thi này trong hệ thống.</p>";
        return;
      }

      const dataRes = await fetch(filePath, { cache: "no-store" });
      if (!dataRes.ok) {
        throw new Error(`HTTP ${dataRes.status} khi tải ${filePath}`);
      }
      examData = await dataRes.json();
      if (!examMeta) {
        examMeta = {
          id: examData.id || examId,
          grade: examData.grade,
          subjectSlug: examData.subjectSlug,
          examType: examData.examType,
          duration: examData.duration || 60,
          title: examData.title
        };
      }

      gradeLabel = taxonomy.grades[examData.grade || examMeta.grade] || examData.grade || examMeta.grade;
      subjectLabel = taxonomy.subjects[examData.subjectSlug || examMeta.subjectSlug] || examData.subjectSlug || examMeta.subjectSlug;
      typeLabel = taxonomy.examTypes[examData.examType || examMeta.examType] || examData.examType || examMeta.examType;
    }

    // Bảo mật & Mã hóa đáp án trong bộ nhớ Client
    (examData.questions || []).forEach(q => {
      q._secAns = _encode(q.answer);
      delete q.answer;
    });

    document.getElementById("exam-title-header").textContent = examData.title || "Đề thi";
    document.getElementById("exam-type-badge").textContent = `${gradeLabel} · ${typeLabel}`;
    document.getElementById("candidate-subject").textContent = subjectLabel;

    timeLeft = (examData.duration || (examMeta && examMeta.duration) || 60) * 60;
    startTimer();

    document.getElementById("exam-loading").style.display = "none";
    document.getElementById("exam-body").style.display = "grid";

    buildGrid();
    renderQuestion(0);

    document.getElementById("prev-btn").addEventListener("click", () => goTo(currentIndex - 1));
    document.getElementById("next-btn").addEventListener("click", () => goTo(currentIndex + 1));
    document.getElementById("flag-btn").addEventListener("click", toggleFlag);
    document.getElementById("submit-btn").addEventListener("click", confirmSubmit);

  } catch (err) {
    console.error("Lỗi khởi tạo đề thi:", err);
    document.getElementById("exam-loading").innerHTML = `<p>Lỗi khi tải đề thi: ${escapeHtml(err.message || "Kiểm tra lại file dữ liệu")}.</p>`;
  }
}

function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (submitted) { clearInterval(timerInterval); return; }
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      doSubmit(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.max(0, Math.floor(timeLeft / 60));
  const s = Math.max(0, timeLeft % 60);
  const timerEl = document.getElementById("timer");
  if (timerEl) {
    timerEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    timerEl.classList.toggle("urgent", timeLeft <= 300);
  }
}

function isAnswered(q) {
  const a = answers[q.id];
  if (a === undefined || a === null) return false;
  if (q.type === "true_false") return Array.isArray(a) && a.some(v => v !== null && v !== undefined);
  if (typeof a === "string") return a.trim() !== "";
  return true;
}

function buildGrid() {
  const grid = document.getElementById("qgrid");
  grid.innerHTML = "";
  examData.questions.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.textContent = idx + 1;
    btn.addEventListener("click", () => goTo(idx));
    btn.dataset.idx = idx;
    grid.appendChild(btn);
  });
  refreshGrid();
}

function refreshGrid() {
  const grid = document.getElementById("qgrid");
  let answeredTotal = 0;
  [...grid.children].forEach((btn, idx) => {
    const q = examData.questions[idx];
    const answered = isAnswered(q);
    if (answered) answeredTotal++;
    btn.className = "";
    if (idx === currentIndex) btn.classList.add("current");
    else if (answered) btn.classList.add("answered");
    if (flagged.has(q.id)) btn.classList.add("flagged");
  });
  const total = examData.questions.length;
  document.getElementById("answered-count").textContent = `${answeredTotal}/${total}`;
  document.getElementById("progress-fill").style.width = `${(answeredTotal / total) * 100}%`;
}

function goTo(idx) {
  if (idx < 0 || idx >= examData.questions.length) return;
  renderQuestion(idx);
}

function toggleFlag() {
  const q = examData.questions[currentIndex];
  if (flagged.has(q.id)) flagged.delete(q.id);
  else flagged.add(q.id);
  refreshGrid();
  updateFlagBtn();
}

function updateFlagBtn() {
  const q = examData.questions[currentIndex];
  document.getElementById("flag-btn").textContent =
    flagged.has(q.id) ? "Bỏ đánh dấu" : "Đánh dấu câu hỏi";
}

function renderQuestion(idx) {
  currentIndex = idx;
  const q = examData.questions[idx];

  document.getElementById("question-number").textContent = `Câu ${idx + 1}/${examData.questions.length}`;
  document.getElementById("question-content").innerHTML = q.content;

  // Đoạn văn dùng chung (nếu có)
  const passageSlot = document.getElementById("passage-slot");
  if (q.passageId && examData.passages && examData.passages[q.passageId]) {
    passageSlot.innerHTML = `<div class="passage-box">${examData.passages[q.passageId]}</div>`;
  } else {
    passageSlot.innerHTML = "";
  }

  const area = document.getElementById("question-answer-area");
  area.innerHTML = "";

  if (q.type === "single") {
    const wrap = document.createElement("div");
    wrap.className = "options";
    q.options.forEach(opt => {
      const letter = opt.trim().charAt(0); // "A. ..." -> "A"
      const label = document.createElement("label");
      const checked = answers[q.id] === letter ? "checked" : "";
      label.innerHTML = `<input type="radio" name="q${q.id}" value="${letter}" ${checked}> ${opt}`;
      label.querySelector("input").addEventListener("change", () => {
        answers[q.id] = letter;
        refreshGrid();
      });
      wrap.appendChild(label);
    });
    area.appendChild(wrap);

  } else if (q.type === "true_false") {
    if (!answers[q.id]) answers[q.id] = new Array(q.statements.length).fill(null);
    const table = document.createElement("table");
    table.className = "tf-table";
    table.innerHTML = `<tr><th style="text-align:left;">Mệnh đề</th><th>Đúng</th><th>Sai</th></tr>`;
    q.statements.forEach((stmt, sIdx) => {
      const tr = document.createElement("tr");
      const tdStmt = document.createElement("td");
      tdStmt.style.textAlign = "left";
      tdStmt.innerHTML = stmt;
      tr.appendChild(tdStmt);
      ["D", "S"].forEach(val => {
        const td = document.createElement("td");
        const checked = answers[q.id][sIdx] === val ? "checked" : "";
        td.innerHTML = `<input type="radio" name="q${q.id}s${sIdx}" value="${val}" ${checked}>`;
        td.querySelector("input").addEventListener("change", () => {
          answers[q.id][sIdx] = val;
          refreshGrid();
        });
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-responsive";
    tableWrap.appendChild(table);
    area.appendChild(tableWrap);

  } else if (q.type === "short_answer") {
    const input = document.createElement(q.responseMode === "long" ? "textarea" : "input");
    if (input.tagName === "INPUT") input.type = "text";
    input.className = q.responseMode === "long" ? "long-answer-input" : "short-answer-input";
    input.placeholder = q.responseMode === "long" ? "Nhập câu trả lời của bạn..." : "Nhập đáp án...";
    if (q.responseMode === "long") input.rows = 9;
    input.value = answers[q.id] || "";
    input.addEventListener("input", () => {
      answers[q.id] = input.value;
      refreshGrid();
    });
    area.appendChild(input);
  }

  updateFlagBtn();
  refreshGrid();
  typesetMath();
  setupImageZoom();

  document.getElementById("prev-btn").disabled = idx === 0;
  document.getElementById("next-btn").textContent =
    idx === examData.questions.length - 1 ? "Câu cuối" : "Câu tiếp →";
}

// Bấm vào hình vẽ/đồ thị trong câu hỏi để phóng to xem cho rõ
function setupImageZoom() {
  document.querySelectorAll(".question-figure img, .passage-box img").forEach(img => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openLightbox(img.src, img.alt));
  });
}

function openLightbox(src, alt) {
  let box = document.getElementById("img-lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "img-lightbox";
    box.className = "img-lightbox";
    box.innerHTML = `<img id="img-lightbox-img"><span class="lightbox-hint">Bấm vào bất kỳ đâu để đóng</span>`;
    box.addEventListener("click", () => box.classList.remove("open"));
    document.body.appendChild(box);
  }
  document.getElementById("img-lightbox-img").src = src;
  document.getElementById("img-lightbox-img").alt = alt || "";
  box.classList.add("open");
}

function confirmSubmit() {
  const total = examData.questions.length;
  const answeredCount = examData.questions.filter(isAnswered).length;
  const msg = answeredCount < total
    ? `Bạn mới trả lời ${answeredCount}/${total} câu. Bạn có chắc chắn muốn nộp bài?`
    : "Bạn có chắc chắn muốn nộp bài?";
  const missingNote = isPartialAnswer()
    ? "\n\nĐề mới có đáp án một phần: hệ thống chỉ chấm những câu đã có đáp án chuẩn."
    : isMissingAnswer()
    ? "\n\nĐề chưa có đáp án: hệ thống sẽ ghi nhận bài đã hoàn thành nhưng không hiển thị điểm hoặc số câu đúng/sai."
    : "";
  if (confirm(msg + missingNote)) doSubmit(false);
}

function normalize(str) {
  return (str || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreQuestion(q) {
  const a = answers[q.id];
  const qAns = q.answer !== undefined ? q.answer : _decode(q._secAns);
  if (qAns === undefined || qAns === null) return 0;
  if (q.type === "single") {
    return a === qAns ? 1 : 0;
  }
  if (q.type === "short_answer") {
    return normalize(a) === normalize(qAns) ? 1 : 0;
  }
  if (q.type === "true_false") {
    if (!Array.isArray(a) || !Array.isArray(qAns)) return 0;
    let correct = 0;
    qAns.forEach((ans, i) => { if (a[i] === ans) correct++; });
    return correct / qAns.length;
  }
  return 0;
}

function doSubmit(auto) {
  submitted = true;
  clearInterval(timerInterval);

  const total = examData.questions.length;
  const missingAnswer = isMissingAnswer();
  const partialAnswer = isPartialAnswer();
  const gradableTotal = partialAnswer ? examData.questions.filter(hasQuestionAnswer).length : total;
  let sumScore = 0;
  const details = examData.questions.map((q, idx) => {
    if (missingAnswer || (partialAnswer && !hasQuestionAnswer(q))) {
      return { idx, q, answered: isAnswered(q), score: null, correct: null };
    }
    const questionScore = scoreQuestion(q);
    sumScore += questionScore;
    return { idx, q, answered: isAnswered(q), score: questionScore, correct: questionScore === 1 };
  });

  const scoreOn10 = missingAnswer || !gradableTotal ? null : (sumScore / gradableTotal) * 10;
  const answeredCount = examData.questions.filter(isAnswered).length;

  try {
    const history = JSON.parse(localStorage.getItem("examHistory") || "[]");
    const completedAt = new Date();
    const entry = {
      examId: (examMeta && examMeta.id) || examData.id,
      title: examData.title,
      grade: (examMeta && examMeta.grade) || examData.grade,
      subjectSlug: (examMeta && examMeta.subjectSlug) || examData.subjectSlug,
      isPractice: isPractice,
      score: missingAnswer ? null : Math.round(scoreOn10 * 100) / 100,
      correctCount: missingAnswer ? null : details.filter(d => d.correct).length,
      totalQuestions: total,
      answeredCount: answeredCount,
      answerSource: missingAnswer ? "missing" : (partialAnswer ? "partial" : (isOfficialAnswer() ? "official" : "ai")),
      date: completedAt.toISOString()
    };

    let stats;
    try { stats = JSON.parse(localStorage.getItem("examStats") || "null"); } catch { stats = null; }
    if (!stats || stats.version !== 1) {
      const previousScores = history.filter(item => typeof item.score === "number");
      const previousDays = history.map(item => {
        const d = new Date(item.date);
        return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }).filter(Boolean);
      stats = {
        version: 1,
        totalCompleted: history.length,
        scoredCount: previousScores.length,
        scoreSum: previousScores.reduce((sum, item) => sum + item.score, 0),
        activityDates: [...new Set(previousDays)]
      };
    }

    stats.totalCompleted = Math.max(Number(stats.totalCompleted) || 0, history.length) + 1;
    if (typeof entry.score === "number") {
      stats.scoredCount = (Number(stats.scoredCount) || 0) + 1;
      stats.scoreSum = (Number(stats.scoreSum) || 0) + entry.score;
    }
    const activityDate = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, "0")}-${String(completedAt.getDate()).padStart(2, "0")}`;
    stats.activityDates = Array.isArray(stats.activityDates) ? stats.activityDates : [];
    if (!stats.activityDates.includes(activityDate)) stats.activityDates.push(activityDate);

    history.unshift(entry);
    if (history.length > 200) history.length = 200;
    localStorage.setItem("examHistory", JSON.stringify(history));
    localStorage.setItem("examStats", JSON.stringify(stats));

    if (window.supabase && typeof window.supabase.saveExamResult === 'function') {
      window.supabase.saveExamResult({
        examId: (examMeta && examMeta.id) || examData.id,
        examName: examData.title,
        subjectSlug: (examMeta && examMeta.subjectSlug) || examData.subjectSlug,
        grade: (examMeta && examMeta.grade) || examData.grade,
        score: missingAnswer ? null : Math.round(scoreOn10 * 100) / 100,
        total: total,
        correct: missingAnswer ? null : details.filter(d => d.correct).length,
        durationSeconds: examData.duration ? (examData.duration * 60 - timeLeft) : 0,
        isPractice: isPractice,
      });
    }
  } catch (e) {
    console.warn("Lỗi khi lưu lịch sử làm bài:", e);
  }

  document.getElementById("exam-body").style.display = "none";

  const resultSlot = document.getElementById("result-slot");
  if (missingAnswer) {
    resultSlot.innerHTML = `
      <div class="result-card">
        <h2>${auto ? "Hết giờ - Đã tự động nộp bài" : "Nộp bài thành công!"}</h2>
        <div class="result-sub">Bạn đã hoàn thành và trả lời ${answeredCount}/${total} câu.</div>
        <div class="result-list" id="result-list"></div>
        <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
          <a class="btn secondary" href="index.html">Về trang chủ</a>
          <a class="btn" href="${isPractice ? 'on-tap.html' : `explore.html?grade=${examMeta.grade}&subject=${examMeta.subjectSlug}`}">${isPractice ? 'Ôn tập tiếp' : 'Thi đề khác cùng môn'}</a>
        </div>
      </div>
    `;

    const listEl = document.getElementById("result-list");
    details.forEach(d => {
      const div = document.createElement("div");
      div.className = "r-item";
      div.innerHTML = `<span>Câu ${d.idx + 1}</span><span>${d.answered ? "Đã trả lời" : "Chưa trả lời"}</span>`;
      listEl.appendChild(div);
    });
    window.scrollTo(0, 0);
    return;
  }

  const pct = Math.max(0, Math.min(100, scoreOn10 * 10));
  resultSlot.innerHTML = `
    <div class="result-card">
      <h2>${auto ? "Hết giờ - Đã tự động nộp bài" : "Nộp bài thành công!"}</h2>
      <div class="score-ring" style="--pct:${pct}">
        <div class="score-num">${scoreOn10.toFixed(2)}<small>/ 10 điểm</small></div>
      </div>
      <div class="result-sub">Số câu đã trả lời: ${answeredCount}/${total} · Đúng hoàn toàn: ${details.filter(d=>d.correct).length}/${gradableTotal} câu</div>
      <div class="result-list" id="result-list"></div>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
        <a class="btn secondary" href="index.html">Về trang chủ</a>
        <a class="btn" href="${isPractice ? 'on-tap.html' : `explore.html?grade=${examMeta.grade}&subject=${examMeta.subjectSlug}`}">${isPractice ? 'Ôn tập tiếp' : 'Thi đề khác cùng môn'}</a>
      </div>
    </div>
  `;

  const listEl = document.getElementById("result-list");
  details.forEach(d => {
    const div = document.createElement("div");
    div.className = "r-item";
    const cls = d.score === null ? "" : (d.score === 1 ? "r-correct" : "r-wrong");
    const pct = d.score === null ? "Chưa có đáp án" : (d.score === 1 ? "Đúng" : (d.score === 0 ? "Sai" : `Đúng ${Math.round(d.score*100)}%`));
    div.innerHTML = `<span>Câu ${d.idx + 1}</span><span class="${cls}">${pct}</span>`;
    listEl.appendChild(div);
  });

  window.scrollTo(0, 0);
}

init();
