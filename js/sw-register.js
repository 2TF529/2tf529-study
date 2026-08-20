// Đăng ký Service Worker (lần sau vào web nhanh hơn nhờ cache)
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    // Không reload khi đang ở trang thi — sẽ mất toàn bộ bài làm của học sinh
    if (window.location.pathname.endsWith("thi.html") || window.location.search.includes("practice=1")) {
      console.warn("SW updated, nhưng không reload vì đang ở trang thi.");
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => registration.update())
      .catch((err) => {
        console.warn("SW register failed:", err);
      });
  });
}
