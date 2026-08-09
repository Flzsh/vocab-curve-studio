// Vocab Curve Studio V44 — 44.0.0-beta-studio.19
const CACHE='vocab-curve-v44-studio-workspace-v19';
const ASSETS=["./","./index.html","./manifest.webmanifest","./v16.css","./v17.css","./v18.css","./v19.css","./v20.css","./studio-workspace.css","./v44.css","./v16-rules.js","./v20-storage.js","./v20-study-memory.js","./v20-queue-policy.js","./v20-liquid-motion.js","./v20-memory-world.js","./v20-library.js","./v20-default-workbook.js","./v44-default-book2.js","./v20-forecast.js","./v44-runtime.js","./v16-learning.js","./v16-transfer.js","./v16-runtime.js","./v17-study.js","./v18-study.js","./v19-ui.js","./v20-interactive-review.js","./v20-import-assistant.js","./v20-pro-tutor.js","./studio-workspace.js","./icons/icon-192.png","./icons/icon-512.png","./assets/tab-account.png","./assets/tab-books.png","./assets/tab-import.png","./assets/tab-more.png","./assets/tab-planner.png","./assets/tab-save.png","./assets/tab-settings.png","./assets/tab-stats.png","./assets/tab-study.png"];
const ASSET_PATHS=new Set(ASSETS.map(asset=>new URL(asset,self.location).pathname));
function matchPrecached(request){
  const url=new URL(request.url);
  const versionedAsset=url.origin===self.location.origin&&ASSET_PATHS.has(url.pathname);
  return caches.open(CACHE).then(cache=>versionedAsset?cache.match(request,{ignoreSearch:true}):cache.match(request));
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(asset=>new Request(asset,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('vocab-curve-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll().then(clients=>clients.forEach(client=>client.postMessage('V20_READY'))))));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const request=event.request;
  const requestUrl=new URL(request.url);
  if(requestUrl.origin!==self.location.origin)return;
  event.respondWith(fetch(request,{cache:'no-store'}).then(async response=>{
    if(response.ok&&ASSET_PATHS.has(requestUrl.pathname)&&!requestUrl.search){
      try{const copy=response.clone();const cache=await caches.open(CACHE);await cache.put(request,copy);}catch(_error){}
    }
    return response;
  }).catch(()=>matchPrecached(request).then(cached=>cached||(request.mode==='navigate'?caches.open(CACHE).then(cache=>cache.match('./index.html')):undefined))));
});
