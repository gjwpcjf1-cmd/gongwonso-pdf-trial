// Tests only self-contained synthetic samples; not real textbooks or student data.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const m=html.match(/const SAMPLE_PDF=\{problem:'([^']+)',answer:'([^']+)'\};/);
if(!m)throw Error('Synthetic PDFs missing from public trial page');
const p=path.join('/tmp/gw-pdfjs/node_modules/pdfjs-dist/build/pdf.min.mjs');
const lib=await import(pathToFileURL(p).href);
const out=[];
for(const [label,raw] of [['문제',m[1]],['해설',m[2]]]){
 const bytes=Buffer.from(raw,'base64');
 const pdf=await lib.getDocument({data:new Uint8Array(bytes),stopAtErrors:true,isEvalSupported:false}).promise;
 if(pdf.numPages!==1)throw Error(`Expected 1 page, got ${pdf.numPages}`);
 const page=await pdf.getPage(1);
 const viewport=page.getViewport({scale:1});
 const rawItems=(await page.getTextContent()).items;
 // Reproduce live row grouping, headings, and nearby ID matching from G4.
 const groups=[[],[]];
 for(const item of rawItems){
  const value=String(item.str||'').trim();if(!value)continue;
  const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
  const col=x<viewport.width/2?0:1;let row=groups[col].find(r=>Math.abs(r.y-y)<=6.4);
  if(!row){row={y,parts:[],col};groups[col].push(row)}
  row.parts.push({x,str:value});
 }
 const rows=groups.flatMap(a=>a.map(r=>({...r,text:r.parts.sort((a,b)=>a.x-b.x).map(t=>t.str).join(' ')})));
 const found=[];
 for(const row of rows){const h=row.text.match(/(?:^|[^\d])(\d{1,3})\s*번\s*(문제|해설)/);
  if(!h||h[2]!==label)continue;
  const ids=rows.filter(r=>r.col===row.col&&Math.abs(r.y-row.y)<=20)
    .flatMap(r=>[...r.text.matchAll(/(?<!\d)\d{6}(?!\d)/g)].map(m=>m[0]));
  const uniq=[...new Set(ids)];
  if(uniq.length!==1)throw Error(`ID not unique in ${label} #${h[1]}: ${uniq}`);
  found.push([Number(h[1]),uniq[0]]);
 }
 found.sort((a,b)=>a[0]-b[0]);
 if(JSON.stringify(found)!==JSON.stringify([[1,'111111'],[2,'222222']])){
  throw Error(`${label} expected 2 IDs, got ${JSON.stringify(found)}`)
 }
 out.push({kind:label,pages:pdf.numPages,matched:found.length,ids:found.map(a=>a[1])});
 pdf.destroy();
}
console.log('G4.2 PDF.js REAL PARSE PASS (only synthetic fixtures)',JSON.stringify(out));
