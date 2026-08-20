#!/usr/bin/env python3
"""Replace two incorrectly grouped AECK records with 26 separate exams."""
import json,os,shutil,subprocess
from pathlib import Path
import fitz
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];SOURCE=Path(os.environ['TELEGRAM_ROOT'])/'Tat_Ca_Cac_File_Chung';OUT=ROOT/'data/l12/toan/totnghiep'
def remove_old():
 for base in ['2026-de-on-thi-tnthpt-mon-toan-de-1-15-aeck','2026-de-on-thi-tnthpt-mon-toan-de-16-26-aeck']:
  p=OUT/(base+'.json');a=OUT/'assets'/base
  if p.exists():p.unlink()
  if a.exists():shutil.rmtree(a)
def main():
 configs=[('ĐỀ ÔN THI TNTHPT - MÔN TOÁN - ĐỀ 1-15 AECK.pdf',1,list(range(0,91,6))),('ĐỀ ÔN THI TNTHPT - MÔN TOÁN - ĐỀ 16-26 AECK.pdf',16,[0,6,13,19,25,32,38,45,51,58,64,71])]
 if not all((SOURCE/x[0]).exists() for x in configs):print('SOURCE MISSING');return
 remove_old();made=[]
 for filename,first,bounds in configs:
  src=SOURCE/filename;d=fitz.open(src)
  for j,(start,end) in enumerate(zip(bounds,bounds[1:])):
   no=first+j;base=f'2026-toan-12-on-thi-tot-nghiep-aeck-de-{no:02d}';target=OUT/(base+'.json');adir=OUT/'assets'/base
   adir.mkdir(parents=True,exist_ok=True);refs=[]
   for k,pi in enumerate(range(start,end),1):
    p=d[pi];pix=p.get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False);im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples);dst=adir/f'trang-{k:02d}.webp';im.save(dst,'WEBP',quality=84,method=6);refs.append(dst.relative_to(ROOT).as_posix())
   qs=[]
   for i in range(1,23):
    ref=refs[min((i-1)*len(refs)//22,len(refs)-1)];content=f'Quan sát **câu {i}** trong trang đề nguyên bản dưới đây:\n<figure class="question-figure"><img src="{ref}" alt="Trang đề AECK chứa câu {i}" loading="lazy"></figure>'
    if i<=12:q={'id':i,'type':'single','content':content,'options':[f'{x}. Chọn phương án {x} trong hình' for x in 'ABCD'],'answer':None}
    elif i<=16:q={'id':i,'type':'true_false','content':content,'statements':[f'Ý {x}) trong hình' for x in 'abcd'],'answer':None}
    else:q={'id':i,'type':'short_answer','content':content,'answer':None}
    q['note']='Chưa có đáp án';qs.append(q)
   exam={'id':f'l12-toan-totnghiep-{base}','grade':'l12','subjectSlug':'toan','examType':'totnghiep','year':2026,'code':f'Đề {no:02d}','title':f'Toán 12 - Ôn thi tốt nghiệp THPT 2026 - AECK đề {no:02d}','duration':90,'answerSource':'missing','notes':'Chưa có đáp án. Đề được tách chính xác từ bộ AECK.','passages':{},'questions':qs};target.write_text(json.dumps(exam,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');made.append(target);print('CREATED',target.relative_to(ROOT))
  d.close();src.unlink();print('DELETED SOURCE',filename)
 subprocess.run(['python',str(ROOT/'scripts/build_index.py')],cwd=ROOT,check=True);print('DONE',len(made))
if __name__=='__main__':main()
