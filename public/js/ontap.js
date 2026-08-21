// ontap.js - Ôn theo dạng + chương
// Nguồn dữ liệu: data/chunks/topic-{grade}.json — chứa CON TRỎ (examFile + questionId) tới các câu
// hỏi đã được gắn nhãn "chuong"/"dang". Chỉ tải chunk của grade được chọn — nhẹ hơn 100x.
// Khi bắt đầu ôn tập mới tải đúng những file đề thật sự có câu khớp bộ lọc.

let taxonomy = null;
let topicIndex = [];
let selectedChuong = null;
let selectedDang = new Set(); // rỗng = lấy tất cả dạng trong chương đó

function qs(id) { return document.getElementById(id); }

function subjectColor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { color: `hsl(${hue}, 58%, 36%)`, tint: `hsl(${hue}, 70%, 95%)` };
}

// ── Chunk loader — chỉ tải dữ liệu khi học sinh chọn khối lớp ──
const TOPIC_CHUNK_GRADES = new Set(['l10', 'l12']); // grades có file chunk riêng
let _loadedGrade = null;

async function ensureTopicLoaded(grade) {
  if (_loadedGrade === grade) return; // đã có sẵn, không cần tải lại
  _loadedGrade = grade;
  const url = TOPIC_CHUNK_GRADES.has(grade)
    ? `data/chunks/topic-${grade}.json`
    : 'data/topic-index.json'; // fallback tổng nếu grade chưa có chunk
  const res = await fetch(url);
  topicIndex = await res.json();
}

async function init() {
  // Chỉ tải taxonomy lúc đầu — nhỏ, nhanh
  const taxRes = await fetch('data/taxonomy.json');
  taxonomy = await taxRes.json();

  fillSelect('f-grade', taxonomy.grades);
  fillSelect('f-subject', taxonomy.subjects);

  qs('f-grade').addEventListener('change', onGradeSubjectChange);
  qs('f-subject').addEventListener('change', onGradeSubjectChange);
  qs('f-chuong').addEventListener('change', onChuongChange);
  qs('start-btn').addEventListener('click', startPractice);

  renderEmptyHint();
}

