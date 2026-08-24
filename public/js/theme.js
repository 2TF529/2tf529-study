// theme.js - xử lý nút chuyển chế độ sáng/tối + chọn bảng màu.
// LƯU Ý: đoạn áp dụng theme/palette lúc tải trang được đặt INLINE trực tiếp trong <head> của
// từng file HTML (không phải ở đây) để chạy đồng bộ trước khi trình duyệt vẽ ra màn hình, tránh
// hiện tượng "chớp trắng/chớp sai màu" rồi mới đổi lại. File này chỉ xử lý sau khi trang đã tải xong.

function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  var next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀️" : "🌙";
  btn.setAttribute("aria-label", isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
}

document.addEventListener("DOMContentLoaded", function () {
  // Giữ khung dashboard khi thành viên đi sang Tìm đề / Ôn tập / Lịch sử.
  var memberSidebar = document.getElementById("member-sidebar");
  if (memberSidebar && !window.location.pathname.endsWith("thi.html")) {
    try {
      var memberSession = JSON.parse(localStorage.getItem("sb_session") || "null");
      var sessionAlive = memberSession && memberSession.user &&
        (!memberSession.expires_at || memberSession.expires_at > Date.now() / 1000);
      if (sessionAlive) {
        var memberMeta = memberSession.user.user_metadata || {};
        var memberDisplayName = memberMeta.username || memberMeta.full_name || memberMeta.name ||
          (memberSession.user.email || "Thành viên").split("@")[0];
        var memberName = document.getElementById("member-name");
        var memberYear = document.getElementById("member-year");
        var memberAvatar = document.getElementById("member-avatar");
        if (memberName) memberName.textContent = memberDisplayName;
        if (memberYear) memberYear.textContent = memberMeta.graduation_year ? "Thi " + memberMeta.graduation_year : "Đang học tập";
        if (memberAvatar) memberAvatar.textContent = memberDisplayName.split(/\s+/).filter(Boolean).slice(-2).map(function (x) { return x[0]; }).join("").toUpperCase();
        memberSidebar.hidden = false;
        memberSidebar.setAttribute("aria-hidden", "false");
        document.documentElement.classList.add("member-mode");
      }
    } catch (e) { /* Session hỏng: giữ giao diện công khai. */ }
  }

  var memberLogout = document.getElementById("member-logout");
  if (memberLogout) memberLogout.addEventListener("click", async function () {
    if (window.supabase && window.supabase.logout) await window.supabase.logout();
    else localStorage.removeItem("sb_session");
    window.location.replace("/tai-khoan.html");
  });

  var navLinks = document.querySelector(".top-nav .nav-links");
  if (navLinks && !document.getElementById("account-nav-link")) {
    var accountLink = document.createElement("a");
    accountLink.id = "account-nav-link";
    accountLink.href = "tai-khoan.html";
    accountLink.className = "nav-link account-nav-link";
    try {
      var session = JSON.parse(localStorage.getItem("sb_session") || "null");
      var meta = session && session.user && session.user.user_metadata;
      accountLink.textContent = meta && (meta.username || meta.full_name)
        ? "👤 " + (meta.username || meta.full_name)
        : "Tài khoản";
    } catch (e) { accountLink.textContent = "Tài khoản"; }
    navLinks.appendChild(accountLink);
  }

  var btn = document.getElementById("theme-toggle");
  if (btn) btn.addEventListener("click", toggleTheme);
  updateThemeToggleIcon();

  var paletteSel = document.getElementById("palette-select");
  if (paletteSel) {
    paletteSel.value = document.documentElement.getAttribute("data-palette") || "1";
    paletteSel.addEventListener("change", function () {
      document.documentElement.setAttribute("data-palette", paletteSel.value);
      localStorage.setItem("palette", paletteSel.value);
    });
  }

  // ===== Hamburger Menu Toggle =====
  var hamburgerBtn = document.getElementById("hamburger-btn");
  navLinks = document.querySelector(".top-nav .nav-links");
  if (hamburgerBtn && navLinks) {
    hamburgerBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = navLinks.classList.toggle("open");
      hamburgerBtn.textContent = isOpen ? "✕" : "☰";
      hamburgerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    // Đóng menu khi bấm vào link
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest(".nav-link")) {
        navLinks.classList.remove("open");
        hamburgerBtn.textContent = "☰";
        hamburgerBtn.setAttribute("aria-expanded", "false");
      }
    });
    // Đóng menu khi bấm bên ngoài
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".top-nav")) {
        navLinks.classList.remove("open");
        hamburgerBtn.textContent = "☰";
        hamburgerBtn.setAttribute("aria-expanded", "false");
      }
    });
  }
});
