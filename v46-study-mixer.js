(function attachV46StudyMixer(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V46StudyMixer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function createV46StudyMixer(){
  'use strict';
  const VERSION='46.0.0';
  const PATTERNS=Object.freeze({
    reviewFirst:Object.freeze(['review','review','review','new','review','review','new','review','review','new']),
    mixed:Object.freeze(['review','review','new','review','review','new','review','review','new','review']),
    newFirst:Object.freeze(['new','review','review','new','review','review','new','review','review','review'])
  });
  const BALANCED_PATTERN=PATTERNS.mixed;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const cardId=card=>String(card?.id??'').trim();
  function patternFor(style){return PATTERNS[String(style||'mixed')]||PATTERNS.mixed;}
  function uniqueCards(cards){const out=[],seen=new Set();for(const card of Array.isArray(cards)?cards:[]){const id=cardId(card);if(!id||seen.has(id))continue;seen.add(id);out.push(card);}return out;}
  function normalizePhase(value){const phase=Math.floor(finite(value,0));return((phase%10)+10)%10;}
  function managedEntry(card,kind,phase,expected=kind,style='mixed'){return{card,kind,mixManaged:true,mixPhase:phase,mixExpected:expected,mixStyle:style};}
  function unmanagedEntry(card,kind,reason='fallback'){return{card,kind,mixManaged:false,mixReason:reason};}
  function plan(options={}){
    const due=uniqueCards(options.dueCards),news=uniqueCards(options.newCards),repair=uniqueCards(options.repairCards);
    const reviewOnly=options.reviewOnly===true,canNew=options.canNew!==false&&!reviewOnly&&news.length>0,forceNew=options.forceNew===true;
    const phase=normalizePhase(options.mixPhase),style=String(options.queueStyle||'mixed'),pattern=patternFor(style);
    if(forceNew&&canNew)return[unmanagedEntry(news[0],'new','manual-new')];
    if(reviewOnly){if(due.length)return due.map(card=>unmanagedEntry(card,'review','review-only'));return repair.map(card=>unmanagedEntry(card,'reinforcement','review-only-repair'));}
    const both=due.length>0&&canNew;
    if(both){
      const expected=pattern[phase];
      if(expected==='new')return[managedEntry(news[0],'new',phase,'new',style),...due.slice(0,2).map(card=>unmanagedEntry(card,'review','queue-preview'))];
      return due.slice(0,3).map(card=>managedEntry(card,'review',phase,'review',style)).concat(news.length?[unmanagedEntry(news[0],'new','spacing-fallback')]:[]).slice(0,4);
    }
    if(due.length)return due.slice(0,4).map(card=>unmanagedEntry(card,'review','review-pool-only'));
    if(canNew)return[unmanagedEntry(news[0],'new','new-pool-only'),...repair.slice(0,2).map(card=>unmanagedEntry(card,'reinforcement','repair-preview'))];
    return repair.slice(0,4).map(card=>unmanagedEntry(card,'reinforcement','repair-only'));
  }
  function recordOutcome(day,entry){
    if(!day||typeof day!=='object'||!entry||entry.mixManaged!==true)return day;
    const phase=normalizePhase(entry.mixPhase),kind=entry.kind==='new'?'new':'review';
    day.mixPhase=(phase+1)%10;
    const history=Array.isArray(day.mixHistory)?day.mixHistory:[];history.push(kind);day.mixHistory=history.slice(-40);
    day.mixNewServed=Math.max(0,Math.floor(finite(day.mixNewServed)))+(kind==='new'?1:0);
    day.mixReviewServed=Math.max(0,Math.floor(finite(day.mixReviewServed)))+(kind==='review'?1:0);
    return day;
  }
  function mixSnapshot(day={},style='mixed'){
    const history=(Array.isArray(day.mixHistory)?day.mixHistory:[]).filter(kind=>kind==='new'||kind==='review').slice(-10),phase=normalizePhase(day.mixPhase);
    return Object.freeze({phase,next:patternFor(style)[phase],recent:history,newCount:history.filter(kind=>kind==='new').length,reviewCount:history.filter(kind=>kind==='review').length});
  }
  return Object.freeze({VERSION,PATTERNS,BALANCED_PATTERN,patternFor,normalizePhase,plan,recordOutcome,mixSnapshot});
});