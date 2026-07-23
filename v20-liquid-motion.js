(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V20LiquidMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='20.0.0-alpha.20';
  const TILE_PX=48;
  const BASE_CYCLE_MS=12800;
  const RATE_SMOOTHING_MS=1800;
  const METRIC_CONFIG=Object.freeze({
    now:{minimum:.20,range:.38,performanceWeight:.08,evidenceWeight:.31,masteryWeight:.10},
    set:{minimum:.185,range:.275,performanceWeight:.04,evidenceWeight:.23,masteryWeight:.08},
    use:{minimum:.17,range:.25,performanceWeight:.05,evidenceWeight:.20,masteryWeight:.07}
  });

  function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
  function clamp(value,min,max){return Math.min(max,Math.max(min,finite(value,min)));}
  function fract(value){const number=finite(value);return ((number%1)+1)%1;}
  function smoothstep(value){const n=clamp(value,0,1);return n*n*(3-2*n);}

  /** Advance one continuous phase while easing speed toward a new target. */
  function advancePhase(state={},deltaMs=0,options={}){
    const dt=clamp(deltaMs,0,1000);
    const currentRate=Math.max(0,finite(state.rate,.03));
    const target=Math.max(0,finite(options.targetRate,currentRate));
    const smoothingMs=Math.max(1,finite(options.smoothingMs,RATE_SMOOTHING_MS));
    const blend=1-Math.exp(-dt/smoothingMs);
    const rate=currentRate+(target-currentRate)*blend;
    const cycleMs=Math.max(1,finite(options.cycleMs,BASE_CYCLE_MS));
    // Keep an unbounded position. Only the texture sampler wraps it. This avoids
    // resetting the motion clock whenever a repeating tile reaches its boundary.
    const position=finite(state.position,finite(state.phase))+dt*rate/cycleMs;
    return {position,phase:fract(position),rate};
  }

  /** Advance a bubble's own phase so the shared texture can wrap without moving bubbles. */
  function advanceBubblePhase(state={},deltaMs=0,options={}){
    const dt=clamp(deltaMs,0,1000);
    const rate=Math.max(0,finite(options.rate,.03));
    const speed=Math.max(.05,finite(options.speed,1));
    const cycleMs=Math.max(1,finite(options.cycleMs,BASE_CYCLE_MS));
    return {phase:fract(finite(state.phase)+dt*rate*speed/cycleMs)};
  }

  /** Sample an already-continuous bubble phase. It fades fully at both wrap edges. */
  function sampleBubblePhase(value,config={}){
    const phase=fract(value);
    const edge=Math.sin(Math.PI*phase);
    const opacity=Math.pow(Math.max(0,edge),1.7)*clamp(config.opacity,.05,1);
    const drift=finite(config.drift,1.5);
    const angle=phase*Math.PI*2+finite(config.angle);
    return {
      phase,
      opacity,
      x:Math.sin(angle)*drift,
      y:1-phase,
      scale:.72+.28*Math.max(0,edge)
    };
  }

  /** Backward-compatible sampler for tests and older callers. */
  function sampleBubble(globalPhase,config={}){
    return sampleBubblePhase(fract(finite(globalPhase)*Math.max(.05,finite(config.speed,1))+finite(config.offset)),config);
  }

  function targetRate(metric,value,options={}){
    const config=METRIC_CONFIG[metric]||METRIC_CONFIG.now;
    if(options.measured===false)return 0;
    const mastery=smoothstep(clamp(value,0,100)/100);
    const evidence=smoothstep(clamp(options.evidenceStrength,0,1));
    const performance=(clamp(options.performanceSignal,-1,1)+1)/2;
    const signalWeight=config.masteryWeight+config.evidenceWeight+config.performanceWeight;
    const signal=(
      config.masteryWeight*mastery+
      config.evidenceWeight*evidence+
      config.performanceWeight*performance
    )/signalWeight;
    const rate=config.minimum+config.range*signal;
    return Number(clamp(rate,.012,.72).toFixed(4));
  }

  function historyPerformanceSignal(history){
    const records=(Array.isArray(history)?history:[])
      .filter(entry=>entry&&String(entry.kind||'study')!=='ranked'&&!entry.afk)
      .slice(-6);
    if(!records.length)return 0;
    let total=0,weight=0;
    for(let index=0;index<records.length;index++){
      const entry=records[index],recency=.48+(index+1)/records.length*.52;
      const rating=String(entry.rating||'').toLowerCase();
      const correctness=rating==='know'?1:rating==='correct'?.72:rating==='partial'?.05:-.72;
      const hints=Math.max(0,finite(entry.hints));
      const seconds=Math.max(.25,finite(entry.activeSeconds,finite(entry.seconds,8)));
      const pace=clamp((10-seconds)/10,-.6,.6);
      total+=(correctness+pace*.24-Math.min(.48,hints*.15))*recency;
      weight+=recency;
    }
    return Number(clamp(total/Math.max(.001,weight),-1,1).toFixed(3));
  }

  function evidenceStrength(input={}){
    const historyCount=Math.max(0,finite(input.historyCount,Array.isArray(input.history)?input.history.length:0));
    const reviews=Math.max(0,finite(input.reviews));
    const independent=Math.max(0,finite(input.independentCorrect));
    const attempts=Math.max(0,finite(input.attempts));
    const introducedRatio=clamp(input.introducedRatio,0,1);
    const raw=historyCount*.08+reviews*.09+attempts*.08+independent*.15+introducedRatio*.55;
    return Number(clamp(1-Math.exp(-raw),0,1).toFixed(3));
  }

  function ensureFlowLayer(liquid,documentRef){
    if(!liquid)return null;
    let layer=liquid.querySelector(':scope > .v20-liquid-flow-layer');
    if(!layer){
      layer=documentRef.createElement('span');
      layer.className='v20-liquid-flow-layer';
      layer.setAttribute('aria-hidden','true');
      liquid.prepend(layer);
    }
    return layer;
  }

  function seededUnit(seed){
    let value=(Math.trunc(finite(seed))^0x9e3779b9)>>>0;
    value=Math.imul(value^(value>>>16),0x21f0aaad);
    value=Math.imul(value^(value>>>15),0x735a2d97);
    value^=value>>>15;
    return (value>>>0)/4294967296;
  }

  /** Build a stable, lightly irregular set of phases and visual traits. */
  function createBubbleLayout(metricIndex,count=6){
    const safeMetric=Math.max(0,Math.trunc(finite(metricIndex)));
    const safeCount=Math.max(0,Math.min(24,Math.trunc(finite(count,6))));
    if(!safeCount)return [];
    const interval=1/safeCount;
    const phaseShift=seededUnit((safeMetric+1)*7919+104729)*interval;
    const jitterLimit=interval*.075;
    return Array.from({length:safeCount},(_,bubbleIndex)=>{
      const seed=(safeMetric+1)*1009+(bubbleIndex+1)*9176;
      const phaseJitter=(seededUnit(seed+11)-.5)*jitterLimit*2;
      const speedRank=(bubbleIndex+safeMetric*2)%safeCount;
      const speedBase=safeCount===1?1:.84+.34*speedRank/(safeCount-1);
      return {
        offset:Number(fract((bubbleIndex+.5)*interval+phaseShift+phaseJitter).toFixed(8)),
        speed:Number(clamp(speedBase+(seededUnit(seed+23)-.5)*.012,.8,1.2).toFixed(6)),
        xPercent:Number((24+seededUnit(seed+37)*52).toFixed(4)),
        drift:Number((1.05+seededUnit(seed+53)*1.25).toFixed(4)),
        angle:Number((seededUnit(seed+71)*Math.PI*2).toFixed(6)),
        opacity:Number((.48+seededUnit(seed+89)*.14).toFixed(4))
      };
    });
  }

  function createController(options={}){
    const documentRef=options.documentRef||(typeof document!=='undefined'?document:null);
    const windowRef=options.windowRef||(typeof window!=='undefined'?window:null);
    const rootElement=options.root||documentRef?.getElementById?.('memorySpine');
    const requestFrame=options.requestAnimationFrame||windowRef?.requestAnimationFrame?.bind(windowRef)||((fn)=>setTimeout(()=>fn(Date.now()),16));
    const cancelFrame=options.cancelAnimationFrame||windowRef?.cancelAnimationFrame?.bind(windowRef)||clearTimeout;
    const setTimer=options.setTimeout||windowRef?.setTimeout?.bind(windowRef)||setTimeout;
    const clearTimer=options.clearTimeout||windowRef?.clearTimeout?.bind(windowRef)||clearTimeout;
    const nowFn=options.now||(()=>windowRef?.performance?.now?.()||Date.now());
    const motionQuery=windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')||null;
    let motionReduced=Boolean(motionQuery?.matches),lowPower=false;
    if(!documentRef||!rootElement)return {setMetrics(){return[];},setLowPower(){return false;},destroy(){},snapshot(){return[];}};

    const definitions=[
      {metric:'now',rail:rootElement.querySelector('[data-memory-line="current-short-term"]')},
      {metric:'set',rail:rootElement.querySelector('[data-memory-line="section-short-term"]')},
      {metric:'use',rail:rootElement.querySelector('[data-memory-line="usability"]')}
    ].filter(item=>item.rail);

    const states=definitions.map((definition,index)=>{
      const liquid=definition.rail.querySelector('.v17-liquid');
      const bubbleElements=[...liquid.querySelectorAll('.v17-rail-bubble')];
      const bubbleLayout=createBubbleLayout(index,bubbleElements.length);
      const calmRate=targetRate(definition.metric,0,{evidenceStrength:0,performanceSignal:-1,measured:true});
      return {
        metric:definition.metric,
        rail:definition.rail,
        liquid,
        layer:ensureFlowLayer(liquid,documentRef),
        bubbles:bubbleElements.map((element,bubbleIndex)=>{const config=bubbleLayout[bubbleIndex];return {element,...config,phase:config.offset};}),
        position:(index+1)*.271828,
        phase:fract((index+1)*.271828),
        rate:calmRate,
        targetRate:calmRate,
        measured:true,
        evidenceStrength:0,
        height:Math.max(1,liquid?.clientHeight||640),
        flowOffsetPx:0
      };
    });

    let frame=0,watchdog=0,last=nowFn(),lastTickAt=last,destroyed=false,documentHidden=Boolean(documentRef.hidden),resizeObserver=null;
    function measure(){for(const state of states)state.height=Math.max(1,state.liquid?.clientHeight||state.height||640);}
    if(typeof windowRef?.ResizeObserver==='function'){
      resizeObserver=new windowRef.ResizeObserver(measure);
      for(const state of states)resizeObserver.observe(state.liquid);
    }
    measure();

    function renderState(state,dt){
      const active=!documentHidden&&!motionReduced&&!lowPower&&state.measured;
      const next=advancePhase({position:state.position,phase:state.phase,rate:state.rate},active?dt:0,{targetRate:active?state.targetRate:0});
      state.position=next.position;state.phase=next.phase;state.rate=next.rate;
      // Keep the texture offset unbounded. A tiny isolated background is repainted,
      // avoiding the compositor jump that occurs when a transformed layer wraps.
      state.flowOffsetPx=state.position*TILE_PX;
      if(state.layer){
        const offset=(-state.flowOffsetPx).toFixed(3);
        state.layer.style.transform='translate3d(0,0,0)';
        state.layer.style.setProperty('--v20-flow-offset',`${offset}px`);
        state.layer.style.opacity=state.measured?'1':'0';
      }
      for(const bubble of state.bubbles){
        if(active)bubble.phase=advanceBubblePhase({phase:bubble.phase},dt,{rate:state.rate,speed:bubble.speed}).phase;
        const sampled=sampleBubblePhase(bubble.phase,bubble);
        const y=sampled.y*(state.height+18)-9;
        bubble.element.style.setProperty('--bubble-x',`${bubble.xPercent}%`);
        bubble.element.style.transform=`translate3d(calc(-50% + ${sampled.x.toFixed(2)}px),${y.toFixed(2)}px,0) scale(${sampled.scale.toFixed(3)})`;
        bubble.element.style.opacity=state.measured?String(sampled.opacity.toFixed(3)):'0';
      }
      state.rail.style.setProperty('--v20-flow-rate',state.rate.toFixed(4));
      state.rail.dataset.flowRate=state.rate.toFixed(4);
      state.rail.dataset.flowPhase=state.phase.toFixed(6);
    }

    function animationAllowed(){return !destroyed&&!documentHidden&&!motionReduced&&!lowPower;}
    function cancelAnimationActivity(){
      if(frame)cancelFrame(frame);
      if(watchdog)clearTimer(watchdog);
      frame=0;watchdog=0;
    }
    function tick(timestamp){
      frame=0;
      if(!animationAllowed())return;
      const current=finite(timestamp,nowFn()),dt=clamp(current-last,0,64);last=current;lastTickAt=current;
      for(const state of states)renderState(state,dt);
      if(animationAllowed())frame=requestFrame(tick);
    }
    function ensureTick(){if(!frame&&animationAllowed()){last=nowFn();lastTickAt=last;frame=requestFrame(tick);}}
    function runWatchdog(){
      watchdog=0;
      if(!animationAllowed())return;
      const current=nowFn();
      // Browsers may cancel an animation frame during a heavy card transition while
      // leaving its numeric handle stale. Restart only after a real heartbeat gap.
      if(!documentHidden&&!motionReduced&&!lowPower&&current-lastTickAt>240){
        if(frame)cancelFrame(frame);
        frame=0;
        // Render one heartbeat immediately, then hand control back to rAF. This
        // prevents a cancelled frame during a card transition from freezing flow.
        tick(current);
      }
      if(animationAllowed())watchdog=setTimer(runWatchdog,320);
    }
    function syncAnimationActivity(){
      if(!animationAllowed()){
        cancelAnimationActivity();
        return false;
      }
      ensureTick();
      if(!watchdog)watchdog=setTimer(runWatchdog,320);
      return true;
    }
    function setLowPower(value){
      const next=value===true;
      if(next===lowPower)return lowPower;
      lowPower=next;
      if(lowPower){
        cancelAnimationActivity();
        for(const state of states){state.rate=0;renderState(state,0);}
      }else{
        syncAnimationActivity();
      }
      return lowPower;
    }
    function setMetrics(metrics={}){
      const performanceSignal=clamp(metrics.performanceSignal,-1,1);
      const values={now:metrics.now,set:metrics.set,use:metrics.use};
      const evidence={now:metrics.nowEvidence,set:metrics.setEvidence,use:metrics.useEvidence};
      for(const state of states){
        state.measured=state.metric!=='use'||metrics.useMeasured!==false;
        state.evidenceStrength=clamp(evidence[state.metric],0,1);
        state.targetRate=targetRate(state.metric,values[state.metric],{performanceSignal,evidenceStrength:state.evidenceStrength,measured:state.measured});
      }
      measure();syncAnimationActivity();return snapshot();
    }
    function snapshot(){return states.map(state=>({metric:state.metric,position:Number(state.position.toFixed(6)),phase:Number(state.phase.toFixed(6)),currentRate:Number(state.rate.toFixed(4)),targetRate:state.targetRate,measured:state.measured,evidenceStrength:Number(state.evidenceStrength.toFixed(3)),flowOffsetPx:Number(state.flowOffsetPx.toFixed(3))}));}
    function visibilityHandler(){documentHidden=Boolean(documentRef.hidden);syncAnimationActivity();}
    function motionPreferenceHandler(event){motionReduced=Boolean(event?.matches ?? motionQuery?.matches);syncAnimationActivity();}
    documentRef.addEventListener?.('visibilitychange',visibilityHandler);
    motionQuery?.addEventListener?.('change',motionPreferenceHandler);
    // Paint one stable layout for Reduced Motion and initially hidden documents,
    // then leave them completely dormant until motion becomes appropriate again.
    for(const state of states)renderState(state,0);
    syncAnimationActivity();
    function destroy(){destroyed=true;cancelAnimationActivity();resizeObserver?.disconnect?.();documentRef.removeEventListener?.('visibilitychange',visibilityHandler);motionQuery?.removeEventListener?.('change',motionPreferenceHandler);}
    return {setMetrics,setLowPower,snapshot,destroy};
  }

  return Object.freeze({VERSION,TILE_PX,BASE_CYCLE_MS,RATE_SMOOTHING_MS,advancePhase,advanceBubblePhase,sampleBubble,sampleBubblePhase,targetRate,historyPerformanceSignal,evidenceStrength,createBubbleLayout,createController});
});
