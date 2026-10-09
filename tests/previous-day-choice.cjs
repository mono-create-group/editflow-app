const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
assert.equal(html,fs.readFileSync('editflow.html','utf8'));
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
function extract(name){
 const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
 const end=html.indexOf('\n',start),line=html.slice(start,end);
 return line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',end)+2);
}
const names=['toggleHabit','toggleAbstinence','abstinenceRecord','abstinenceStatus','previousDayGateState','needsPreviousDayCheck','rPreviousDayChoice','rPreviousDayGate'];
const code=names.map(extract).join('\n');
const date='2026-10-09',older='2026-10-08';
function fixture(){return {habits:[{id:'run',title:'ランニング',completedDates:[older],failedDates:[]},{id:'work',title:'決まった休憩時間と業務時間で仕事をする',completedDates:[],failedDates:[date]}],workouts:[{date,isRest:true}],abstinence:{records:{[date]:{a:'failed',b:'failed',c:'failed'}}}};}
function context(S=fixture()){
 const c={S,ABSTINENCE_ITEMS:[{key:'a',label:'禁欲'},{key:'b',label:'ジャンクフード禁止'},{key:'c',label:'おやつ・ジュース禁止'}],previousDay:()=>date,isRecordSkipDay:()=>false,habitLevel:()=>({level:1}),calcStreak:()=>1,toast:()=>{},render:()=>{},esc:s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),rHabitRecordCalendar:()=>''};
 c.habitsForDate=()=>c.S.habits;c.save=()=>{c.saved=JSON.stringify(c.S)};vm.createContext(c);vm.runInContext(code,c);return c;
}
for(const kind of ['habit','abstinence']){
 for(const current of ['', 'kept','failed'])for(const result of ['kept','failed']){
  const c=context();
  const call=result=>kind==='habit'?c.toggleHabit('run',date,result):c.toggleAbstinence(date,'a',result);
  const status=()=>kind==='habit'?(c.S.habits[0].completedDates.includes(date)?'kept':c.S.habits[0].failedDates.includes(date)?'failed':''):c.abstinenceStatus(date,'a');
  if(kind==='habit'){if(current)c.S.habits[0][current==='kept'?'completedDates':'failedDates'].push(date);}else c.S.abstinence.records[date].a=current;
  call(result);assert.equal(status(),result);call(result);assert.equal(status(),result);
  assert.ok(c.S.habits[0].completedDates.includes(older));
  assert.equal(c.S.abstinence.records[date].b,'failed');
  const loaded=context(JSON.parse(c.saved));assert.equal(loaded.needsPreviousDayCheck(),kind==='habit'?false:true);
 }
 const c=context();if(kind==='abstinence')c.S.abstinence.records[date].a='';
 for(const expected of ['kept','failed','']){
  if(kind==='habit')c.toggleHabit('run',date);else c.toggleAbstinence(date,'a');
  const actual=kind==='habit'?(c.S.habits[0].completedDates.includes(date)?'kept':c.S.habits[0].failedDates.includes(date)?'failed':''):c.abstinenceStatus(date,'a');assert.equal(actual,expected);
 }
}
for(const kind of ['habit','abstinence']){
 const c=context();
 if(kind==='abstinence'){c.S.habits[0].failedDates.push(date);c.S.abstinence.records[date].a='';}
 assert.equal(c.needsPreviousDayCheck(),true);
 const markup=c.rPreviousDayGate();assert.ok(markup.includes(kind==='habit'?"toggleHabit('run','2026-10-09','failed')":"toggleAbstinence('2026-10-09','a','failed')"));
 if(kind==='habit')c.toggleHabit('run',date,'failed');else c.toggleAbstinence(date,'a','failed');
 assert.equal(c.needsPreviousDayCheck(),false);
 const loaded=context(JSON.parse(c.saved));assert.equal(loaded.needsPreviousDayCheck(),false);
 assert.equal(kind==='habit'?loaded.S.habits[0].failedDates.includes(date):loaded.abstinenceStatus(date,'a')==='failed',true);
}
console.log('PASS: direct choices, last-item failed save/reload, idempotency, legacy cycles, unrelated data, HTML parity and JS syntax');
if(process.argv.includes('--preview')){
 const c=context();
 const setup=`let S=JSON.parse(localStorage.getItem('editflow-choice-fixture')||'null')||${JSON.stringify(fixture())};const ABSTINENCE_ITEMS=${JSON.stringify(c.ABSTINENCE_ITEMS)};const previousDay=()=>${JSON.stringify(date)},isRecordSkipDay=()=>false,habitsForDate=()=>S.habits,habitLevel=()=>({level:1}),calcStreak=()=>1,toast=()=>{},esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),rHabitRecordCalendar=()=>'';function save(){localStorage.setItem('editflow-choice-fixture',JSON.stringify(S))}function render(){document.getElementById('view').innerHTML=needsPreviousDayCheck()?rPreviousDayGate():'<h2>確認完了</h2><p>ランニング：'+(S.habits[0].failedDates.includes(previousDay())?'× できなかった':'○ 達成')+'</p><p>保存後の記録です。</p>'}`;
 fs.writeFileSync('/tmp/editflow-choice-preview/index.html','<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EditFlow 修正確認用（テストデータ）</title><style>'+html.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style><body style="display:block;padding:16px"><p>修正確認用・テストデータ</p><main id="view" style="margin:auto;max-width:760px"></main><script>'+setup+'\n'+code+'\nrender();</script></body></html>');
}
