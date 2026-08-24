(function () {
  const $ = id => document.getElementById(id);
  const state = { cover: localStorage.getItem('account_cover') || '', avatar: localStorage.getItem('account_avatar') || '' };

  function message(text, type = '') {
    const box = $('account-message');
    box.textContent = text;
    box.className = `account-message ${type}`;
    box.hidden = !text;
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = busy;
    btn.dataset.label ||= btn.textContent;
    btn.textContent = busy ? 'Đang xử lý…' : btn.dataset.label;
  }

  function switchMode(mode) {
    document.querySelectorAll('[data-auth-tab]').forEach(x => x.classList.toggle('active', x.dataset.authTab === mode));
    $('login-form').hidden = mode !== 'login';
    $('register-form').hidden = mode !== 'register';
    message('');
  }

  function historyStats() {
    let history = [];
    try { history = JSON.parse(localStorage.getItem('examHistory') || '[]'); } catch {}
    const dayKeys = [...new Set(history.map(x => new Date(x.date).toISOString().slice(0, 10)))].sort().reverse();
    let streak = 0;
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (dayKeys[0]) {
      const latest = new Date(dayKeys[0] + 'T00:00:00');
      if ((cursor - latest) / 86400000 > 1) return { history, days: dayKeys.length, streak: 0 };
      if (latest < cursor) cursor.setDate(cursor.getDate() - 1);
      const set = new Set(dayKeys);
      while (set.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    }
    return { history, days: dayKeys.length, streak };
  }

  function initials(name) {
    return (name || '2TF').split(/\s+/).filter(Boolean).slice(-2).map(x => x[0]).join('').toUpperCase();
  }

  function renderDashboard() {
    const user = window.supabase.getUser();
    if (!user) { $('auth-screen').hidden = false; $('profile-screen').hidden = true; return; }
    $('auth-screen').hidden = true; $('profile-screen').hidden = false;
    const meta = user.user_metadata || {};
    const name = meta.username || meta.full_name || meta.name || meta.user_name || user.email?.split('@')[0] || 'Thành viên 2TF';
    $('profile-name').textContent = name;
    $('profile-email').value = user.email || '';
    $('profile-goal').textContent = meta.first_choice || 'Chưa đặt nguyện vọng 1';
    $('profile-year').textContent = meta.graduation_year ? `Thi tốt nghiệp ${meta.graduation_year}` : 'Chưa chọn năm thi';
    $('profile-name-input').value = name;
    $('profile-year-input').value = meta.graduation_year || '';
    $('profile-choice-input').value = meta.first_choice || '';
    $('avatar-initials').textContent = initials(name);
    const avatar = state.avatar || meta.avatar_url || meta.picture || '';
    if (avatar) { $('profile-avatar-img').src = avatar; $('profile-avatar-img').hidden = false; }
    if (state.cover) $('profile-hero').style.backgroundImage = `linear-gradient(90deg,rgba(9,18,32,.88),rgba(9,18,32,.28)),url(${state.cover})`;
    const { history, days, streak } = historyStats();
    $('stat-exams').textContent = history.length;
    $('stat-days').textContent = days;
    $('stat-streak').textContent = streak;
    const scored = history.filter(x => typeof x.score === 'number');
    $('stat-score').textContent = scored.length ? (scored.reduce((s, x) => s + x.score, 0) / scored.length).toFixed(1) : '—';
    $('recent-account-history').innerHTML = history.length
      ? history.slice(0, 5).map(x => `<a href="thi.html?id=${encodeURIComponent(x.examId || '')}" class="account-recent-row"><span><b>${escapeHtml(x.title || 'Đề thi')}</b><small>${new Date(x.date).toLocaleDateString('vi-VN')}</small></span><strong>${typeof x.score === 'number' ? x.score.toFixed(1) : 'Đã làm'}</strong></a>`).join('')
      : '<div class="account-empty">Bạn chưa làm đề nào. <a href="explore.html">Tìm đề để bắt đầu →</a></div>';
  }

  function escapeHtml(value) {
    const d = document.createElement('div'); d.textContent = value || ''; return d.innerHTML;
  }

  async function compressImage(file, maxW, maxH, quality = .82) {
    if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn một file ảnh.');
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', quality);
  }

  async function handleImage(input, key, maxW, maxH) {
    if (!input.files[0]) return;
    try {
      const data = await compressImage(input.files[0], maxW, maxH);
      localStorage.setItem(key, data); state[key === 'account_cover' ? 'cover' : 'avatar'] = data;
      if (key === 'account_cover') {
        $('book-cover-preview').style.backgroundImage = `linear-gradient(145deg,rgba(9,18,32,.2),rgba(9,18,32,.75)),url(${data})`;
        if (!$('profile-screen').hidden) $('profile-hero').style.backgroundImage = `linear-gradient(90deg,rgba(9,18,32,.88),rgba(9,18,32,.28)),url(${data})`;
      } else renderDashboard();
      message('Đã cập nhật ảnh.', 'success');
    } catch (e) { message(e.message, 'error'); }
  }

  async function init() {
    document.querySelectorAll('[data-auth-tab]').forEach(x => x.addEventListener('click', () => switchMode(x.dataset.authTab)));
    $('cover-input').addEventListener('change', e => handleImage(e.target, 'account_cover', 1400, 900));
    if ($('profile-cover-input')) $('profile-cover-input').addEventListener('change', e => handleImage(e.target, 'account_cover', 1400, 900));
    $('avatar-input').addEventListener('change', e => handleImage(e.target, 'account_avatar', 420, 420));
    if (state.cover) $('book-cover-preview').style.backgroundImage = `linear-gradient(145deg,rgba(9,18,32,.2),rgba(9,18,32,.75)),url(${state.cover})`;

    $('login-form').addEventListener('submit', async e => {
      e.preventDefault(); setBusy(e.currentTarget, true); message('');
      try { await window.supabase.signInWithPassword($('login-identifier').value, $('login-password').value); renderDashboard(); }
      catch (err) { message(err.message.replace(/^Supabase error \d+:\s*/, ''), 'error'); }
      finally { setBusy(e.currentTarget, false); }
    });
    $('register-form').addEventListener('submit', async e => {
      e.preventDefault(); setBusy(e.currentTarget, true); message('');
      try {
        const result = await window.supabase.signUpWithPassword({ username: $('register-name').value, graduationYear: $('register-year').value, email: $('register-email').value, password: $('register-password').value, firstChoice: $('register-choice').value });
        if (result?.access_token) renderDashboard(); else { switchMode('login'); message('Đã tạo tài khoản. Hãy kiểm tra Gmail để xác nhận rồi đăng nhập.', 'success'); }
      } catch (err) { message(err.message.replace(/^Supabase error \d+:\s*/, ''), 'error'); }
      finally { setBusy(e.currentTarget, false); }
    });
    $('profile-form').addEventListener('submit', async e => {
      e.preventDefault(); setBusy(e.currentTarget, true);
      try { await window.supabase.updateProfile({ username: $('profile-name-input').value.trim(), full_name: $('profile-name-input').value.trim(), graduation_year: $('profile-year-input').value, first_choice: $('profile-choice-input').value.trim() }); message('Đã lưu hồ sơ.', 'success'); renderDashboard(); }
      catch (err) { message(err.message, 'error'); } finally { setBusy(e.currentTarget, false); }
    });
    $('account-logout').addEventListener('click', async () => { await window.supabase.logout(); location.reload(); });
    document.querySelectorAll('[data-oauth-provider]').forEach(button => {
      button.addEventListener('click', () => window.supabase.loginWithOAuth(button.dataset.oauthProvider));
    });
    await window.supabase.initSupabase();
    renderDashboard();
  }
  window.addEventListener('DOMContentLoaded', init);
})();
