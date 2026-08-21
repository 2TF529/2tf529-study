// home.js - hiển thị số liệu tổng quan hệ thống trên trang chủ

async function loadStats() {
  const el = document.getElementById("stat-strip");
  try {
    const res = await fetch("data/stats.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();

    el.innerHTML = `
      <span><b>${stats.examCount}</b> đề thi</span>
      <span class="dot-sep">·</span>
      <span><b>${stats.questionCount}</b> câu hỏi</span>
      <span class="dot-sep">·</span>
      <span><b>${stats.subjectCount}</b> môn học</span>
      <span class="dot-sep">·</span>
      <span>đang tiếp tục cập nhật</span>
    `;
  } catch (err) {
    el.textContent = "Không tải được số liệu hệ thống.";
    console.error(err);
  }
}

loadStats();
