(function attachV20QueuePolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20QueuePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20QueuePolicy() {
  'use strict';
  const VERSION = '43.0.0-beta';
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const cardId=card=>card&&card.id!==null&&card.id!==undefined?String(card.id).trim():'';
  function hasStudyEvidence(card){return finite(card&&card.introducedAt)>0||finite(card&&card.studySeenAt)>0||finite(card&&card.studyReviews)>0||finite(card&&card.sessionAttempts)>0;}
  function reviewable(card){return Boolean(cardId(card)&&card&&!card.deleted&&card.state!=='suspended'&&card.state!=='known'&&hasStudyEvidence(card));}
  function recentHistory(values,gap){return (Array.isArray(values)?values:[]).map(value=>value==null?'':String(value).trim()).filter(Boolean).slice(-Math.max(1,gap));}
  function isSpaced(id,history,gap){return Boolean(id)&&!history.slice(-gap).includes(id);}
  function interleaveRecentReviews(normalQueue,reviewableCards,options={}){
    const gap=Math.max(1,Math.min(4,Math.floor(finite(options.gap,2)))),now=finite(options.now,Date.now()),allHistory=(Array.isArray(options.recentCardIds)?options.recentCardIds:[]).map(value=>value==null?'':String(value).trim()).filter(Boolean),history=recentHistory(allHistory,gap),ordinary=[],ordinaryIds=new Set();
    for(const raw of Array.isArray(normalQueue)?normalQueue:[]){if(!raw||!raw.card)continue;const id=cardId(raw.card);if(!id||ordinaryIds.has(id))continue;ordinary.push({...raw,card:raw.card});ordinaryIds.add(id);}
    if(!ordinary.length||!history.length)return ordinary;
    const maturedId=allHistory.length>gap?allHistory[allHistory.length-gap-1]:'';
    if(maturedId&&!history.includes(maturedId)){const maturedIndex=ordinary.findIndex(entry=>cardId(entry.card)===maturedId);if(maturedIndex>0){const [matured]=ordinary.splice(maturedIndex,1);ordinary.unshift(matured);}}
    const seen=new Set(ordinaryIds),bridges=(Array.isArray(reviewableCards)?reviewableCards:[]).filter(reviewable).filter(card=>{const id=cardId(card);if(!id||seen.has(id))return false;seen.add(id);return true;}).slice().sort((left,right)=>{const a=finite(left.dueAt,Number.MAX_SAFE_INTEGER),b=finite(right.dueAt,Number.MAX_SAFE_INTEGER),af=a>now?1:0,bf=b>now?1:0;return af-bf||a-b||cardId(left).localeCompare(cardId(right));});
    const pending=ordinary.slice(),output=[],used=new Set();let bridgeIndex=0;const maxSteps=pending.length+bridges.length+gap+4;
    for(let step=0;pending.length&&step<maxSteps;step+=1){const safeIndex=pending.findIndex(entry=>isSpaced(cardId(entry.card),history,gap));if(safeIndex>=0){const [entry]=pending.splice(safeIndex,1),id=cardId(entry.card);output.push(entry);used.add(id);history.push(id);if(history.length>gap)history.splice(0,history.length-gap);continue;}let bridge=null;while(bridgeIndex<bridges.length&&!bridge){const candidate=bridges[bridgeIndex++],id=cardId(candidate);if(!used.has(id)&&isSpaced(id,history,gap))bridge=candidate;}if(!bridge)break;const id=cardId(bridge);output.push({card:bridge,kind:finite(bridge.dueAt)<=now?'review':'early-review'});used.add(id);history.push(id);if(history.length>gap)history.splice(0,history.length-gap);}
    return output;
  }
  function isActiveReview(entry){if(!entry||!entry.card||entry.kind==='new')return false;return reviewable(entry.card)||['review','early-review','reinforcement','repair'].includes(String(entry.kind||''));}
  function visibleReviewCount(dueCount,currentEntry){const due=Math.max(0,Math.floor(finite(dueCount)));return isActiveReview(currentEntry)?Math.max(1,due):due;}
  function reviewKindLabel(entry,now=Date.now()){if(!entry||!entry.card)return'No card';const kind=String(entry.kind||'').toLowerCase();if(kind==='new')return'New word';if(kind==='reinforcement'||kind==='repair')return'Reinforcement';if(kind==='early-review')return'Early review';return finite(entry.card.dueAt,0)>finite(now,Date.now())?'Early review':'Due review';}
  return Object.freeze({VERSION,interleaveRecentReviews,visibleReviewCount,reviewKindLabel});
});
