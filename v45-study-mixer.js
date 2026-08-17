(function attachV45StudyMixer(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.V45StudyMixer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='45.1.0';
 const uniqueEntries=entries=>{const out=[],seen=new Set();for(const e of Array.isArray(entries)?entries:[]){const id=String(e?.card?.id||e?.id||'');if(!id||seen.has(id))continue;seen.add(id);out.push(e.card?e:{card:e,kind:'review'});}return out;};
 function cadenceForBacklog(dueCount,requested=2){if(dueCount>=260)return Math.max(1,Math.min(3,Number(requested)||2));return Math.max(1,Math.min(2,Number(requested)||2));}
 function plan(options={}){
   const due=uniqueEntries((options.dueCards||[]).map(card=>({card,kind:'review'})));
   const news=uniqueEntries((options.newCards||[]).map(card=>({card,kind:'new'})));
   const repair=uniqueEntries((options.repairCards||[]).map(card=>({card,kind:'reinforcement'})));
   const reviewOnly=options.reviewOnly===true,canNew=options.canNew!==false&&!reviewOnly&&news.length>0;
   if(options.forceNew&&canNew)return [news[0],...due.slice(0,2)];
   if(reviewOnly)return due.length?due:repair;
   if(!due.length)return canNew?[news[0],...repair]:repair;
   if(!canNew)return due.length?due:repair;
   if(String(options.queueStyle||'mixed')==='newFirst')return [news[0],...due];
   const cadence=cadenceForBacklog(due.length,options.reviewsBeforeNew);
   const since=Math.max(0,Number(options.reviewSinceNew)||0);
   const needed=Math.max(0,cadence-since);
   if(needed===0)return [news[0],...due];
   const head=due.slice(0,needed),tail=due.slice(needed);
   return [...head,news[0],...tail];
 }
 return Object.freeze({VERSION,cadenceForBacklog,plan});
});