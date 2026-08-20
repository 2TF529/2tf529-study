/**
 * translate.js - Tính năng Bôi đen văn bản để Dịch nhanh qua Google Dịch
 * Áp dụng đặc biệt khi làm đề Ngoại ngữ (Tiếng Anh, IELTS, TOEIC, HSK, TOPIK, JLPT) và mọi môn học.
 */

(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('trans-injected-css')) return;
    const style = document.createElement('style');
    style.id = 'trans-injected-css';
    style.textContent = `
      /* Nút popover nhỏ xuất hiện khi bôi đen text */
      .trans-trigger-btn {
        position: absolute;
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #1e293b;
        color: #fff;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
        cursor: pointer;
        transition: transform 0.15s ease, background 0.15s ease;
        user-select: none;
        animation: trans-pop-in 0.15s ease;
      }
      .trans-trigger-btn:hover {
        background: #2563eb;
        transform: translateY(-2px) scale(1.05);
      }
      @keyframes trans-pop-in {
        from { opacity: 0; transform: translateY(4px) scale(0.92); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* Hộp thoại hiển thị bản dịch */
      .trans-card {
        position: absolute;
        z-index: 10000;
        width: 320px;
        max-width: calc(100vw - 32px);
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
        font-family: inherit;
        font-size: 13px;
        line-height: 1.5;
        color: #1e293b;
        overflow: hidden;
        animation: trans-pop-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      [data-theme="dark"] .trans-card {
        background: #1e293b;
        border-color: #334155;
        color: #f1f5f9;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
      }

      .trans-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }
      [data-theme="dark"] .trans-card-header {
        background: #0f172a;
        border-color: #334155;
      }
      .trans-card-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 12px;
        color: #2563eb;
      }
      .trans-card-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .trans-icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 4px;
        color: inherit;
        opacity: 0.7;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .trans-icon-btn:hover {
        opacity: 1;
        background: rgba(0,0,0,0.06);
      }
      [data-theme="dark"] .trans-icon-btn:hover {
        background: rgba(255,255,255,0.1);
      }

      .trans-card-body {
        padding: 12px 14px;
      }
      .trans-orig {
        font-size: 12px;
        color: #64748b;
        margin-bottom: 6px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      [data-theme="dark"] .trans-orig {
        color: #94a3b8;
      }
      .trans-orig-text {
        font-style: italic;
        word-break: break-word;
      }
      .trans-result {
        font-size: 14.5px;
        font-weight: 600;
        color: #0f172a;
        word-break: break-word;
      }
      [data-theme="dark"] .trans-result {
        color: #38bdf8;
      }

      .trans-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        font-size: 11px;
      }
      [data-theme="dark"] .trans-card-footer {
        background: #0f172a;
        border-color: #334155;
      }
      .trans-link {
        color: #2563eb;
        text-decoration: underline;
        font-weight: 600;
      }
      [data-theme="dark"] .trans-link {
        color: #60a5fa;
      }
    `;
    document.head.appendChild(style);
  }

  function initTranslate() {
    injectStyles();

    let triggerBtn = null;
    let transCard = null;
    let selectedText = '';

    function removeTrigger() {
      if (triggerBtn && triggerBtn.parentNode) {
        triggerBtn.parentNode.removeChild(triggerBtn);
        triggerBtn = null;
      }
    }

    function removeCard() {
      if (transCard && transCard.parentNode) {
        transCard.parentNode.removeChild(transCard);
        transCard = null;
      }
    }

    // Lắng nghe sự kiện bôi đen văn bản
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', (e) => {
      setTimeout(handleSelection, 200);
    });

    function handleSelection(e) {
      // Nếu click vào trong trigger hoặc popup card thì không xóa
      if (e.target.closest('.trans-trigger-btn') || e.target.closest('.trans-card')) {
        return;
      }

      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';

      if (!text || text.length < 1 || text.length > 500) {
        removeTrigger();
        return;
      }

      selectedText = text;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) {
        removeTrigger();
        return;
      }

      removeTrigger();

      // Tạo nút dịch nổi sát bên văn bản được bôi đen
      triggerBtn = document.createElement('button');
      triggerBtn.className = 'trans-trigger-btn';
      triggerBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>Dịch</span>
      `;

      const top = window.scrollY + rect.top - 36;
      const left = window.scrollX + rect.left + rect.width / 2;

      triggerBtn.style.top = Math.max(10, top) + 'px';
      triggerBtn.style.left = Math.max(10, left) + 'px';
      triggerBtn.style.transform = 'translateX(-50%)';

      const onTrigger = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        fetchTranslation(selectedText, rect);
      };

      triggerBtn.addEventListener('mousedown', onTrigger);
      triggerBtn.addEventListener('touchstart', onTrigger, { passive: false });

      document.body.appendChild(triggerBtn);
    }

    // Gọi API Google Dịch
    async function fetchTranslation(text, rect) {
      removeTrigger();
      removeCard();

      transCard = document.createElement('div');
      transCard.className = 'trans-card';
      transCard.innerHTML = `
        <div class="trans-card-header">
          <div class="trans-card-title">
            <span>🌐 Google Dịch</span>
          </div>
          <div class="trans-card-actions">
            <button class="trans-icon-btn" id="trans-close-btn" title="Đóng">✕</button>
          </div>
        </div>
        <div class="trans-card-body">
          <div class="trans-orig">
            <span class="trans-orig-text">"${escapeHtml(text.length > 60 ? text.substring(0, 60) + '...' : text)}"</span>
            <button class="trans-icon-btn" id="trans-speak-btn" title="Phát âm tiếng Anh">🔊</button>
          </div>
          <div class="trans-result" id="trans-result-text">Đang dịch...</div>
        </div>
        <div class="trans-card-footer">
          <span>Tự động phát hiện ngôn ngữ</span>
          <a class="trans-link" href="https://translate.google.com/?sl=auto&tl=vi&text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Mở trang Google Dịch ↗</a>
        </div>
      `;

      let top = window.scrollY + rect.bottom + 8;
      let left = window.scrollX + rect.left + rect.width / 2 - 160;
      left = Math.max(12, Math.min(window.innerWidth - 335, left));

      transCard.style.top = top + 'px';
      transCard.style.left = left + 'px';

      document.body.appendChild(transCard);

      document.getElementById('trans-close-btn').addEventListener('click', removeCard);

      // Phát âm Text-to-Speech
      document.getElementById('trans-speak-btn').addEventListener('click', () => {
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'en-US';
          window.speechSynthesis.speak(utterance);
        }
      });

      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Dịch không thành công');
        const data = await res.json();
        
        let translatedText = '';
        if (data && data[0]) {
          translatedText = data[0].map(item => item[0]).join('');
        }
        
        const resultEl = document.getElementById('trans-result-text');
        if (resultEl) {
          resultEl.textContent = translatedText || 'Không tìm thấy bản dịch.';
        }
      } catch (err) {
        const resultEl = document.getElementById('trans-result-text');
        if (resultEl) {
          resultEl.innerHTML = `<span style="color:#ef4444;font-size:12px;">Không thể kết nối Google Dịch. Vui lòng bấm liên kết bên dưới để mở trang web.</span>`;
        }
      }
    }

    // Đóng khi click ngoài hoặc ấn Escape
    document.addEventListener('mousedown', (e) => {
      if (transCard && !e.target.closest('.trans-card') && !e.target.closest('.trans-trigger-btn')) {
        removeCard();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        removeTrigger();
        removeCard();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTranslate);
  } else {
    initTranslate();
  }
})();
