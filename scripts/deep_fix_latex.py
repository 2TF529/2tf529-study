import glob, json, re

def deep_fix_file(fpath):
    with open(fpath, 'r', encoding='utf-8') as fp:
        data = json.load(fp)
        
    changed = False
    for q in data.get('questions', []):
        for field in ['content', 'explanation']:
            txt = q.get(field, '')
            if isinstance(txt, str) and '$' in txt:
                # Fix unescaped dollar signs in English / general currency (e.g. $100 -> 100 USD or \$100)
                txt_fixed = re.sub(r'(?<=\s)\$(\d+)', r'\\$\1', txt)
                # Fix unclosed braces in fractions
                txt_fixed = re.sub(r'\\frac\{([^{}]+)\}\{([^{}]+)(?!\})', r'\\frac{\1}{\2}', txt_fixed)
                if txt_fixed != txt:
                    q[field] = txt_fixed
                    changed = True
                    
        opts = q.get('options', [])
        if isinstance(opts, list):
            new_opts = []
            for opt in opts:
                if isinstance(opt, str) and '$' in opt:
                    opt_fixed = re.sub(r'(?<=\s)\$(\d+)', r'\\$\1', opt)
                    if opt_fixed != opt:
                        changed = True
                        opt = opt_fixed
                new_opts.append(opt)
            q['options'] = new_opts
            
    if changed:
        with open(fpath, 'w', encoding='utf-8') as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)
        return True
    return False

fixed_count = 0
for f in glob.glob('data/**/*.json', recursive=True):
    if f.endswith(('index.json', 'explore-index.json', 'stats.json', 'taxonomy.json', 'id-map.json', 'topic-index.json')):
        continue
    if deep_fix_file(f):
        fixed_count += 1

print(f"Deep fixed {fixed_count} additional files.")
