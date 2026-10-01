const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Sync=require('../personal-sync.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const copy=Sync.clone;
const base={_uid:'test-account',_savedAt:100,tasks:[{id:'t1',title:'fixture',done:false}],chores:[{id:'c1',time:'18:00',completedDates:[]}],fsSchedules:[{id:'weekday',blocks:[{id:'b1',t:'old'}]}],fsChecked:{day:{b1:false}},settings:{identity:'old'},finance:{incomes:[{id:'i1',amount:10}]},abstinence:{records:{day:{kept:false}}}};
// Match the shape normalized by the production migration, so an initial schema
// upgrade is not incorrectly counted as an echo write in the two-device test.
for(const k of ['habits','jobs','logs','journals','goals','clients','workers','checkIns','performanceLogs','customPages','customEx','customExSets','choreRoutines','navConfig','meals','workouts','pipeline','teamKgis','teamKpis','teamPosts','teamDocs','bizUnits','teamMeetings','salesLeads','hpFees','salesSites','templates'])base[k]=[];
base.abstinence.urges=[];base.recordSkipDays={};base.editCounter={days:{}};
test('all personal sections follow remote changes when local is unchanged',()=>{
  const remote=copy(base);remote.tasks[0].done=true;remote.chores[0].time='18:30';remote.chores[0].completedDates=['day'];remote.fsSchedules[0].blocks[0].t='new';remote.fsChecked.day.b1=true;remote.settings.identity='new';remote.finance.incomes[0].amount=20;remote.abstinence.records.day.kept=true;
  assert.deepEqual(Sync.merge(base,base,remote),remote);
});
test('unsent edits and other-device edits both survive, including the same record',()=>{
  const local=copy(base),remote=copy(base);local.tasks[0].title='local title';remote.tasks[0].done=true;local.fsChecked.day.local=true;remote.fsChecked.day.remote=true;local.fsSchedules[0].blocks[0].t='local schedule';remote.settings.identity='remote identity';
  const merged=Sync.merge(base,local,remote);
  assert.deepEqual(merged.tasks,[{id:'t1',title:'local title',done:true}]);
  assert.deepEqual(merged.fsChecked.day,{b1:false,local:true,remote:true});
  assert.equal(merged.fsSchedules[0].blocks[0].t,'local schedule');assert.equal(merged.settings.identity,'remote identity');
});
test('remote deletion and unchecking do not resurrect stale data',()=>{
  const remote=copy(base);remote.chores=[];delete remote.fsChecked.day.b1;
  const result=Sync.merge(base,base,remote);assert.deepEqual(result.chores,[]);assert.deepEqual(result.fsChecked.day,{});
});
test('concurrent additions preserve both device records',()=>{
  const l=copy(base),r=copy(base);l.tasks.push({id:'local',done:false});r.tasks.push({id:'remote',done:false});
  assert.deepEqual(new Set(Sync.merge(base,l,r).tasks.map(x=>x.id)),new Set(['t1','local','remote']));
});
test('first install does not resurrect local-only records or fields',()=>{
  const local=copy(base),remote=copy(base);remote.chores[0].time='18:30';remote.fsChecked.day.b1=true;local.tasks.push({id:'local-only'});local._savedAt=9999999999999;
  local.fsChecked.oldDay={old:true};local.habits.push({id:'old-habit'});local.settings.retired='old';
  const before=JSON.stringify(local),result=Sync.merge(null,local,remote);
  assert.equal(Sync.signature(result),Sync.signature(remote));assert.equal(JSON.stringify(local),before);
});
test('canonical signature ignores save time and object property order',()=>{
  assert.equal(Sync.signature({a:1,b:{y:2,x:1},_savedAt:1}),Sync.signature({b:{x:1,y:2},a:1,_savedAt:999}));
});
test('merge is pure and idempotent',()=>{
  const b=copy(base),l=copy(base),r=copy(base);l.tasks[0].title='new';r.tasks[0].done=true;
  const frozen=[JSON.stringify(b),JSON.stringify(l),JSON.stringify(r)],out=Sync.merge(b,l,r);
  assert.deepEqual([JSON.stringify(b),JSON.stringify(l),JSON.stringify(r)],frozen);assert.deepEqual(Sync.merge(out,out,out),out);
});

function harness(){
  const storage=new Map(),timers=new Map(),events={},stats={writes:[],renders:0,enables:0,listeners:[]};let counter=0;
  const doc={visibilityState:'visible',activeElement:null,addEventListener:(k,v)=>events[k]=v,getElementById:()=>null};
  const ctx={console,EditFlowSync:Sync,window:{},document:doc,Date,Intl,JSON,Map,Set,Promise,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
    setTimeout:fn=>{const id=++counter;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    S:copy(base),DB:'fixture-db',V:'today',TEAM_KEYS:[],TEAM_SHARE_OK:false,
    migrate:s=>s,defState:()=>({tasks:[],chores:[],settings:{},abstinence:{records:{}}}),
    render:()=>stats.renders++,renderAuthUI:()=>{},renderSyncGate:()=>{},toast:()=>{},
    _stampTeamChanges:()=>{},_teamSave:async()=>{},fbSetupTeamSync:()=>{},
    firebase:{firestore:{FieldValue:{serverTimestamp:()=>({server:true})}}},
  };
  ctx.window.addEventListener=(k,v)=>events[k]=v;
  ctx.fbDb={enableNetwork:async()=>{stats.enables++;},collection:()=>({doc:()=>({onSnapshot:(options,fn)=>{stats.options=options;stats.listeners.push(fn);return()=>{};}})}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>({json:JSON.stringify(stats.server||base)})}),set:(_ref,payload)=>stats.writes.push(JSON.parse(payload.json))})};
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('let FB_USER=null;'),html.indexOf('// ===チーム共有')),ctx);
  vm.runInContext("FB_USER={uid:'test-account'};fbSetupRealtimeSync();",ctx);
  const snapshot=(state,ts=200,fromCache=false,pending=false)=>stats.listeners.at(-1)({exists:true,metadata:{fromCache,hasPendingWrites:pending},data:()=>({json:JSON.stringify(state),ts:{toMillis:()=>ts}})});
  return {ctx,stats,storage,timers,events,snapshot,run:s=>vm.runInContext(s,ctx)};
}
test('cache-first then identical server metadata confirms without a reconnect loop',()=>{
  const h=harness();h.snapshot(base,200,true);assert.equal(h.run('_personalServerReady'),false);assert.equal(h.stats.writes.length,0);
  h.snapshot(base,200,false);assert.equal(h.stats.options.includeMetadataChanges,true);assert.equal(h.run('_personalServerReady'),true);assert.equal(h.run('PERSONAL_SYNC_STATE'),'synced');assert.equal(h.run('_firestoreReconnectTimer'),null);
});
test('future local clock and sub-two-second updates cannot suppress cloud data',()=>{
  const h=harness();h.ctx.S._savedAt=9999999999999;h.snapshot(base,200);
  const remote=copy(base);remote.chores[0].time='18:30';h.snapshot(remote,201);assert.equal(h.ctx.S.chores[0].time,'18:30');
});
test('stale first connection is backed up and never echoed into cloud',async()=>{
  const h=harness();h.ctx.S.tasks.push({id:'stale',title:'old task'});h.ctx.S.habits.push({id:'stale-habit'});
  h.run("_loadPersonalSyncBaseline('test-account')");
  h.snapshot(base);
  assert.equal(Sync.signature(h.ctx.S),Sync.signature(base));
  const backups=[...h.storage].filter(([k])=>k.startsWith('ef_sync_backup_'));
  assert.equal(backups.length,1);const saved=JSON.parse(backups[0][1]);
  assert.equal(saved._backupReason,'before-first-cloud-apply-v3');
  assert.ok(saved.tasks.some(t=>t.id==='stale'));assert.equal(saved.habits[0].id,'stale-habit');
  await h.run('_flushFirebaseSave()');assert.equal(h.stats.writes.length,0);
});
test('new edits during first server wait survive but unchanged stale items do not',async()=>{
  const h=harness();h.ctx.S.tasks.push({id:'stale'});h.run("_loadPersonalSyncBaseline('test-account')");
  h.ctx.S.tasks.push({id:'new',title:'just added'});h.ctx.S.tasks[0].title='new edit';
  const cloud=copy(base);cloud.tasks[0].done=true;h.snapshot(cloud);
  assert.deepEqual(h.ctx.S.tasks.map(t=>t.id),['t1','new']);
  assert.equal(h.ctx.S.tasks[0].title,'new edit');assert.equal(h.ctx.S.tasks[0].done,true);
  h.stats.server=cloud;await h.run('_flushFirebaseSave()');
  assert.equal(h.stats.writes.length,1);assert.ok(!h.stats.writes[0].tasks.some(t=>t.id==='stale'));
});
test('first connection requires a fresh backup even with three existing backups',()=>{
  const h=harness();h.run("syncBackupKeys=()=>['ef_sync_backup_test-account_v3_1','ef_sync_backup_old_2','ef_sync_backup_old_3']");
  h.ctx.S.tasks.push({id:'stale'});h.run("_loadPersonalSyncBaseline('test-account')");h.snapshot(base);
  const saved=[...h.storage].filter(([k])=>k.startsWith('ef_sync_backup_'));
  assert.equal(saved.length,1);assert.ok(JSON.parse(saved[0][1]).tasks.some(t=>t.id==='stale'));
});
test('old phone snapshot respects cloud task deletion on initial connection and restart',async()=>{
  const h=harness(),cloud=copy(base);cloud.tasks[0].deleted=true;cloud.tasks[0].updatedAt=200;
  h.snapshot(cloud);assert.equal(h.ctx.S.tasks[0].deleted,true);
  h.run("_loadPersonalSyncBaseline('test-account')");h.snapshot(cloud,201);h.stats.server=cloud;
  await h.run('_flushFirebaseSave()');assert.equal(h.ctx.S.tasks[0].deleted,true);assert.equal(h.stats.writes.length,0);
});
test('invalid or other-account persisted baseline cannot bypass first-sync safeguards',()=>{
  for(const state of [null,[],{_uid:'other-account',tasks:[]}]){
    const h=harness();h.storage.set('ef_personal_sync_base_test-account',JSON.stringify({uid:'test-account',state}));
    h.ctx.S.tasks.push({id:'stale'});h.run("_loadPersonalSyncBaseline('test-account')");h.snapshot(base);
    assert.ok(!h.ctx.S.tasks.some(t=>t.id==='stale'));
    assert.ok([...h.storage.keys()].some(k=>k.startsWith('ef_sync_backup_')));
  }
});
test('backup failure blocks local replacement, baseline acknowledgement, and cloud writes',async()=>{
  const h=harness();h.ctx.S.tasks.push({id:'stale'});h.run("_loadPersonalSyncBaseline('test-account')");
  const before=JSON.stringify(h.ctx.S);h.ctx.localStorage.setItem=()=>{throw Error('quota');};h.snapshot(base);
  assert.equal(JSON.stringify(h.ctx.S),before);assert.equal(h.run('_personalSyncBase'),null);
  assert.equal(h.run('_personalServerReady'),false);assert.equal(h.run('PERSONAL_SYNC_STATE'),'error');
  await h.run('_flushFirebaseSave()');assert.equal(h.stats.writes.length,0);
});
test('backup readback failure also fails closed',()=>{
  const h=harness();h.ctx.S.tasks.push({id:'stale'});h.run("_loadPersonalSyncBaseline('test-account')");
  h.ctx.localStorage.setItem=()=>{};h.snapshot(base);
  assert.ok(h.ctx.S.tasks.some(t=>t.id==='stale'));assert.equal(h.run('_personalServerReady'),false);
});
test('missing server document still seeds genuine first-time local work',async()=>{
  const h=harness();h.ctx.S.tasks.push({id:'new-account-task'});
  h.stats.listeners.at(-1)({exists:false,metadata:{fromCache:false,hasPendingWrites:false},data:()=>undefined});
  h.stats.server={};await h.run('_flushFirebaseSave()');
  assert.ok(h.stats.writes[0].tasks.some(t=>t.id==='new-account-task'));
});
test('server metadata-only acknowledgement does not repeatedly render or write',()=>{
  const h=harness();h.snapshot(base);const count=h.stats.renders;h.snapshot({...base,_savedAt:333},201);h.snapshot({...base,_savedAt:333},201);
  assert.equal(h.stats.renders,count);assert.equal(h.run('_fbSaveTimer'),null);
});
test('queued IME remote update survives blur despite a newer local timestamp',()=>{
  const h=harness();h.snapshot(base);h.run('_imeComposing=true');const remote=copy(base);remote.chores[0].time='18:30';h.snapshot(remote,201);
  assert.equal(h.ctx.S.chores[0].time,'18:00');h.ctx.S.settings.identity='local typing';h.ctx.S._savedAt=999999;h.run('_imeComposing=false;_flushQueuedCloudSync()');
  assert.equal(h.ctx.S.chores[0].time,'18:30');assert.equal(h.ctx.S.settings.identity,'local typing');
});
test('transaction rebases stale saved snapshot against newest server data',async()=>{
  const h=harness();h.snapshot(base);h.ctx.S.tasks[0].title='local';h.stats.server=copy(base);h.stats.server.tasks[0].done=true;h.stats.server.finance.incomes[0].amount=25;
  await h.run('_flushFirebaseSave()');assert.equal(h.stats.writes.length,1);assert.deepEqual(h.stats.writes[0].tasks,[{id:'t1',title:'local',done:true}]);assert.equal(h.stats.writes[0].finance.incomes[0].amount,25);
});
test('no writes occur before first server acknowledgement',async()=>{
  const h=harness();await h.run('_flushFirebaseSave()');assert.equal(h.stats.writes.length,0);
});
test('baseline restores unsent edits after restarting the app',()=>{
  const h=harness();h.snapshot(base);h.ctx.S.settings.identity='offline edit';h.run("_loadPersonalSyncBaseline('test-account')");const remote=copy(base);remote.chores[0].time='18:30';h.snapshot(remote,300);
  assert.equal(h.ctx.S.settings.identity,'offline edit');assert.equal(h.ctx.S.chores[0].time,'18:30');
});
test('background save persists locally and foreground resumes, with throttling',()=>{
  const h=harness();h.events.pagehide();assert.ok(h.storage.has('fixture-db'));h.events.pageshow();h.events.focus();assert.equal(h.stats.enables,1);
});
test('malformed server data fails closed without modifying local state',()=>{
  const h=harness();const before=JSON.stringify(h.ctx.S);h.stats.listeners.at(-1)({exists:true,metadata:{},data:()=>({json:'invalid',ts:{toMillis:()=>200}})});
  assert.equal(JSON.stringify(h.ctx.S),before);assert.equal(h.run('PERSONAL_SYNC_STATE'),'error');assert.equal(h.stats.writes.length,0);
});
test('quota pause blocks resume and writes',async()=>{
  const h=harness();h.run('_fbQuotaBlockedUntil=Date.now()+100000');h.events.pageshow();await h.run('_flushFirebaseSave()');assert.equal(h.stats.enables,0);assert.equal(h.stats.writes.length,0);
});
test('separate dates and morning/evening records are not overwritten',()=>{
  const b={journals:[{date:'2026-10-01',type:'morning',content:'base'}],workouts:[]};
  const l=copy(b),r=copy(b);l.journals[0].content='local';r.journals.push({date:'2026-10-01',type:'evening',content:'remote'});l.workouts.push({date:'2026-10-01',entries:[{id:'a'}]});r.workouts.push({date:'2026-10-02',entries:[{id:'b'}]});
  const result=Sync.merge(b,l,r);assert.equal(result.journals.length,2);assert.equal(result.journals[0].content,'local');assert.equal(result.workouts.length,2);
});
test('habit checks on different dates merge and an explicit undo is retained',()=>{
  const b={habits:[{id:'h',completedDates:['a']}]},l=copy(b),r=copy(b);
  l.habits[0].completedDates=['b'];r.habits[0].completedDates=['a','c'];
  assert.deepEqual(new Set(Sync.merge(b,l,r).habits[0].completedDates),new Set(['b','c']));
});
test('two device save/receive cycles converge without echo writes',async()=>{
  const pc=harness(),phone=harness();pc.snapshot(base);phone.snapshot(base);
  pc.ctx.S.chores[0].time='18:30';pc.ctx.S.fsChecked.day.b1=true;await pc.run('_flushFirebaseSave()');
  const first=pc.stats.writes[0];pc.snapshot(first,301);
  phone.ctx.S.tasks[0].done=true;phone.ctx.S.settings.identity='phone';phone.stats.server=first;await phone.run('_flushFirebaseSave()');
  const second=phone.stats.writes[0];phone.snapshot(second,302);pc.snapshot(second,302);
  assert.equal(Sync.signature(pc.ctx.S),Sync.signature(phone.ctx.S));assert.equal(pc.ctx.S.tasks[0].done,true);assert.equal(phone.ctx.S.chores[0].time,'18:30');assert.equal(phone.ctx.S.fsChecked.day.b1,true);
  pc.stats.server=second;phone.stats.server=second;await pc.run('_flushFirebaseSave()');await phone.run('_flushFirebaseSave()');assert.equal(pc.stats.writes.length,1);assert.equal(phone.stats.writes.length,1);
});
test('acknowledged data cannot cross accounts',()=>{
  const h=harness();h.run("FB_USER={uid:'another-account'}");const changed=copy(base);changed.tasks[0].title='wrong account';h.snapshot(changed);assert.equal(h.ctx.S.tasks[0].title,'fixture');
});
test('pending SDK writes are not treated as server confirmation',()=>{
  const h=harness();h.snapshot(base,200,false,true);assert.equal(h.run('_personalServerReady'),false);assert.equal(h.run('_lastPersonalSyncSignature'),'');
});
test('all inline scripts parse and both published entrypoints match',()=>{
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.equal(html,fs.readFileSync(path.join(__dirname,'../editflow.html'),'utf8'));
});
test('concurrent habit outcomes remain mutually exclusive',()=>{
  const b={habits:[{id:'h',completedDates:[],failedDates:[]}]},l=copy(b),r=copy(b);
  l.habits[0].failedDates=['day'];r.habits[0].completedDates=['day'];
  const h=Sync.merge(b,l,r).habits[0];assert.deepEqual(h.completedDates,[]);assert.deepEqual(h.failedDates,['day']);
});
