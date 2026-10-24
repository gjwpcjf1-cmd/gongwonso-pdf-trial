/** G5 isolated synthetic integration of G3 catalog bridge and V6.5 workflow semantics.
 * No I/O, no network, no persisted browser data, no real students, no teacher authentication.
 * This is a *simulation*; it is NOT a patch to V6.5 Apps Script services.
 */
const STUDENTS={'SYN-A':'SYN-GA','SYN-B':'SYN-GB'};
const SET='G5_S2_U3_P1';
const REV='a'.repeat(64);
function die(code){throw Error('G5_'+code)}
function validateStudent(s){if(!(s in STUDENTS))die('SYNTHETIC_ONLY')}
function validateWeek(w){if(!Number.isInteger(w)||w<1||w>4)die('WEEK_1_TO_4_ONLY')}
export function syntheticApprovedG2(){
 return {schema:'GW_G2_OFFLINE_CATALOG_1',student_published:false,books:[{
  set_key:SET,revision:REV,item_count:6,review_overrides:{},items:Array.from({length:6},(_,i)=>({
   number:i+1,original_id:String(910001+i),problem_page:1+i%2,answer_page:1+i%2,
   problem_bbox:[12,20,200,95],answer_bbox:[12,110,200,180]
  }))}]};
}
export function beginDemo(G3,studentId='SYN-A'){
 validateStudent(studentId);
 if(!G3 || typeof G3.normalizeG2Approved!=='function')die('G3_BRIDGE_MISSING');
 const catalog=G3.normalizeG2Approved(syntheticApprovedG2());
 if(catalog.studentPublished!==false||catalog.isRealStudentReady!==false)die('G3_NOT_SAFE');
 return {schema:'G5_SYNTHETIC_SESSION_ONLY',studentId,guardianId:STUDENTS[studentId],catalog,
   tasks:{},submissions:{},reviews:{},rechecks:[],notes:{},reports:{}};
}
function checkState(s){if(!s||s.schema!=='G5_SYNTHETIC_SESSION_ONLY')die('INVALID_SESSION');validateStudent(s.studentId)}
function arrUnique(nums){return Array.isArray(nums)&&nums.every(n=>Number.isInteger(n))&&new Set(nums).size===nums.length}
export function assign(s,G3,week,numbers){
 checkState(s);validateWeek(week);
 if(s.tasks[week])die('DUPLICATE_ASSIGNMENT');
 if(!arrUnique(numbers)||numbers.length===0)die('INVALID_NUMBERS');
 const dto=G3.previewSyntheticAssignment(s.catalog,{studentId:s.studentId,week,setKey:SET,numbers});
 if(dto.studentPublished!==false||dto.readonlyPreview!==true)die('NOT_PREVIEW');
 s.tasks[week]=dto;return dto;
}
function requireTask(s,week){checkState(s);validateWeek(week);const t=s.tasks[week];if(!t)die('TASK_NOT_ASSIGNED');return t}
function idsFor(t,nums){if(!arrUnique(nums))die('DUPLICATE_OR_BAD_NUMBER');
 const map=new Map(t.items.map(it=>[Number(it.label),it.id]));
 return nums.map(n=>{if(!map.has(n))die('NOT_ASSIGNED_NUMBER');return map.get(n)});
}
export function submit(s,week,wrong,skipped){
 const t=requireTask(s,week);const w=idsFor(t,wrong),p=idsFor(t,skipped);
 if(w.some(x=>p.includes(x)))die('WRONG_SKIPPED_OVERLAP');
 const revision=(s.submissions[week]?.revision||0)+1;
 s.submissions[week]={revision,wrong:w,skipped:p};
 // invalidate prior teacher review and any previously approved report on updated submission.
 delete s.reviews[week];delete s.reports[week];
 return {revision,wrong:w.length,skipped:p.length};
}
export function review(s,week,numbers){
 const t=requireTask(s,week),sub=s.submissions[week];if(!sub)die('SUBMISSION_REQUIRED');
 if(s.reviews[week])die('ALREADY_REVIEWED');
 const reps=idsFor(t,numbers);
 if(reps.length<1||reps.length>3||reps.some(x=>!sub.wrong.includes(x)))die('REPRESENTATIVES_NOT_VERIFIED_WRONG');
 s.reviews[week]={revision:sub.revision,reps,teacherVerified:true};delete s.reports[week];
 return {count:reps.length};
}
function baseQueue(s,week){
 const rec=[];
 for(let w=1;w<week;w++){
  const t=s.tasks[w],sub=s.submissions[w],rev=s.reviews[w];
  if(!t||!sub||!rev||rev.revision!==sub.revision||!rev.teacherVerified)continue;
  for(const id of rev.reps){if(!sub.wrong.includes(id))continue;
   const it=t.items.find(i=>i.id===id);
   if(it)rec.push({id,week:w,number:Number(it.label),label:it.label,page:it.page,bookLabel:t.bookLabel});
  }
 }
 return rec;
}
function queueAt(s,week,cutoffWeek){
 const first=baseQueue(s,week),uniq=new Map();
 for(const x of first)uniq.set(x.id,x);
 for(const r of s.rechecks){if(r.week>cutoffWeek)continue;
  if(uniq.has(r.id)){
   if(r.outcome==='완료')uniq.delete(r.id);
  }
 }
 return [...uniq.values()].sort((a,b)=>a.week-b.week||a.number-b.number);
}
export function queue(s,week){checkState(s);validateWeek(week);return queueAt(s,week,week)}
export function recheck(s,week,id,outcome,sawExplanation){
 checkState(s);validateWeek(week);
 if(week===1)die('NO_PRIOR_WEEK');
 if(sawExplanation!==true||!['완료','복습필요'].includes(outcome))die('TEACHER_MANUAL_CONFIRM_REQUIRED');
 if(!queue(s,week).some(i=>i.id===id))die('NOT_OPEN_RECHECK');
 if(s.rechecks.some(r=>r.week===week&&r.id===id))die('RECHECK_ALREADY_RECORDED');
 s.rechecks.push({week,id,outcome});delete s.reports[week];
 return {outcome,remaining:queue(s,week).length};
}
function clean(s){return String(s||'').trim().replace(/[<>\r\n]/g,' ').slice(0,200)}
export function saveLesson(s,week,note){checkState(s);validateWeek(week);const n={concept:clean(note?.concept),feedback:clean(note?.feedback),nextHomework:clean(note?.nextHomework),approved:note?.approved===true};
 if(!n.concept&&!n.feedback&&!n.nextHomework)die('EMPTY_LESSON');
 s.notes[week]=n;delete s.reports[week];return n;
}
export function report(s,week){checkState(s);validateWeek(week);
 const t=s.tasks[week],sub=s.submissions[week],r=s.reviews[week],note=s.notes[week]||null;
 const totals={assigned:t?.items?.length||0,submitted:sub?1:0,unsubmitted:t&&!sub?1:0,wrong:sub?.wrong?.length||0,skipped:sub?.skipped?.length||0,verifiedReps:r&&sub&&r.revision===sub.revision?r.reps.length:0};
 // Freeze the week-end recheck count: subsequent lessons must not rewrite an approved prior-week report.
 const remain=week<4?queueAt(s,week+1,week).length:0;
 const text=['[공원소 4주 수학코칭 · '+week+'주차 · 가상 시험]',
  '학생 코드: '+s.studentId,
  '과제: '+(t?1:0)+'건 (제출 '+totals.submitted+'건 / 미제출 '+totals.unsubmitted+'건)',
  '학생 자가채점 오답: '+totals.wrong+'문항 / 미풀이: '+totals.skipped+'문항',
  '교사가 확인한 대표 오답: '+totals.verifiedReps+'문항',
  '다음 수업 재확인 후보: '+remain+'문항',
  '이번 주 학습: '+(note?.concept||'교사 입력 전'),
  '수업에서 확인한 점: '+(note?.feedback||'교사 입력 전'),
  '다음 숙제: '+(note?.nextHomework||'교사 입력 전'),
  '※ 자가채점 수치는 교사의 전체 정오답 판정이 아닙니다.',
  '※ 이 문서는 가상 학생 시험 전용이며 실제 보호자에게 발송하지 않습니다.'].join('\n');
 const snapshot=JSON.stringify({t,sub,r,note,rechecks:s.rechecks.filter(x=>x.week<=week),text});
 // fingerprint string intentionally uses entire raw state. Never expose real data in this demo.
 const stamp=snapshot;
 const approved=s.reports[week]?.stamp===stamp&&s.reports[week]?.status==='READY';
 return {studentId:s.studentId,week,totals,remaining:remain,text,stamp,ready:!!approved,status:!note?.approved?'NO_APPROVED_LESSON':approved?'READY':'DRAFT'};
}
export function approveReport(s,week,guardian){const r=report(s,week);
 if(guardian!==s.guardianId)die('GUARDIAN_MISMATCH');
 if(!s.notes[week]?.approved)die('LESSON_NOT_APPROVED');
 if(!r.totals.assigned||r.totals.unsubmitted)die('TASK_NOT_SUBMITTED');
 s.reports[week]={stamp:r.stamp,status:'READY'};
 return {status:'READY',canCopy:true};
}
export function copyableReport(s,week){const r=report(s,week);if(!r.ready)die('REPORT_APPROVAL_REQUIRED');return r.text}
export const constants={SET,STUDENTS};
