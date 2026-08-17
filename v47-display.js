(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V47Display=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PREF_KEY='vcs-display-preferences-v47';
  const THEMES=new Set(['system','light','dark']);
  const POWER_MODES=new Set(['full','low','ultra']);

  function normalizeTheme(value){
    const next=String(value||'system').toLowerCase();
    return THEMES.has(next)?next:'system';
  }
  function normalizePower(value,legacyLowPower=false){
    const next=String(value||'').toLowerCase();
    if(POWER_MODES.has(next))return next;
    return legacyLowPower?'low':'full';
  }
  function resolveTheme(preference,systemDark=false){
    const next=normalizeTheme(preference);
    return next==='system'?(systemDark?'dark':'light'):next;
  }
  function normalizePreferences(value={}){
    return {
      themeMode:normalizeTheme(value.themeMode),
      powerMode:normalizePower(value.powerMode,value.lowPowerMode===true)
    };
  }
  function readPreferences(storage){
    try{
      const raw=storage?.getItem?.(PREF_KEY);
      return normalizePreferences(raw?JSON.parse(raw):{});
    }catch(_error){return normalizePreferences({});}
  }
  function writePreferences(storage,value={}){
    const normalized=normalizePreferences(value);
    try{storage?.setItem?.(PREF_KEY,JSON.stringify(normalized));}catch(_error){}
    return normalized;
  }
  function applyToDocument(documentRef,value={},systemDark=false){
    if(!documentRef?.documentElement)return normalizePreferences(value);
    const preferences=normalizePreferences(value);
    const resolved=resolveTheme(preferences.themeMode,systemDark);
    const root=documentRef.documentElement;
    root.dataset.themePreference=preferences.themeMode;
    root.dataset.themeResolved=resolved;
    root.dataset.powerMode=preferences.powerMode;
    root.style.colorScheme=resolved;
    const body=documentRef.body;
    if(body){
      body.dataset.themePreference=preferences.themeMode;
      body.dataset.themeResolved=resolved;
      body.dataset.powerMode=preferences.powerMode;
    }
    const meta=documentRef.querySelector?.('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',resolved==='dark'?'#0b0d13':'#eef7ff');
    return {...preferences,resolvedTheme:resolved};
  }
  function motionSuppressed(powerMode){return normalizePower(powerMode)!=='full';}
  function allMotionDisabled(powerMode){return normalizePower(powerMode)==='ultra';}

  return Object.freeze({
    PREF_KEY,normalizeTheme,normalizePower,resolveTheme,normalizePreferences,
    readPreferences,writePreferences,applyToDocument,motionSuppressed,allMotionDisabled
  });
});
