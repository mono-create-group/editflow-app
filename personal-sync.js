/* Pure, account-scoped three-way merge. No network or browser storage access. */
(function(root){
  'use strict';
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  function stable(v){
    if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
    if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
    return JSON.stringify(v);
  }
  const equal=(a,b)=>stable(a)===stable(b);
  function key(x){if(!object(x))return null;if(x.id!==undefined)return 'id:'+x.id;if(x.date)return 'date:'+x.date+':'+(x.type||'morning');if(x.name)return 'name:'+x.name;return null;}
  function keyed(a){return Array.isArray(a)&&a.every(x=>key(x)!==null)&&new Set(a.map(key)).size===a.length;}
  function mergeValue(base,local,remote,field=''){
    if(equal(local,base))return clone(remote);
    if(equal(remote,base)||equal(local,remote))return clone(local);
    if(object(local)&&object(remote)&&(base===undefined||object(base))){
      const out={};
      new Set([...Object.keys(base||{}),...Object.keys(remote),...Object.keys(local)]).forEach(k=>{
        if(k==='__proto__'||k==='constructor'||k==='prototype')return;
        const value=mergeValue(own(base,k)?base[k]:undefined,own(local,k)?local[k]:undefined,own(remote,k)?remote[k]:undefined,k);
        if(value!==undefined)out[k]=value;
      });
      if(Array.isArray(local.completedDates)&&Array.isArray(remote.completedDates)&&(Array.isArray(local.failedDates)||Array.isArray(remote.failedDates))){
        const status=(value,date)=>(value?.completedDates||[]).includes(date)?'done':(value?.failedDates||[]).includes(date)?'failed':'';
        const dates=new Set([...(base?.completedDates||[]),...(base?.failedDates||[]),...remote.completedDates,...(remote.failedDates||[]),...local.completedDates,...(local.failedDates||[])]);
        out.completedDates=[];out.failedDates=[];
        dates.forEach(date=>{const b=status(base,date),l=status(local,date),r=status(remote,date),value=l!==b?l:r;if(value==='done')out.completedDates.push(date);else if(value==='failed')out.failedDates.push(date);});
      }
      return out;
    }
    if(keyed(local)&&keyed(remote)&&(base===undefined||keyed(base))){
      const bm=new Map((base||[]).map(x=>[key(x),x])),lm=new Map(local.map(x=>[key(x),x])),rm=new Map(remote.map(x=>[key(x),x]));
      const ids=a=>(a||[]).map(key);
      const order=equal(ids(local),ids(base))?[...ids(remote),...ids(local)]:[...ids(local),...ids(remote)];
      return [...new Set(order)].map(id=>mergeValue(bm.get(id),lm.get(id),rm.get(id))).filter(x=>x!==undefined);
    }
    if(['completedDates','failedDates'].includes(field)&&Array.isArray(local)&&Array.isArray(remote)&&(base===undefined||Array.isArray(base))){
      const b=new Set(base||[]),l=new Set(local),r=new Set(remote);
      return [...new Set([...remote,...local])].filter(date=>l.has(date)!==b.has(date)?l.has(date):r.has(date));
    }
    // Two edits to the same scalar: preserve this device's unsent user change.
    return clone(local);
  }
  function bootstrap(local,remote){
    // Before the first acknowledged baseline, do not let a stale device replace
    // an existing cloud value. Retain local-only records/fields and a UI backup.
    if(remote===undefined)return clone(local);
    if(object(local)&&object(remote)){
      const out=clone(remote);
      Object.keys(local).forEach(k=>{if(!['__proto__','constructor','prototype'].includes(k))out[k]=bootstrap(local[k],remote[k]);});
      return out;
    }
    if(keyed(local)&&keyed(remote)){
      const rm=new Map(remote.map(x=>[key(x),x]));
      const out=remote.map(x=>clone(x));
      local.forEach(x=>{if(!rm.has(key(x)))out.push(clone(x));});
      return out;
    }
    return clone(remote);
  }
  function signature(state){const copy={...(state||{})};delete copy._savedAt;return stable(copy);}
  function merge(base,local,remote){
    const out=base===null?bootstrap(local||{},remote||{}):mergeValue(base||{},local||{},remote||{});
    out._savedAt=Math.max(Number(local?._savedAt)||0,Number(remote?._savedAt)||0);
    return out;
  }
  const api=Object.freeze({merge,signature,equal,clone});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.EditFlowSync=api;
})(typeof window==='object'?window:globalThis);
