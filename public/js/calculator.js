/**
 * calculator.js - Nhúng Máy tính Khoa học (Scientific Calculator) qua Iframe
 * Hỗ trợ: Kéo thả di chuyển, Co dãn 8 hướng (4 cạnh + 4 góc), Phóng to/Thu nhỏ, Phím tắt Alt+C
 */

(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('calc-injected-css')) return;
    const style = document.createElement('style');
    style.id = 'calc-injected-css';
    style.textContent = `
      .calc-floating-btn {
        position: fixed;
        right: 18px;
        bottom: 78px;
        z-index: 80;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--navy-800, #1e293b);
        color: #fff;
        padding: 11px 18px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.25);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        cursor: pointer;
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 700;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(8px);
      }
      .calc-floating-btn:hover {
        background: var(--navy-950, #0f172a);
        transform: translateY(-2px) scale(1.03);
      }
      .calc-modal {
        position: fixed;
        right: 24px;
        bottom: 135px;
        width: 520px;
        height: 480px;
        min-width: 340px;
        min-height: 380px;
        max-width: 96vw;
        max-height: 88vh;
        background: var(--white, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
        z-index: 92;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        user-select: none;
      }
      .calc-modal.hidden {
        display: none !important;
      }
      .calc-modal.fullscreen {
        inset: 16px !important;
        width: auto !important;
        height: auto !important;
        max-width: none !important;
        max-height: none !important;
      }
      .calc-header {
        height: 42px;
        background: var(--navy-800, #1e293b);
        color: #fff;
        padding: 0 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        flex-shrink: 0;
      }
      .calc-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
      .calc-header-actions { display: flex; align-items: center; gap: 4px; }
      .calc-icon-btn {
        background: transparent; border: none; color: #fff; opacity: 0.8;
        padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 13px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .calc-icon-btn:hover { opacity: 1; background: rgba(255, 255, 255, 0.15); }
      .calc-icon-btn.calc-close-btn:hover { background: #dc2626; }
      .calc-iframe-wrap { flex: 1; position: relative; overflow: hidden; background: #fff; }
      #calc-iframe { width: 100%; height: 100%; border: none; display: block; }
      .calc-resizer { position: absolute; z-index: 10; }
      .calc-resizer-t { top: 0; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
      .calc-resizer-b { bottom: 0; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
      .calc-resizer-l { left: 0; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
      .calc-resizer-r { right: 0; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
      .calc-resizer-tl { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
      .calc-resizer-tr { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
      .calc-resizer-bl { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
      .calc-resizer-br { bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #94a3b8 50%); opacity: 0.4; }
      @media (max-width: 640px) {
        .calc-floating-btn span { display: none; }
        .calc-floating-btn { padding: 11px; right: 12px; bottom: 68px; border-radius: 50%; width: 44px; height: 44px; justify-content: center; }
        .calc-modal { width: 95vw !important; height: 72vh !important; left: 2.5vw !important; right: auto !important; bottom: 118px !important; border-radius: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function initCalculator() {
    if (document.getElementById('calc-container')) return;
    injectStyles();

    // 1. Tạo nút Floating Button bên phải
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'calc-toggle-btn';
    toggleBtn.className = 'calc-floating-btn';
    toggleBtn.setAttribute('title', 'Mở máy tính khoa học (Alt + C)');
    toggleBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"></rect>
        <line x1="8" y1="6" x2="16" y2="6"></line>
        <line x1="16" y1="14" x2="16" y2="18"></line>
        <path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"></path>
      </svg>
      <span>Máy tính</span>
    `;
    document.body.appendChild(toggleBtn);

    // 2. Tạo Modal Máy tính Khoa học (Draggable & 8-Direction Resizable)
    const modal = document.createElement('div');
    modal.id = 'calc-container';
    modal.className = 'calc-modal hidden';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="calc-header" id="calc-header">
        <div class="calc-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="2" width="16" height="20" rx="2"></rect>
            <line x1="8" y1="6" x2="16" y2="6"></line>
          </svg>
          <span>Máy tính khoa học (Desmos Scientific)</span>
        </div>
        <div class="calc-header-actions">
          <button class="calc-icon-btn" id="calc-expand-btn" title="Phóng to / Thu nhỏ">⛶</button>
          <button class="calc-icon-btn calc-close-btn" id="calc-close-btn" title="Đóng máy tính (Alt+C)">✕</button>
        </div>
      </div>

      <!-- Khung chứa Iframe Máy tính Desmos Scientific -->
      <div class="calc-iframe-wrap">
        <iframe
          id="calc-iframe"
          src="https://www.desmos.com/scientific?lang=vi"
          title="Desmos Scientific Calculator"
          loading="lazy"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>

      <!-- 8 điểm kéo co dãn kích thước: 4 Cạnh + 4 Góc (Universal Resizers) -->
      <div class="calc-resizer calc-resizer-t" data-dir="top" title="Kéo cạnh trên"></div>
      <div class="calc-resizer calc-resizer-b" data-dir="bottom" title="Kéo cạnh dưới"></div>
      <div class="calc-resizer calc-resizer-l" data-dir="left" title="Kéo cạnh trái"></div>
      <div class="calc-resizer calc-resizer-r" data-dir="right" title="Kéo cạnh phải"></div>
      <div class="calc-resizer calc-resizer-tl" data-dir="top-left" title="Kéo góc trên trái"></div>
      <div class="calc-resizer calc-resizer-tr" data-dir="top-right" title="Kéo góc trên phải"></div>
      <div class="calc-resizer calc-resizer-bl" data-dir="bottom-left" title="Kéo góc dưới trái"></div>
      <div class="calc-resizer calc-resizer-br" data-dir="bottom-right" title="Kéo góc dưới phải"></div>
    `;
    document.body.appendChild(modal);

    setupCalculatorLogic(modal, toggleBtn);
  }

  function setupCalculatorLogic(modal, toggleBtn) {
    function toggleCalc() {
      const isHidden = modal.style.display === 'none' || modal.classList.contains('hidden');
      if (isHidden) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
      } else {
        modal.style.display = 'none';
        modal.classList.add('hidden');
      }
    }

    toggleBtn.addEventListener('click', toggleCalc);
    document.getElementById('calc-close-btn').addEventListener('click', () => {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    });

    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        toggleCalc();
      }
    });

    const header = document.getElementById('calc-header');
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      const rect = modal.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      modal.style.transition = 'none';
      document.getElementById('calc-iframe').style.pointerEvents = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      let x = e.clientX - dragOffsetX;
      let y = e.clientY - dragOffsetY;
      x = Math.max(10, Math.min(window.innerWidth - modal.offsetWidth - 10, x));
      y = Math.max(10, Math.min(window.innerHeight - modal.offsetHeight - 10, y));
      modal.style.left = x + 'px';
      modal.style.top = y + 'px';
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.getElementById('calc-iframe').style.pointerEvents = 'auto';
      }
    });

    const expandBtn = document.getElementById('calc-expand-btn');
    expandBtn.addEventListener('click', () => {
      modal.classList.toggle('fullscreen');
    });

    let isResizing = false;
    let resizeDir = '';
    let startRect = null;
    let startMouseX = 0;
    let startMouseY = 0;

    modal.querySelectorAll('.calc-resizer').forEach((resizer) => {
      resizer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        resizeDir = resizer.dataset.dir;
        startRect = modal.getBoundingClientRect();
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        modal.style.transition = 'none';
        document.getElementById('calc-iframe').style.pointerEvents = 'none';
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing || !startRect) return;

      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const MIN_W = 340;
      const MIN_H = 380;

      let newW = startRect.width;
      let newH = startRect.height;
      let newLeft = startRect.left;
      let newTop = startRect.top;

      if (resizeDir.includes('right')) newW = Math.max(MIN_W, startRect.width + dx);
      if (resizeDir.includes('bottom')) newH = Math.max(MIN_H, startRect.height + dy);
      if (resizeDir.includes('left')) {
        const potentialW = startRect.width - dx;
        if (potentialW >= MIN_W) {
          newW = potentialW;
          newLeft = startRect.left + dx;
        } else {
          newW = MIN_W;
          newLeft = startRect.right - MIN_W;
        }
      }
      if (resizeDir.includes('top')) {
        const potentialH = startRect.height - dy;
        if (potentialH >= MIN_H) {
          newH = potentialH;
          newTop = startRect.top + dy;
        } else {
          newH = MIN_H;
          newTop = startRect.bottom - MIN_H;
        }
      }

      modal.style.width = `${newW}px`;
      modal.style.height = `${newH}px`;
      modal.style.left = `${newLeft}px`;
      modal.style.top = `${newTop}px`;
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        startRect = null;
        document.getElementById('calc-iframe').style.pointerEvents = 'auto';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalculator);
  } else {
    initCalculator();
  }
})();
