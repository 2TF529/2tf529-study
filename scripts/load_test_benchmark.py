import urllib.request
import ssl
import time
import statistics
import random
from concurrent.futures import ThreadPoolExecutor

BASE_URL = "https://2tf529.id.vn"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

ENDPOINTS = [
    ("/", "Trang chủ"),
    ("/explore.html", "Trang tìm đề"),
    ("/on-tap.html", "Trang ôn tập"),
    ("/css/style.css?v=20260821-1", "CSS Giao diện"),
    ("/js/theme.js?v=20260821-1", "JS Theme"),
    ("/js/explore.js?v=20260821-1", "JS Explore"),
    ("/data/stats.json", "Dữ liệu thống kê"),
    ("/data/id-map.json", "Bản đồ tra cứu đề"),
    ("/data/explore-index.json", "Chỉ mục tìm kiếm 9.6k đề"),
    ("/data/topic-index.json", "Chỉ mục ôn tập"),
    ("/data/taxonomy.json", "Danh mục môn/lớp")
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15"
]

def make_request(item_id):
    path, label = random.choice(ENDPOINTS)
    url = f"{BASE_URL}{path}"
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json,*/*",
        "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
        "Connection": "keep-alive"
    }
    req = urllib.request.Request(url, headers=headers)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
            data = resp.read()
            elapsed_ms = (time.perf_counter() - t0) * 1000
            cache = resp.headers.get("cf-cache-status", "NONE")
            return {
                "status": resp.status,
                "elapsed": elapsed_ms,
                "bytes": len(data),
                "cache": cache,
                "label": label,
                "url": path
            }
    except urllib.error.HTTPError as e:
        return {
            "status": e.code,
            "elapsed": (time.perf_counter() - t0) * 1000,
            "bytes": 0,
            "cache": e.headers.get("cf-cache-status", "ERROR"),
            "label": label,
            "url": path
        }
    except Exception as e:
        return {
            "status": 0,
            "elapsed": (time.perf_counter() - t0) * 1000,
            "bytes": 0,
            "cache": "CONN_ERR",
            "label": label,
            "url": path
        }

def run_stress_test(workers=30, total_requests=150):
    print(f"=== BẮT ĐẦU TEST TẢI (Concurrency: {workers} luồng | Tổng requests: {total_requests}) ===")
    
    start_time = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(make_request, range(total_requests)))
    total_time = time.perf_counter() - start_time
    
    status_200 = sum(1 for r in results if r["status"] == 200)
    errors = sum(1 for r in results if r["status"] != 200)
    cache_hits = sum(1 for r in results if r["cache"] == "HIT")
    latencies = [r["elapsed"] for r in results if r["status"] == 200]
    total_bytes = sum(r["bytes"] for r in results)
    
    rps = len(results) / total_time if total_time > 0 else 0
    
    print("\n" + "="*55)
    print("        KẾT QUẢ KIỂM THỬ SỨC CHỊU TẢI (2tf529.id.vn)")
    print("="*55)
    print(f"⏱️ Tổng thời gian chạy     : {total_time:.2f} giây")
    print(f"🚀 Tốc độ xử lý (RPS)      : {rps:.1f} req/s")
    print(f"✅ Thành công (200 OK)     : {status_200}/{len(results)} ({status_200/len(results)*100:.1f}%)")
    print(f"❌ Lỗi / Thất bại         : {errors}/{len(results)}")
    print(f"⚡ Tỷ lệ Cache Hit (CF)    : {cache_hits}/{len(results)} ({cache_hits/len(results)*100:.1f}%)")
    print(f"📦 Tổng dữ liệu truyền tải: {total_bytes / (1024*1024):.2f} MB")
    
    if latencies:
        print("\n--- PHÂN PHỐI THỜI GIAN PHẢN HỒI (LATENCY) ---")
        print(f"⚡ Nhanh nhất (Min)       : {min(latencies):.1f} ms")
        print(f"📊 Trung bình (Mean)      : {statistics.mean(latencies):.1f} ms")
        print(f"🎯 Trung vị (P50)         : {statistics.median(latencies):.1f} ms")
        sorted_lat = sorted(latencies)
        print(f"📈 90% người dùng (P90)   : {sorted_lat[int(len(sorted_lat)*0.9)]:.1f} ms")
        print(f"🔥 99% người dùng (P99)   : {sorted_lat[int(len(sorted_lat)*0.99)]:.1f} ms")
        print(f"⏳ Chậm nhất (Max)        : {max(latencies):.1f} ms")
    print("="*55)

if __name__ == "__main__":
    import sys
    w = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 150
    run_stress_test(w, n)
