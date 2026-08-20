#!/usr/bin/env python3
"""Split the two five-exam math booklets at their known exam/solution pages."""
import json,os,re,subprocess,unicodedata
from pathlib import Path
import fitz
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];SOURCE=Path(os.environ['TELEGRAM_ROOT'])/'Tat_Ca_Cac_File_Chung'
def plain(s):return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn').lower().replace('đ','d')
def main():
 made=[]
 configs=[('5 ĐỀ ÔN GK2 - TOÁN 10.pdf','l10',[0,10,19,30,39],[3,13,22,33,42]),('5 ĐỀ ÔN GK2 - TOÁN 12.pdf','l12',[0,11,24,37,50],[4,15,28,41,54])]
 for filename,grade,starts,ends in configs:
  src=SOURCE/filename
  if not src.exists():continue
  d=fitz.open(src)
  for no,(start,end) in enumerate(zip(starts,ends),1):
   base=f'2026-toan-{grade[1:]}-on-gk2-bo-5-de-de-{no:02d}';out=ROOT/'data'/grade/'toan'/'giuaki2';target=out/(base+'.json');adir=out/'assets'/base
   if target.exists():continue
   adir.mkdir(parents=True,exist_ok=True);refs=[]
   for j,pi in enumerate(range(start,end),1):
    p=d[pi];pix=p.get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False);im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples);dst=adir/f'trang-{j:02d}.webp';im.save(dst,'WEBP',quality=84,method=6);refs.append(dst.relative_to(ROOT).as_posix())
   qs=[]
   for i in range(1,23):
    ref=refs[min((i-1)*len(refs)//22,len(refs)-1)];content=f'Quan sát **câu {i}** trong trang đề nguyên bản dưới đây:\n<figure class="question-figure"><img src="{ref}" alt="Trang đề chứa câu {i}" loading="lazy"></figure>'
    if i<=12:q={'id':i,'type':'single','content':content,'options':[f'{x}. Chọn phương án {x} trong hình' for x in 'ABCD'],'answer':None}
    elif i<=16:q={'id':i,'type':'true_false','content':content,'statements':[f'Ý {x}) trong hình' for x in 'abcd'],'answer':None}
    else:q={'id':i,'type':'short_answer','content':content,'answer':None}
    q['note']='Chưa có đáp án';qs.append(q)
   title=f'Toán {grade[1:]} - Ôn giữa học kỳ 2 năm 2025-2026 - Đề {no:02d}'
   exam={'id':f'{grade}-toan-giuaki2-{base}','grade':grade,'subjectSlug':'toan','examType':'giuaki2','year':2026,'code':f'Đề {no:02d}','title':title,'duration':90,'answerSource':'missing','notes':'Chưa có đáp án. Đề được tách từ bộ 5 đề; công thức và hình giữ nguyên từ PDF.','passages':{},'questions':qs};out.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(exam,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');made.append(target);print('CREATED',target.relative_to(ROOT))
  d.close()
  # Every expected output must exist before deleting the bundle.
  if all((ROOT/'data'/grade/'toan'/'giuaki2'/f'2026-toan-{grade[1:]}-on-gk2-bo-5-de-de-{i:02d}.json').exists() for i in range(1,6)):src.unlink();print('DELETED SOURCE',filename)
 if made:subprocess.run(['python',str(ROOT/'scripts/build_index.py')],cwd=ROOT,check=True)
 print('DONE',len(made))
if __name__=='__main__':main()
