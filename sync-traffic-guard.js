/* Browser-local safety estimates, NOT Firebase billing or a project-wide quota. */
(function(root){
  'use strict';
  const LIMITS=Object.freeze({read:3000,write:800,listen:120});
  function create({storage,now=Date.now,dayKey,limits=LIMITS,key='ef_sync_traffic_v1',burstLimit=120}={}){
    function load(){
      const at=now(),day=dayKey(at),raw=storage.getItem(key),saved=raw?JSON.parse(raw):null;
      if(saved&&saved.day===day){
        for(const k of Object.keys(limits))if(!Number.isFinite(saved[k])||saved[k]<0)throw Error('invalid usage counter');
        return saved;
      }
      return {day,read:0,write:0,listen:0,windowAt:at,windowCount:0};
    }
    function snapshot(){try{return {...load(),limits};}catch(_){return {unavailable:true,limits};}}
    function record(kind){
      if(!Object.prototype.hasOwnProperty.call(limits,kind))throw Error('unknown traffic kind');
      try{
        const state=load(),at=now();
        if(state[kind]>=limits[kind])return {ok:false,reason:'daily',kind};
        if(!Number.isFinite(state.windowAt)||at-state.windowAt>=60000||at<state.windowAt){state.windowAt=at;state.windowCount=0;}
        if(state.windowCount>=burstLimit)return {ok:false,reason:'burst',kind,retryAt:state.windowAt+60000};
        state[kind]++;state.windowCount=(Number(state.windowCount)||0)+1;
        const encoded=JSON.stringify(state);storage.setItem(key,encoded);
        if(storage.getItem(key)!==encoded)throw Error('usage counter not saved');
        return {ok:true};
      }catch(_){return {ok:false,reason:'storage',kind};}
    }
    return Object.freeze({record,snapshot});
  }
  function pressureError(entry){
    if(!entry||!String(entry.type||'').includes('firestore'))return null;
    if(!/resource-exhausted|quota exceeded|maximum allowed queued writes/i.test(String(entry.message||'')))return null;
    return {code:'resource-exhausted',message:'Firestore stream pressure'};
  }
  const api=Object.freeze({create,pressureError,LIMITS});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.EditFlowTraffic=api;
})(typeof window==='object'?window:globalThis);
