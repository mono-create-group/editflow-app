const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const P=require('../day-plan.js');
const values={title:'ラーメン食べに行く',date:'2026-10-02',start:'12:00',end:'',duration:30};
test('time-prefixed Japanese quick input becomes a normal shared task',()=>{
  assert.deepEqual(P.input({...values,title:'１２：０５ ラーメン食べに行く',start:''}),{title:'ラーメン食べに行く',dueDate:'2026-10-02',startTime:'12:05',endTime:'12:35',estimatedMinutes:30});
});
test('explicit range takes precedence over fallback fields',()=>{const r=P.input({...values,title:'12:07〜13:11 ラーメン食べに行く'});assert.equal(r.startTime,'12:07');assert.equal(r.endTime,'13:11');assert.equal(r.estimatedMinutes,64);});
test('one-minute precision and midnight ending are supported',()=>{const r=P.input({...values,start:'23:59',end:'00:00'});assert.equal(r.endTime,'24:00');assert.equal(r.estimatedMinutes,1);});
test('invalid titles, dates, times and durations fail before mutation',()=>{
  for(const v of [{title:''},{title:'12:00'},{date:'2026-02-30'},{date:''},{start:'25:00'},{title:'25:00 bad'},{duration:0},{duration:1.5},{start:'23:59',duration:2},{end:'11:00'},{end:'12:00'}])assert.throws(()=>P.input({...values,...v}));
});
test('entries select only the chosen day and retain multiple slots without duplicating tasks',()=>{
  const tasks=[{id:'a',dueDate:values.date,startTime:'12:00',endTime:'13:00',timeSlots:[{s:'17:03',e:'17:20'}]},{id:'b',dueDate:'2026-10-01',startTime:'08:00'},{id:'c',deleted:true,dueDate:values.date,startTime:'09:00'}];
  const rows=P.entries(tasks,values.date);assert.equal(rows.length,2);assert.equal(P.summary(rows).count,1);assert.equal(P.summary(rows).minutes,77);assert.deepEqual(rows.map(x=>x.slotIndex),[0,1]);
});
test('overlap warns without prohibiting adjacent or completed schedules',()=>{
  const rows=P.entries([{id:'a',dueDate:values.date,startTime:'12:00',endTime:'13:00'},{id:'b',dueDate:values.date,startTime:'12:30',endTime:'12:40'},{id:'c',dueDate:values.date,startTime:'13:00',endTime:'14:00'},{id:'d',done:true,dueDate:values.date,startTime:'12:00',endTime:'15:00'}],values.date);
  assert.deepEqual(P.summary(rows).conflicts,new Set(['a:0','b:0']));
});
test('editing preserves ID, completion, notes, deadlines and extra slots',()=>{
  const t={id:'a',done:true,doneDate:'2026-10-01',description:'keep',dueTime:'20:00',fsBlockId:'old',fsSlot:2,timeSlots:[{s:'17:00',e:'17:30'}]};const original=JSON.stringify(t);
  const r=P.apply(t,values);assert.equal(r.id,'a');assert.equal(r.done,true);assert.equal(r.doneDate,t.doneDate);assert.equal(r.description,'keep');assert.equal(r.dueTime,'20:00');assert.equal(r.fsBlockId,null);assert.equal(r.fsSlot,null);assert.deepEqual(r.timeSlots,t.timeSlots);assert.equal(r.estimatedMinutes,60);assert.equal(JSON.stringify(t),original);
});
test('editing an extra slot does not overwrite the primary time',()=>{
  const t={id:'a',startTime:'08:00',endTime:'09:00',timeSlots:[{s:'17:00',e:'17:30'}]};const r=P.apply(t,{...values,start:'18:03',duration:17},1);assert.equal(r.startTime,'08:00');assert.deepEqual(r.timeSlots,[{s:'18:03',e:'18:20'}]);
});
test('removing a time preserves task and date; extra slots can be removed separately',()=>{
  const t={id:'a',title:'keep',done:false,dueDate:values.date,startTime:'08:00',endTime:'09:00',fsBlockId:'old',timeSlots:[{s:'17:00',e:'17:30'}]};
  const r=P.unslot(t);assert.equal(r.id,'a');assert.equal(r.dueDate,values.date);assert.equal(r.startTime,null);assert.equal(r.fsBlockId,null);assert.equal(r.timeSlots.length,1);assert.equal(P.unslot(t,1).timeSlots.length,0);assert.equal(t.timeSlots.length,1);
});
test('unknown ends are explicit rather than invented durations',()=>{const row=P.entries([{id:'a',dueDate:values.date,startTime:'12:00'}],values.date)[0];assert.equal(row.end,null);assert.equal(row.minutes,null);});
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function harness(){
  const fields={},ctx={EditFlowDayPlan:P,Date,Number,String,Set,JSON,S:{tasks:[],fsSchedules:[],fs:[],settings:{}},V:'tasks',TV:'dayplan',today:()=> '2026-10-01',uid:()=> 'fixture-id',esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),render:()=>{},save:()=>{},toast:()=>{},closeModal:()=>{},confirm:()=>true,fsBlocksForDate:()=>[{id:'f',s:'07:30',e:'08:00',t:'固定の身支度'}],document:{getElementById:id=>fields[id]},fields};
  vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf("let DAY_PLAN_DATE=''"),html.indexOf('function decisionPriorityMeta')),ctx);return {ctx,fields,run:s=>vm.runInContext(s,ctx)};
}
test('new page defaults to tomorrow and supports explicit today navigation',()=>{const h=harness();assert.equal(h.run('dayPlanDate()'),'2026-10-02');h.run('dayPlanOpen()');assert.equal(h.run('dayPlanDate()'),'2026-10-01');h.run('dayPlanMoveDay(1)');assert.equal(h.run('dayPlanDate()'),'2026-10-02');});
test('free-form add creates exactly one standard task for the selected date',()=>{
  const h=harness();for(const [id,value] of Object.entries({'dp-title':'12:00 ラーメン食べに行く','dp-start':'','dp-end':'','dp-minutes':'30','dp-error':''}))h.fields[id]={value,textContent:''};h.run('dayPlanAdd()');assert.equal(h.ctx.S.tasks.length,1);assert.equal(h.ctx.S.tasks[0].dueDate,'2026-10-02');assert.equal(h.ctx.S.tasks[0].startTime,'12:00');assert.equal(h.ctx.S.tasks[0].endTime,'12:30');assert.equal(h.ctx.S.fs.length,0);
});
test('failed input leaves tasks unchanged and displays an actionable error',()=>{
  const h=harness();for(const id of ['dp-title','dp-start','dp-end','dp-minutes','dp-error'])h.fields[id]={value:'',textContent:''};h.run('dayPlanAdd()');assert.equal(h.ctx.S.tasks.length,0);assert.match(h.fields['dp-error'].textContent,/名前/);
});
test('render is read-only and escapes task titles and IDs',()=>{
  const h=harness();h.ctx.S.tasks=[{id:'id"\'test',title:'<img src=x onerror=alert(1)>',dueDate:'2026-10-02',startTime:'12:00',endTime:'13:00'}];const before=JSON.stringify(h.ctx.S),out=h.run('rDayPlan()');assert.equal(JSON.stringify(h.ctx.S),before);assert.ok(out.includes('&lt;img'));assert.ok(!out.includes('<img src=x'));assert.ok(out.includes('固定の身支度'));
});
test('selected task edit updates its existing ID rather than adding a duplicate',()=>{
  const h=harness();h.ctx.S.tasks=[{id:'a',title:'existing',done:false,dueDate:'2026-10-02'}];for(const [id,value] of Object.entries({'dp-edit-title':'existing','dp-edit-date':'2026-10-02','dp-edit-start':'09:07','dp-edit-end':'09:42','dp-edit-minutes':'35','dp-edit-error':''}))h.fields[id]={value,textContent:''};h.run("dayPlanSaveEditor('a',0)");assert.equal(h.ctx.S.tasks.length,1);assert.equal(h.ctx.S.tasks[0].id,'a');assert.equal(h.ctx.S.tasks[0].estimatedMinutes,35);
});
test('completed state is rendered from the same task object',()=>{
  const h=harness();h.ctx.S.tasks=[{id:'a',title:'shared',dueDate:'2026-10-02',startTime:'12:00',endTime:'13:00',done:false}];assert.match(h.run('rDayPlan()'),/aria-pressed="false"/);h.ctx.S.tasks[0].done=true;assert.match(h.run('rDayPlan()'),/aria-pressed="true"/);assert.match(h.run('rDayPlan()'),/未完了に戻す/);
});
test('removing a time requires confirmation and keeps the original task',()=>{
  const h=harness();let modal='';h.ctx.openModal=text=>{modal=text;};
  h.ctx.S.tasks=[{id:'a',title:'<keep>',dueDate:'2026-10-02',startTime:'12:00',endTime:'13:00',done:true}];
  const before=JSON.stringify(h.ctx.S.tasks);h.run("dayPlanUnslot('a',0)");
  assert.equal(JSON.stringify(h.ctx.S.tasks),before);assert.match(modal,/&lt;keep&gt;/);assert.match(modal,/時間帯だけ外す/);
  h.run("dayPlanConfirmUnslot('a',0)");assert.equal(h.ctx.S.tasks.length,1);assert.equal(h.ctx.S.tasks[0].startTime,null);assert.equal(h.ctx.S.tasks[0].done,true);assert.equal(h.ctx.S.tasks[0].dueDate,'2026-10-02');
});
