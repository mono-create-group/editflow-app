/* Shared-task daily planning. Pure helpers: no storage, network or UI mutation. */
(function(root){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  function minute(value,allowMidnight=false){
    const m=String(value||'').normalize('NFKC').match(/^(\d{1,2}):(\d{2})$/);
    if(!m)return null;const h=Number(m[1]),n=Number(m[2]);
    if(allowMidnight&&h===24&&n===0)return 1440;
    return h<24&&n<60?h*60+n:null;
  }
  function clock(n){return n===1440?'24:00':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function validDate(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
    const d=new Date(date+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;
  }
  function parseLine(value){
    const raw=String(value||'').trim(),normalized=raw.normalize('NFKC');
    const m=normalized.match(/^(\d{1,2}:\d{2})(?:\s*[〜~～–-]\s*(\d{1,2}:\d{2}))?\s*(.*)$/);
    if(!m)return {title:raw,start:'',end:''};
    if(minute(m[1])===null||m[2]&&minute(m[2],true)===null)throw Error('時刻は00:00〜23:59で入力してください。終了のみ24:00も使えます。');
    return {title:m[3].trim(),start:clock(minute(m[1])),end:m[2]?clock(minute(m[2],true)):''};
  }
  function input(value){
    const line=parseLine(value.title),date=value.date;
    if(!line.title)throw Error('予定の名前を入力してください。');
    if(!validDate(date))throw Error('予定を入れる日付を選んでください。');
    const start=minute(line.start||value.start);
    if(start===null)throw Error('開始時刻を入力してください。');
    const endText=line.end||value.end;
    let end=endText?minute(endText,true):null;
    if(endText&&end===null)throw Error('終了時刻を確認してください。');
    if(end===0&&start>0)end=1440;
    if(!endText){const duration=Number(value.duration);if(!Number.isInteger(duration)||duration<1||duration>1440)throw Error('所要時間を1〜1440分で入力してください。');end=start+duration;}
    if(end<=start||end>1440)throw Error('終了は開始より後にしてください。翌日まで続く予定は、日付ごとに分けて登録できます。');
    return {title:line.title,dueDate:date,startTime:clock(start),endTime:clock(end),estimatedMinutes:end-start};
  }
  function entries(tasks,date){
    const out=[];
    for(const task of tasks||[]){
      if(task.deleted||task.dueDate!==date)continue;
      const slots=[{s:task.startTime,e:task.endTime},...(task.timeSlots||[])];
      slots.forEach((slot,slotIndex)=>{
        const start=minute(slot.s);if(start===null)return;
        let end=minute(slot.e,true);if(end===0&&start>0)end=1440;
        if(end!==null&&end<=start)end=null;
        out.push({task,slotIndex,key:String(task.id)+':'+slotIndex,start,end,minutes:end===null?null:end-start});
      });
    }
    return out.sort((a,b)=>a.start-b.start||String(a.task.id).localeCompare(String(b.task.id))||a.slotIndex-b.slotIndex);
  }
  function summary(rows){
    const conflicts=new Set();
    rows.forEach((a,i)=>{if(a.task.done||a.end===null)return;for(let j=i+1;j<rows.length;j++){const b=rows[j];if(b.task.done||b.end===null)continue;if(a.start<b.end&&b.start<a.end){conflicts.add(a.key);conflicts.add(b.key);}}});
    return {count:new Set(rows.map(x=>x.task.id)).size,minutes:rows.reduce((n,x)=>n+(x.minutes||0),0),conflicts};
  }
  function apply(task,values,slotIndex=0,now=Date.now()){
    const next=clone(task),v=input(values);
    next.title=v.title;next.dueDate=v.dueDate;next.updatedAt=now;
    if(slotIndex===0){next.startTime=v.startTime;next.endTime=v.endTime;next.fsBlockId=null;next.fsSlot=null;}
    else{if(!next.timeSlots?.[slotIndex-1])throw Error('この時間帯は変更されています。予定を開き直してください。');next.timeSlots[slotIndex-1]={...next.timeSlots[slotIndex-1],s:v.startTime,e:v.endTime};}
    next.estimatedMinutes=summary(entries([next],next.dueDate)).minutes||null;
    return next;
  }
  function unslot(task,slotIndex=0,now=Date.now()){
    const next=clone(task);next.updatedAt=now;
    if(slotIndex===0){next.startTime=null;next.endTime=null;next.fsBlockId=null;next.fsSlot=null;}
    else if(next.timeSlots?.[slotIndex-1])next.timeSlots.splice(slotIndex-1,1);
    next.estimatedMinutes=summary(entries([next],next.dueDate)).minutes||null;
    return next;
  }
  const api=Object.freeze({minute,clock,validDate,parseLine,input,entries,summary,apply,unslot});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.EditFlowDayPlan=api;
})(typeof window==='object'?window:globalThis);
