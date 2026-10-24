/**
 * GW G3 · no-charge catalog bridge. Pure Javascript (Node v22 or Apps Script V8).
 * No network, payment, uploads, Google Drive/Sheets writes, or live-student access.
 * Converts G2 OFFLINE approved catalog metadata into V6.5-compatible item lists.
 * IMPORTANT: must NOT be invoked from public student endpoints, and this code does
 * not grant ownership or teaching clearance. Teacher-only catalog preview.
 */
(function (root) {
  'use strict';
  const LABEL_RE = /^G([3-6])_S([12])_U([1-6])_P([12])$/;
  const REV_RE = /^[a-f0-9]{64}$/i;
  const ID_RE = /^\d{6}$/;
  const MAX_TOTAL_ITEMS = 10000;
  function fail(code) { throw new Error('G3_' + code); }
  function str(v) { return typeof v === 'string' ? v : ''; }
  function cleanBBox(v) {
    if (!Array.isArray(v) || v.length !== 4 || !v.every(Number.isFinite) ||
        v[0] >= v[2] || v[1] >= v[3] || v.some(x => x < 0)) return null;
    return v.map(x => +x.toFixed(2));
  }
  function positiveInt(v, upper) { return Number.isInteger(v) && v >= 1 && v <= upper; }
  function parseSet(setKey) {
    const m = LABEL_RE.exec(str(setKey));
    if (!m) fail('INVALID_SET_KEY');
    const grade=Number(m[1]), semester=Number(m[2]), unit=Number(m[3]), part=Number(m[4]);
    if (grade <= 4 && part !== 1) fail('INVALID_SPLIT_FOR_LOWER_GRADE');
    return {grade,semester,unit,part};
  }
  function normalizeG2Approved(data) {
    if (!data || data.schema !== 'GW_G2_OFFLINE_CATALOG_1' || data.student_published !== false || !Array.isArray(data.books))
      fail('UNAPPROVED_OR_UNKNOWN_SOURCE');
    const globalIDs = new Map(), seenPairs=new Set();
    const books=[]; let total=0;
    for (const b of data.books) {
      const parsed=parseSet(b.set_key);
      if (!REV_RE.test(str(b.revision)) || !positiveInt(b.item_count,300) ||
          !Array.isArray(b.items) || b.items.length !== b.item_count) fail('BAD_BOOK_CONTRACT');
      if (seenPairs.has(b.set_key)) fail('DUPLICATE_BOOK_SET');
      seenPairs.add(b.set_key);
      const localNums=new Set(),items=[];
      const overrides=(b.review_overrides && typeof b.review_overrides==='object' && !Array.isArray(b.review_overrides)) ? b.review_overrides : {};
      for (const item of b.items) {
        const n=item.number,oid=str(item.original_id);
        if (!positiveInt(n,500) || !ID_RE.test(oid) || localNums.has(n) ||
            !positiveInt(item.problem_page,9999) || !positiveInt(item.answer_page,9999)) fail('BAD_ITEM_OR_DUPLICATE_NUMBER');
        localNums.add(n);
        if (globalIDs.has(oid) && globalIDs.get(oid)!==b.set_key) fail('CROSS_SET_ORIGINAL_ID_CONFLICT');
        globalIDs.set(oid,b.set_key);
        // A blank bbox must be explicitly resolved in the authenticated G2 teacher workflow.
        let questionBox=cleanBBox(item.problem_bbox), answerBox=cleanBBox(item.answer_bbox);
        let problemPage=item.problem_page,answerPage=item.answer_page;
        for (const [side,key] of [['problem','problem:'+n],['answer','answer:'+n]]) {
          if (overrides[key]) {
            const x=overrides[key];
            if (x.side !== side || x.number!==n || x.original_id!==oid ||
                !positiveInt(x.page,9999) || !cleanBBox(x.bbox) || typeof x.note!=='string' || x.note.trim().length<8)
              fail('UNVERIFIED_VISUAL_OVERRIDE');
            if (side==='problem'){problemPage=x.page;questionBox=cleanBBox(x.bbox);}
            else {answerPage=x.page;answerBox=cleanBBox(x.bbox);}
          }
        }
        if (!questionBox || !answerBox) fail('UNRESOLVED_IMAGE_OR_TEXT_REGION');
        const itemId=`M:${b.set_key}:${b.revision}:${oid}`;
        items.push({id:itemId,number:n,label:String(n),page:String(problemPage),originalId:oid,
          problemPage,answerPage,problemBox:questionBox,answerBox:answerBox});
        total++;
        if(total>MAX_TOTAL_ITEMS)fail('CATALOG_TOO_LARGE');
      }
      items.sort((a,b)=>a.number-b.number);
      books.push({setKey:b.set_key,revision:b.revision,grade:parsed.grade,semester:parsed.semester,unit:parsed.unit,part:parsed.part,
        label:`초${parsed.grade}-${parsed.semester} ${parsed.unit}단원${parsed.part===2?' 2편':parsed.grade>=5?' 1편':''}`,
        itemCount:items.length,items:items});
    }
    books.sort((a,b)=>a.setKey.localeCompare(b.setKey));
    return {schema:'GW_G3_TEACHER_CATALOG_PREVIEW_V1',isRealStudentReady:false,studentPublished:false,
      teacherOnly:true, source:'GW_G2_OFFLINE_CATALOG_1', bookCount:books.length,itemCount:total, books};
  }
  function previewSyntheticAssignment(catalog, spec) {
    if (!catalog || catalog.schema !== 'GW_G3_TEACHER_CATALOG_PREVIEW_V1' ||
        catalog.studentPublished !== false || catalog.teacherOnly!==true ||catalog.isRealStudentReady!==false)
      fail('UNSAFE_CATALOG');
    if (!spec || !['SYN-A','SYN-B'].includes(spec.studentId) || !positiveInt(spec.week,4)) fail('SYNTHETIC_ONLY');
    const book=catalog.books.find(b=>b.setKey===spec.setKey);
    if (!book) fail('SET_NOT_FOUND');
    if (!Array.isArray(spec.numbers) || spec.numbers.length<1 || spec.numbers.length>300 ||
        new Set(spec.numbers).size!==spec.numbers.length)fail('INVALID_ASSIGNMENT_NUMBERS');
    const chosen=[];
    for (const n of spec.numbers) {
      const item=book.items.find(x=>x.number===n);
      if(!item)fail('NUMBER_NOT_REGISTERED');
      chosen.push({id:item.id,page:item.page,label:item.label});
    }
    return {studentId:spec.studentId,week:spec.week,bookType:'mssabu',bookLabel:book.label,
      unit:book.setKey,items:chosen,studentPublished:false,readonlyPreview:true,
      note:'V6.5 ASSIGNMENTS.itemsJson compatible shape; does not write or publish.'};
  }
  const api={normalizeG2Approved,previewSyntheticAssignment,parseSet};
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.GW3_FREE_CATALOG_BRIDGE=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
