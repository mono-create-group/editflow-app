const {test}=require('node:test');
const assert=require('node:assert/strict');
const Traffic=require('../sync-traffic-guard.js');
function fixture(options={}){
  const values=new Map();let at=100000;
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const config={storage,now:()=>at,dayKey:n=>String(Math.floor(n/86400000)),...options};
  return {guard:Traffic.create(config),another:()=>Traffic.create(config),values,storage,advance:ms=>at+=ms};
}
test('unchanged status inspection incurs no operation or storage writes',()=>{
  const f=fixture();for(let i=0;i<100;i++)f.guard.snapshot();assert.equal(f.values.size,0);
});
test('daily write safety cap blocks before the next write and survives restart',()=>{
  const f=fixture({limits:{read:10,write:2,listen:3}});
  assert.equal(f.guard.record('write').ok,true);assert.equal(f.guard.record('write').ok,true);
  assert.equal(f.another().record('write').reason,'daily');assert.equal(f.guard.snapshot().write,2);
});
test('sequential tabs share the browser ledger',()=>{
  const f=fixture(),b=f.another();f.guard.record('read');b.record('read');assert.equal(f.guard.snapshot().read,2);
});
test('short-term burst guard resumes after a minute but retains daily counts',()=>{
  const f=fixture({burstLimit:3});for(let i=0;i<3;i++)assert.equal(f.guard.record('read').ok,true);
  assert.equal(f.guard.record('write').reason,'burst');f.advance(60001);
  assert.equal(f.guard.record('write').ok,true);assert.equal(f.guard.snapshot().read,3);
});
test('daily reset follows provided quota day, not device locale',()=>{
  const f=fixture({limits:{read:1,write:1,listen:1}});f.guard.record('read');f.advance(86400000);
  assert.equal(f.guard.record('read').ok,true);assert.equal(f.guard.snapshot().read,1);
});
test('counter save failure fails closed instead of resetting the counter',()=>{
  const f=fixture();f.storage.setItem=()=>{throw Error('full');};assert.equal(f.guard.record('write').reason,'storage');
});
test('silent storage write failure is detected',()=>{
  const f=fixture();f.storage.setItem=()=>{};assert.equal(f.guard.record('read').reason,'storage');
});
test('corrupt counters fail closed without allowing a burst',()=>{
  const f=fixture();f.values.set('ef_sync_traffic_v1','broken');assert.equal(f.guard.record('read').reason,'storage');
});
test('clock moving backwards cannot clear daily counters',()=>{
  const f=fixture({limits:{read:1,write:1,listen:1}});f.guard.record('read');f.advance(-1);assert.equal(f.guard.record('read').reason,'daily');
});
test('only Firestore pressure logs open the emergency stop',()=>{
  assert.equal(Traffic.pressureError({type:'auth',message:'resource-exhausted'}),null);
  assert.equal(Traffic.pressureError({type:'@firebase/firestore',message:'unavailable'}),null);
  assert.equal(Traffic.pressureError({type:'@firebase/firestore',message:'RESOURCE_EXHAUSTED: Quota exceeded'}).code,'resource-exhausted');
});
