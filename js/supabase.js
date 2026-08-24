// supabase.js — Supabase client: Auth (Google login) + lưu lịch sử thi
// Project: 2tf529-study | Region: ap-southeast-1 (Singapore)

const SUPABASE_URL = 'https://eeufhhlokhymbbprbfqe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVldWZoaGxva2h5bWJicHJiZnFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDYzMTEsImV4cCI6MjEwMzEyMjMxMX0.ShQkBcrXbLcqflz-u1s8YeyuOeRZ-zDiUsVWW15Kaxg';

// ── Gọi Supabase REST API trực tiếp (không cần cài SDK nặng) ──────────────────

async function supabaseFetch(path, options = {}) {
  const session = getSession();
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    ...options.headers,
  };
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Session management (lưu vào localStorage) ─────────────────────────────────

function saveSession(session) {
  if (session) {
    localStorage.setItem('sb_session', JSON.stringify(session));
  } else {
    localStorage.removeItem('sb_session');
  }
}

function getSession() {
  try {
    const raw = localStorage.getItem('sb_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Kiểm tra token còn hạn không (expires_at là Unix timestamp giây)
    if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
      localStorage.removeItem('sb_session');
      return null;
    }
    return session;
  } catch { return null; }
}

function getUser() {
  const session = getSession();
  return session?.user || null;
}

// ── Auth: Đăng nhập Google ────────────────────────────────────────────────────

async function loginWithGoogle() {
  const redirectTo = window.location.origin + '/lich-su.html';
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  window.location.href = authUrl;
}

async function logout() {
  const session = getSession();
  if (session) {
    try {
      await supabaseFetch('/auth/v1/logout', { method: 'POST' });
    } catch { /* bỏ qua lỗi network khi logout */ }
  }
  saveSession(null);
  updateAuthUI();
}

// ── Xử lý callback URL sau khi Google redirect về ────────────────────────────
// Supabase gửi access_token trong URL hash (#access_token=...&refresh_token=...)

async function handleAuthCallback() {
  const hash = window.location.hash;
  if (!hash.includes('access_token')) return false;

  const params = new URLSearchParams(hash.slice(1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const expires_in = parseInt(params.get('expires_in') || '3600');

  if (!access_token) return false;

  // Lấy thông tin user từ token
  try {
    const userData = await supabaseFetch('/auth/v1/user', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const session = {
      access_token,
      refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + expires_in,
      user: userData,
    };
    saveSession(session);

    // Xóa hash khỏi URL cho gọn
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return true;
  } catch (e) {
    console.error('Auth callback error:', e);
    return false;
  }
}

// ── Lưu kết quả thi lên Supabase ─────────────────────────────────────────────

async function saveExamResult({ examId, examName, subjectSlug, grade, score, total, correct, durationSeconds, isPractice }) {
  const user = getUser();
  if (!user) return; // Chưa đăng nhập thì bỏ qua

  try {
    await supabaseFetch('/rest/v1/exam_history', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        exam_id: examId,
        exam_name: examName,
        subject_slug: subjectSlug,
        grade: grade,
        score: score,
        total: total,
        correct: correct,
        duration_seconds: durationSeconds || 0,
        is_practice: isPractice || false,
      }),
    });
  } catch (e) {
    console.warn('Không lưu được lịch sử lên cloud:', e.message);
    // Không throw — localStorage vẫn lưu bình thường
  }
}

// ── Lấy lịch sử thi từ Supabase ──────────────────────────────────────────────

async function fetchCloudHistory(limit = 100) {
  const user = getUser();
  if (!user) return [];

  try {
    const data = await supabaseFetch(
      `/rest/v1/exam_history?user_id=eq.${user.id}&order=created_at.desc&limit=${limit}&select=*`
    );
    return data || [];
  } catch (e) {
    console.warn('Không lấy được lịch sử cloud:', e.message);
    return [];
  }
}

// ── Cập nhật UI hiển thị trạng thái đăng nhập ────────────────────────────────

function updateAuthUI() {
  const user = getUser();
  const loginBtn = document.getElementById('auth-login-btn');
  const logoutBtn = document.getElementById('auth-logout-btn');
  const userInfo = document.getElementById('auth-user-info');
  const userName = document.getElementById('auth-user-name');
  const userAvatar = document.getElementById('auth-user-avatar');

  if (user) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = '';
    if (userInfo) userInfo.style.display = '';
    if (userName) userName.textContent = user.user_metadata?.full_name || user.email || 'Người dùng';
    if (userAvatar && user.user_metadata?.avatar_url) {
      userAvatar.src = user.user_metadata.avatar_url;
      userAvatar.style.display = '';
    }
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userInfo) userInfo.style.display = 'none';
  }
}

// ── Khởi tạo ─────────────────────────────────────────────────────────────────

async function initSupabase() {
  // Xử lý redirect callback từ Google OAuth
  await handleAuthCallback();
  // Cập nhật UI
  updateAuthUI();
}

// Export toàn cục để các file khác dùng
window.supabase = {
  getUser,
  getSession,
  loginWithGoogle,
  logout,
  saveExamResult,
  fetchCloudHistory,
  updateAuthUI,
  initSupabase,
};

// Tự khởi tạo khi load
initSupabase();