function fillSelect(id, dict) {
  const sel = qs(id);
  Object.entries(dict).forEach(([slug, label]) => {
    const opt = document.createElement('option');
    opt.value = slug;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

function renderEmptyHint() {
  qs('topic-list').innerHTML = `<div class="empty-state">Chọn khối lớp và môn học để xem các chương đã có câu hỏi luyện tập.</div>`;
  qs('result-count').textContent = '';
}

function currentMatches() {
  const grade = qs('f-grade').value;
  const subject = qs('f-subject').value;
  return topicIndex.filter(t => (!grade || t.grade === grade) && (!subject || t.subjectSlug === subject));
}

async function onGradeSubjectChange() {
  selectedChuong = null;
  selectedDang.clear();
  qs('setup-panel').style.display = 'none';
  qs('dang-chips').innerHTML = '';

  const grade = qs('f-grade').value;
  const subject = qs('f-subject').value;
  const chuongSel = qs('f-chuong');
  chuongSel.innerHTML = `<option value="">-- Chương / chủ đề --</option>`;

  if (!grade || !subject) {
    chuongSel.disabled = true;
    renderEmptyHint();
    return;
  }

  // Lazy-load chunk cho grade vừa chọn
  qs('topic-list').innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div>`;
  await ensureTopicLoaded(grade);

  const matches = currentMatches();
  if (matches.length === 0) {
    chuongSel.disabled = true;
    qs('topic-list').innerHTML = `<div class="empty-state">Môn này chưa có câu hỏi nào được gắn nhãn chương/dạng.</div>`;
    qs('result-count').textContent = '';
    return;
  }

  // Đếm số câu theo từng chương
  const byChuong = {};
  matches.forEach(t => { byChuong[t.chuong] = (byChuong[t.chuong] || 0) + 1; });

  Object.keys(byChuong).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `${c} (${byChuong[c]} câu)`;
    chuongSel.appendChild(opt);
  });
  chuongSel.disabled = false;

  renderChuongCards(byChuong, subject);
}

function renderChuongCards(byChuong, subject) {
  const { color, tint } = subjectColor(subject);
  const listEl = qs('topic-list');
  listEl.innerHTML = '';
  Object.entries(byChuong).forEach(([chuong, count]) => {
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.style.setProperty('--subject-color', color);
    card.innerHTML = `<span class="t-name">${chuong}</span><span class="t-count">${count} câu</span>`;
    card.addEventListener('click', () => {
      qs('f-chuong').value = chuong;
      onChuongChange();
    });
    listEl.appendChild(card);
  });
  qs('result-count').textContent = `${Object.keys(byChuong).length} chương đang có câu hỏi luyện tập`;
}

function onChuongChange() {
  selectedChuong = qs('f-chuong').value || null;
  selectedDang.clear();

  [...qs('topic-list').children].forEach(card => {
    const nameEl = card.querySelector('.t-name');
    if (nameEl) card.classList.toggle('selected', nameEl.textContent === selectedChuong);
  });

  if (!selectedChuong) {
    qs('dang-chips').innerHTML = '';
    qs('setup-panel').style.display = 'none';
    return;
  }

  const matches = currentMatches().filter(t => t.chuong === selectedChuong);
  const byDang = {};
  matches.forEach(t => {
    const key = t.dang || '(Chưa phân loại dạng)';
    byDang[key] = (byDang[key] || 0) + 1;
  });

  const chipsEl = qs('dang-chips');
  chipsEl.innerHTML = '';
  Object.entries(byDang).forEach(([dang, count]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dang-chip';
    chip.innerHTML = `${dang}<span class="n">${count}</span>`;
    chip.addEventListener('click', () => {
      if (selectedDang.has(dang)) selectedDang.delete(dang);
      else selectedDang.add(dang);
      chip.classList.toggle('active');
      updateAvailableCount();
    });
    chipsEl.appendChild(chip);
  });

  qs('setup-panel').style.display = 'block';
  updateAvailableCount();
}

function matchedQuestions() {
  const matches = currentMatches().filter(t => t.chuong === selectedChuong);
  if (selectedDang.size === 0) return matches;
  return matches.filter(t => selectedDang.has(t.dang || '(Chưa phân loại dạng)'));
}

function updateAvailableCount() {
  const n = matchedQuestions().length;
  qs('available-count').textContent = `(hiện có ${n} câu khớp bộ lọc)`;
  qs('f-count').max = n;
  if (Number(qs('f-count').value) > n) qs('f-count').value = n;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startPractice() {
  const pool = shuffle(matchedQuestions());
  const wantCount = Math.max(1, Number(qs('f-count').value) || 20);
  const picked = pool.slice(0, wantCount);

  if (picked.length === 0) {
    alert('Không có câu hỏi nào khớp bộ lọc hiện tại.');
    return;
  }

  qs('start-btn').disabled = true;
  qs('start-btn').textContent = 'Đang tải câu hỏi...';

  try {
    // Chỉ tải đúng những file đề thật sự chứa câu khớp bộ lọc
    const fileGroups = {};
    picked.forEach(p => {
      (fileGroups[p.examFile] = fileGroups[p.examFile] || []).push(p.questionId);
    });

    const fileContents = await Promise.all(
      Object.keys(fileGroups).map(f => fetch(f).then(r => r.json()))
    );
    const byFile = {};
    Object.keys(fileGroups).forEach((f, i) => (byFile[f] = fileContents[i]));

    const questions = [];
    const passages = {};
    picked.forEach(p => {
      const examData = byFile[p.examFile];
      const q = examData.questions.find(x => x.id === p.questionId);
      if (!q) return;
      const newQ = { ...q, id: questions.length + 1 };
      if (q.passageId && examData.passages && examData.passages[q.passageId]) {
        const newPid = `${p.examId}-${q.passageId}`;
        passages[newPid] = examData.passages[q.passageId];
        newQ.passageId = newPid;
      }
      questions.push(newQ);
    });

    const subjectLabel = taxonomy.subjects[qs('f-subject').value] || qs('f-subject').value;
    const gradeLabel = taxonomy.grades[qs('f-grade').value] || qs('f-grade').value;
    const allOfficial = Object.values(byFile).every(f => f.answerSource === 'official');
    const practiceExam = {
      id: `ontap-${Date.now()}`,
      title: `Ôn tập: ${selectedChuong}`,
      subjectSlug: qs('f-subject').value,
      grade: qs('f-grade').value,
      duration: Math.max(1, Number(qs('f-duration').value) || 30),
      answerSource: allOfficial ? 'official' : 'ai',
      passages,
      questions
    };

    sessionStorage.setItem('practiceExam', JSON.stringify(practiceExam));
    sessionStorage.setItem('practiceMeta', JSON.stringify({
      gradeLabel, subjectLabel, chuong: selectedChuong
    }));
    window.location.href = 'thi.html?practice=1';

  } catch (err) {
    console.error(err);
    alert('Có lỗi khi tải câu hỏi, vui lòng thử lại.');
    qs('start-btn').disabled = false;
    qs('start-btn').textContent = 'Bắt đầu ôn tập';
  }
}

init();
