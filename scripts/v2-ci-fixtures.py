#!/usr/bin/env python3
"""CI-only synthetic PDF generator; uses no copyrighted source or student data."""
import io, os, struct, sys, zlib
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from PIL import Image
import random
out=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/gw-v2-fixtures')
out.mkdir(parents=True,exist_ok=True)
fonts=['/usr/share/fonts/truetype/nanum/NanumGothic.ttf','/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf','/usr/share/fonts/truetype/baekmuk/gulim.ttf']
font=next((p for p in fonts if os.path.isfile(p)),None)
if not font: raise SystemExit('MISSING_HANGUL_FONT')
pdfmetrics.registerFont(TTFont('FixtureHangul',font))
w,h=120,70
raw=b''.join(b'\x00'+bytes(c for x in range(w) for c in ((220 if x//10%2 else 190),(100+y)%255,(70+x//4)%255)) for y in range(h))
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
img=ImageReader(io.BytesIO(png))
full = '--full' in sys.argv
for grade,unit,semester in [(1,3,1),(2,4,2),(3,5,None)]:
 count={1:176,2:174,3:122}[grade] if full else 2
 for kind in ('문','답'):
  p=out/('중%d.%d.%s.pdf'%(grade,unit,kind))
  c=canvas.Canvas(str(p),pagesize=(595,842),pageCompression=1)
  title=('중%d %d학기 %d단원 연습'%(grade,semester,unit)) if semester else ('중%d %d단원 학기 구분 없음'%(grade,unit))
  for page_index in range((count+1)//2):
   if full:
    noise=random.Random(grade*100000+page_index*2+(1 if kind=='답' else 0)).randbytes(125*100*3)
    pageimg=ImageReader(Image.frombytes('RGB',(125,100),noise))
   else:
    pageimg=img
   if page_index==0:
    c.setFont('FixtureHangul',15)
    c.drawString(63,808,title)
   for offset,y in [(0,740),(1,440)]:
    n=page_index*2+offset+1
    if n>count: break
    c.setFont('FixtureHangul',12)
    c.drawString(63,y,str(n)+'번 '+('문제' if kind=='문' else '해설'))
    c.setFont('FixtureHangul',10)
    c.drawString(170,y,('%d%05d'%(grade,n)))
    c.drawImage(pageimg,63,y-120,width=214,height=95)
   c.showPage()
  c.save()
  print(p.name,p.stat().st_size,'items=',count)
