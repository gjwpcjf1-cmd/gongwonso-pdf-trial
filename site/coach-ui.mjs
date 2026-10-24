import * as C from './coach-core.mjs';
const G=globalThis.GW3_FREE_CATALOG_BRIDGE;
const $=id=>document.getElementById(id);
let s=C.beginDemo(G);
function message(t,err=false){$('status').textContent=t;$('status').className='output'+(err?' error':'')}
function step(fn){try{const result=fn();refresh();return result;}catch(e){message('안전 차단: '+(e?.message||e),true);return null}}
function valueWeek(){return Number($('week').value)}
function addCheckbox(container,n,checked=false,cls=''){const label=document.createElement('label');label.className='check';const c=document.createElement('input');c.type='checkbox';c.value=String(n);c.className=cls;c.checked=checked;const text=document.createElement('span');text.textContent=n+'번';label.append(c,text);container.append(label)}
function selectNumbers(root,cls){return [...root.querySelectorAll('input.'+cls+':checked')].map(x=>Number(x.value))}
function createChoiceControls(){const p=$('assignChoices');p.replaceChildren();for(let n=1;n<=6;n++)addCheckbox(p,n,n<=4,'assignNum')}
function renderTask(){const week=valueWeek(),t=s.tasks[week];$('taskState').textContent=t?`${t.bookLabel} · ${t.items.length}문항 · 가상 학생 ${s.studentId} · 서버 저장 없음`:'이번 주차에는 아직 과제를 배정하지 않았습니다.';
const root=$('selfChecks');root.replaceChildren();if(!t){root.textContent='먼저 과제를 배정하세요.';return}
const sub=s.submissions[week];for(const it of t.items){const wrap=document.createElement('div');wrap.className='answerrow';const x=document.createElement('b');x.textContent=it.label+'번';const sel=document.createElement('select');sel.className='selfChoice';sel.dataset.id=it.id;for(const [v,label]of [['correct','맞음'],['wrong','틀림'],['skipped','미풀이']]){const o=document.createElement('option');o.value=v;o.textContent=label;sel.append(o)}sel.value=sub?.wrong.includes(it.id)?'wrong':sub?.skipped.includes(it.id)?'skipped':'correct';wrap.append(x,sel);root.append(wrap)}
$('selfStatus').textContent=sub?`자가채점 제출 ${sub.revision}차 · 오답 ${sub.wrong.length}개 · 미풀이 ${sub.skipped.length}개`:'자가채점 미제출';}
function renderReps(){const week=valueWeek(),t=s.tasks[week],sub=s.submissions[week],root=$('representativeChoices');root.replaceChildren();if(!t||!sub){root.textContent='자가채점 후 틀린 문제 중에서 선택하세요.';return}
if(!sub.wrong.length){root.textContent='자가채점 오답 0개 (대표오답 없음)';return}
for(const it of t.items.filter(x=>sub.wrong.includes(x.id)))addCheckbox(root,Number(it.label),!!s.reviews[week]?.reps.includes(it.id),'repNum');$('reviewStatus').textContent=s.reviews[week]?'교사 대표오답 확인됨 · 다음 주 복습 대기열에 반영':'교사 확인 전 · 다음 주 복습 후보 0개';}
function renderQueue(){const week=valueWeek(),open=C.queue(s,week),root=$('queueView');root.replaceChildren();if(!open.length){root.textContent=week===1?'1주차에는 이전 주차의 오답이 없습니다.':'재확인 후보 0개. 대표오답 미확인 또는 모두 완료 상태입니다.';return}
for(const item of open){const wrap=document.createElement('div');wrap.className='answerrow';const title=document.createElement('div');title.textContent=`${item.number}번 (이전 ${item.week}주차)`;const sel=document.createElement('select');sel.className='recheckChoice';sel.dataset.id=item.id;for(const [v,l]of [['hold','아직 확인 전'],['완료','재풀이·설명 확인 완료'],['복습필요','재풀이 후 복습 필요']]){const o=document.createElement('option');o.value=v;o.textContent=l;sel.append(o)}wrap.append(title,sel);root.append(wrap)}
}
function renderReport(){const r=C.report(s,valueWeek());$('reportState').textContent=`상태: ${r.status} · 배정 ${r.totals.assigned}문항 · 오답 ${r.totals.wrong}문항 · 미풀이 ${r.totals.skipped}문항 · 교사확인 ${r.totals.verifiedReps}문항`;
$('reportText').textContent=r.text;$('copy').disabled=!r.ready;
$('queueCount').textContent=C.queue(s,valueWeek()).length;
$('assignedCount').textContent=Object.keys(s.tasks).length;
}
function refresh(){renderTask();renderReps();renderQueue();renderReport()}
$('assign').addEventListener('click',()=>step(()=>{const numbers=selectNumbers($('assignChoices'),'assignNum');C.assign(s,G,valueWeek(),numbers);message(`${valueWeek()}주차 과제 ${numbers.length}문항 배정 미리보기 완료 (가상)`)}));
$('submit').addEventListener('click',()=>step(()=>{const t=s.tasks[valueWeek()];if(!t)throw Error('과제부터 배정하세요');const wrong=[],skipped=[];for(const x of document.querySelectorAll('.selfChoice')){const number=Number(t.items.find(t=>t.id===x.dataset.id).label);if(x.value==='wrong')wrong.push(number);if(x.value==='skipped')skipped.push(number)}const a=C.submit(s,valueWeek(),wrong,skipped);message(`자가채점 ${a.revision}차 저장(가상) · 오답 ${a.wrong} / 미풀이 ${a.skipped}`)}));
$('review').addEventListener('click',()=>step(()=>{const r=selectNumbers($('representativeChoices'),'repNum');C.review(s,valueWeek(),r);message(`교사가 대표오답 ${r.length}개 확인(가상) · 다음 주 자동 재출제 준비`)}));
$('recheck').addEventListener('click',()=>step(()=>{let n=0;for(const el of document.querySelectorAll('.recheckChoice')){if(el.value!=='hold'){C.recheck(s,valueWeek(),el.dataset.id,el.value,true);n++}}if(!n)throw Error('재확인 결과를 선택해 주세요');message(`${n}문항 교사 재풀이·설명 확인 기록(가상) 저장`)}));
$('lesson').addEventListener('click',()=>step(()=>{C.saveLesson(s,valueWeek(),{concept:$('concept').value,feedback:$('feedback').value,nextHomework:$('nextHomework').value,approved:$('lessonApproved').checked});message('가상 수업 기록 저장 완료')}));
$('approve').addEventListener('click',()=>step(()=>{C.approveReport(s,valueWeek(),s.guardianId);message('가상 학부모 리포트 승인됨 · 수동 복사 가능 · 자동 발송하지 않음')}));
$('copy').addEventListener('click',()=>step(()=>{const t=C.copyableReport(s,valueWeek());if(!navigator.clipboard)throw Error('현재 브라우저의 복사 권한이 없습니다');navigator.clipboard.writeText(t).then(()=>message('승인된 가상 리포트를 클립보드에 복사했습니다. 실제 보호자에게 발송하지 마세요.')).catch(()=>message('복사 권한이 차단됐습니다. 보고서 본문을 길게 눌러 복사해 주세요.',true))}));
$('student').addEventListener('change',()=>{s=C.beginDemo(G,$('student').value);refresh();message('가상 학생이 변경되어 모든 이전 시뮬레이션 기록을 초기화했습니다.')});
$('week').addEventListener('change',refresh);
$('reset').addEventListener('click',()=>{s=C.beginDemo(G,$('student').value);createChoiceControls();refresh();message('가상 시연 데이터 초기화 완료 · 브라우저에 학생정보를 저장하지 않습니다.')});
$('scenario').addEventListener('click',()=>step(()=>{
 s=C.beginDemo(G,$('student').value);
 C.assign(s,G,1,[1,2,3,4]);C.submit(s,1,[2,3],[4]);C.review(s,1,[2,3]);
 C.saveLesson(s,1,{concept:'분수 곱셈 (가상)',feedback:'2·3번 문제의 풀이 설명 확인 (가상)',nextHomework:'다음 주 2·3번 재풀이 (가상)',approved:true});C.approveReport(s,1,s.guardianId);
 const q=C.queue(s,2);C.recheck(s,2,q.find(x=>x.number===2).id,'완료',true);C.recheck(s,2,q.find(x=>x.number===3).id,'복습필요',true);
 C.assign(s,G,2,[5,6]);C.submit(s,2,[6],[]);C.review(s,2,[6]);
 C.saveLesson(s,2,{concept:'약분 응용 (가상)',feedback:'2번 해결, 3번 추가 복습 필요 (가상)',nextHomework:'3·6번 다시 풀고 설명하기 (가상)',approved:true});C.approveReport(s,2,s.guardianId);
 $('week').value='3';
 message('G5 통합 가상 시나리오 성공 · 1주차 오답 2·3번 → 2주차 2번 해결/3번 재확인 · 2주차 새 오답 6번 → 3주차 재확인 후보 3·6번 · 1·2주차 보고서 승인 상태는 각 주차를 선택해 확인할 수 있습니다. 실제 서버/학생정보 변경 없음.');
}));
createChoiceControls();refresh();
