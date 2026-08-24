(function () {
  const $ = id => document.getElementById(id);
  const state = {
    cover: localStorage.getItem('account_cover') || '',
    avatar: localStorage.getItem('account_avatar') || ''
  };
  let messageTimer = 0;

  /* ── Toast ── */
  function message(text, type = '', autoHide = true) {
    const box = $('account-message');
    window.clearTimeout(messageTimer);
    box.textContent = text;
    box.className = `account-message ${type}`;
    box.hidden = !text;
    if (text && autoHide) {
      messageTimer = window.setTimeout(() => {
        box.hidden = true;
        box.textContent = '';
      }, type === 'error' ? 6000 : 3500);
    }
  }

  /* ── Busy state ── */
  function setBusy(form, busy) {
    if (!form || typeof form.querySelector !== 'function') return;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = busy;
    btn.dataset.label ||= btn.textContent;
    btn.textContent = busy ? 'Đang xử lý…' : btn.dataset.label;
  }

  function friendlyAuthError(error) {
    let text = String(error?.message || error || 'Đã xảy ra lỗi. Vui lòng thử lại.');
    text = text.replace(/^Supabase error \d+:\s*/, '').trim();
    try {
      const payload = JSON.parse(text);
      const code = payload.error_code || payload.code || '';
      if (code === 'email_address_invalid') return 'Địa chỉ Gmail chưa hợp lệ. Vui lòng kiểm tra và sửa lại.';
      if (code === 'email_exists' || code === 'user_already_exists') return 'Gmail này đã được đăng ký. Hãy chuyển sang đăng nhập.';
      if (code === 'invalid_credentials') return 'Thông tin đăng nhập hoặc mật khẩu chưa đúng.';
      if (code === 'weak_password') return 'Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 6 ký tự.';
      text = payload.msg || payload.message || payload.error_description || text;
    } catch {}
    if (/email.+invalid/i.test(text)) return 'Địa chỉ Gmail chưa hợp lệ. Vui lòng kiểm tra và sửa lại.';
    return text;
  }

  /* ── Password toggles ── */
  function initPasswordToggles() {
    document.querySelectorAll('.account-form input[type="password"]').forEach(input => {
      if (input.parentElement?.classList.contains('password-field')) return;
      const wrapper = document.createElement('span');
      wrapper.className = 'password-field';
      input.before(wrapper);
      wrapper.appendChild(input);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'password-toggle';
      button.setAttribute('aria-label', 'Hiện mật khẩu');
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
      button.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.classList.toggle('is-visible', show);
        button.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
        button.setAttribute('aria-pressed', String(show));
      });
      wrapper.appendChild(button);
    });
  }

  /* ── Tab switch ── */
  function switchMode(mode) {
    document.querySelectorAll('[data-auth-tab]').forEach(x =>
      x.classList.toggle('active', x.dataset.authTab === mode));
    $('login-form').hidden = mode !== 'login';
    $('register-form').hidden = mode !== 'register';
    message('');
  }

  /* ── renderDashboard → redirect sang dashboard ── */
  function renderDashboard() {
    const user = window.supabase.getUser();
    if (!user) {
      if ($('auth-screen'))    $('auth-screen').hidden = false;
      if ($('profile-screen')) $('profile-screen').hidden = true;
      return;
    }
    // Đã đăng nhập → chuyển sang trang dashboard riêng
    window.location.replace('/dashboard.html');
  }

  function escapeHtml(value) {
    const d = document.createElement('div'); d.textContent = value || ''; return d.innerHTML;
  }

  /* ── Image compression ── */
  async function compressImage(file, maxW, maxH, quality = .82) {
    if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn một file ảnh.');
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(bitmap.width  * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', quality);
  }

  /* ── Handle image upload ── */
  async function handleImage(input, key, maxW, maxH) {
    if (!input.files[0]) return;
    try {
      const data = await compressImage(input.files[0], maxW, maxH);
      localStorage.setItem(key, data);
      state[key === 'account_cover' ? 'cover' : 'avatar'] = data;
      if (key === 'account_cover') {
        const cover = $('book-cover-preview');
        if (cover) cover.style.backgroundImage =
          `linear-gradient(145deg,rgba(9,18,32,.12),rgba(9,18,32,.72)),url(${data})`;
      }
      message('Đã cập nhật ảnh bìa.', 'success');
    } catch (e) { message(e.message, 'error'); }
  }

  /* ── Init ── */
  async function init() {
    initPasswordToggles();
    document.querySelectorAll('[data-auth-tab]').forEach(x =>
      x.addEventListener('click', () => switchMode(x.dataset.authTab)));

    // Cover image
    const coverEl = $('cover-input');
    if (coverEl) coverEl.addEventListener('change', e => handleImage(e.target, 'account_cover', 1400, 900));
    if (state.cover) {
      const prev = $('book-cover-preview');
      if (prev) prev.style.backgroundImage =
        `linear-gradient(145deg,rgba(9,18,32,.12),rgba(9,18,32,.72)),url(${state.cover})`;
    }

    // Login form
    $('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      setBusy(form, true); message('');
      try {
        await window.supabase.signInWithPassword(
          $('login-identifier').value,
          $('login-password').value
        );
        message('Đăng nhập thành công! Đang chuyển…', 'success');
        setTimeout(() => window.location.replace('/dashboard.html'), 400);
      } catch (err) {
        message(friendlyAuthError(err), 'error');
      } finally { setBusy(form, false); }
    });

    // Register form
    $('register-form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      setBusy(form, true); message('');
      try {
        const result = await window.supabase.signUpWithPassword({
          username:       $('register-name').value,
          graduationYear: $('register-year').value,
          email:          $('register-email').value,
          password:       $('register-password').value,
          firstChoice:    $('register-choice').value
        });
        if (result?.access_token) {
          message('Đã tạo tài khoản! Đang chuyển…', 'success');
          setTimeout(() => window.location.replace('/dashboard.html'), 400);
        } else {
          switchMode('login');
          message('Đã tạo tài khoản. Hãy kiểm tra Gmail để xác nhận rồi đăng nhập.', 'success');
        }
      } catch (err) {
        message(friendlyAuthError(err), 'error');
      } finally { setBusy(form, false); }
    });

    // Profile form (stub — không dùng nữa, chỉ để tránh lỗi)
    const profileForm = $('profile-form');
    if (profileForm) profileForm.addEventListener('submit', e => e.preventDefault());

    // Logout (stub)
    const logoutBtn = $('account-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      await window.supabase.logout();
      window.location.replace('/tai-khoan.html');
    });

    // OAuth
    document.querySelectorAll('[data-oauth-provider]').forEach(button => {
      button.addEventListener('click', () =>
        window.supabase.loginWithOAuth(button.dataset.oauthProvider));
    });

    // Khởi tạo Supabase + kiểm tra session
    await window.supabase.initSupabase();

    // Nếu đã đăng nhập → redirect ngay sang dashboard
    if (window.supabase.getUser()) {
      window.location.replace('/dashboard.html');
      return;
    }

    // Chưa đăng nhập → hiện form login
    if ($('auth-screen'))    $('auth-screen').hidden = false;
    if ($('profile-screen')) $('profile-screen').hidden = true;
  }

  window.addEventListener('DOMContentLoaded', init);
})();
