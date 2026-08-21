// sw-register.js — Đăng ký Service Worker + Prefetch JSON tĩnh khi trình duyệt rảnh
// Chiến lược: SW cache shell → prefetch data quan trọng → trang load tức thì từ lần 2+

if ('serviceWorker' in navigator) {
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    // Không reload khi đang ở trang thi — sẽ mất toàn bộ bài làm của học sinh
    if (window.location.pathname.endsWith('thi.html') || window.location.search.includes('practice=1')) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        reg.update();

        // Prefetch các JSON index quan trọng khi browser rảnh
        // Dùng requestIdleCallback để không ảnh hưởng đến render chính
        const prefetchWhenIdle = (urls) => {
          const run = () => {
            urls.forEach((url) => {
              fetch(url, { method: 'GET', credentials: 'same-origin' })
                .catch(() => {}); // Bỏ qua lỗi — SW sẽ cache khi thành công
            });
          };
          if ('requestIdleCallback' in window) {
            requestIdleCallback(run, { timeout: 3000 });
          } else {
            setTimeout(run, 2000);
          }
        };

        // Chỉ prefetch trên trang chủ và explore (nơi cần data nhanh nhất)
        const page = window.location.pathname;
        if (page.endsWith('index.html') || page === '/' || page.endsWith('explore.html')) {
          prefetchWhenIdle([
            './data/stats.json',
            './data/id-map.json',
            './data/explore-index.json',
            './data/taxonomy.json',
          ]);
        } else if (page.endsWith('on-tap.html')) {
          prefetchWhenIdle([
            './data/topic-index.json',
            './data/taxonomy.json',
          ]);
        }
      })
      .catch((err) => {
        // SW đăng ký thất bại — không ảnh hưởng chức năng chính
        void err;
      });
  });
}
