// G4.3 Chromium UI regression: synthetic PDFs only; never store real textbooks or student data.
import { chromium } from '/tmp/gw-browser/node_modules/playwright-core/index.mjs';
const chrome = process.env.GW_CHROME_BIN;
if (!chrome) throw new Error('Chrome binary missing');
const browser = await chromium.launch({executablePath: chrome, headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
const context = await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
const page = await context.newPage();
const errors=[],requests=[];
page.on('pageerror',err=>errors.push(String(err)));
page.on('request',req=>requests.push([req.method(),req.url()]));
try {
  const response=await page.goto('http://127.0.0.1:8765/',{waitUntil:'load',timeout:30000});
  if(!response || response.status()!==200) throw new Error('Local HTTP site unavailable');
  if(await page.locator('#result').isVisible())throw Error('Result visible before clicking');
  await page.locator('#demo').click();
  await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('가상 PDF 시험 성공'),{timeout:30000});
  const progress=await page.locator('#progress').innerText();
  const summary=await page.locator('#summary').innerText();
  if(!progress.includes('2/2문항')) throw Error('Incorrect sample output: '+progress);
  if(!summary.includes('2개')) throw Error('Expected two questions: '+summary);
  if(!await page.locator('#previews').isVisible())throw Error('Preview controls missing');
  await page.locator('#show').click();
  if(!await page.locator('#qcan').evaluate(el=>el.width>10 && el.height>10) ||
     !await page.locator('#acan').evaluate(el=>el.width>10 && el.height>10))
      throw Error('PDF page preview canvas not rendered');
  const downloadPromise=page.waitForEvent('download',{timeout:15000});
  await page.locator('#save').click();
  const downloaded=await downloadPromise;
  const suggested=downloaded.suggestedFilename();
  if(!suggested.includes('검토대기_'))throw Error('Unexpected filename '+suggested);
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('선택해 주세요'),{timeout:8000});
  await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('검사 실패'),{timeout:8000});
  if(await page.locator('#result').isVisible())throw Error('Result must hide on invalid/no files');
  if(errors.length)throw Error('Browser page errors: '+JSON.stringify(errors));
  if(requests.some(([method])=>method!=='GET'))throw Error('Unexpected upload or non-GET request');
  console.log('G4.3 CHROMIUM UI PASS: mobile viewport, synthetic button, 2/2 match, both previews, JSON, reset, invalid-file rejection, no POST.');
} finally {
  await browser.close();
}