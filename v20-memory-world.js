(function attachV20MemoryWorld(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20MemoryWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20MemoryWorld() {
  'use strict';

  const VERSION = '20.0.0-alpha.20';
  const STAGES = Object.freeze([
    Object.freeze({ id:'luna', label:'Luna', min:0, max:19, color:'#8495ff', liquid:'#6f82f6', coreScale:.68, bodyScale:.68, moons:0, satellites:0, asteroids:0, orbitBodies:0, bodyCount:1, orbitPaths:0, orbitRate:.42, hoverRate:1.05 }),
    Object.freeze({ id:'mars', label:'Mars', min:20, max:39, color:'#e0765f', liquid:'#c95b49', coreScale:.82, bodyScale:.82, moons:2, satellites:0, asteroids:0, orbitBodies:2, bodyCount:3, orbitPaths:2, orbitRate:.58, hoverRate:1.42 }),
    Object.freeze({ id:'saturn', label:'Saturn', min:40, max:59, color:'#d7ad54', liquid:'#c18b32', coreScale:.94, bodyScale:.94, moons:5, satellites:1, asteroids:0, orbitBodies:6, bodyCount:7, orbitPaths:5, orbitRate:.72, hoverRate:1.72 }),
    Object.freeze({ id:'jupiter', label:'Jupiter', min:60, max:89, color:'#c38462', liquid:'#a85f48', coreScale:1.08, bodyScale:1.08, moons:8, satellites:2, asteroids:2, orbitBodies:12, bodyCount:13, orbitPaths:7, orbitRate:.9, hoverRate:2.05 }),
    Object.freeze({ id:'sun', label:'Sun', min:90, max:100, color:'#ff9a32', liquid:'#ef6d20', coreScale:1.22, bodyScale:1.22, moons:10, satellites:4, asteroids:12, orbitBodies:26, bodyCount:27, orbitPaths:8, orbitRate:1.12, hoverRate:2.55 })
  ]);

  function clamp(value, min=0, max=100) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
  }

  function stageFor(score) {
    const value = clamp(score);
    return STAGES.find(stage => value >= stage.min && value <= stage.max) || STAGES[0];
  }

  function scoreColor(score) {
    const value = clamp(score);
    if (value < 20) return '#8192f3';
    if (value < 40) return '#df725d';
    if (value < 60) return '#d4aa4f';
    if (value < 90) return '#b87958';
    return '#ff9630';
  }

  function visualState(wordScore, scopeAverage) {
    const word = clamp(wordScore);
    const average = clamp(scopeAverage);
    const stage = stageFor(average);
    const color = scoreColor(word);
    return Object.freeze({
      stage,
      wordScore: Math.round(word),
      scopeAverage: Math.round(average),
      fill: 1,
      solid: true,
      color,
      coreScale: stage.coreScale,
      bodyScale: stage.bodyScale,
      orbitRate: stage.orbitRate,
      hoverRate: stage.hoverRate
    });
  }

  function orbitPoint(config={}, angle=0) {
    const rx = Math.max(0, Number(config.rx) || 0);
    const ry = Math.max(0, Number(config.ry) || 0);
    const rotation = Number(config.rotation) || 0;
    const phase = Number(config.phase) || 0;
    const depth = Math.max(0, Number(config.depth) || Math.min(rx, ry) * .42);
    const theta = angle + phase;
    const localX = Math.cos(theta) * rx;
    const localY = Math.sin(theta) * ry;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return Object.freeze({
      x: localX * cos - localY * sin,
      y: localX * sin + localY * cos,
      z: Math.sin(theta) * depth
    });
  }

  function approachRate(current, target, elapsedMs=16, smoothingMs=520) {
    const from = Math.max(0, Number(current) || 0);
    const to = Math.max(0, Number(target) || 0);
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const smoothing = Math.max(1, Number(smoothingMs) || 1);
    const blend = 1 - Math.exp(-elapsed / smoothing);
    return from + (to - from) * blend;
  }

  function setPlaybackRate(root, rate) {
    if (!root || typeof root.getAnimations !== 'function') return 0;
    const next = Math.max(0, Number(rate) || 0);
    let changed = 0;
    for (const animation of root.getAnimations({ subtree: true }) || []) {
      try {
        animation.playbackRate = next;
        changed += 1;
      } catch (_error) {}
    }
    return changed;
  }

  function bodyAllowed(stage, type, index) {
    const ordinal = Math.max(1, Number(index) || 1);
    if (type === 'moon') return ordinal <= stage.moons;
    if (type === 'satellite') return ordinal <= stage.satellites;
    if (type === 'asteroid') return ordinal <= stage.asteroids;
    return false;
  }

  function bodyConfig(element, index=0) {
    const dataset = element && element.dataset ? element.dataset : {};
    const type = String(dataset.orbitBody || 'moon');
    const ordinal = Math.max(1, Number(dataset.bodyIndex) || index + 1);
    const defaults = type === 'asteroid'
      ? { rx:103 + (ordinal % 3) * 5, ry:39 + (ordinal % 4) * 3, rotation:(ordinal % 5 - 2) * .12, speed:.72 + (ordinal % 7) * .035, depth:13 }
      : type === 'satellite'
        ? { rx:88 + ordinal * 7, ry:31 + ordinal * 3, rotation:(ordinal % 2 ? 1 : -1) * (.32 + ordinal * .08), speed:.62 + ordinal * .07, depth:18 }
        : { rx:73 + ordinal * 5.4, ry:27 + (ordinal % 4) * 3.7, rotation:(ordinal % 2 ? 1 : -1) * (.12 + ordinal * .055), speed:.54 + ordinal * .055, depth:20 };
    return {
      type,
      index: ordinal,
      rx: Math.max(12, Number(dataset.orbitRx) || defaults.rx),
      ry: Math.max(8, Number(dataset.orbitRy) || defaults.ry),
      rotation: ((Number(dataset.orbitRotation) || defaults.rotation * 180 / Math.PI) * Math.PI) / 180,
      speed: Math.max(.08, Number(dataset.orbitSpeed) || defaults.speed),
      phase: ((Number(dataset.orbitPhase) || ordinal * 43) * Math.PI) / 180,
      depth: Math.max(1, Number(dataset.orbitDepth) || defaults.depth)
    };
  }

  function renderBodies(root, stage, phase) {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    const bodies = Array.from(root.querySelectorAll('[data-orbit-body]'));
    let visible = 0;
    bodies.forEach((element, index) => {
      const config = bodyConfig(element, index);
      const show = bodyAllowed(stage, config.type, config.index);
      element.hidden = !show;
      element.dataset.orbitVisible = show ? 'true' : 'false';
      if (!show) {
        element.style && element.style.setProperty('opacity', '0');
        return;
      }
      visible += 1;
      const point = orbitPoint(config, phase * config.speed);
      const scale = config.type === 'asteroid' ? .72 + (config.index % 3) * .1 : .84 + ((point.z / Math.max(1, config.depth)) + 1) * .12;
      const opacity = .5 + ((point.z / Math.max(1, config.depth)) + 1) * .22;
      element.style && element.style.setProperty('transform', `translate3d(${(120 + point.x).toFixed(2)}px,${(96 + point.y).toFixed(2)}px,${point.z.toFixed(2)}px) scale(${scale.toFixed(3)})`);
      element.style && element.style.setProperty('opacity', String(clamp(opacity, .35, 1)));
      element.style && element.style.setProperty('z-index', point.z >= 0 ? '9' : '2');
      element.dataset.orbitSide = point.z >= 0 ? 'front' : 'back';
    });
    root.dataset.visibleOrbitBodies = String(visible);
    return visible;
  }

  function createMotionController(root, options={}) {
    if (!root) return null;
    const requestFrame = options.requestFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : callback => setTimeout(() => callback(Date.now()), 16));
    const cancelFrame = options.cancelFrame || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : clearTimeout);
    const now = options.now || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
    const motionQuery = options.motionQuery || (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);
    const reducedMotion = typeof options.reducedMotion === 'function'
      ? options.reducedMotion
      : () => Boolean(motionQuery && motionQuery.matches);
    let stage = stageFor(Number(root.dataset && root.dataset.memoryAverage) || 0);
    let currentRate = stage.orbitRate;
    let targetRate = currentRate;
    let phase = 0;
    let last = 0;
    let frame = 0;
    let running = false;
    let active = true;

    root.style && root.style.removeProperty && root.style.removeProperty('--v20-world-core-spin');
    root.style && root.style.setProperty('--v20-world-surface-longitude', '-108px');

    const motionAllowed = () => running && active && !reducedMotion();
    const cancelScheduledFrame = () => {
      if (frame) cancelFrame(frame);
      frame = 0;
    };
    const ensureFrame = () => {
      if (!frame && motionAllowed()) {
        last = 0;
        frame = requestFrame(draw);
      }
    };

    const draw = timestamp => {
      frame = 0;
      if (!motionAllowed()) return;
      const time = Number(timestamp) || now();
      const elapsed = last ? Math.min(64, Math.max(0, time - last)) : 16;
      last = time;
      stage = stageFor(Number(root.dataset && root.dataset.memoryAverage) || Number(root.style && root.style.getPropertyValue && root.style.getPropertyValue('--v20-world-average')) || 0);
      currentRate = approachRate(currentRate, targetRate, elapsed, options.smoothingMs || 560);
      phase += (elapsed / 1000) * currentRate;
      renderBodies(root, stage, phase);
      root.style && root.style.setProperty('--v20-world-motion-rate', currentRate.toFixed(4));
      root.style && root.style.setProperty('--v20-world-orbit-drift', `${(phase * 1.35).toFixed(3)}deg`);
      root.style && root.style.setProperty('--v20-world-surface-longitude', `${(-108 + ((phase * 3.4) % 108)).toFixed(3)}px`);
      if (motionAllowed()) frame = requestFrame(draw);
    };

    const start = () => {
      running = true;
      ensureFrame();
    };
    const stop = () => {
      running = false;
      cancelScheduledFrame();
    };
    const setTargetRate = value => {
      targetRate = Math.max(.05, Number(value) || stage.orbitRate);
      return targetRate;
    };
    const setActive = value => {
      active = value !== false;
      if (motionAllowed()) ensureFrame();
      else cancelScheduledFrame();
      return active;
    };
    const syncStage = next => {
      stage = next && next.id ? next : stageFor(next);
      currentRate = Math.max(.05, Math.min(currentRate, stage.hoverRate));
      targetRate = stage.orbitRate;
      renderBodies(root, stage, phase);
      return stage;
    };
    const snapshot = () => ({ stage:stage.id, currentRate, targetRate, phase, running, active });
    const motionPreferenceHandler = () => {
      if (motionAllowed()) ensureFrame();
      else cancelScheduledFrame();
    };
    motionQuery && motionQuery.addEventListener && motionQuery.addEventListener('change', motionPreferenceHandler);
    const destroy = () => {
      stop();
      motionQuery && motionQuery.removeEventListener && motionQuery.removeEventListener('change', motionPreferenceHandler);
    };
    renderBodies(root, stage, phase);
    return { start, stop, destroy, setTargetRate, setActive, syncStage, snapshot, render: () => renderBodies(root, stage, phase) };
  }

  function applyState(root, state) {
    if (!root || !state) return state;
    const stage = state.stage || stageFor(state.scopeAverage);
    const word = clamp(state.wordScore);
    root.dataset.memoryStage = stage.id;
    root.dataset.memoryScore = String(word);
    root.dataset.memoryAverage = String(clamp(state.scopeAverage));
    root.dataset.solidWorld = 'true';
    delete root.dataset.hasLiquid;
    root.style?.setProperty('--v20-world-fill', '1');
    if(root.style&&typeof root.style.removeProperty==='function')root.style.removeProperty('--v20-world-liquid-y');
    root.style?.setProperty('--v20-world-score', String(word));
    root.style?.setProperty('--v20-world-average', String(clamp(state.scopeAverage)));
    root.style?.setProperty('--v20-world-color', state.color || stage.color);
    root.style?.setProperty('--v20-world-stage-color', stage.color);
    if(root.style&&typeof root.style.removeProperty==='function')root.style.removeProperty('--v20-world-liquid');
    root.style?.setProperty('--v20-world-scale', String(state.coreScale || state.bodyScale || stage.coreScale));
    root.style?.setProperty('--v20-world-path-count', String(stage.orbitPaths));
    return state;
  }

  return Object.freeze({ VERSION, STAGES, stageFor, scoreColor, visualState, orbitPoint, approachRate, setPlaybackRate, renderBodies, createMotionController, applyState });
});
