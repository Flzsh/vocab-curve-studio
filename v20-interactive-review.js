(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ProInteractiveReview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='20.0.0-alpha.20';
  const PHASES=new Set(['coach','recall','assess','complete']);

  function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
  function clamp(value,min,max){return Math.min(max,Math.max(min,finite(value,min)));}
  function text(value,max=160){return String(value??'').trim().slice(0,max);}
  function boolNumber(value){return value===true?1:0;}

  function normalizeOption(option,index){return {id:text(option&&option.id,30)||`option-${index+1}`,label:text(option&&option.label,240)||`Option ${index+1}`};}
  function normalizeCard(card,index){
    const options=(Array.isArray(card&&card.options)?card.options:[]).slice(0,4).map(normalizeOption);
    const reinforcementOptions=(Array.isArray(card&&card.reinforcement&&card.reinforcement.options)?card.reinforcement.options:[]).slice(0,4).map(normalizeOption);
    const coached=String(card&&card.interactionKind||'').includes('coach')||Boolean(card&&(card.supportBody||card.delayedPrompt||card.recallPrompt))&&!options.length;
    const answer=text(card&&card.answer,100)||text(card&&card.targetWord,100);
    return {
      planId:text(card&&card.planId,60)||`plan-${index+1}`,
      targetCardIds:(Array.isArray(card&&card.targetCardIds)?card.targetCardIds:[]).map(id=>text(id,100)).filter(Boolean).slice(0,3),
      connectionCardIds:(Array.isArray(card&&card.connectionCardIds)?card.connectionCardIds:[]).map(id=>text(id,100)).filter(Boolean).slice(0,3),
      learningObjective:text(card&&card.learningObjective,60)||'retrieval_repair',
      activityType:text(card&&card.activityType,60)||(coached?'application_pattern':'meaning_choice'),
      inputMode:'tap',interactionKind:coached?'guided_coach':'choice',
      title:text(card&&card.title,100),targetWord:text(card&&card.targetWord,100)||answer,
      supportTitle:text(card&&card.supportTitle,100)||text(card&&card.title,100)||'Focus',
      supportBody:text(card&&card.supportBody,900)||text(card&&card.application,900)||'Build one useful route to the word.',
      application:text(card&&card.application,500),
      delayedPrompt:text(card&&card.delayedPrompt,380)||text(card&&card.recallPrompt,380)||'Recall the word from its meaning.',
      answer:answer||'the target word',
      alternateSupport:text(card&&card.alternateSupport,560)||'Use another meaning boundary, then meet the word again in normal study.',
      prompt:text(card&&card.prompt,300)||'Choose the best answer.',options,correctOptionId:text(card&&card.correctOptionId,30),
      feedback:{correct:text(card&&card.feedback&&card.feedback.correct,260)||'Correct.',incorrect:text(card&&card.feedback&&card.feedback.incorrect,300)||'Review the distinction.',memoryCue:text(card&&card.feedback&&card.feedback.memoryCue,180)},
      reinforcement:{prompt:text(card&&card.reinforcement&&card.reinforcement.prompt,300)||'Choose the accurate follow-up.',options:reinforcementOptions,correctOptionId:text(card&&card.reinforcement&&card.reinforcement.correctOptionId,30),feedback:{correct:text(card&&card.reinforcement&&card.reinforcement.feedback&&card.reinforcement.feedback.correct,260)||'Right.',incorrect:text(card&&card.reinforcement&&card.reinforcement.feedback&&card.reinforcement.feedback.incorrect,300)||'Keep the exact boundary.'}}
    };
  }
  function normalizeReview(review){
    const cards=(Array.isArray(review&&review.reviewCards)?review.reviewCards:[]).slice(0,5).map(normalizeCard);
    const mode=String(review&&review.interactionMode||'').toLowerCase();
    const coached=['coach','coached','guided'].includes(mode)||cards.some(card=>card.interactionKind==='guided_coach');
    return {schemaVersion:8,interactionMode:coached?'coach':'tap',source:text(review&&review.source,20)||'local',reviewTitle:text(review&&review.reviewTitle,100)||'Pro Review',summary:'',reviewCards:cards};
  }
  function stableHash(value){
    let hash=2166136261;
    for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return hash>>>0;
  }
  function seededUnit(seed){
    let state=seed>>>0;
    return()=>{state+=0x6D2B79F5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296;};
  }
  function scrambledRecallOrder(cards){
    const source=(Array.isArray(cards)?cards:[]).map((_card,index)=>index);
    if(source.length<2)return source;
    const random=seededUnit(stableHash(cards.map(card=>card&&card.planId||'').join('|')+'|recall-v1'));
    // Sattolo's cycle produces a deterministic derangement for three or more
    // cards, so the recall pass cannot mirror the coaching order or leave a
    // target in the same ordinal position.
    if(source.length>2){
      for(let index=source.length-1;index>0;index-=1){
        const swapIndex=Math.floor(random()*index);
        [source[index],source[swapIndex]]=[source[swapIndex],source[index]];
      }
      return source;
    }
    return [1,0];
  }
  function buildSteps(review){
    const cards=review.reviewCards||[];
    if(review.interactionMode!=='coach')return cards.map((card,cardIndex)=>({id:`${card.planId}:choice`,kind:'choice',cardIndex,supportGap:0}));
    const supports=cards.map((card,cardIndex)=>({id:`${card.planId}:support`,kind:'support',cardIndex,supportGap:0}));
    if(cards.length===1)return supports;
    const recallOrder=scrambledRecallOrder(cards);
    const recalls=recallOrder.map((cardIndex,recallPosition)=>{
      const card=cards[cardIndex];
      const supportGap=Math.max(0,cards.length+recallPosition-cardIndex-1);
      return{id:`${card.planId}:recall`,kind:'recall',cardIndex,supportGap};
    });
    return [...supports,...recalls];
  }
  function initialCardState(now){return {supportComplete:false,alternateUsed:false,recallPhase:'recall',selfRating:'',selectedOptionId:'',reinforcementSelectedId:'',initialCorrect:null,reinforcementCorrect:null,startedAt:finite(now,Date.now()),supportCompletedAt:0,recallStartedAt:0,attemptCheckedAt:0,reinforcementStartedAt:0,completedAt:0};}
  function stageForStep(step,done=false){if(done)return'done';if(!step)return'done';return step.kind==='support'?'coach':step.kind==='recall'?'recall':'choice';}
  function createSession(review,now=Date.now()){
    const normalized=normalizeReview(review),steps=buildSteps(normalized),cardStates={};
    normalized.reviewCards.forEach(card=>{cardStates[card.planId]=initialCardState(now);});
    return {index:0,stage:stageForStep(steps[0]),review:normalized,steps,cardStates};
  }
  function currentStep(session){return session&&Array.isArray(session.steps)?session.steps[clamp(session.index,0,Math.max(0,session.steps.length-1))]||null:null;}
  function currentCard(session){const step=currentStep(session);return step&&session&&session.review?session.review.reviewCards[step.cardIndex]||null:null;}
  function rawState(session){const card=currentCard(session);return card&&session&&session.cardStates?session.cardStates[card.planId]||initialCardState(Date.now()):null;}
  function currentState(session){
    const step=currentStep(session),state=rawState(session);if(!step||!state)return null;
    if(session.stage==='done')return {...state,phase:'complete'};
    if(step.kind==='support')return {...state,phase:'coach'};
    if(step.kind==='recall')return {...state,phase:state.recallPhase||'recall'};
    return {...state,phase:state.reinforcementCorrect==null?(state.initialCorrect==null?'attempt':'reinforcement'):'complete'};
  }
  function withCardState(session,planId,nextState){return {...session,cardStates:{...(session.cardStates||{}),[planId]:nextState}};}
  function advanceSession(session){
    const nextIndex=session.index+1;
    if(nextIndex>=session.steps.length)return {...session,index:Math.max(0,session.steps.length-1),stage:'done'};
    const nextStep=session.steps[nextIndex];
    return {...session,index:nextIndex,stage:stageForStep(nextStep)};
  }
  function useAlternate(session){
    const card=currentCard(session),step=currentStep(session),state=rawState(session);
    if(!card||!step||step.kind!=='support'||!state||!card.alternateSupport)return session;
    return withCardState(session,card.planId,{...state,alternateUsed:!state.alternateUsed});
  }
  function selectOption(session,optionId){
    const card=currentCard(session),step=currentStep(session),state=rawState(session);if(!card||!step||!state)return session;
    const id=text(optionId,30);
    if(step.kind==='recall'){
      if(state.recallPhase!=='assess'||!['remembered','missed','fuzzy'].includes(id))return session;
      return withCardState(session,card.planId,{...state,selfRating:id==='fuzzy'?'missed':id});
    }
    if(step.kind!=='choice')return session;
    const phase=state.initialCorrect==null?'attempt':state.reinforcementCorrect==null?'reinforcement':'complete';
    const options=phase==='reinforcement'?card.reinforcement.options:card.options;
    if(!options.some(option=>String(option.id)===id))return session;
    return withCardState(session,card.planId,phase==='attempt'?{...state,selectedOptionId:id}:{...state,reinforcementSelectedId:id});
  }
  function outcomeFrom(card,state,step,overrides={}){
    return {planId:card.planId,activityType:card.activityType,learningObjective:card.learningObjective,targetCardIds:card.targetCardIds.slice(),connectionCardIds:card.connectionCardIds.slice(),initialCorrect:state.initialCorrect===true,reinforcementCorrect:state.reinforcementCorrect===true,selfRating:text(state.selfRating,20),attemptMs:Math.max(0,finite(state.attemptCheckedAt)-finite(state.recallStartedAt||state.supportCompletedAt||state.startedAt)),reinforcementMs:Math.max(0,finite(state.completedAt)-finite(state.reinforcementStartedAt||state.attemptCheckedAt)),completedAt:finite(state.completedAt),deferred:overrides.deferred===true,recallAttempted:overrides.recallAttempted===true,supportOnly:overrides.supportOnly===true,deferredOnly:overrides.deferredOnly===true,alternateUsed:Boolean(state.alternateUsed),supportGap:Math.max(0,finite(step&&step.supportGap))};
  }
  function checkCurrent(session,now=Date.now()){
    const card=currentCard(session),step=currentStep(session),state=rawState(session);if(!card||!step||!state)return {status:'empty',session,outcome:null};
    const timestamp=finite(now,Date.now());
    if(step.kind==='support'){
      const nextState={...state,supportComplete:true,supportCompletedAt:timestamp};
      let nextSession=withCardState(session,card.planId,nextState);
      const lastSupport=session.index===session.review.reviewCards.length-1;
      if(session.review.reviewCards.length===1){
        nextState.completedAt=timestamp;nextSession=withCardState(session,card.planId,nextState);nextSession={...nextSession,stage:'done'};
        return {status:'deferred_complete',session:nextSession,outcome:outcomeFrom(card,nextState,step,{deferred:true,deferredOnly:true,supportOnly:true,recallAttempted:false})};
      }
      nextSession=advanceSession(nextSession);
      if(nextSession.stage==='recall'){
        const nextCard=currentCard(nextSession),nextCardState=rawState(nextSession);
        if(nextCard&&nextCardState&&!nextCardState.recallStartedAt)nextSession=withCardState(nextSession,nextCard.planId,{...nextCardState,recallStartedAt:timestamp});
      }
      return {status:lastSupport?'recall_started':'coach_advanced',session:nextSession,outcome:null};
    }
    if(step.kind==='recall'){
      if(state.recallPhase==='recall'){
        const next={...state,recallPhase:'assess',attemptCheckedAt:timestamp};
        return {status:'answer_revealed',session:withCardState(session,card.planId,next),outcome:null};
      }
      if(state.recallPhase==='assess'){
        if(!state.selfRating)return {status:'missing_selection',session,outcome:null};
        const remembered=state.selfRating==='remembered';
        const next={...state,recallPhase:'complete',initialCorrect:remembered,reinforcementCorrect:remembered,completedAt:timestamp};
        const updated=withCardState(session,card.planId,next),outcome=outcomeFrom(card,next,step,{deferred:!remembered,recallAttempted:true});
        let advanced=advanceSession(updated);
        if(advanced.stage==='recall'){
          const nextCard=currentCard(advanced),nextCardState=rawState(advanced);
          if(nextCard&&nextCardState&&!nextCardState.recallStartedAt)advanced=withCardState(advanced,nextCard.planId,{...nextCardState,recallStartedAt:timestamp});
        }
        return {status:advanced.stage==='done'?'complete':'recall_advanced',session:advanced,outcome};
      }
    }
    if(step.kind==='choice'){
      if(state.initialCorrect==null){
        if(!state.selectedOptionId)return {status:'missing_selection',session,outcome:null};
        const correct=String(state.selectedOptionId)===String(card.correctOptionId),next={...state,initialCorrect:correct,attemptCheckedAt:timestamp,reinforcementStartedAt:timestamp};
        return {status:'attempt_checked',session:withCardState(session,card.planId,next),outcome:null};
      }
      if(state.reinforcementCorrect==null){
        if(!state.reinforcementSelectedId)return {status:'missing_selection',session,outcome:null};
        const correct=String(state.reinforcementSelectedId)===String(card.reinforcement.correctOptionId),next={...state,reinforcementCorrect:correct,completedAt:timestamp};
        const updated=withCardState(session,card.planId,next),outcome=outcomeFrom(card,next,step,{recallAttempted:true});
        const advanced=advanceSession(updated);
        return {status:advanced.stage==='done'?'complete':'choice_advanced',session:advanced,outcome};
      }
    }
    return {status:'already_complete',session,outcome:null};
  }
  function canMoveForward(session){return session&&session.stage==='done';}
  function move(session,delta){
    if(!session||!Array.isArray(session.steps)||!session.steps.length)return session;
    const amount=Math.sign(finite(delta));
    if(amount>=0)return session; // progression is intentionally controlled by completion.
    const index=clamp(session.index-1,0,session.steps.length-1),step=session.steps[index];
    return {...session,index,stage:stageForStep(step)};
  }
  function allComplete(session){return Boolean(session&&session.stage==='done');}

  function normalizeActivityStat(value={}){return {supports:Math.max(0,Math.round(finite(value.supports))),uses:Math.max(0,Math.round(finite(value.uses))),initialChecks:Math.max(0,Math.round(finite(value.initialChecks))),initialSuccess:Math.max(0,Math.round(finite(value.initialSuccess))),reinforcementChecks:Math.max(0,Math.round(finite(value.reinforcementChecks))),reinforcementSuccess:Math.max(0,Math.round(finite(value.reinforcementSuccess))),deferredChecks:Math.max(0,Math.round(finite(value.deferredChecks))),delayedChecks:Math.max(0,Math.round(finite(value.delayedChecks))),delayedSuccess:Math.max(0,Math.round(finite(value.delayedSuccess))),totalResponseMs:Math.max(0,Math.round(finite(value.totalResponseMs))),lastUsedAt:Math.max(0,finite(value.lastUsedAt))};}
  function normalizeProfile(value={}){const source=value&&typeof value==='object'?value:{},activityStats={};for(const [key,stat] of Object.entries(source.activityStats&&typeof source.activityStats==='object'?source.activityStats:{})){const id=text(key,60);if(id)activityStats[id]=normalizeActivityStat(stat);}return {...source,activityStats,recentActivities:(Array.isArray(source.recentActivities)?source.recentActivities:[]).map(item=>text(item,60)).filter(Boolean).slice(-8)};}
  function applyOutcomeToProfile(profile,outcome){const next=normalizeProfile(profile),activity=text(outcome&&outcome.activityType,60);if(!activity)return next;const stat=normalizeActivityStat(next.activityStats[activity]);stat.uses+=1;stat.supports+=outcome.supportOnly?1:0;if(outcome.recallAttempted||typeof outcome.initialCorrect==='boolean'){stat.initialChecks+=1;stat.initialSuccess+=boolNumber(outcome.initialCorrect);}const reinforcementMs=Math.max(0,finite(outcome.reinforcementMs));if(reinforcementMs>0||outcome.reinforcementAttempted===true){stat.reinforcementChecks+=1;stat.reinforcementSuccess+=boolNumber(outcome.reinforcementCorrect);}if(outcome.deferred)stat.deferredChecks+=1;stat.totalResponseMs+=Math.max(0,Math.round(finite(outcome.attemptMs)))+Math.round(reinforcementMs);stat.lastUsedAt=Math.max(stat.lastUsedAt,finite(outcome.completedAt,Date.now()));next.activityStats={...next.activityStats,[activity]:stat};next.recentActivities=[...next.recentActivities,activity].slice(-8);return next;}
  function createPendingDelayedCheck(outcome,cardId,context={}){const targetId=text(cardId,100);if(!targetId||!outcome)return null;const assistedAt=Math.max(0,finite(outcome.completedAt,Date.now()));return {activityType:text(outcome.activityType,60),learningObjective:text(outcome.learningObjective,60),planId:text(outcome.planId,60),cardId:targetId,assistedAt,notBeforeAt:assistedAt+Math.max(120000,finite(context.minimumDelayMs,180000)),dueAfterReviewCount:Math.max(0,Math.round(finite(context.currentReviewCount,0)))+Math.max(3,Math.round(finite(context.reviewGap,4))),settled:false};}
  function shouldSurfacePendingCheck(pending,context={}){if(!pending||pending.settled)return false;return finite(context.now,Date.now())>=finite(pending.notBeforeAt,0)&&Math.max(0,finite(context.currentReviewCount,0))>=finite(pending.dueAfterReviewCount,0);}
  function settleDelayedCheck(profile,pending,rating,now=Date.now(),minimumDelayMs=120000){const nextProfile=normalizeProfile(profile),nextPending=pending&&typeof pending==='object'?{...pending}:null;if(!nextPending||nextPending.settled||!nextPending.activityType)return {counted:false,profile:nextProfile,pending:nextPending};if(finite(now)-finite(nextPending.assistedAt)<Math.max(0,finite(minimumDelayMs)))return {counted:false,profile:nextProfile,pending:nextPending};const activity=text(nextPending.activityType,60),stat=normalizeActivityStat(nextProfile.activityStats[activity]);const normalizedRating=text(rating,20).toLowerCase(),success=normalizedRating==='correct'||normalizedRating==='know';stat.delayedChecks+=1;stat.delayedSuccess+=boolNumber(success);stat.lastUsedAt=Math.max(stat.lastUsedAt,finite(now));nextProfile.activityStats={...nextProfile.activityStats,[activity]:stat};nextPending.settled=true;nextPending.settledAt=finite(now);nextPending.success=success;return {counted:true,success,profile:nextProfile,pending:nextPending};}

  return Object.freeze({VERSION,PHASES,normalizeReview,scrambledRecallOrder,createSession,currentStep,currentCard,currentState,useAlternate,selectOption,checkCurrent,move,canMoveForward,allComplete,normalizeActivityStat,normalizeProfile,applyOutcomeToProfile,createPendingDelayedCheck,shouldSurfacePendingCheck,settleDelayedCheck});
});
