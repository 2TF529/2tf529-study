import os, glob, json

NON_EXAM_PATTERNS = [
    've-do-thi-online',
    've-bang-bien-thien-online',
    've-hinh-tron-xoay-online',
    'ke-hoach-giao-duc',
    'ke-hoach-day-hoc',
    'ke-hoach-chuyen-mon',
    'tang-kem-thi-nghiem',
    'giao-an-stem'
]

def clean_and_deduplicate():
    all_files = glob.glob('data/**/*.json', recursive=True)
    seen_ids = {}
    deleted = 0
    
    for p in all_files:
        p_rel = p.replace('\\', '/')
        if p_rel in ('data/taxonomy.json', 'data/index.json', 'data/topic-index.json', 'data/stats.json', 'data/id-map.json'):
            continue
            
        fname = os.path.basename(p_rel)
        if any(pat in fname for pat in NON_EXAM_PATTERNS):
            try:
                os.remove(p)
                deleted += 1
            except:
                pass
            continue
            
        try:
            with open(p, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            try:
                os.remove(p)
                deleted += 1
            except:
                pass
            continue
            
        if not isinstance(data, dict):
            continue
            
        exam_id = data.get('id')
        if not exam_id:
            try:
                os.remove(p)
                deleted += 1
            except:
                pass
            continue
            
        if exam_id in seen_ids:
            try:
                os.remove(p)
                deleted += 1
            except:
                pass
        else:
            seen_ids[exam_id] = p
            
    print(f"Cleaned {deleted} files. Total valid exams: {len(seen_ids)}")

if __name__ == '__main__':
    clean_and_deduplicate()
