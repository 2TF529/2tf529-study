#!/usr/bin/env python3
"""Split the 10-exam Chemistry 11 CK2 booklet."""
import json,os,subprocess
from pathlib import Path
import fitz
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];SOURCE=Path(os.environ['TELEGRAM_ROOT'])/'Tat_Ca_Cac_File_Chung'
def main():
 src=SOURCE/'10 ĐỀ ÔN CK2 - HÓA 11.pdf'
 if not src.exists():print('SOURCE MISSING');return
 d=fitz.open(src); starts=[0,4,7,11,15,18,21,24,27,31];ends=[4,7,11,15,18,21,24,27,31,35];made=[]
 for no,(start,end) in enumerate(zip(starts,ends),1):
  base=f'2026-hoa-11-on-cuoi-ky-2-de-{no:02d}';out=ROOT/'data/l11/hoa/cuoiki2';target=out/(base+'.json');adir=out/'assets'/base
  if target.exists():continue
  adir.mkdir(parents=True,exist_ok=True);refs=[]
  for j,pi in enumerate(range(start,end),1):
   p=d[pi];pix=p.get_pixmap(matrix=fitz.Matrix(1.6,1.6),alpha=False);im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples);dst=adir/f'trang-{j:02d}.webp';im.save(dst,'WEBP',quality=84,method=6);refs.append(dst.relative_to(ROOT).as_posix())
  qs=[]
  for i in range(1,23):
   ref=refs[min((i-1)*len(refs)//22,len(refs)-1)];content=f'Quan sát **câu {i}** trong trang đề nguyên bản dưới đây:\n<figure class="question-figure"><img src="{ref}" alt="Trang đề Hóa 11 chứa câu {i}" loading="lazy"></figure>'
   if i<=18:q={'id':i,'type':'single','content':content,'options':[f'{x}. Chọn phương án {x} trong hình' for x in 'ABCD'],'answer':None}
   else:q={'id':i,'type':'short_answer','content':content,'answer':None}
   q['note']='Chưa có đáp án';qs.append(q)
  exam={'id':f'l11-hoa-cuoiki2-{base}','grade':'l11','subjectSlug':'hoa','examType':'cuoiki2','year':2026,'code':f'Đề {no:02d}','title':f'Hóa học 11 - Ôn cuối học kỳ 2 năm 2025-2026 - Đề {no:02d}','duration':45,'answerSource':'missing','notes':'Chưa có đáp án. Đề được tách từ bộ 10 đề; nội dung gốc được giữ nguyên.','passages':{},'questions':qs};out.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(exam,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');made.append(target);print('CREATED',target.relative_to(ROOT))
 d.close()
 if all((ROOT/f'data/l11/hoa/cuoiki2/2026-hoa-11-on-cuoi-ky-2-de-{i:02d}.json').exists() for i in range(1,11)):src.unlink();print('DELETED SOURCE',src.name)
 if made:subprocess.run(['python',str(ROOT/'scripts/build_index.py')],cwd=ROOT,check=True)
 print('DONE',len(made))
if __name__=='__main__':main()
