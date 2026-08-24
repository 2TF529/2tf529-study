// history.js - hiển thị lịch sử làm bài từ localStorage

let taxonomy = null;

function qs(id) { return document.getElementById(id); }

function subjectColor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { color: `hsl(${hue}, 58%, 36%)`, tint: `hsl(${hue}, 70%, 95%)` };
}

function scoreColor(score) {
  if (typeof score !== "number") return 'var(--green-600)';
  if (score >= 8) return 'var(--green-600)';
  if (score >= 5) return 'var(--amber-600)';
  return 'var(--red-600)';
}

function formatDate(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("examHistory") || "[]");
  } catch (e) {
    return [];
  }
}

function render() {
  const history = loadHistory();
  const listEl = qs("history-list");
  const countEl = qs("history-count");
  const clearBtn = qs("clear-btn");

  if (history.length === 0) {
    countEl.textContent = "";
    clearBtn.style.display = "none";
    listEl.innerHTML = `<div class="empty-state">Bạn chưa làm bài nào.<br>Vào <a href="explore.html"><b>Tìm đề thi</b></a> để bắt đầu luyện tập.<br><a class="btn" href="explore.html" style="margin-top:16px;display:inline-block;">Tìm đề thi →</a></div>`;
    return;
  }

  countEl.textContent = `${history.length} bài đã làm`;
  clearBtn.style.display = "";

  listEl.innerHTML = "";
  const frag = document.createDocumentFragment();

  history.forEach(h => {
    const { color, tint } = subjectColor(h.subjectSlug || "");
    const subjectLabel = (taxonomy && taxonomy.subjects[h.subjectSlug]) || h.subjectSlug || "";
    const gradeLabel = (taxonomy && taxonomy.grades[h.grade]) || h.grade || "";
    const item = document.createElement("div");
    item.className = "exam-item";
    item.style.setProperty("--subject-color", color);
    item.style.setProperty("--subject-color-tint", tint);

    const hasScore = typeof h.score === "number" && Number.isFinite(h.score);
    const sColor = scoreColor(h.score);
    const answerBadge = h.answerSource === "official"
      ? '<span class="answer-badge official">✓ Đáp án chuẩn</span>'
      : (h.answerSource === "partial"
          ? '<span class="answer-badge partial">Đáp án chuẩn một phần</span>'
      : (h.answerSource === "missing"
          ? '<span class="answer-badge">Chưa có đáp án</span>'
          : '<span class="answer-badge ai">⚠ Đáp án AI</span>'));

    const practiceTag = h.isPractice
      ? '<span class="answer-badge" style="background:var(--blue-50);color:var(--blue-600);">Ôn tập</span>'
      : '';

    const retryBtn = h.isPractice
      ? `<a class="btn secondary" href="on-tap.html" title="Phiên ôn tập ngẫu nhiên không làm lại y hệt được, vào đây để ôn tiếp" style="font-size:12px;padding:7px 14px;">Ôn tập tiếp</a>`
      : `<a class="btn" href="thi.html?id=${escapeHtml(h.examId)}" style="font-size:12px;padding:7px 14px;">Làm lại</a>`;

    item.innerHTML = `
      <div style="min-width:0;">
        <div class="exam-title">${escapeHtml(h.title)}</div>
        <div class="meta">
          <span class="subject-tag">${escapeHtml(subjectLabel)}</span>
          <span class="sep">·</span>${escapeHtml(gradeLabel)}
          <span class="sep">·</span>${formatDate(h.date)}
          <span class="sep">·</span><span class="mono">${hasScore ? `Đúng ${h.correctCount}/${h.totalQuestions}` : `Đã làm ${h.answeredCount}/${h.totalQuestions} câu`}</span>
          <span class="sep">·</span>${answerBadge}
          ${practiceTag}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
        <div style="text-align:center;">
          <div style="font-family:var(--font-mono);font-weight:700;font-size:${hasScore ? '22px' : '14px'};color:${sColor};line-height:1;">${hasScore ? h.score.toFixed(1) : 'Đã hoàn thành'}</div>
          ${hasScore ? '<div style="font-size:11px;color:var(--ink-500);font-weight:600;">/ 10 điểm</div>' : ''}
        </div>
        ${retryBtn}
      </div>
    `;
    frag.appendChild(item);
  });

  listEl.appendChild(frag);
}

function clearHistory() {
  if (!confirm("Xoá toàn bộ lịch sử làm bài? Hành động này không thể hoàn tác.")) return;
  try {
    localStorage.removeItem("examHistory");
  } catch (e) {}
  render();
}

function updateAuthUI() {
  const user = window.supabase?.getUser();
  const loggedOutBox = qs("auth-logged-out");
  const loginBtn = qs("auth-login-btn");
  const loggedInBox = qs("auth-logged-in");
  const userName = qs("auth-user-name");
  const userAvatar = qs("auth-user-avatar");

  if (user) {
    if (loggedOutBox) loggedOutBox.style.display = "none";
    if (loginBtn) loginBtn.style.display = "none";
    if (loggedInBox) loggedInBox.style.display = "flex";
    if (userName) userName.textContent = user.user_metadata?.full_name || user.email || "Học sinh";
    if (userAvatar && user.user_metadata?.avatar_url) {
      userAvatar.src = user.user_metadata.avatar_url;
      userAvatar.style.display = "block";
    }
  } else {
    if (loggedOutBox) loggedOutBox.style.display = "flex";
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (loggedInBox) loggedInBox.style.display = "none";
  }
}

async function syncCloudHistory() {
  if (!window.supabase || !window.supabase.getUser()) return;
  try {
    const cloudList = await window.supabase.fetchCloudHistory(50);
    if (!cloudList || cloudList.length === 0) return;

    const localList = loadHistory();
    const localMap = new Map();
    localList.forEach(item => localMap.set(item.examId + '_' + (item.date ? item.date.slice(0, 16) : ''), item));

    cloudList.forEach(c => {
      const key = c.exam_id + '_' + (c.created_at ? c.created_at.slice(0, 16) : '');
      if (!localMap.has(key)) {
        localList.push({
          examId: c.exam_id,
          title: c.exam_name || c.exam_id,
          grade: c.grade || "",
          subjectSlug: c.subject_slug || "",
          isPractice: c.is_practice || false,
          score: c.score,
          correctCount: c.correct,
          totalQuestions: c.total,
          answeredCount: c.total,
          answerSource: "official",
          date: c.created_at,
          isCloud: true
        });
      }
    });

    localList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (localList.length > 50) localList.length = 50;
    localStorage.setItem("examHistory", JSON.stringify(localList));
    render();
  } catch (e) {
    console.warn("Lỗi sync lịch sử cloud:", e);
  }
}

async function init() {
  try {
    const res = await fetch("data/taxonomy.json");
    taxonomy = await res.json();
  } catch (e) {
    taxonomy = { grades: {}, subjects: {}, examTypes: {} };
  }
  
  qs("clear-btn").addEventListener("click", clearHistory);

  const loginBtn = qs("auth-login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      if (window.supabase) window.supabase.loginWithGoogle();
    });
  }

  const logoutBtn = qs("auth-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (window.supabase) {
        window.supabase.logout();
        updateAuthUI();
      }
    });
  }

  updateAuthUI();
  render();
  await syncCloudHistory();
}

init();
