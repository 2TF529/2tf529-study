// supabase.js — Supabase client: Auth + lưu lịch sử thi
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Không thể kết nối máy chủ đăng nhập. Yêu cầu đã quá thời gian, vui lòng thử lại.');
    }
    throw new Error('Không thể kết nối máy chủ đăng nhập. Hãy kiểm tra mạng rồi thử lại.');
  } finally {
    clearTimeout(timeoutId);
  }
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

function rememberUsername(username, email) {
  if (!username || !email) return;
  try {
    const map = JSON.parse(localStorage.getItem('account_username_map') || '{}');
    map[username.trim().toLocaleLowerCase('vi')] = email.trim().toLowerCase();
    localStorage.setItem('account_username_map', JSON.stringify(map));
  } catch {}
}

function resolveLoginEmail(identifier) {
  const value = (identifier || '').trim();
  if (value.includes('@')) return value.toLowerCase();
  try {
    const map = JSON.parse(localStorage.getItem('account_username_map') || '{}');
    return map[value.toLocaleLowerCase('vi')] || '';
  } catch { return ''; }
}

async function signUpWithPassword({ username, email, password, graduationYear, firstChoice }) {
  const payload = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      data: {
        username: username.trim(),
        full_name: username.trim(),
        graduation_year: String(graduationYear || ''),
        first_choice: (firstChoice || '').trim(),
      },
    }),
  });
  rememberUsername(username, email);
  if (payload?.access_token) {
    payload.expires_at = Math.floor(Date.now() / 1000) + (payload.expires_in || 3600);
    saveSession(payload);
  }
  return payload;
}

async function signInWithPassword(identifier, password) {
  const email = resolveLoginEmail(identifier);
  if (!email) throw new Error('Không tìm thấy tên đăng nhập trên thiết bị này. Hãy dùng Gmail để đăng nhập.');
  const payload = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  payload.expires_at = Math.floor(Date.now() / 1000) + (payload.expires_in || 3600);
  saveSession(payload);
  const name = payload.user?.user_metadata?.username || payload.user?.user_metadata?.full_name;
  rememberUsername(name, email);
  return payload;
}

async function updateProfile(data) {
  const session = getSession();
  if (!session) throw new Error('Bạn chưa đăng nhập.');
  const user = await supabaseFetch('/auth/v1/user', {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
  session.user = user;
  saveSession(session);
  rememberUsername(data.username || data.full_name, user.email);
  updateAuthUI();
  return user;
}

// ── Auth: Đăng nhập OAuth ─────────────────────────────────────────────────────

async function loginWithOAuth(provider) {
  if (!['discord', 'github'].includes(provider)) {
    throw new Error('Nhà cung cấp đăng nhập không được hỗ trợ.');
  }
  const redirectTo = window.location.origin + '/tai-khoan.html';
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
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

// ── Xử lý callback URL sau khi OAuth redirect về ─────────────────────────────
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

// Lấy thống kê tổng hợp của tài khoản hiện tại. RLS chỉ cho user đọc dòng của chính mình.
async function fetchUserStats() {
  const user = getUser();
  if (!user) return null;

  try {
    const rows = await supabaseFetch(
      `/rest/v1/user_stats?user_id=eq.${encodeURIComponent(user.id)}` +
      '&select=completed_exams,active_days,current_streak,longest_streak,last_study_date,score_sum,scored_count,admin_exam_bonus,admin_streak_override&limit=1'
    );
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch (e) {
    console.warn('Không lấy được thống kê cloud:', e.message);
    return null;
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

let supabaseInitPromise = null;
function initSupabase() {
  if (!supabaseInitPromise) {
    supabaseInitPromise = (async () => {
      // Xử lý redirect callback từ Discord/GitHub OAuth đúng một lần.
      await handleAuthCallback();
      updateAuthUI();
    })();
  }
  return supabaseInitPromise;
}

// Export toàn cục để các file khác dùng
window.supabase = {
  getUser,
  getSession,
  loginWithOAuth,
  logout,
  saveExamResult,
  fetchCloudHistory,
  fetchUserStats,
  signUpWithPassword,
  signInWithPassword,
  updateProfile,
  updateAuthUI,
  initSupabase,
};

// Tự khởi tạo khi load
initSupabase();
