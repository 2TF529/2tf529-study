/**
 * shield.js — Bảo vệ giao diện và chống trích xuất mã nguồn (v2.0)
 * Tính năng:
 *  - Chặn phím tắt DevTools: F12, Ctrl+Shift+I/J/C/K, Ctrl+U, Ctrl+S
 *  - Chặn chuột phải (Context Menu)
 *  - Vô hiệu hóa console
 *  - Phát hiện DevTools qua kích thước cửa sổ
 *  - Phát hiện debugger qua timing
 *  - VẪN CHO PHÉP: Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X, bôi đen văn bản
 */
(function () {
  'use strict';

  // ===== 1. Chặn phím tắt mở DevTools =====
  document.addEventListener('keydown', function (e) {
    // Whitelist: Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X, Ctrl+Z, Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      var allowed = [65, 67, 86, 88, 90, 89];
      if (allowed.indexOf(e.keyCode) !== -1) return;
    }

    // Block F12
    if (e.keyCode === 123 || e.key === 'F12') {
      e.preventDefault(); e.stopPropagation(); return false;
    }

    // Block Ctrl+Shift+I/J/C/K
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      var k = (e.key || '').toUpperCase();
      if ('IJCK'.indexOf(k) !== -1 || [73, 74, 67, 75].indexOf(e.keyCode) !== -1) {
        e.preventDefault(); e.stopPropagation(); return false;
      }
    }

    // Block Ctrl+U (View Source) & Ctrl+S (Save)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (e.keyCode === 85 || e.keyCode === 83) {
        e.preventDefault(); e.stopPropagation(); return false;
      }
    }
  }, true);

  // ===== 2. Chặn chuột phải =====
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault(); return false;
  });

  // ===== 3. Vô hiệu hóa console =====
  try {
    var noop = function () {};
    var methods = ['log', 'debug', 'info', 'warn', 'dir', 'dirxml', 'table', 'trace',
                   'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd',
                   'profile', 'profileEnd', 'count'];
    for (var i = 0; i < methods.length; i++) {
      if (window.console && window.console[methods[i]]) {
        window.console[methods[i]] = noop;
      }
    }
  } catch (_) {}

  // ===== 4. Chặn kéo thả hình ảnh =====
  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  });

  // ===== 5. Phát hiện DevTools qua kích thước cửa sổ =====
  var _devToolsWarningShown = false;
  var _warningBanner = null;

  function showDevToolsWarning() {
    if (_devToolsWarningShown) return;
    _devToolsWarningShown = true;
    _warningBanner = document.createElement('div');
    _warningBanner.id = 'shield-devtools-warning';
    _warningBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
      'background:linear-gradient(90deg,#dc2626,#b91c1c);color:#fff;text-align:center;' +
      'padding:10px 16px;font-size:13px;font-weight:600;font-family:system-ui,sans-serif;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.3);';
    _warningBanner.textContent = '⚠ Phát hiện công cụ phát triển đang mở. Vui lòng đóng để tiếp tục làm bài.';
    document.body.appendChild(_warningBanner);
  }

  function hideDevToolsWarning() {
    if (!_devToolsWarningShown) return;
    _devToolsWarningShown = false;
    if (_warningBanner && _warningBanner.parentNode) {
      _warningBanner.parentNode.removeChild(_warningBanner);
      _warningBanner = null;
    }
  }

  // Kiểm tra kích thước cửa sổ mỗi 2 giây
  setInterval(function () {
    var widthDiff = window.outerWidth - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;
    if (widthDiff > 160 || heightDiff > 160) {
      showDevToolsWarning();
    } else {
      hideDevToolsWarning();
    }
  }, 2000);

  // ===== 6. Phát hiện debugger qua timing =====
  setInterval(function () {
    var start = performance.now();
    (function(){}).constructor('debugger')();
    if (performance.now() - start > 100) {
      showDevToolsWarning();
    }
  }, 4000);

})();
