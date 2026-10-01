const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='Asia/Tokyo';
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('function habitsForDate(date){'),html.indexOf('// 習慣をタスクビュー内で表示するアイテム'));
function select(habits,date){
  const before=JSON.stringify(habits),ctx=vm.createContext({S:{habits},date});
  vm.runInContext("Date.prototype.toLocalYmd=function(){return this.getFullYear()+'-'+String(this.getMonth()+1).padStart(2,'0')+'-'+String(this.getDate()).padStart(2,'0')};"+code,ctx);
  const result=JSON.parse(vm.runInContext('JSON.stringify(habitsForDate(date))',ctx));
  assert.equal(JSON.stringify(habits),before,'selection must not alter history');
  return result;
}
test('new Wednesday habit does not lock Thursday for missing yesterday',()=>{
  const h={title:'脚トレ',daysOfWeek:[3],createdAt:'2026-10-01T05:45:10.818Z',completedDates:[]};
  assert.equal(select([h],'2026-09-30').length,0);
  assert.equal(select([h],'2026-10-07').length,1);
  assert.equal(select([h],'2026-10-14').length,1);
  assert.equal(select([h],'2026-10-08').length,0);
});
test('start date uses local date and includes the creation day',()=>{
  const h={createdAt:'2026-09-30T15:01:00Z'};
  assert.equal(select([h],'2026-09-30').length,0);
  assert.equal(select([h],'2026-10-01').length,1);
});
test('legacy missing or invalid creation dates retain existing behavior',()=>{
  assert.equal(select([{}, {createdAt:'invalid'}, {createdAt:null}],'2026-09-30').length,3);
});
test('imported completion and failure history before creation stays visible',()=>{
  const base={createdAt:'2026-10-01T00:00:00Z'};
  assert.equal(select([{...base,completedDates:['2026-09-30']},{...base,failedDates:['2026-09-30']}],'2026-09-30').length,2);
});
test('deleted and non-scheduled weekdays remain excluded',()=>{
  assert.equal(select([{deleted:true},{daysOfWeek:[1],completedDates:['2026-09-30']}],'2026-09-30').length,0);
});
test('all seven weekday menus recur independently next week',()=>{
  const h=Array.from({length:7},(_,day)=>({title:String(day),daysOfWeek:[day],createdAt:'2026-10-01T05:00:00Z'}));
  for(let day=4;day<=17;day++)assert.equal(select(h,`2026-10-${String(day).padStart(2,'0')}`).length,1);
});
test('entry HTML mirrors remain identical',()=>{
  assert.equal(html,fs.readFileSync(path.join(__dirname,'../editflow.html'),'utf8'));
});
