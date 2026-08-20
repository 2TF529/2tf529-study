/**
 * security.js — Module bảo mật dùng chung
 * - escapeHtml(): Escape ký tự đặc biệt HTML để chống XSS khi dùng innerHTML
 * - sanitizeForDOM(): Whitelist thẻ an toàn cho nội dung đề thi (giữ LaTeX, img, table nhưng chặn script/iframe/event handlers)
 */
(function() {
  'use strict';

  // Escape HTML special characters
  window.escapeHtml = function(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Whitelist-based HTML sanitizer for exam content
  // Allows: p, br, div, span, b, strong, i, em, u, sub, sup, table, thead, tbody, tr, td, th,
  //         img (with src, alt, class, style), pre, code, ul, ol, li, math elements
  // Strips: script, iframe, object, embed, form, input, link, style, and ALL event handlers (on*)
  var ALLOWED_TAGS = /^(p|br|div|span|b|strong|i|em|u|sub|sup|table|thead|tbody|tr|td|th|img|pre|code|ul|ol|li|h[1-6]|blockquote|hr|a|figure|figcaption|mjx-[a-z-]+|math|mi|mo|mn|ms|mrow|msup|msub|mfrac|msqrt|mover|munder|mtext|annotation|semantics)$/i;
  var ALLOWED_ATTRS = /^(class|style|src|alt|title|width|height|colspan|rowspan|href|target|rel|id|data-[a-z-]+)$/i;
  var DANGEROUS_ATTR_VALUES = /javascript:|data:text\/html|vbscript:/i;

  window.sanitizeForDOM = function(html) {
    if (typeof html !== 'string') return '';
    var doc = new DOMParser().parseFromString(html, 'text/html');
    cleanNode(doc.body);
    return doc.body.innerHTML;
  };

  function cleanNode(node) {
    var children = Array.from(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 1) { // Element node
        var tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.test(tag)) {
          // Replace dangerous element with its text content
          var text = document.createTextNode(child.textContent || '');
          node.replaceChild(text, child);
          continue;
        }
        // Remove dangerous attributes
        var attrs = Array.from(child.attributes);
        for (var j = 0; j < attrs.length; j++) {
          var attrName = attrs[j].name.toLowerCase();
          if (attrName.startsWith('on') || !ALLOWED_ATTRS.test(attrName) || DANGEROUS_ATTR_VALUES.test(attrs[j].value)) {
            child.removeAttribute(attrs[j].name);
          }
        }
        // Add rel="noopener noreferrer" to links with target
        if (tag === 'a' && child.getAttribute('target')) {
          child.setAttribute('rel', 'noopener noreferrer');
        }
        cleanNode(child);
      }
    }
  }
})();
