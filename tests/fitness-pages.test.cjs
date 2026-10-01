const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function fitnessCustomPages(){'),html.indexOf('function rFitnessOverview(){'));
function context(pages){
  return vm.createContext({S:{customPages:pages},FTV:'overview',V:'fitness',CP_EDIT_MODE:false,
    today:()=> '2026-10-01',esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    closeModal:()=>{},render:()=>{},rCustomPage:p=>`PAGE:${p.id}`,rFitnessOverview:()=> 'overview',
    rFitnessTraining:()=> 'training',rFitnessMeal:()=> 'meal',rFitnessGoals:()=> 'goals'});
}
test('only explicitly moved active pages belong to fitness; records stay intact',()=>{
  const pages=[{id:'week',title:'週間トレメニュー',parentView:'fitness',blocks:[{type:'links',items:[{url:'https://www.youtube.com/watch?v=RSBA5aXMbso&t=311s'}]}]},
    {id:'other',title:'メモ'}, {id:'deleted',parentView:'fitness',deleted:true}];
  const before=JSON.stringify(pages),c=context(pages);vm.runInContext(source,c);
  assert.equal(vm.runInContext('fitnessCustomPages().length',c),1);
  assert.equal(vm.runInContext("isFitnessCustomNav('cp_week')",c),true);
  assert.equal(vm.runInContext("isFitnessCustomNav('cp_other')",c),false);
  assert.equal(JSON.stringify(pages),before);
});
test('fitness renders the same page and escapes tab titles',()=>{
  const c=context([{id:'week',title:'<b>週間</b>',parentView:'fitness'}]);vm.runInContext(source,c);
  c.FTV='cp_week';const out=vm.runInContext('rFitness()',c);
  assert.match(out,/&lt;b>週間&lt;\/b>/);assert.match(out,/PAGE:week/);
  c.FTV='cp_missing';assert.match(vm.runInContext('rFitness()',c),/overview/);
});
test('opening custom pages follows their location without modifying data',()=>{
  const c=context([{id:'week',parentView:'fitness'},{id:'notes'}]);vm.runInContext(source,c);
  vm.runInContext("openCustomPage('week')",c);assert.equal(c.V,'fitness');assert.equal(c.FTV,'cp_week');
  vm.runInContext("openCustomPage('notes')",c);assert.equal(c.V,'cp_notes');
});
test('location control supports moving back to the sidebar',()=>{
  const c=context([]);vm.runInContext(source,c);
  assert.match(vm.runInContext("customPageLocationField({id:'week',parentView:'fitness'})",c),/value="fitness" selected/);
  assert.match(vm.runInContext("customPageLocationField({id:'week'})",c),/value="" selected/);
});
test('link renderer preserves each time offset and opens a fresh context',()=>{
  const c=context([]);vm.runInContext(html.slice(html.indexOf('function rBlockInner('),html.indexOf('function rBlock(b,pid,idx){')),c);
  const starts=[38,311,447,845,1037,1292,1486];
  c.block={type:'links',items:starts.map(t=>({label:String(t),url:`https://www.youtube.com/watch?v=RSBA5aXMbso&t=${t}s`}))};
  const out=vm.runInContext("rBlockInner(block,'week',0)",c);
  for(const t of starts)assert.ok(out.includes(`&amp;t=${t}s`));
  assert.equal((out.match(/target="_blank" rel="noopener"/g)||[]).length,7);
});
