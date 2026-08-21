import { defineConfig } from 'astro/config';

export default defineConfig({
  // Output hoàn toàn static — không cần server, deploy thẳng lên Cloudflare Pages
  output: 'static',

  // Build ra thư mục dist/
  outDir: './dist',

  // Public folder: css, js, data, assets, sw.js, _headers, robots.txt, sitemap.xml
  publicDir: './public',

  // Tắt trailing slash để URL /thi hoạt động như /thi.html
  trailingSlash: 'never',

  build: {
    // Giữ tên file rõ ràng, không hash (để sw.js có thể precache đúng)
    assets: 'assets',
    // Xuất file .html (không dùng directory index để URL /thi?id=... hoạt động tốt)
    format: 'file',
  },

  // Không dùng view transitions để giữ SPA behavior đơn giản
  // (exam.js tự quản lý state, không cần Astro router)
});
