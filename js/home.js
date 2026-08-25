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

// Thông báo dịch vụ dành riêng cho khách chưa đăng nhập.
// Chỉ hiện một lần trong mỗi tab và tự đóng sau 2 phút.
function initGuestServicesNotice() {
  const dismissedKey = "guest-services-notice-dismissed";
  try {
    if (sessionStorage.getItem(dismissedKey) === "1") return;
  } catch (_) {
    // Trình duyệt chặn sessionStorage vẫn có thể hiển thị thông báo bình thường.
  }

  if (window.supabase?.getSession?.()) return;

  const notice = document.createElement("aside");
  notice.className = "guest-services-notice";
  notice.setAttribute("role", "dialog");
  notice.setAttribute("aria-modal", "false");
  notice.setAttribute("aria-labelledby", "guest-services-title");
  notice.innerHTML = `
    <button class="guest-services-close" type="button" aria-label="Đóng thông báo">×</button>
    <div class="guest-services-heading">
      <span class="guest-services-icon" aria-hidden="true">🎁</span>
      <div>
        <span class="guest-services-eyebrow">Dành cho thành viên</span>
        <h2 id="guest-services-title">Đăng nhập để dùng thêm dịch vụ miễn phí</h2>
      </div>
    </div>
    <ul class="guest-services-list">
      <li><span aria-hidden="true">👤</span><span><b>Tài khoản:</b> đăng nhập để mở thêm nhiều dịch vụ miễn phí.</span></li>
      <li><span aria-hidden="true">✈️</span><span><b>Telegram:</b> nhóm tài liệu chính của cộng đồng.</span></li>
      <li><span aria-hidden="true">🎮</span><span><b>Discord:</b> có khóa học, tài liệu đại học, HOBO và không gian giao lưu, trao đổi.</span></li>
    </ul>
    <div class="guest-services-actions">
      <a class="guest-services-primary" href="/tai-khoan.html">Mở phần Tài khoản</a>
      <span>Thông báo tự đóng sau 2 phút</span>
    </div>
  `;

  let closeTimer;
  const handleEscape = (event) => {
    if (event.key === "Escape" && notice.isConnected) closeNotice();
  };
  const closeNotice = () => {
    if (!notice.isConnected) return;
    clearTimeout(closeTimer);
    document.removeEventListener("keydown", handleEscape);
    notice.classList.add("is-closing");
    try { sessionStorage.setItem(dismissedKey, "1"); } catch (_) {}
    window.setTimeout(() => notice.remove(), 220);
  };

  notice.querySelector(".guest-services-close")?.addEventListener("click", closeNotice);
  document.addEventListener("keydown", handleEscape);

  document.body.appendChild(notice);
  requestAnimationFrame(() => notice.classList.add("is-visible"));
  closeTimer = window.setTimeout(closeNotice, 120000);
}

initGuestServicesNotice();
