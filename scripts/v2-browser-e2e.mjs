// V2 real Chromium / real IndexedDB + SHA-256 E2E on generated synthetic PDFs only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from '/tmp/gw-browser/node_modules/playwright-core/index.mjs';
const chrome=process.env.GW_CHROME_BIN;
if(!chrome)throw Error('CHROME_MISSING');
const full=process.env.GW_V2_FULLSCALE==='1';
const root=process.env.GW_V2_FIXTURE_ROOT||'/tmp/gw-v2-fixtures';
const base=process.env.GW_V2_TEST_URL||'http://127.0.0.1:8765/pdf-classroom-v2/index.html';
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const notes=[],errors=[];
function note(s){notes.push(s);console.log('V2_E2E_PASS',s)}
async function open(){
 const cx=await browser.newContext({acceptDownloads:true}),p=await cx.newPage();
 p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.accept());
 const resp=await p.goto(base,{waitUntil:'load',timeout:45000});
 assert.equal(resp?.status(),200);
 await p.waitForFunction(()=>window.__G7_READY===true,{timeout:45000});
 assert.equal(await p.evaluate(()=>!!indexedDB&&!!crypto.subtle),true);
 return {cx,p};
}
async function counts(p){
 return p.evaluate(async()=>{
 const r=indexedDB.open('G7_PDF_DIRECT_TEACHER_V2',1);
 const db=await new Promise((ok,bad)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
 return Object.fromEntries(await Promise.all(['sets','files','tasks'].map(n=>new Promise((ok,bad)=>{
 const q=db.transaction(n,'readonly').objectStore(n).count();
 q.onsuccess=()=>ok([n,q.result]);q.onerror=()=>bad(q.error);
 }))));
 });
}
async function upload(p,g,u,s){
 await p.locator('[data-tab="books"]').click();
 await p.locator('#semester').selectOption(s==null?'NONE':String(s));
 await p.locator('#grade').selectOption('M'+g);
 for(const [id,k] of [['qfile','문'],['afile','답']]){
  const name='중'+g+'.'+u+'.'+k+'.pdf';
  await p.locator('#'+id).setInputFiles({name,mimeType:'application/pdf',buffer:fs.readFileSync(path.join(root,name))});
 }
 await p.locator('#register').click();
 await p.waitForFunction(()=>!document.querySelector('#register').disabled&&!document.querySelector('#busy').classList.contains('show')&&/등록 성공|등록 보류|이미 등록/.test(document.querySelector('#status')?.textContent||''),null,{timeout:full?240000:90000});
 const status=await p.locator('#status').innerText();
 assert.match(status,/등록 성공|이미 등록/,'PDF import: '+status);
 return status;
}
async function inspectFull(p,g,u,semester){
 const setKey='M'+g+'_S'+(semester==null?0:semester)+'_U'+u+'_P1';
 const want={1:176,2:174,3:122}[g];
 return p.evaluate(async({setKey,want})=>{
   const op=indexedDB.open('G7_PDF_DIRECT_TEACHER_V2',1);
   const db=await new Promise((resolve,reject)=>{op.onsuccess=()=>resolve(op.result);op.onerror=()=>reject(op.error)});
   const get=(store,key)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
   });
   const sets=await new Promise((resolve,reject)=>{
     const r=db.transaction('sets','readonly').objectStore('sets').getAll();
     r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
   });
   const x=sets.find(v=>v.setKey===setKey);
   if(!x||x.count!==want||x.items.length!==want)throw Error('FULL_SET_COUNT_MISMATCH '+setKey+' '+x?.count);
   if(x.items.some((it,k)=>it.number!==k+1||!/^[0-9]{5,6}$/.test(it.originalId)||it.problemBox.length!==4||it.answerBox.length!==4||it.problemPage<1||it.answerPage<1))throw Error('FULL_ITEM_INDEX_INTEGRITY');
   if(new Set(x.items.map(it=>it.originalId)).size!==want)throw Error('DUPLICATE_SOURCE_IDS');
   for(const [suffix,hash] of [['q',x.qhash],['a',x.ahash]]){
    const f=await get('files',x.id+':'+suffix);
    if(!(f?.bytes instanceof Uint8Array))throw Error('PDF_FILE_BYTES_NOT_PERSISTED');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',f.bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==hash)throw Error('PERSISTED_PDF_SHA_MISMATCH_'+suffix);
   }
   return {count:x.count,qpages:x.qpages,apages:x.apages};
 },{setKey,want});
}
try{
 const {cx,p}=await open();
 note('Browser origin and native IndexedDB/SHA-256 initialized');
 for(const [g,u,s] of [[1,3,1],[2,4,2],[3,5,null]]){
  await upload(p,g,u,s);
  assert.deepEqual(await counts(p),{sets:g,files:g*2,tasks:0});
  if(full){
   const result=await inspectFull(p,g,u,s);
   note('M'+g+' full-scale '+result.count+' items with 2'+String.fromCharCode(215)+result.count+' SHA-linked PDFs validated');
  } else note('M'+g+' synthetic PDF pair saved');
 }

 if(full){
  await p.locator('[data-tab="view"]').click();
  await p.locator('#showAnswer').check();
  for(const [g,u,s] of [[1,3,1],[2,4,2],[3,5,null]]){
   const key='M'+g+'_S'+(s??0)+'_U'+u+'_P1';
   const id=await p.locator('#viewerSet option').evaluateAll((all,k)=>all.find(x=>x.textContent.includes(k))?.value,key);
   assert(id,'MISSING_VIEWER_SET '+key);
   await p.locator('#viewerSet').selectOption(id);
   const count={1:176,2:174,3:122}[g];
   for(const n of [1,Math.floor(count/2),count]){
    await p.evaluate(()=>{document.querySelector('#qpage').textContent='QA_PENDING';document.querySelector('#apage').textContent='QA_PENDING'});
    await p.locator('#numberNav button[data-n="'+n+'"]').click();
    await p.waitForFunction(()=>['qpage','apage'].every(id=>/쪽 원본 일부/.test(document.getElementById(id)?.textContent||'')),null,{timeout:60000});
    const stat=await p.evaluate(()=>['questionCanvas','answerCanvas'].map(id=>{
     const c=document.getElementById(id),ctx=c.getContext('2d');
     if(c.width<40||c.height<25)return {id,width:c.width,height:c.height,unique:0};
     const d=ctx.getImageData(0,0,c.width,c.height).data;
     const colors=new Set();
     const step=Math.max(1,Math.floor(c.width*c.height/7000));
     for(let j=0;j<c.width*c.height;j+=step)colors.add(d[j*4]+','+d[j*4+1]+','+d[j*4+2]);
     return {id,width:c.width,height:c.height,unique:colors.size};
    }));
    for(const x of stat)assert(x.unique>=8,'BLANK_OR_STALE_CROP '+key+' #'+n+' '+JSON.stringify(x));
   }
   note('M'+g+' first/middle/last actual canvas crops rendered for both problem and solution');
  }
 }
 await p.reload({waitUntil:'load'});await p.waitForFunction(()=>window.__G7_READY===true);
 assert.deepEqual(await counts(p),{sets:3,files:6,tasks:0});
 note('Three sets survive browser reload');
 const dupe=await upload(p,1,3,1);
 assert.match(dupe,/이미 등록/);
 assert.deepEqual(await counts(p),{sets:3,files:6,tasks:0});
 note('Duplicate PDF rejected without new records');
 await p.locator('[data-tab="tasks"]').click();
 const m1=await p.locator('#taskSet option').evaluateAll(a=>a.find(x=>x.textContent.includes('M1_S1_U3_P1'))?.value);
 assert(m1);
 await p.locator('#taskSet').selectOption(m1);
 await p.locator('#student').fill('TEST-A');
 await p.locator('#week').selectOption('1');
 await p.locator('#taskNumbers button[data-n="1"]').click();
 await p.locator('#makeTask').click();
 await p.waitForFunction(()=>document.querySelectorAll('#taskList button[data-task]').length>0);
 assert.equal((await counts(p)).tasks,1);
 note('TEST-A assignment');
 await p.locator('#taskList button[data-task][data-num="1"]').first().click();
 await p.locator('#taskList button[data-task][data-num="1"]').first().click();
 assert.match(await p.locator('#taskList').innerText(),/오답/);
 note('Wrong grading');
 await p.locator('[data-tab="next"]').click();
 await p.locator('#nextStudent').selectOption('TEST-A');
 assert.match(await p.locator('#nextResult').innerText(),/1문항 복습 필요/);
 await p.locator('#createReviewTask').click();
 await p.waitForFunction(()=>document.querySelectorAll('#taskList button[data-task]').length>=2);
 assert.equal((await counts(p)).tasks,2);
 note('Next lesson review task');
 await p.locator('#taskList .task').filter({hasText:'(복습)'}).locator('button[data-task][data-num="1"]').click();
 await p.locator('[data-tab="next"]').click();
 assert.match(await p.locator('#nextResult').innerText(),/미해결 오답·미풀이가 없습니다/);
 note('Correct review closes unresolved queue');
 await p.locator('[data-tab="reports"]').click();
 await p.locator('#reportStudent').selectOption('TEST-A');
 await p.locator('#reportWeek').selectOption('1');
 await p.locator('#makeReport').click();
 assert.match(await p.locator('#reportText').inputValue(),/오답: 1개/);
 note('Weekly report reuses grading history');
 await p.locator('[data-tab="backup"]').click();
 const promise=p.waitForEvent('download',{timeout:50000});
 await p.locator('#exportBackup').click();
 const dl=await promise;
 const backup=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
 assert.equal(backup.sets.length,3);
 assert.equal(backup.files.length,6);
 assert.equal(backup.tasks.length,2);
 note('Complete PDF inclusive JSON backup');
 await p.locator('#importBackup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await p.waitForFunction(()=>document.querySelector('#backupStatus')?.textContent.includes('복원 중단'),{timeout:50000});
 assert.deepEqual(await counts(p),{sets:3,files:6,tasks:2});
 note('Nonempty profile restore blocked');
 await p.reload({waitUntil:'load'});await p.waitForFunction(()=>window.__G7_READY===true);
 assert.deepEqual(await counts(p),{sets:3,files:6,tasks:2});
 note('Task data persisted after reload');
 await cx.close();
 const fresh=await open();
 assert.deepEqual(await counts(fresh.p),{sets:0,files:0,tasks:0});
 await fresh.p.locator('[data-tab="backup"]').click();
 await fresh.p.locator('#importBackup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await fresh.p.waitForFunction(()=>document.querySelector('#backupStatus')?.textContent.includes('전체 복원 완료'),{timeout:55000});
 assert.deepEqual(await counts(fresh.p),{sets:3,files:6,tasks:2});
 note('Empty profile fully restores PDFs and tasks');
 await fresh.cx.close();
 const bad=structuredClone(backup);
 bad.files[0].base64='X'+bad.files[0].base64.slice(1);
 const isolated=await open();
 await isolated.p.locator('[data-tab="backup"]').click();
 await isolated.p.locator('#importBackup').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
 await isolated.p.waitForFunction(()=>document.querySelector('#backupStatus')?.textContent.includes('복원 중단'),{timeout:50000});
 assert.deepEqual(await counts(isolated.p),{sets:0,files:0,tasks:0});
 note('Corrupted backup rejected before any write');
 await isolated.cx.close();
 assert.deepEqual(errors,[]);
 console.log('V2_CHROMIUM_REAL_STORAGE_E2E_PASS',JSON.stringify({checks:notes.length,syntheticPDFOnly:true,fullScale:full,expectedItems:full?472:6}));
}catch(e){
 console.error('V2_CHROMIUM_REAL_STORAGE_E2E_FAIL',e.stack||String(e));
 process.exitCode=1;
}finally{await browser.close()}
