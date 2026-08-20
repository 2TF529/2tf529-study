/**
 * whiteboard.js - Bảng nháp & Vẽ hình học trực tuyến cho học sinh
 * Hỗ trợ: Bút viết, Dạ quang, Tẩy, Thước thẳng, Thước đo góc, Hệ trục Oxy,
 * Hình học, Copy/Paste ảnh (Ctrl+V), Undo/Redo, Lưới ô ly, Đổi kích thước tùy ý, Kéo thả.
 */

(function () {
  'use strict';

  // Tự động inject CSS cần thiết vào document head để tránh bị lỗi cache CSS trên web chính
  function injectStyles() {
    if (document.getElementById('wb-injected-css')) return;
    const style = document.createElement('style');
    style.id = 'wb-injected-css';
    style.textContent = `
      .wb-floating-btn {
        position: fixed;
        right: 18px;
        bottom: 24px;
        z-index: 80;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--blue-500, #2563eb);
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
      .wb-floating-btn:hover {
        background: var(--blue-600, #1d4ed8);
        transform: translateY(-2px) scale(1.03);
      }
      .wb-modal {
        position: fixed;
        right: 24px;
        bottom: 80px;
        width: 580px;
        height: 440px;
        min-width: 380px;
        min-height: 280px;
        max-width: 96vw;
        max-height: 90vh;
        background: var(--white, #fff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
        z-index: 90;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        user-select: none;
      }
      .wb-modal.hidden {
        display: none !important;
      }
      .wb-modal.fullscreen {
        inset: 16px !important;
        width: auto !important;
        height: auto !important;
        max-width: none !important;
        max-height: none !important;
      }
      .wb-modal.transparent-mode {
        background: rgba(255, 255, 255, 0.65) !important;
        backdrop-filter: blur(4px);
      }
      .wb-header {
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
      .wb-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
      .wb-header-actions { display: flex; align-items: center; gap: 4px; }
      .wb-icon-btn {
        background: transparent; border: none; color: #fff; opacity: 0.8;
        padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 13px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .wb-icon-btn:hover { opacity: 1; background: rgba(255, 255, 255, 0.15); }
      .wb-toolbar {
        display: flex; align-items: center; gap: 6px; padding: 6px 10px;
        background: var(--bg, #f8fafc); border-bottom: 1px solid var(--line, #e2e8f0);
        flex-wrap: wrap; flex-shrink: 0;
      }
      .wb-tool-group { display: flex; align-items: center; gap: 3px; }
      .wb-divider { width: 1px; height: 20px; background: var(--line, #e2e8f0); margin: 0 4px; }
      .wb-tool-btn, .wb-action-btn, .wb-size-btn {
        background: var(--white, #fff); border: 1px solid var(--line, #e2e8f0);
        color: var(--ink-700, #334155); border-radius: 6px; padding: 5px 8px;
        cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; justify-content: center;
      }
      .wb-tool-btn.active { background: var(--blue-500, #2563eb); color: #fff; }
      .wb-color-dot {
        width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff;
        box-shadow: 0 0 0 1px #cbd5e1; cursor: pointer; padding: 0;
      }
      .wb-color-dot.active { box-shadow: 0 0 0 2px #2563eb; transform: scale(1.15); }
      .wb-custom-color { width: 22px; height: 22px; padding: 0; border: none; border-radius: 50%; cursor: pointer; background: transparent; }
      .wb-size-btn span { background: currentColor; border-radius: 50%; display: block; }
      .wb-size-btn.active { background: var(--blue-50, #eff6ff); border-color: #2563eb; color: #2563eb; }
      .wb-canvas-wrap { flex: 1; position: relative; overflow: hidden; background: #fff; cursor: crosshair; }
      #wb-canvas { display: block; width: 100%; height: 100%; touch-action: none; }
      #wb-canvas.wb-grid-dots {
        background-image: radial-gradient(#94a3b8 0.75px, transparent 0.75px);
        background-size: 16px 16px;
      }
      #wb-canvas.wb-grid-lines {
        background-image: linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px);
        background-size: 20px 20px;
      }
      .wb-resizer { position: absolute; z-index: 10; }
      .wb-resizer-t { top: 0; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
      .wb-resizer-b { bottom: 0; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
      .wb-resizer-l { left: 0; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
      .wb-resizer-r { right: 0; top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
      .wb-resizer-tl { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
      .wb-resizer-tr { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
      .wb-resizer-bl { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
      .wb-resizer-br { bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #94a3b8 50%); opacity: 0.4; }
      @media (max-width: 640px) {
        .wb-floating-btn span { display: none; }
        .wb-floating-btn { padding: 11px; right: 12px; bottom: 16px; border-radius: 50%; width: 44px; height: 44px; justify-content: center; }
        .wb-modal { width: 95vw !important; height: 72vh !important; left: 2.5vw !important; right: auto !important; bottom: 68px !important; border-radius: 12px; }
        .wb-toolbar { overflow-x: auto; flex-wrap: nowrap; padding: 6px 8px; -webkit-overflow-scrolling: touch; }
      }
    `;
    document.head.appendChild(style);
  }

  // Khởi tạo container và nút mở khi DOM sẵn sàng
  function initWhiteboard() {
    if (document.getElementById('wb-container')) return;
    injectStyles();

    // 1. Tạo nút Floating Button bên phải màn hình
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'wb-toggle-btn';
    toggleBtn.className = 'wb-floating-btn';
    toggleBtn.setAttribute('title', 'Mở bảng nháp (Alt + B)');
    toggleBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </svg>
      <span>Bảng nháp</span>
    `;
    document.body.appendChild(toggleBtn);

    // 2. Tạo Modal Bảng Nháp (Draggable & Resizable)
    const modal = document.createElement('div');
    modal.id = 'wb-container';
    modal.className = 'wb-modal hidden';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="wb-header" id="wb-header">
        <div class="wb-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Bảng nháp & Vẽ hình học</span>
        </div>
        <div class="wb-header-actions">
          <button class="wb-icon-btn" id="wb-grid-toggle" title="Đổi kiểu lưới (Ô ly / Kẻ ngang / Trơn)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path>
            </svg>
          </button>
          <button class="wb-icon-btn" id="wb-opacity-toggle" title="Độ trong suốt nhìn xuyên đề thi">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path>
            </svg>
          </button>
          <button class="wb-icon-btn" id="wb-expand-btn" title="Phóng to / Thu nhỏ">⛶</button>
          <button class="wb-icon-btn wb-close-btn" id="wb-close-btn" title="Đóng bảng nháp">✕</button>
        </div>
      </div>

      <!-- Toolbar điều khiển -->
      <div class="wb-toolbar">
        <div class="wb-tool-group">
          <button class="wb-tool-btn active" data-tool="pen" title="Bút vẽ (P)">
            ✏️
          </button>
          <button class="wb-tool-btn" data-tool="highlighter" title="Bút dạ quang (H)">
            🖍️
          </button>
          <button class="wb-tool-btn" data-tool="eraser" title="Tẩy / Xóa nét (E)">
            🧹
          </button>
          <button class="wb-tool-btn" data-tool="line" title="Thước thẳng (L)">
            📏
          </button>
          <button class="wb-tool-btn" data-tool="protractor" title="Thước đo góc 0°-180° (G)">
            📐
          </button>
          <button class="wb-tool-btn" data-tool="rect" title="Hình chữ nhật / Vuông">
            ⬜
          </button>
          <button class="wb-tool-btn" data-tool="circle" title="Hình tròn / Elip">
            ⭕
          </button>
          <button class="wb-tool-btn" data-tool="oxy" title="Hệ trục tọa độ Oxy">
            📈
          </button>
          <button class="wb-tool-btn" data-tool="text" title="Chèn chữ / Văn bản (T)">
            🔤
          </button>
        </div>

        <div class="wb-divider"></div>

        <!-- Bảng màu sắc -->
        <div class="wb-tool-group wb-colors">
          <button class="wb-color-dot active" style="background:#1e293b;" data-color="#1e293b" title="Đen"></button>
          <button class="wb-color-dot" style="background:#2563eb;" data-color="#2563eb" title="Xanh dương"></button>
          <button class="wb-color-dot" style="background:#dc2626;" data-color="#dc2626" title="Đỏ"></button>
          <button class="wb-color-dot" style="background:#16a34a;" data-color="#16a34a" title="Xanh lá"></button>
          <button class="wb-color-dot" style="background:#d97706;" data-color="#d97706" title="Cam/Vàng"></button>
          <button class="wb-color-dot" style="background:#9333ea;" data-color="#9333ea" title="Tím"></button>
          <input type="color" id="wb-custom-color" class="wb-custom-color" value="#1e293b" title="Chọn màu tùy ý">
        </div>

        <div class="wb-divider"></div>

        <!-- Độ dày nét vẽ -->
        <div class="wb-tool-group wb-sizes">
          <button class="wb-size-btn active" data-size="2" title="Nét mảnh">
            <span style="width:4px; height:4px;"></span>
          </button>
          <button class="wb-size-btn" data-size="5" title="Nét vừa">
            <span style="width:7px; height:7px;"></span>
          </button>
          <button class="wb-size-btn" data-size="12" title="Nét đậm">
            <span style="width:11px; height:11px;"></span>
          </button>
        </div>

        <div class="wb-divider"></div>

        <!-- Thao tác Lịch sử & Clipboard -->
        <div class="wb-tool-group">
          <button class="wb-action-btn" id="wb-undo-btn" title="Hoàn tác (Ctrl + Z)">↩</button>
          <button class="wb-action-btn" id="wb-redo-btn" title="Làm lại (Ctrl + Y)">↪</button>
          <button class="wb-action-btn" id="wb-copy-btn" title="Copy bảng nháp vào Clipboard">📋</button>
          <button class="wb-action-btn danger" id="wb-clear-btn" title="Xóa toàn bộ nháp">🗑️</button>
          <button class="wb-action-btn" id="wb-download-btn" title="Tải ảnh nháp (PNG)">💾</button>
        </div>
      </div>

      <!-- Vùng vẽ Canvas -->
      <div class="wb-canvas-wrap" id="wb-canvas-wrap">
        <canvas id="wb-canvas" class="wb-grid-dots"></canvas>
      </div>

      <!-- 8 điểm kéo co dãn kích thước: 4 Cạnh + 4 Góc (Universal Resizers) -->
      <div class="wb-resizer wb-resizer-t" data-dir="top" title="Kéo cạnh trên"></div>
      <div class="wb-resizer wb-resizer-b" data-dir="bottom" title="Kéo cạnh dưới"></div>
      <div class="wb-resizer wb-resizer-l" data-dir="left" title="Kéo cạnh trái"></div>
      <div class="wb-resizer wb-resizer-r" data-dir="right" title="Kéo cạnh phải"></div>
      <div class="wb-resizer wb-resizer-tl" data-dir="top-left" title="Kéo góc trên trái"></div>
      <div class="wb-resizer wb-resizer-tr" data-dir="top-right" title="Kéo góc trên phải"></div>
      <div class="wb-resizer wb-resizer-bl" data-dir="bottom-left" title="Kéo góc dưới trái"></div>
      <div class="wb-resizer wb-resizer-br" data-dir="bottom-right" title="Kéo góc dưới phải"></div>
    `;
    document.body.appendChild(modal);

    setupWhiteboardLogic(modal, toggleBtn);
  }

  function setupWhiteboardLogic(modal, toggleBtn) {
    const canvas = document.getElementById('wb-canvas');
    const wrap = document.getElementById('wb-canvas-wrap');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Trạng thái vẽ
    let isDrawing = false;
    let currentTool = 'pen';
    let currentColor = '#1e293b';
    let currentSize = 2;
    let startX = 0;
    let startY = 0;
    let snapshot = null;
    let history = [];
    let historyStep = -1;
    const MAX_HISTORY = 25;
    let isTransparent = false;
    let gridStyle = 1; // 0: Blank, 1: Grid dots, 2: Lines

    // Khởi tạo kích thước canvas
    function resizeCanvas(preserve = true) {
      let tempImage = null;
      if (preserve && canvas.width > 0 && canvas.height > 0) {
        tempImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(300, rect.width);
      canvas.height = Math.max(200, rect.height);

      if (tempImage && preserve) {
        ctx.putImageData(tempImage, 0, 0);
      } else {
        saveState();
      }
    }

    // Quản lý History (Undo/Redo)
    function saveState() {
      historyStep++;
      if (historyStep < history.length) {
        history.length = historyStep;
      }
      history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (history.length > MAX_HISTORY) {
        history.shift();
        historyStep--;
      }
    }

    function undo() {
      if (historyStep > 0) {
        historyStep--;
        ctx.putImageData(history[historyStep], 0, 0);
      }
    }

    function redo() {
      if (historyStep < history.length - 1) {
        historyStep++;
        ctx.putImageData(history[historyStep], 0, 0);
      }
    }

    // Toggle hiển thị
    function toggleWhiteboard() {
      const isHidden = modal.style.display === 'none' || modal.classList.contains('hidden');
      if (isHidden) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        resizeCanvas(history.length > 0);
      } else {
        modal.style.display = 'none';
        modal.classList.add('hidden');
      }
    }

    toggleBtn.addEventListener('click', toggleWhiteboard);
    document.getElementById('wb-close-btn').addEventListener('click', () => {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    });

    // Phím tắt bàn phím
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleWhiteboard();
      }
      if (!modal.classList.contains('hidden')) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
          e.preventDefault();
          redo();
        }
      }
    });

    // Xử lý Paste ảnh từ Clipboard (Ctrl+V)
    window.addEventListener('paste', (e) => {
      if (modal.classList.contains('hidden')) return;
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const blob = item.getAsFile();
          const img = new Image();
          const reader = new FileReader();
          reader.onload = (event) => {
            img.onload = () => {
              // Vẽ ảnh paste vào trung tâm bảng nháp
              const maxWidth = canvas.width * 0.8;
              const maxHeight = canvas.height * 0.8;
              let scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
              const w = img.width * scale;
              const h = img.height * scale;
              const x = (canvas.width - w) / 2;
              const y = (canvas.height - h) / 2;
              ctx.drawImage(img, x, y, w, h);
              saveState();
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    });

    // Kéo thả di chuyển cửa sổ bảng nháp
    const header = document.getElementById('wb-header');
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
      isDragging = false;
    });

    // Co dãn kích thước đa hướng (Universal 8-Direction Resizing)
    let isResizing = false;
    let resizeDir = '';
    let startRect = null;
    let startMouseX = 0;
    let startMouseY = 0;

    modal.querySelectorAll('.wb-resizer').forEach((resizer) => {
      resizer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        resizeDir = resizer.dataset.dir;
        startRect = modal.getBoundingClientRect();
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        modal.style.transition = 'none';
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing || !startRect) return;

      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const MIN_W = 320;
      const MIN_H = 220;

      let newW = startRect.width;
      let newH = startRect.height;
      let newLeft = startRect.left;
      let newTop = startRect.top;

      if (resizeDir.includes('right')) {
        newW = Math.max(MIN_W, startRect.width + dx);
      }
      if (resizeDir.includes('bottom')) {
        newH = Math.max(MIN_H, startRect.height + dy);
      }
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

      resizeCanvas(true);
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        startRect = null;
        resizeCanvas(true);
      }
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizeCanvas(true);
      }
    });

    // Phóng to toàn màn hình / thu nhỏ
    const expandBtn = document.getElementById('wb-expand-btn');
    expandBtn.addEventListener('click', () => {
      modal.classList.toggle('fullscreen');
      setTimeout(() => resizeCanvas(true), 150);
    });

    // Bật/tắt nhìn xuyên đề thi (Opacity)
    const opacityBtn = document.getElementById('wb-opacity-toggle');
    opacityBtn.addEventListener('click', () => {
      isTransparent = !isTransparent;
      modal.classList.toggle('transparent-mode', isTransparent);
    });

    // Đổi kiểu lưới nền
    const gridBtn = document.getElementById('wb-grid-toggle');
    gridBtn.addEventListener('click', () => {
      gridStyle = (gridStyle + 1) % 3;
      canvas.className = '';
      if (gridStyle === 1) canvas.className = 'wb-grid-dots';
      else if (gridStyle === 2) canvas.className = 'wb-grid-lines';
    });

    // Chuyển đổi công cụ vẽ
    document.querySelectorAll('.wb-tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wb-tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
      });
    });

    // Chọn màu
    document.querySelectorAll('.wb-color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.wb-color-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        currentColor = dot.dataset.color;
        document.getElementById('wb-custom-color').value = currentColor;
      });
    });

    document.getElementById('wb-custom-color').addEventListener('input', (e) => {
      currentColor = e.target.value;
      document.querySelectorAll('.wb-color-dot').forEach((d) => d.classList.remove('active'));
    });

    // Chọn cỡ nét vẽ
    document.querySelectorAll('.wb-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wb-size-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentSize = parseInt(btn.dataset.size, 10);
      });
    });

    // Actions
    document.getElementById('wb-undo-btn').addEventListener('click', undo);
    document.getElementById('wb-redo-btn').addEventListener('click', redo);

    document.getElementById('wb-clear-btn').addEventListener('click', () => {
      if (confirm('Xóa sạch bảng nháp?')) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        saveState();
      }
    });

    document.getElementById('wb-copy-btn').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        try {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          alert('Đã sao chép hình nháp vào Clipboard!');
        } catch (err) {
          alert('Trình duyệt chưa cấp quyền copy ảnh.');
        }
      });
    });

    document.getElementById('wb-download-btn').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `bang-nhap-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    // Tọa độ chuột / chạm
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    // Logic vẽ chính
    function startDraw(e) {
      e.preventDefault();
      const pos = getPos(e);
      isDrawing = true;
      startX = pos.x;
      startY = pos.y;

      if (currentTool === 'text') {
        const text = prompt('Nhập văn bản / công thức muốn chèn lên bảng:');
        if (text) {
          ctx.font = `${Math.max(14, currentSize * 6)}px Inter, sans-serif`;
          ctx.fillStyle = currentColor;
          ctx.fillText(text, startX, startY);
          saveState();
        }
        isDrawing = false;
        return;
      }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);

      if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (currentTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = currentSize * 8;
        } else if (currentTool === 'highlighter') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = currentColor + '55'; // Alpha 33%
          ctx.lineWidth = currentSize * 5;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentSize;
        }

        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else {
        // Các công cụ hình học & thước: phục hồi snapshot để vẽ preview
        ctx.putImageData(snapshot, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.lineCap = 'round';

        if (currentTool === 'line') {
          // Thước thẳng kèm độ dài pixel
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();

          // Hiển thị độ dài
          const dist = Math.round(Math.hypot(pos.x - startX, pos.y - startY));
          ctx.font = '11px sans-serif';
          ctx.fillStyle = currentColor;
          ctx.fillText(`${dist}px`, (startX + pos.x) / 2 + 5, (startY + pos.y) / 2 - 5);
        } else if (currentTool === 'protractor') {
          // Thước đo góc
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(pos.x, startY); // Cạnh đáy ngang
          ctx.moveTo(startX, startY);
          ctx.lineTo(pos.x, pos.y); // Cạnh xiên
          ctx.stroke();

          // Tính góc
          let rad = Math.atan2(startY - pos.y, pos.x - startX);
          let deg = Math.round(rad * (180 / Math.PI));
          if (deg < 0) deg += 360;

          // Vẽ cung tròn góc
          ctx.beginPath();
          ctx.arc(startX, startY, 28, 0, -rad, rad > 0);
          ctx.stroke();
          ctx.font = '12px sans-serif';
          ctx.fillStyle = currentColor;
          ctx.fillText(`${deg}°`, startX + 34, startY - 8);
        } else if (currentTool === 'rect') {
          ctx.beginPath();
          ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY);
        } else if (currentTool === 'circle') {
          const radiusX = Math.abs(pos.x - startX) / 2;
          const radiusY = Math.abs(pos.y - startY) / 2;
          const centerX = Math.min(startX, pos.x) + radiusX;
          const centerY = Math.min(startY, pos.y) + radiusY;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (currentTool === 'oxy') {
          // Vẽ hệ trục tọa độ Oxy với mũi tên
          const minX = Math.min(startX, pos.x);
          const maxX = Math.max(startX, pos.x);
          const minY = Math.min(startY, pos.y);
          const maxY = Math.max(startY, pos.y);
          const originX = minX + (maxX - minX) * 0.4;
          const originY = minY + (maxY - minY) * 0.6;

          ctx.beginPath();
          // Trục Ox
          ctx.moveTo(minX, originY);
          ctx.lineTo(maxX, originY);
          // Mũi tên Ox
          ctx.lineTo(maxX - 8, originY - 4);
          ctx.moveTo(maxX, originY);
          ctx.lineTo(maxX - 8, originY + 4);

          // Trục Oy
          ctx.moveTo(originX, maxY);
          ctx.lineTo(originX, minY);
          // Mũi tên Oy
          ctx.lineTo(originX - 4, minY + 8);
          ctx.moveTo(originX, minY);
          ctx.lineTo(originX + 4, minY + 8);
          ctx.stroke();

          ctx.font = '12px sans-serif';
          ctx.fillStyle = currentColor;
          ctx.fillText('x', maxX + 4, originY + 4);
          ctx.fillText('y', originX - 4, minY - 6);
          ctx.fillText('O', originX - 12, originY + 14);
        }
      }
    }

    function stopDraw() {
      if (!isDrawing) return;
      isDrawing = false;
      ctx.globalCompositeOperation = 'source-over';
      saveState();
    }

    // Event listeners vẽ chuột & cảm ứng
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);
  }

  // Khởi động khi tải xong trang
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhiteboard);
  } else {
    initWhiteboard();
  }
})();
