(function attachV44Runtime(root,factory){
  const memory=root&&root.V20StudyMemory?root.V20StudyMemory:(typeof require==='function'?safeRequire('./v20-study-memory.js'):null);
  const learning=root&&root.V16Learning?root.V16Learning:(typeof require==='function'?safeRequire('./v16-learning.js'):null);
  const api=factory(root,memory,learning);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V44Runtime=api;

  function safeRequire(path){try{return require(path);}catch(_error){return null;}}
})(typeof globalThis!=='undefined'?globalThis:this,function(root,Memory,Learning){
  'use strict';
  const VERSION='44.1.0-beta';
  const MEMORY_STATE_VERSION=44;
  const DAY=86400000;
  const CARRYOVER_TTL_MS=36*60*60*1000;
  const SHORT_TERM_TARGET=Number(Memory?.SHORT_TERM_TARGET)||90;
  const unique=values=>[...new Set((Array.isArray(values)?values:[]).map(String).filter(Boolean))];
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
  let lowPower=false;

  function localDayKey(timestamp=Date.now()){
    const date=new Date(finite(timestamp,Date.now()));
    const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }
  function sameLocalDay(left,right){return localDayKey(left)===localDayKey(right);}
  function dayEnd(timestamp=Date.now()){
    const date=new Date(finite(timestamp,Date.now()));
    return new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
  }
  function defaultCalibration(){
    return Learning?.defaultCalibration?Learning.defaultCalibration():{version:44,samples:0,weightedSamples:0,observedSum:0,predictedSum:0,brierSum:0};
  }
  function calibrationSummary(calibration){
    return Learning?.calibrationSummary?Learning.calibrationSummary(calibration||defaultCalibration()):{
      samples:0,weightedSamples:0,observedPercent:0,predictedPercent:0,calibrationPercent:0,brierScore:0,status:'learning'
    };
  }
  function calibrationView(calibration,learning=Learning){
    const migrated=learning?.migrateCalibration?learning.migrateCalibration(calibration||{}):(calibration||{});
    const summary=learning?.calibrationSummary?learning.calibrationSummary(migrated):calibrationSummary(migrated);
    const samples=Math.max(0,Math.round(finite(summary.samples,0)));
    return {
      ...summary,
      samples,
      display:samples?`${Math.round(finite(summary.calibrationPercent??summary.observedPercent,0))}%`:'Learning',
      detail:samples?`${Math.round(finite(summary.observedPercent,0))}% actual · ${Math.round(finite(summary.predictedPercent,0))}% expected · Brier ${finite(summary.brierScore,0).toFixed(3)}`:'Waiting for delayed independent recalls'
    };
  }
  function cardEvidenceTimes(card){
    const values=[];
    for(const value of [card?.introducedAt,card?.studySeenAt,card?.lastReviewedAt,card?.shortTermUpdatedAt]){
      const number=finite(value,0);if(number>0)values.push(number);
    }
    for(const item of Array.isArray(card?.history)?card.history:[]){const time=finite(item?.time,0);if(time>0)values.push(time);}
    return values.sort((a,b)=>a-b);
  }
  function hasStudyEvidence(card){
    return Boolean(card&&(
      finite(card.introducedAt,0)>0||finite(card.studySeenAt,0)>0||finite(card.lastReviewedAt,0)>0||
      finite(card.studyReviews,0)>0||finite(card.sessionAttempts,0)>0||finite(card.shortTermMastery,0)>0||
      (Array.isArray(card.history)&&card.history.some(item=>String(item?.source||'study')!=='ranked'))
    ));
  }
  function migrateCard(card,now=Date.now()){
    if(!card||typeof card!=='object')return false;
    let changed=false;
    if(Array.isArray(card.history)){
      const sorted=card.history.slice().sort((a,b)=>finite(a?.time,0)-finite(b?.time,0));
      if(sorted.some((item,index)=>item!==card.history[index])){card.history=sorted;changed=true;}
    }else{card.history=[];changed=true;}
    const times=cardEvidenceTimes(card);
    if(!finite(card.introducedAt,0)&&hasStudyEvidence(card)){
      card.introducedAt=times[0]||finite(card.createdAt,0)||now;changed=true;
    }
    if(finite(card.shortTermMastery,0)>0&&!finite(card.shortTermUpdatedAt,0)){
      card.shortTermUpdatedAt=times[times.length-1]||finite(card.introducedAt,0)||now;changed=true;
    }
    if(finite(card.shortTermUpdatedAt,0)>0){
      const key=localDayKey(card.shortTermUpdatedAt);
      if(card.shortTermDayKey!==key){card.shortTermDayKey=key;changed=true;}
    }
    if(card.memoryStateVersion!==MEMORY_STATE_VERSION){card.memoryStateVersion=MEMORY_STATE_VERSION;changed=true;}
    for(const key of ['shortTermMastery','memoryScore','stability','difficulty','intervalDays']){
      if(card[key]!==undefined&&!Number.isFinite(Number(card[key]))){card[key]=0;changed=true;}
    }
    if(card.dueAt!==undefined&&card.dueAt!==null&&!Number.isFinite(Number(card.dueAt))){
      card.dueAt=finite(card.lastReviewedAt,0)||finite(card.introducedAt,0)||now;changed=true;
    }
    return changed;
  }
  function migrateState(state,options={}){
    if(!state||typeof state!=='object')throw new TypeError('state is required');
    const now=finite(options.now,Date.now());let changed=false;
    if(Number(state.schemaVersion)!==MEMORY_STATE_VERSION){state.schemaVersion=MEMORY_STATE_VERSION;changed=true;}
    state.profile=state.profile&&typeof state.profile==='object'?state.profile:{};
    const previousCalibration=state.profile.memoryCalibration;
    state.profile.memoryCalibration=Learning?.migrateCalibration?Learning.migrateCalibration(previousCalibration||{}):(previousCalibration||defaultCalibration());
    if(state.profile.memoryCalibration!==previousCalibration)changed=true;
    state.settings=state.settings&&typeof state.settings==='object'?state.settings:{};
    if(!Array.isArray(state.settings.carryoverWeakCardIds)){state.settings.carryoverWeakCardIds=[];changed=true;}
    if(!Array.isArray(state.sectionCarryover)){state.sectionCarryover=[];changed=true;}
    if(!Array.isArray(state.continuedWeakCardIds)){state.continuedWeakCardIds=unique(state.settings.carryoverWeakCardIds);changed=true;}
    const books=Array.isArray(state.books)?state.books:[];
    for(const book of books)for(const card of Array.isArray(book?.cards)?book.cards:[])if(migrateCard(card,now))changed=true;
    const book2=options.book2;
    if(book2?.ensureInState){const before=Array.isArray(state.books)?state.books.length:0;book2.ensureInState(state,{now});if((state.books||[]).length!==before)changed=true;}
    return {state,changed};
  }
  function ensureState(state,options={}){migrateState(state,options);return state;}
  function shortTermOf(card,now,longTermOf){
    if(Memory?.effectiveShortTerm)return clamp(Memory.effectiveShortTerm(card,now,typeof longTermOf==='function'?longTermOf(card):finite(card?.memoryScore,0)),0,100);
    return clamp(card?.shortTermMastery,0,100);
  }
  function makeCarryover(cards,cardIds,options={}){
    const now=finite(options.now,Date.now()),target=finite(options.target,SHORT_TERM_TARGET),ttl=Math.max(60000,finite(options.ttlMs,CARRYOVER_TTL_MS));
    const map=new Map((Array.isArray(cards)?cards:[]).filter(Boolean).map(card=>[String(card.id),card]));
    return unique(cardIds).flatMap(cardId=>{
      const card=map.get(cardId);if(!card||card.deleted||card.state==='known'||card.state==='suspended')return[];
      const score=typeof options.shortTermOf==='function'?clamp(options.shortTermOf(card),0,100):shortTermOf(card,now,options.longTermOf);
      if(score>=target)return[];
      return [{cardId,sourceSetId:String(options.sourceSetId||''),createdAt:now,expiresAt:now+ttl}];
    });
  }
  function activeCarryover(records,cards,options={}){
    const now=finite(options.now,Date.now()),target=finite(options.target,SHORT_TERM_TARGET),map=new Map((Array.isArray(cards)?cards:[]).filter(Boolean).map(card=>[String(card.id),card]));
    return (Array.isArray(records)?records:[]).filter(record=>{
      const card=map.get(String(record?.cardId));if(!card||card.deleted||card.state==='known'||card.state==='suspended'||finite(record?.expiresAt,0)<=now)return false;
      const score=typeof options.shortTermOf==='function'?clamp(options.shortTermOf(card),0,100):shortTermOf(card,now,options.longTermOf);
      return score<target;
    }).map(record=>({...record}));
  }
  function cleanContinuedWeakIds(state,cards,scoreOf,target=SHORT_TERM_TARGET){
    const map=new Map((Array.isArray(cards)?cards:[]).filter(Boolean).map(card=>[String(card.id),card]));
    const score=typeof scoreOf==='function'?scoreOf:card=>finite(card?.shortTermMastery,0);
    const source=unique([...(state?.continuedWeakCardIds||[]),...(state?.settings?.carryoverWeakCardIds||[])]);
    const kept=source.filter(id=>{const card=map.get(id);return card&&!card.deleted&&card.state!=='known'&&card.state!=='suspended'&&clamp(score(card),0,100)<target;});
    if(state){state.continuedWeakCardIds=kept;if(state.settings)state.settings.carryoverWeakCardIds=kept.slice();}
    return kept;
  }
  function markContinuedWeak(state,cardIds){
    if(!state||typeof state!=='object')return[];
    state.settings=state.settings&&typeof state.settings==='object'?state.settings:{};
    const merged=unique([...(state.continuedWeakCardIds||[]),...(state.settings.carryoverWeakCardIds||[]),...(cardIds||[])]);
    state.continuedWeakCardIds=merged;state.settings.carryoverWeakCardIds=merged.slice();return merged.slice();
  }
  function continuationDecision(cards,options={}){
    if(Memory?.sectionContinuationDecision)return Memory.sectionContinuationDecision(cards,options);
    const now=finite(options.now,Date.now()),target=finite(options.target,SHORT_TERM_TARGET),introduced=(Array.isArray(cards)?cards:[]).filter(hasStudyEvidence);
    const weak=introduced.filter(card=>shortTermOf(card,now,options.longTermOf)<target);
    const repeated=weak.filter(card=>finite(card.studyReviews,0)+finite(card.sessionAttempts,0)>=2);
    return {available:introduced.length===(cards||[]).length&&weak.length>0&&weak.length<=4&&repeated.length===weak.length,weakCardIds:weak.map(card=>String(card.id)),weakCount:weak.length};
  }
  function chooseNextSet(sets,currentId){const ordered=(Array.isArray(sets)?sets:[]).slice().sort((a,b)=>finite(a?.order,0)-finite(b?.order,0));const index=ordered.findIndex(set=>String(set?.id)===String(currentId));return index>=0?ordered[index+1]||null:null;}
  function setLowPower(enabled){
    lowPower=Boolean(enabled);
    try{
      const EventCtor=root?.CustomEvent;
      const event=typeof EventCtor==='function'?new EventCtor('studio:low-power-change',{detail:{enabled:lowPower}}):null;
      if(event&&typeof root?.dispatchEvent==='function')root.dispatchEvent(event);
      else if(event&&typeof root?.document?.dispatchEvent==='function')root.document.dispatchEvent(event);
    }catch(_error){}
    return lowPower;
  }
  function isLowPower(){return lowPower;}

  return Object.freeze({VERSION,MEMORY_STATE_VERSION,DAY,CARRYOVER_TTL_MS,localDayKey,sameLocalDay,dayEnd,defaultCalibration,calibrationSummary,calibrationView,migrateState,ensureState,makeCarryover,activeCarryover,cleanContinuedWeakIds,markContinuedWeak,continuationDecision,chooseNextSet,setLowPower,isLowPower});
});
