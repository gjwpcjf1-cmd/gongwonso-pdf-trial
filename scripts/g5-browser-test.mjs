/** Public G5 mock browser regression. Synthetic codes ONLY. */
import { chromium } from '/tmp/gw-browser/node_modules/playwright-core/index.mjs';
const chrome=process.env.GW_CHROME_BIN;
if(!chrome)throw Error('No chrome');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const p=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
const errors=[],traffic=[];
p.on('pageerror',x=>errors.push(String(x)));
p.on('request',req=>traffic.push({method:req.method(),url:req.url()}));
try{
 await p.goto('http://127.0.0.1:8765/coach-demo.html',{waitUntil:'load',timeout:30000});
 if(!(await p.locator('#status').innerText()).includes('시작 전'))throw Error('Initial state bad');
 await p.locator('#scenario').click();
 const txt=await p.locator('#status').innerText();
 if(!txt.includes('G5 통합 가상 시나리오 성공'))throw Error('Scenario failed '+txt);
 if((await p.locator('#queueCount').innerText())!=='2')throw Error('Week3 unresolved queue not 2');
 if((await p.locator('#assignedCount').innerText())!=='2')throw Error('Expected 2 week assignments');
 const q=await p.locator('#queueView').innerText();
 if(!q.includes('3번')||!q.includes('6번')||q.includes('2번'))throw Error('Bad queue '+q);
 await p.locator('#week').selectOption('1');
 if(!(await p.locator('#reportState').innerText()).includes('READY'))throw Error('Prior-week report invalidated unexpectedly');
 if(await p.locator('#copy').isDisabled())throw Error('Approved week1 report not copyable');
 await p.locator('#week').selectOption('2');
 if(!(await p.locator('#reportState').innerText()).includes('READY'))throw Error('Week2 report not ready');
 await p.locator('#reset').click();
 if((await p.locator('#assignedCount').innerText())!=='0')throw Error('Reset did not clear');
 if(!(await p.locator('#reportState').innerText()).includes('NO_APPROVED_LESSON'))throw Error('Reset report guard');
 await p.locator('#approve').click();
 if(!(await p.locator('#status').innerText()).includes('안전 차단'))throw Error('Unsafe report approval allowed');
 if(traffic.some(x=>x.method!=='GET'))throw Error('Network writes observed '+JSON.stringify(traffic));
 if(errors.length)throw Error('Browser JS errors '+errors.join(','));
 console.log('G5 CHROMIUM MOBILE PASS: synthetic G3->V6.5-like 2wk course, week3 queue 3+6, week1+2 report approved, reset, no unauthorised approval, no network writes');
}finally{await browser.close()}
