(function attachV19UI(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V19UI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV19UI() {
  'use strict';

  const VERSION = 19;
  const PROGRESS_PROXIMITY_RADIUS = 88;
  const PROGRESS_FILL_SELECTOR = [
    '.mini-progress > span',
    '.statbar > span',
    '.v15-progress-track > span',
    '.v15-glory-progress > span',
    '.match-timer-track > span',
    '.health-track > span',
    '.timer-track > .timer-fill',
    '.section-progress-fill'
  ].join(', ');
  const VALID_STUDY_PANES = new Set(['today', 'learn', 'queue']);
  const VIEW_PROFILES = Object.freeze({
    study: Object.freeze({ themeCarry: true, density: 'focus', energy: 0.42 }),
    import: Object.freeze({ themeCarry: true, density: 'work', energy: 0.50 }),
    planner: Object.freeze({ themeCarry: true, density: 'work', energy: 0.58 }),
    books: Object.freeze({ themeCarry: true, density: 'calm', energy: 0.34 }),
    achievements: Object.freeze({ themeCarry: true, density: 'gallery', energy: 0.46 }),
    stats: Object.freeze({ themeCarry: true, density: 'data', energy: 0.52 }),
    settings: Object.freeze({ themeCarry: true, density: 'calm', energy: 0.30 }),
    more: Object.freeze({ themeCarry: true, density: 'calm', energy: 0.34 }),
    ranked: Object.freeze({ themeCarry: false, density: 'arena', energy: 0.76 })
  });

  let initialized = false;
  let activePane = 'today';
  let interactionTimer = 0;
  let observer = null;
  let progressPointerFrame = 0;
  let pendingProgressPointer = null;
  const rangeState = new WeakMap();

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function normalizeRange(input = {}) {
    const minimum = finite(input.min, 0);
    const maximum = finite(input.max, 100);
    if (maximum <= minimum) return 0;
    return clamp((finite(input.value, minimum) - minimum) / (maximum - minimum));
  }

  function tabIndicatorGeometry(active, tabs) {
    if (!active?.getBoundingClientRect || !tabs?.getBoundingClientRect) return null;
    const tabRect = active.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    return {
      x: tabRect.left - tabsRect.left + finite(tabs.scrollLeft) - finite(tabs.clientLeft),
      y: tabRect.top - tabsRect.top + finite(tabs.scrollTop) - finite(tabs.clientTop),
      width: tabRect.width,
      height: tabRect.height
    };
  }

  function commitAnimationState(animation) {
    if (!animation) return false;
    try {
      if (typeof animation.commitStyles === 'function') animation.commitStyles();
    } catch (_error) {
      // A finished or detached animation can reject commitStyles; cancellation is still safe.
    }
    try {
      if (typeof animation.cancel === 'function') animation.cancel();
    } catch (_error) {
      return false;
    }
    return true;
  }

  function interactionEnergy(input = {}) {
    const distance = Math.abs(finite(input.delta));
    const elapsed = Math.max(8, finite(input.elapsedMs, 120));
    const velocity = distance / elapsed;
    return clamp(Math.log1p(distance) * 0.12 + Math.sqrt(velocity) * 0.72, 0.04, 1);
  }

  function progressFlowState(point = {}, rect = {}, radius = PROGRESS_PROXIMITY_RADIUS) {
    const x = finite(point.x);
    const y = finite(point.y);
    const left = finite(rect.left);
    const top = finite(rect.top);
    const right = finite(rect.right, left);
    const bottom = finite(rect.bottom, top);
    const safeRadius = Math.max(1, finite(radius, PROGRESS_PROXIMITY_RADIUS));
    const horizontalDistance = Math.max(left - x, 0, x - right);
    const verticalDistance = Math.max(top - y, 0, y - bottom);
    const distance = Math.hypot(horizontalDistance, verticalDistance);
    const proximity = clamp(1 - distance / safeRadius);
    return {
      distance,
      proximity
    };
  }

  function chooseStudyPane(input = {}) {
    const due = Math.max(0, finite(input.due));
    const unseen = Math.max(0, finite(input.unseen));
    if (due > 0) return 'queue';
    if (unseen > 0) return 'learn';
    return 'today';
  }

  function viewProfile(name) {
    return VIEW_PROFILES[name] || Object.freeze({ themeCarry: true, density: 'calm', energy: 0.36 });
  }

  function parseCount(text, label) {
    const source = String(text || '');
    const match = source.match(new RegExp(`${label}\\s*(\\d+)`, 'i'));
    return match ? Number(match[1]) : 0;
  }

  function getCounts() {
    const today = document.getElementById('todayStrip')?.textContent || '';
    const due = parseCount(today, 'Due');
    const selected = document.getElementById('batchPicker');
    const unseen = Number((selected?.selectedOptions?.[0]?.textContent || '').match(/·\s*(\d+)/)?.[1] || 0);
    return { due, unseen };
  }

  function setInteractionEnergy(energy, target) {
    if (typeof document === 'undefined') return;
    const value = clamp(energy);
    const body = document.body;
    body.style.setProperty('--v19-interaction-energy', value.toFixed(3));
    body.dataset.v19Interacting = value > 0.16 ? 'true' : 'false';
    if (target?.style) {
      target.style.setProperty('--v19-control-energy', value.toFixed(3));
    }
    clearTimeout(interactionTimer);
    interactionTimer = setTimeout(() => {
      body.style.setProperty('--v19-interaction-energy', '0.12');
      delete body.dataset.v19Interacting;
      if (target?.style) {
        target.style.setProperty('--v19-control-energy', '0.12');
      }
    }, 640);
  }

  function updateRange(input, eventTime = Date.now()) {
    if (!input || input.type !== 'range') return;
    const previous = rangeState.get(input) || { value: finite(input.value), time: eventTime - 120 };
    const value = finite(input.value);
    const energy = interactionEnergy({ delta: value - previous.value, elapsedMs: eventTime - previous.time });
    rangeState.set(input, { value, time: eventTime });
    input.style.setProperty('--v19-range-fill', `${(normalizeRange(input) * 100).toFixed(2)}%`);
    input.style.setProperty('--v19-control-energy', energy.toFixed(3));
    input.classList.add('v19-range-ready', 'is-adjusting');
    setInteractionEnergy(energy, input);
    clearTimeout(input.__v19AdjustTimer);
    input.__v19AdjustTimer = setTimeout(() => input.classList.remove('is-adjusting'), 320);
  }

  function rippleEligible(button) {
    if (!button || button.disabled) return false;
    if (typeof button.matches === 'function' && button.matches('.tab')) return false;
    if (typeof button.closest === 'function' && button.closest('#tabs')) return false;
    if (typeof button.closest === 'function' && button.closest('#view-ranked')) return false;
    return !(typeof button.querySelector === 'function' && button.querySelector(':scope > .v19-ripple'));
  }

  function addRipple(button, event) {
    if (!rippleEligible(button)) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'v19-ripple';
    const x = event?.clientX ? event.clientX - rect.left : rect.width / 2;
    const y = event?.clientY ? event.clientY - rect.top : rect.height / 2;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }

  function selectStudyPane(name, options = {}) {
    if (typeof document === 'undefined') return 'today';
    const next = VALID_STUDY_PANES.has(name) ? name : 'today';
    activePane = next;
    document.querySelectorAll('[data-study-side-tab]').forEach((button) => {
      const selected = button.dataset.studySideTab === next;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('[data-study-side-pane]').forEach((pane) => {
      const selected = pane.dataset.studySidePane === next;
      pane.classList.toggle('active', selected);
      pane.setAttribute('aria-hidden', selected ? 'false' : 'true');
    });
    if (options.persist !== false) {
      try { sessionStorage.setItem('vcs:v19-study-pane', next); } catch (_) {}
    }
    return next;
  }

  function updateStudyBadges() {
    if (typeof document === 'undefined') return;
    const counts = getCounts();
    const dueBadge = document.querySelector('[data-study-side-tab="queue"] .v19-side-count');
    const learnBadge = document.querySelector('[data-study-side-tab="learn"] .v19-side-count');
    const dueText = String(counts.due);
    const learnText = String(counts.unseen);
    if (dueBadge && dueBadge.textContent !== dueText) dueBadge.textContent = dueText;
    if (learnBadge && learnBadge.textContent !== learnText) learnBadge.textContent = learnText;
  }

  function enhanceSidebar() {
    if (typeof document === 'undefined') return;
    const tabs = document.getElementById('studySideTabs');
    if (!tabs || tabs.dataset.v19Bound === 'true') return;
    tabs.dataset.v19Bound = 'true';
    tabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-study-side-tab]');
      if (!button) return;
      selectStudyPane(button.dataset.studySideTab);
      setInteractionEnergy(0.48, button);
    });
    tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const buttons = [...tabs.querySelectorAll('[data-study-side-tab]')];
      const index = Math.max(0, buttons.findIndex((button) => button.dataset.studySideTab === activePane));
      const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[nextIndex].focus();
      selectStudyPane(buttons[nextIndex].dataset.studySideTab);
      event.preventDefault();
    });
    let preferred = '';
    try { preferred = sessionStorage.getItem('vcs:v19-study-pane') || ''; } catch (_) {}
    selectStudyPane(VALID_STUDY_PANES.has(preferred) ? preferred : chooseStudyPane(getCounts()), { persist: false });
    updateStudyBadges();
  }

  function trimCopy() {
    if (typeof document === 'undefined') return;
    const selectors = [
      '#view-import .section > p.muted:first-of-type',
      '#view-planner .section > p.muted',
      '#view-planner #planNotice',
      '#view-planner .code-box',
      '#view-books .section > p.muted',
      '#view-achievements .progress-heading p',
      '#view-settings .section > p.muted',
      '#view-more .code-box'
    ];
    for (const element of document.querySelectorAll(selectors.join(','))) {
      if (!element.classList.contains('v19-optional-copy')) {
        element.classList.add('v19-optional-copy');
        if (!element.title) element.title = element.textContent.trim();
      }
    }
  }

  function enhanceControls() {
    if (typeof document === 'undefined') return;
    for (const button of document.querySelectorAll('button, label.btn')) button.classList.add('v19-control');
    for (const input of document.querySelectorAll('input[type="range"]')) updateRange(input, Date.now());
    for (const progress of document.querySelectorAll(PROGRESS_FILL_SELECTOR)) {
      progress.classList.add('v19-liquid-progress');
      progress.parentElement?.classList.add('v19-liquid-track');
    }
  }

  function resetProgressFlow() {
    if (typeof document === 'undefined') return;
    for (const track of document.querySelectorAll('.v19-liquid-track.is-flow-near')) {
      track.classList.remove('is-flow-near');
      track.style.removeProperty('--v19-progress-proximity');
    }
  }

  function updateProgressFlow(point) {
    if (typeof document === 'undefined') return;
    const tracks = [...document.querySelectorAll('.v19-liquid-track')];
    let nearest = null;

    for (const track of tracks) {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const state = progressFlowState(point, rect, PROGRESS_PROXIMITY_RADIUS);
      if (!nearest || state.distance < nearest.state.distance) nearest = { track, state };
    }

    const activeTrack = nearest?.state.distance <= PROGRESS_PROXIMITY_RADIUS ? nearest.track : null;
    for (const track of tracks) {
      const active = track === activeTrack;
      track.classList.toggle('is-flow-near', active);
      if (active) {
        track.style.setProperty('--v19-progress-proximity', nearest.state.proximity.toFixed(3));
      } else {
        track.style.removeProperty('--v19-progress-proximity');
      }
    }
  }

  function queueProgressFlow(event) {
    pendingProgressPointer = { x: event.clientX, y: event.clientY };
    if (progressPointerFrame) return;
    progressPointerFrame = requestAnimationFrame(() => {
      progressPointerFrame = 0;
      if (pendingProgressPointer) updateProgressFlow(pendingProgressPointer);
    });
  }

  function refresh() {
    enhanceSidebar();
    enhanceControls();
    trimCopy();
    updateStudyBadges();
  }

  function setView(name) {
    if (typeof document === 'undefined') return viewProfile(name);
    const profile = viewProfile(name);
    if (name === 'ranked') {
      document.querySelectorAll('.v19-ripple').forEach((ripple) => ripple.remove());
    }
    if (name === 'settings' && typeof window !== 'undefined' && window.scrollY) {
      window.scrollTo(0, 0);
    }
    document.body.dataset.v19View = name;
    document.body.dataset.v19Density = profile.density;
    document.body.style.setProperty('--v19-view-energy', profile.energy.toFixed(3));
    document.body.classList.toggle('v19-theme-carry', profile.themeCarry);
    requestAnimationFrame(refresh);
    return profile;
  }

  function bindInteractions() {
    document.addEventListener('pointermove', queueProgressFlow, { passive: true });
    document.addEventListener('pointerover', queueProgressFlow, { passive: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerleave', resetProgressFlow, { passive: true });
      window.addEventListener('blur', resetProgressFlow);
    }

    document.addEventListener('pointerdown', (event) => {
      const control = event.target.closest('button, .btn, input, select, textarea');
      if (!control) return;
      setInteractionEnergy(0.58, control);
      if (control.matches('button, .btn') && rippleEligible(control)) addRipple(control, event);
    }, { passive: true });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (target?.type === 'range') updateRange(target, Date.now());
      else if (target?.matches('input, textarea, select')) setInteractionEnergy(0.46, target);
    });

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!target?.matches('input, select, textarea')) return;
      target.classList.add('v19-value-set');
      setInteractionEnergy(0.62, target);
      setTimeout(() => target.classList.remove('v19-value-set'), 520);
    });
  }

  function init() {
    if (initialized || typeof document === 'undefined') return api;
    initialized = true;
    refresh();
    bindInteractions();
    const observeRoot = document.querySelector('.app') || document.body;
    if (typeof MutationObserver === 'function' && observeRoot) {
      let refreshQueued = false;
      observer = new MutationObserver(() => {
        if (refreshQueued) return;
        refreshQueued = true;
        requestAnimationFrame(() => {
          refreshQueued = false;
          updateStudyBadges();
          enhanceControls();
        });
      });
      observer.observe(observeRoot, { childList: true, subtree: true });
    }
    setView(document.body.dataset.activeView || 'study');
    return api;
  }

  const api = Object.freeze({
    VERSION,
    normalizeRange,
    tabIndicatorGeometry,
    commitAnimationState,
    interactionEnergy,
    progressFlowState,
    rippleEligible,
    chooseStudyPane,
    viewProfile,
    selectStudyPane,
    updateRange,
    setView,
    refresh,
    init
  });

  return api;
});
