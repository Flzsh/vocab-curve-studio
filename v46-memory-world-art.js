(function attachV46MemoryWorldArt(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V46MemoryWorldArt=api;
})(typeof globalThis!=='undefined'?globalThis:this,function createV46MemoryWorldArt(){
  'use strict';
  const VERSION='46.0.0';
  const safeNamespace=value=>String(value||'v46').replace(/[^a-zA-Z0-9_-]/g,'-');

  function createOrbitMaskMarkup(namespace='v46-orbit'){
    const ns=safeNamespace(namespace);
    return `<radialGradient id="${ns}-occlusionFade" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="white" stop-opacity="0"/>
      <stop offset="76%" stop-color="white" stop-opacity="0"/>
      <stop offset="94%" stop-color="white" stop-opacity=".58"/>
      <stop offset="100%" stop-color="white" stop-opacity="1"/>
    </radialGradient>
    <rect width="240" height="192" fill="white"/>
    <circle cx="120" cy="96" r="73" fill="url(#${ns}-occlusionFade)"/>`;
  }

  function crater(cx,cy,rx,ry,rotation=0,opacity=.68){
    return `<g class="v46-mars-crater" transform="rotate(${rotation} ${cx} ${cy})" opacity="${opacity}">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(85,28,24,.42)"/>
      <ellipse cx="${cx-1.5}" cy="${cy-1.7}" rx="${Math.max(1,rx-.9)}" ry="${Math.max(1,ry-.8)}" fill="none" stroke="rgba(255,194,159,.34)" stroke-width="1.2"/>
      <ellipse cx="${cx+1.4}" cy="${cy+1.5}" rx="${Math.max(.8,rx-1.5)}" ry="${Math.max(.8,ry-1.3)}" fill="rgba(97,37,29,.18)"/>
    </g>`;
  }

  function createSvgMarkup(namespace='v46-world'){
    const ns=safeNamespace(namespace);
    const marsCraters=[
      crater(61,67,8,5,-18,.72),crater(132,49,5.5,4,12,.62),crater(145,116,10,6,-8,.7),
      crater(85,133,6,4,18,.55),crater(117,82,3.8,2.8,-12,.56),crater(49,108,4.5,3.3,22,.5),
      crater(154,77,3.2,2.4,0,.48),crater(105,151,4.2,2.8,-20,.48)
    ].join('');
    return `<svg class="v46-world-art" viewBox="0 0 200 200" focusable="false" aria-hidden="true">
      <defs>
        <clipPath id="${ns}-worldClip"><circle cx="100" cy="100" r="86"/></clipPath>
        <radialGradient id="${ns}-lunaBase" cx="31%" cy="24%" r="78%"><stop offset="0" stop-color="#fff"/><stop offset=".28" stop-color="#dbe2f4"/><stop offset=".72" stop-color="#9ca8c5"/><stop offset="1" stop-color="#59647f"/></radialGradient>
        <radialGradient id="${ns}-marsBase" cx="29%" cy="21%" r="86%"><stop offset="0" stop-color="#ffd9bd"/><stop offset=".22" stop-color="#e99870"/><stop offset=".58" stop-color="#bd5e47"/><stop offset=".82" stop-color="#843d34"/><stop offset="1" stop-color="#45262a"/></radialGradient>
        <radialGradient id="${ns}-marsLight" cx="34%" cy="26%" r="58%"><stop offset="0" stop-color="#fff4dd" stop-opacity=".78"/><stop offset=".34" stop-color="#f5b389" stop-opacity=".23"/><stop offset="1" stop-color="#f5b389" stop-opacity="0"/></radialGradient>
        <linearGradient id="${ns}-marsTerrainA" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="#6d302d" stop-opacity=".10"/><stop offset=".48" stop-color="#6a2527" stop-opacity=".42"/><stop offset="1" stop-color="#331d25" stop-opacity=".18"/></linearGradient>
        <linearGradient id="${ns}-marsTerrainB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f1a078" stop-opacity=".10"/><stop offset=".52" stop-color="#7b302e" stop-opacity=".36"/><stop offset="1" stop-color="#f2a57b" stop-opacity=".08"/></linearGradient>
        <radialGradient id="${ns}-saturnBase" cx="34%" cy="25%" r="78%"><stop offset="0" stop-color="#fff5c8"/><stop offset=".3" stop-color="#e7c27a"/><stop offset=".72" stop-color="#ad7f42"/><stop offset="1" stop-color="#5d4633"/></radialGradient>
        <radialGradient id="${ns}-jupiterBase" cx="31%" cy="23%" r="84%"><stop offset="0" stop-color="#fff4dc"/><stop offset=".33" stop-color="#d6ae87"/><stop offset=".74" stop-color="#9a664e"/><stop offset="1" stop-color="#4e3840"/></radialGradient>
        <radialGradient id="${ns}-sunBase" cx="35%" cy="29%" r="76%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".26" stop-color="#ffd85d"/><stop offset=".62" stop-color="#f6922f"/><stop offset="1" stop-color="#bd3c1c"/></radialGradient>
        <linearGradient id="${ns}-glassShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".36"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#10182d" stop-opacity=".34"/></linearGradient>
        <filter id="${ns}-surfaceNoise" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".035 .07" numOctaves="3" seed="19" result="noise"/><feColorMatrix in="noise" values="1 0 0 0 0 0 .5 0 0 0 0 0 .4 0 0 0 0 0 .34 0"/><feBlend in="SourceGraphic" mode="multiply"/></filter>
      </defs>
      <g data-v46-stage-art="luna" clip-path="url(#${ns}-worldClip)">
        <circle cx="100" cy="100" r="86" fill="url(#${ns}-lunaBase)"/>
        <path d="M6 115 C34 91 55 103 82 91 S137 73 194 93 L194 139 C151 126 121 139 83 130 S35 142 6 154Z" fill="#6f7896" opacity=".19"/>
        <g opacity=".47" fill="#68728e"><ellipse cx="58" cy="70" rx="13" ry="8"/><ellipse cx="132" cy="62" rx="8" ry="6"/><ellipse cx="139" cy="126" rx="15" ry="10"/><ellipse cx="82" cy="142" rx="7" ry="5"/><ellipse cx="49" cy="113" rx="5" ry="4"/></g>
        <g fill="none" stroke="#f7f9ff" stroke-opacity=".42" stroke-width="2"><ellipse cx="55" cy="67" rx="12" ry="7"/><ellipse cx="129" cy="59" rx="7" ry="5"/><ellipse cx="136" cy="123" rx="13" ry="8"/></g>
      </g>
      <g data-v46-stage-art="mars" clip-path="url(#${ns}-worldClip)">
        <circle cx="100" cy="100" r="86" fill="url(#${ns}-marsBase)"/>
        <rect x="9" y="9" width="182" height="182" fill="#b95f48" opacity=".22" filter="url(#${ns}-surfaceNoise)"/>
        <path class="v46-mars-terrain" d="M-22 62 C14 48 45 69 80 58 C118 46 150 37 222 55 L222 78 C175 70 139 86 102 78 C55 68 26 83 -22 86Z" fill="url(#${ns}-marsTerrainB)"/>
        <path class="v46-mars-terrain" d="M-25 103 C17 84 51 111 89 100 C128 89 170 72 225 93 L225 119 C178 106 143 126 99 116 C61 107 24 126 -25 118Z" fill="url(#${ns}-marsTerrainA)" opacity=".9"/>
        <path class="v46-mars-terrain" d="M-20 142 C28 123 61 151 97 138 C137 123 175 122 220 137 L220 163 C175 151 142 165 101 157 C59 149 24 165 -20 160Z" fill="#6c2d2c" opacity=".24"/>
        <path d="M20 44 C49 29 75 31 101 39 C72 48 48 53 22 66Z" fill="#f8c9a5" opacity=".24"/>
        ${marsCraters}<circle cx="100" cy="100" r="86" fill="url(#${ns}-marsLight)"/>
      </g>
      <g data-v46-stage-art="saturn" clip-path="url(#${ns}-worldClip)">
        <circle cx="100" cy="100" r="86" fill="url(#${ns}-saturnBase)"/>
        <g opacity=".38"><path d="M8 61 Q100 82 192 60 L192 75 Q100 94 8 74Z" fill="#8e6638"/><path d="M8 91 Q100 107 192 89 L192 102 Q100 118 8 104Z" fill="#f5dc99"/><path d="M8 119 Q100 136 192 116 L192 131 Q100 145 8 134Z" fill="#805b37"/></g>
      </g>
      <g data-v46-stage-art="jupiter" clip-path="url(#${ns}-worldClip)">
        <circle cx="100" cy="100" r="86" fill="url(#${ns}-jupiterBase)"/>
        <g opacity=".6"><path d="M7 45 C59 58 135 34 193 50 L193 67 C135 56 59 76 7 62Z" fill="#8e5647"/><path d="M7 77 C66 88 132 68 193 80 L193 96 C131 87 65 102 7 93Z" fill="#f0d1ac"/><path d="M7 108 C60 120 142 101 193 114 L193 132 C137 121 61 140 7 127Z" fill="#865044"/><path d="M7 140 C69 151 134 136 193 147 L193 161 C132 154 63 168 7 157Z" fill="#e4bb91"/></g>
        <ellipse cx="137" cy="124" rx="19" ry="10" fill="#a74e3d" opacity=".72"/><ellipse cx="132" cy="121" rx="12" ry="5" fill="#df8c69" opacity=".5"/>
      </g>
      <g data-v46-stage-art="sun" clip-path="url(#${ns}-worldClip)">
        <circle cx="100" cy="100" r="86" fill="url(#${ns}-sunBase)"/>
        <g opacity=".34" fill="none" stroke="#fff3a0" stroke-width="5"><path d="M21 89 C52 66 67 102 101 77 C133 54 154 81 184 65"/><path d="M12 128 C45 103 67 138 105 113 C139 91 164 123 194 103"/><path d="M36 47 C60 34 76 48 93 37"/></g>
        <circle cx="100" cy="100" r="69" fill="none" stroke="#fff5b5" stroke-opacity=".25" stroke-width="9"/>
      </g>
      <circle cx="100" cy="100" r="85" fill="url(#${ns}-glassShade)"/>
      <ellipse cx="67" cy="49" rx="25" ry="10" fill="#fff" opacity=".34" transform="rotate(-18 67 49)"/>
      <circle class="v46-world-rim" cx="100" cy="100" r="85.5" fill="none" stroke="rgba(255,255,255,.52)" stroke-width="2"/>
    </svg>`;
  }

  function install(root,options={}){
    const sphere=root?.querySelector?root.querySelector('#longTermSphere'):null;
    if(!sphere)return false;
    const core=sphere.querySelector('.v20-world-core');
    if(core&&!core.querySelector('.v46-world-art')){
      core.insertAdjacentHTML('afterbegin',createSvgMarkup(safeNamespace(options.namespace||'v46-memory-world')));
      core.dataset.v46Art='true';
    }
    const orbitSvg=sphere.querySelector('#longTermOrbitSvg'),mask=orbitSvg?.querySelector('#v20OrbitCutout');
    if(mask&&!mask.dataset.v46Feathered){
      const ns=safeNamespace(options.orbitNamespace||'v46-orbit'),defs=orbitSvg.querySelector('defs');
      if(defs&&!defs.querySelector(`#${ns}-occlusionFade`)){
        const parser=new DOMParser(),parsed=parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${createOrbitMaskMarkup(ns).split('<rect')[0]}</defs></svg>`,'image/svg+xml'),gradient=parsed.querySelector('radialGradient');
        if(gradient)defs.appendChild(document.importNode(gradient,true));
      }
      while(mask.firstChild)mask.removeChild(mask.firstChild);
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('width','240');rect.setAttribute('height','192');rect.setAttribute('fill','white');mask.appendChild(rect);
      const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx','120');circle.setAttribute('cy','96');circle.setAttribute('r','75');circle.setAttribute('fill',`url(#${ns}-occlusionFade)`);mask.appendChild(circle);mask.dataset.v46Feathered='true';
    }
    sphere.dataset.memoryArt='v46';
    return true;
  }
  return Object.freeze({VERSION,createSvgMarkup,createOrbitMaskMarkup,install});
});