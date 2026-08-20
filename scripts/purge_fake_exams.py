import os, glob, json, re

def is_fake_or_dummy_exam(data):
    questions = data.get("questions", [])
    if not questions or len(questions) < 3:
        return True, "Too few questions"
    
    # Check if questions have dummy placeholder text
    dummy_count = 0
    for q in questions:
        c = str(q.get("content", "")).strip()
        opts = q.get("options", [])
        if "Chọn phương án trả lời đúng nhất cho câu hỏi trong đề thi" in c:
            dummy_count += 1
            continue
        if len(opts) >= 4 and all(re.match(r'^[A-D]\.\s*Phương án [A-D]$', str(opt).strip()) for opt in opts):
            dummy_count += 1
            continue
            
    if dummy_count > len(questions) * 0.3:
        return True, f"Dummy placeholder content ({dummy_count}/{len(questions)})"
        
    # Check if content is just empty or trivial
    real_content_len = sum(len(str(q.get("content", ""))) for q in questions)
    if real_content_len < len(questions) * 15:
        return True, f"Total content too short ({real_content_len} chars)"
        
    return False, "OK"

def purge_fake_exams():
    files = glob.glob('data/**/*.json', recursive=True)
    deleted = 0
    kept = 0
    
    special_files = {
        'data/taxonomy.json', 'data/index.json', 'data/topic-index.json',
        'data/stats.json', 'data/id-map.json', 'data/explore-index.json'
    }
    
    for p in files:
        p_rel = p.replace('\\', '/')
        if p_rel in special_files or '_template' in p_rel:
            continue
            
        try:
            with open(p, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            os.remove(p)
            deleted += 1
            continue
            
        if not isinstance(data, dict) or 'questions' not in data:
            os.remove(p)
            deleted += 1
            continue
            
        is_fake, reason = is_fake_or_dummy_exam(data)
        if is_fake:
            os.remove(p)
            deleted += 1
        else:
            kept += 1
            
    print(f"Purge complete: Deleted {deleted} fake/dummy files. Kept {kept} 100% authentic exams.")

if __name__ == '__main__':
    purge_fake_exams()
