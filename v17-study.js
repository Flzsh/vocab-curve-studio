(function attachV17Study(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V17Study = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV17Study() {
  'use strict';

  const VERSION = 17;
  const MAX_CLIMATE_RECORDS = 30;
  const RECENT_RECORDS = 12;
  const DEFAULT_LATENCY = 8;
  const FIVE_MINUTES = 5 * 60 * 1_000;
  const THIRTY_MINUTES = 30 * 60 * 1_000;
  const BAND_LIMITS = Object.freeze({ cold: -0.55, cool: -0.18, warm: 0.20, hot: 0.48, fire: 0.74 });
  const SUCCESS_RATINGS = Object.freeze(new Set(['correct', 'know']));
  const VALID_RATINGS = Object.freeze(new Set(['wrong', 'correct', 'know']));
  const COLOR_STOPS = Object.freeze([
    Object.freeze([-1, '#4C8DFF']),
    Object.freeze([0, '#7357F2']),
    Object.freeze([0.45, '#FF9C42']),
    Object.freeze([1, '#F34D33'])
  ]);
  const GESTURE_DISTANCE_RATIO = 0.28;
  const GESTURE_FLICK_DISTANCE = 36;
  const GESTURE_FLICK_VELOCITY = 0.65;
  const GESTURE_AXIS_RATIO = 1.22;
  const GESTURE_PREVIEW_DISTANCE = 12;
  const RECALL_DRAG_RESISTANCE = 0.18;
  const RECALL_DRAG_LIMIT = 24;
  const REVEALED_DRAG_RATIO = 0.22;
  const REVEALED_DRAG_MIN = 56;
  const REVEALED_DRAG_MAX = 96;
  const RATING_ANIMATION_FALLBACK = 180;
  const CLIMATE_BANDS = Object.freeze(['cold', 'cool', 'steady', 'warm', 'hot', 'onFire']);
  const STUDY_PHASES = Object.freeze(new Set(['recall', 'revealed', 'dragging', 'settling', 'advancing', 'empty']));
  const INTERACTIVE_SELECTOR = 'button, input, textarea, select, a, [contenteditable]';
  const PHASE_TRANSITIONS = Object.freeze({
    CARD_READY: Object.freeze({ empty: 'recall' }),
    REVEAL: Object.freeze({ recall: 'revealed' }),
    DRAG_START: Object.freeze({ revealed: 'dragging' }),
    DRAG_CANCEL: Object.freeze({ dragging: 'revealed' }),
    RATE: Object.freeze({ revealed: 'settling', dragging: 'settling' }),
    RAILS_SETTLED: Object.freeze({ settling: 'advancing' }),
    NEXT_CARD: Object.freeze({ advancing: 'recall' }),
    EMPTY: Object.freeze({
      recall: 'empty',
      revealed: 'empty',
      dragging: 'empty',
      settling: 'empty',
      advancing: 'empty',
      empty: 'empty'
    })
  });

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum = -1, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function bounded(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, minimum, maximum) : fallback;
  }

  function median(values, fallback = DEFAULT_LATENCY) {
    const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
    if (!sorted.length) return fallback;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function defaultClimateState() {
    return {
      version: VERSION,
      history: [],
      latencyMedian: DEFAULT_LATENCY,
      updatedAt: 0
    };
  }

  function sanitizeEvidence(value, latencyFallback = DEFAULT_LATENCY) {
    if (!value || typeof value !== 'object' || value.source !== 'study' || !VALID_RATINGS.has(value.rating)) return null;
    const time = Number(value.time);
    if (!Number.isFinite(time) || time < 0) return null;

    const typedNumber = Number(value.typedMatch);
    const typedMatch = value.typedMatch == null || !Number.isFinite(typedNumber)
      ? null
      : clamp(typedNumber, 0, 1);

    return {
      time,
      source: 'study',
      rating: value.rating,
      priorMemory: bounded(value.priorMemory, 0, 100, 0),
      nextMemory: bounded(value.nextMemory, 0, 100, 0),
      priorSection: bounded(value.priorSection, 0, 100, 0),
      nextSection: bounded(value.nextSection, 0, 100, 0),
      activeSeconds: bounded(value.activeSeconds, 0, 300, 0),
      latencyBaseline: bounded(value.latencyBaseline, 0, 300, bounded(latencyFallback, 0, 300, DEFAULT_LATENCY)),
      hints: Math.round(bounded(value.hints, 0, 20, 0)),
      typedMatch,
      afk: value.afk === true,
      first: value.first === true
    };
  }

  function sortedRecentHistory(history) {
    return history
      .slice()
      .sort((left, right) => left.time - right.time)
      .slice(-MAX_CLIMATE_RECORDS);
  }

  function migrateClimateState(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.history)) return defaultClimateState();

    const latencyFallback = bounded(value.latencyMedian, 0.25, 300, DEFAULT_LATENCY);
    const history = sortedRecentHistory(value.history
      .map((record) => sanitizeEvidence(record, latencyFallback))
      .filter(Boolean));
    const observedLatency = median(
      history.filter((record) => !record.afk && record.activeSeconds > 0).map((record) => record.activeSeconds),
      latencyFallback
    );
    const latestTime = history.length ? history[history.length - 1].time : 0;
    const updatedAt = Math.max(latestTime, bounded(value.updatedAt, 0, Number.MAX_SAFE_INTEGER, latestTime));

    return {
      version: VERSION,
      history,
      latencyMedian: bounded(value.latencyMedian, 0.25, 300, observedLatency),
      updatedAt
    };
  }

  function appendClimateEvidence(state, evidence) {
    const current = migrateClimateState(state);
    const record = sanitizeEvidence(evidence, current.latencyMedian);
    if (!record) return current;

    const history = sortedRecentHistory(current.history.concat(record));
    const latencySamples = history
      .filter((entry) => !entry.afk && entry.activeSeconds > 0)
      .slice(-RECENT_RECORDS)
      .map((entry) => entry.activeSeconds);

    return {
      version: VERSION,
      history,
      latencyMedian: median(latencySamples, current.latencyMedian),
      updatedAt: Math.max(current.updatedAt, record.time)
    };
  }

  function qualitySignal(record) {
    const difficulty = 1 - record.priorMemory / 100;
    if (record.rating === 'wrong') return -(0.55 + 0.45 * (record.priorMemory / 100));
    const base = record.rating === 'know' ? 0.90 : 0.56;
    return base + 0.22 * difficulty;
  }

  function paceSignal(record) {
    if (record.afk || record.activeSeconds <= 0 || record.latencyBaseline <= 0) return null;
    const relativePace = (record.latencyBaseline - record.activeSeconds) / record.latencyBaseline;
    return clamp(relativePace, -0.35, 0.35);
  }

  function optionalSignal(record) {
    const signals = [];
    const pace = paceSignal(record);
    if (pace !== null) signals.push([pace, 0.35]);
    if (record.typedMatch !== null) signals.push([record.typedMatch * 2 - 1, 0.40]);
    if (Number.isFinite(record.hints)) signals.push([clamp(1 - record.hints, -1, 1), 0.25]);
    if (!signals.length) return null;

    const totalWeight = signals.reduce((sum, signal) => sum + signal[1], 0);
    return signals.reduce((sum, signal) => sum + signal[0] * signal[1], 0) / totalWeight;
  }

  function eventTemperature(record) {
    const wordDelta = clamp((record.nextMemory - record.priorMemory) / 25, -1, 1);
    const sectionDelta = clamp((record.nextSection - record.priorSection) / 4, -1, 1);
    const core = 0.70 * qualitySignal(record) + 0.18 * wordDelta + 0.12 * sectionDelta;
    const optional = optionalSignal(record);
    return clamp(optional === null ? core : core * 0.88 + optional * 0.12, -1, 1);
  }

  function isSuccess(record) {
    return SUCCESS_RATINGS.has(record.rating);
  }

  function isCleanSuccess(record) {
    return isSuccess(record)
      && !record.afk
      && record.hints <= 1
      && (record.typedMatch === null || record.typedMatch >= 0.4);
  }

  function consecutiveSuccesses(newestFirst) {
    let streak = 0;
    for (const record of newestFirst) {
      if (!isSuccess(record)) break;
      streak += 1;
    }
    return Math.min(MAX_CLIMATE_RECORDS, streak);
  }

  function cadenceFor(records, latencyMedian) {
    if (!records.length) return 0;
    const density = Math.min(records.length / 4, 1);
    if (records.length === 1) {
      const activeSeconds = records[0].activeSeconds || latencyMedian;
      return clamp(density * clamp(latencyMedian / Math.max(activeSeconds, 0.25), 0.5, 1), 0, 1);
    }

    let totalGap = 0;
    for (let index = 1; index < records.length; index += 1) {
      totalGap += Math.max(0, records[index].time - records[index - 1].time) / 1_000;
    }
    const averageGap = totalGap / (records.length - 1);
    const intervalCadence = clamp(1 - averageGap / 60, 0, 1);
    return clamp(density * intervalCadence, 0, 1);
  }

  function weightedMoments(records) {
    let totalWeight = 0;
    let weightedSum = 0;
    const samples = records.map((record, age) => {
      const value = eventTemperature(record);
      const weight = 0.82 ** age;
      totalWeight += weight;
      weightedSum += value * weight;
      return { value, weight };
    });
    const mean = totalWeight ? weightedSum / totalWeight : 0;
    const variance = totalWeight
      ? samples.reduce((sum, sample) => sum + sample.weight * (sample.value - mean) ** 2, 0) / totalWeight
      : 0;
    return { mean, standardDeviation: Math.sqrt(Math.max(0, variance)) };
  }

  function recencyAt(latestTime, now) {
    const inactiveFor = Math.max(0, now - latestTime);
    if (inactiveFor <= FIVE_MINUTES) return 1;
    return Math.exp(-(inactiveFor - FIVE_MINUTES) / THIRTY_MINUTES);
  }

  function bandFor(temperature, newestFirst) {
    if (temperature < BAND_LIMITS.cold) return 'cold';
    if (temperature < BAND_LIMITS.cool) return 'cool';
    if (temperature < BAND_LIMITS.warm) return 'steady';
    if (temperature < BAND_LIMITS.hot) return 'warm';
    if (temperature < BAND_LIMITS.fire) return 'hot';
    return newestFirst.slice(0, 3).length === 3 && newestFirst.slice(0, 3).every(isCleanSuccess) ? 'onFire' : 'hot';
  }

  function neutralClimate() {
    const flow = 0.18;
    return {
      temperature: 0,
      energy: 0,
      stability: 1,
      flow,
      flowDuration: 18 - 15 * flow,
      streak: 0,
      band: 'steady'
    };
  }

  function deriveSessionClimate(state, now) {
    const current = migrateClimateState(state);
    if (!current.history.length) return neutralClimate();

    const chronological = current.history.slice(-RECENT_RECORDS);
    const newestFirst = chronological.slice().reverse();
    const moments = weightedMoments(newestFirst);
    const streak = consecutiveSuccesses(newestFirst);
    const recovered = newestFirst.length >= 3
      && isCleanSuccess(newestFirst[0])
      && isCleanSuccess(newestFirst[1])
      && newestFirst[2].rating === 'wrong';
    const streakBonus = Math.min(0.18, 0.035 * streak);
    const latestTime = newestFirst[0].time;
    const currentTime = bounded(now, 0, Number.MAX_SAFE_INTEGER, Math.max(current.updatedAt, latestTime));
    const recency = recencyAt(latestTime, currentTime);
    const temperature = clamp((moments.mean + streakBonus + (recovered ? 0.06 : 0)) * recency, -1, 1);
    const stability = clamp(1 - moments.standardDeviation / 0.9, 0, 1);
    const cadence = cadenceFor(chronological, current.latencyMedian);
    const energy = clamp(
      recency * clamp(0.26 + 0.28 * cadence + 0.28 * Math.min(streak / 5, 1) + 0.18 * Math.abs(temperature), 0, 1),
      0,
      1
    );
    const flow = clamp(0.18 + 0.52 * energy + 0.30 * Math.max(temperature, 0), 0.18, 1);

    return {
      temperature,
      energy,
      stability,
      flow,
      flowDuration: 18 - 15 * flow,
      streak,
      band: bandFor(temperature, newestFirst)
    };
  }

  function normalizeRecallText(value) {
    return String(value == null ? '' : value)
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('en-US')
      .replace(/[\p{P}\p{Z}\s]+/gu, ' ')
      .trim();
  }

  function characterCountWithoutSpaces(value) {
    return Array.from(value.replace(/\s/gu, '')).length;
  }

  function recallTokens(value) {
    return new Set(value.split(/\s+/u).filter((token) => Array.from(token).length >= 2));
  }

  function typedRecallMatch(typed, expected) {
    const normalizedTyped = normalizeRecallText(typed);
    const normalizedExpected = normalizeRecallText(expected);
    if (characterCountWithoutSpaces(normalizedTyped) < 2 || characterCountWithoutSpaces(normalizedExpected) < 2) return null;
    if (normalizedTyped.includes(normalizedExpected) || normalizedExpected.includes(normalizedTyped)) return 1;

    const typedTokens = recallTokens(normalizedTyped);
    const expectedTokens = recallTokens(normalizedExpected);
    const denominator = Math.max(typedTokens.size, expectedTokens.size);
    if (!denominator) return 0;
    let overlap = 0;
    for (const token of typedTokens) if (expectedTokens.has(token)) overlap += 1;
    return clamp(overlap / denominator, 0, 1);
  }

  function srgbChannelToLinear(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function linearChannelToSrgb(channel) {
    const value = channel <= 0.0031308 ? 12.92 * channel : 1.055 * (Math.max(0, channel) ** (1 / 2.4)) - 0.055;
    return Math.round(clamp(value, 0, 1) * 255);
  }

  function hexToOKLab(hex) {
    const red = srgbChannelToLinear(parseInt(hex.slice(1, 3), 16));
    const green = srgbChannelToLinear(parseInt(hex.slice(3, 5), 16));
    const blue = srgbChannelToLinear(parseInt(hex.slice(5, 7), 16));
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }

  function oklabToRgb(lab) {
    const lRoot = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
    const mRoot = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
    const sRoot = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
    const l = lRoot ** 3;
    const m = mRoot ** 3;
    const s = sRoot ** 3;
    return [
      linearChannelToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      linearChannelToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linearChannelToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }

  function mixOKLab(left, right, amount) {
    const ratio = clamp(amount, 0, 1);
    return left.map((component, index) => component + (right[index] - component) * ratio);
  }

  function colorAtTemperature(temperature) {
    const value = clamp(temperature, -1, 1);
    for (let index = 1; index < COLOR_STOPS.length; index += 1) {
      const lower = COLOR_STOPS[index - 1];
      const upper = COLOR_STOPS[index];
      if (value <= upper[0]) {
        const amount = (value - lower[0]) / (upper[0] - lower[0]);
        return mixOKLab(hexToOKLab(lower[1]), hexToOKLab(upper[1]), amount);
      }
    }
    return hexToOKLab(COLOR_STOPS[COLOR_STOPS.length - 1][1]);
  }

  function serializeRgb(lab) {
    const rgb = oklabToRgb(lab);
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  }

  function climateVisuals(climate) {
    const source = climate && typeof climate === 'object' ? climate : {};
    const temperature = bounded(source.temperature, -1, 1, 0);
    const energy = bounded(source.energy, 0, 1, 0);
    const stability = bounded(source.stability, 0, 1, 1);
    const ambientLab = colorAtTemperature(temperature);
    const wordLab = mixOKLab(ambientLab, hexToOKLab('#7357F2'), 0.16);
    const sectionLab = mixOKLab(ambientLab, hexToOKLab('#10A6C8'), 0.20);

    return {
      ambient: serializeRgb(ambientLab),
      word: serializeRgb(wordLab),
      section: serializeRgb(sectionLab),
      glowOpacity: clamp(0.12 + 0.22 * energy + 0.08 * (1 - stability), 0, 1),
      bubbleOpacity: clamp(0.18 + 0.34 * energy + 0.10 * stability, 0, 1)
    };
  }

  function resolveGesture(sample) {
    if (!sample || typeof sample !== 'object') return null;
    const dx = finite(sample.dx);
    const dy = finite(sample.dy);
    const horizontal = Math.abs(dx) >= Math.abs(dy) * GESTURE_AXIS_RATIO;
    const vertical = Math.abs(dy) >= Math.abs(dx) * GESTURE_AXIS_RATIO;
    if (!horizontal && !vertical) return null;

    const distance = horizontal ? Math.abs(dx) : Math.abs(dy);
    const dimension = finite(horizontal ? sample.width : sample.height);
    const duration = finite(sample.dt);
    const crossedDistance = dimension > 0 && distance >= dimension * GESTURE_DISTANCE_RATIO;
    const crossedFlick = duration > 0
      && distance >= GESTURE_FLICK_DISTANCE
      && distance / duration >= GESTURE_FLICK_VELOCITY;
    if (!crossedDistance && !crossedFlick) return null;

    if (horizontal) {
      return dx < 0
        ? { intent: 'rate', rating: 'know', direction: 'left' }
        : { intent: 'cancel', direction: 'right' };
    }
    return dy < 0
      ? { intent: 'rate', rating: 'wrong', direction: 'up' }
      : { intent: 'rate', rating: 'correct', direction: 'down' };
  }

  function keyIntent(input) {
    if (!input || typeof input !== 'object' || input.editable) return null;
    if (input.phase === 'recall' && ['Enter', ' ', 'Space', 'Spacebar'].includes(input.key)) {
      return { intent: 'reveal' };
    }
    if (input.phase !== 'revealed') return null;
    const rating = {
      ArrowUp: 'wrong',
      ArrowDown: 'correct',
      ArrowLeft: 'know'
    }[input.key];
    return rating ? { intent: 'rate', rating } : null;
  }

  function reducePhase(phase, event) {
    if (!event || typeof event.type !== 'string') return phase;
    const transitions = PHASE_TRANSITIONS[event.type];
    return transitions && transitions[phase] ? transitions[phase] : phase;
  }

  function createInteractionController(options = {}) {
    const stage = options.stage || null;
    const cardFace = options.cardFace || null;
    const ratingTarget = options.ratingTarget || cardFace;
    const ratingDock = options.ratingDock || null;
    const documentRef = stage && stage.ownerDocument
      ? stage.ownerDocument
      : (typeof document !== 'undefined' ? document : null);
    const view = documentRef && documentRef.defaultView
      ? documentRef.defaultView
      : (typeof globalThis !== 'undefined' ? globalThis : null);
    const onReveal = typeof options.onReveal === 'function' ? options.onReveal : function noop() {};
    const onRate = typeof options.onRate === 'function' ? options.onRate : function noop() {};
    const onPhaseChange = typeof options.onPhaseChange === 'function' ? options.onPhaseChange : function noop() {};
    const requestFrame = view && typeof view.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame.bind(view)
      : function immediateFrame(callback) { callback(); return 0; };
    const cancelFrame = view && typeof view.cancelAnimationFrame === 'function'
      ? view.cancelAnimationFrame.bind(view)
      : function noopFrame() {};
    const setTimer = view && typeof view.setTimeout === 'function'
      ? view.setTimeout.bind(view)
      : setTimeout;
    const clearTimer = view && typeof view.clearTimeout === 'function'
      ? view.clearTimeout.bind(view)
      : clearTimeout;
    const listeners = [];
    let currentPhase = 'empty';
    let destroyed = false;
    let activePointer = null;
    let dragFrame = null;
    let pendingDrag = null;
    let ratingAnimation = null;
    let climateClass = null;

    function phase() {
      return currentPhase;
    }

    function setPhase(nextPhase) {
      if (!STUDY_PHASES.has(nextPhase) || nextPhase === currentPhase) return currentPhase;
      const previousPhase = currentPhase;
      currentPhase = nextPhase;
      onPhaseChange(currentPhase, previousPhase);
      return currentPhase;
    }

    function prepareCard(available = true) {
      clearPointer();
      const type = available
        ? (currentPhase === 'advancing' ? 'NEXT_CARD' : 'CARD_READY')
        : 'EMPTY';
      return setPhase(reducePhase(currentPhase, { type }));
    }

    function reveal() {
      const nextPhase = reducePhase(currentPhase, { type: 'REVEAL' });
      if (nextPhase === currentPhase) return false;
      setPhase(nextPhase);
      onReveal();
      return true;
    }

    function beginRating(rating) {
      if (!VALID_RATINGS.has(rating)) return false;
      const nextPhase = reducePhase(currentPhase, { type: 'RATE' });
      if (nextPhase === currentPhase) return false;
      setPhase(nextPhase);
      return true;
    }

    function isEditableTarget(target) {
      return Boolean(target && typeof target.closest === 'function' && target.closest(INTERACTIVE_SELECTOR));
    }

    function isActiveViewTarget(target) {
      if (!target || typeof target.closest !== 'function') return false;
      const viewElement = target.closest('.view');
      return Boolean(viewElement && viewElement.classList && viewElement.classList.contains('active'));
    }

    function isCardTarget(target) {
      if (!cardFace || !target) return false;
      return target === cardFace || (typeof cardFace.contains === 'function' && cardFace.contains(target));
    }

    function listen(target, type, listener) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, listener);
      listeners.push([target, type, listener]);
    }

    function numericEventValue(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }

    function pointerMatches(event) {
      return activePointer && event.pointerId === activePointer.id;
    }

    function resistantOffset(value) {
      return Math.sign(value) * Math.min(Math.abs(value) * RECALL_DRAG_RESISTANCE, RECALL_DRAG_LIMIT);
    }

    function elasticPreviewOffset(value, span) {
      const distance = Math.abs(finite(value, 0));
      if (!distance) return 0;
      const limit = clamp(finite(span, 0) * REVEALED_DRAG_RATIO, REVEALED_DRAG_MIN, REVEALED_DRAG_MAX);
      return Math.sign(value) * limit * (1 - Math.exp(-distance / limit));
    }

    function cssNumber(value) {
      return Number(value.toFixed(3));
    }

    function previewRating(dx, dy) {
      const horizontal = Math.abs(dx) >= Math.abs(dy) * GESTURE_AXIS_RATIO;
      const vertical = Math.abs(dy) >= Math.abs(dx) * GESTURE_AXIS_RATIO;
      if (horizontal && Math.abs(dx) >= GESTURE_PREVIEW_DISTANCE) return dx < 0 ? 'know' : null;
      if (vertical && Math.abs(dy) >= GESTURE_PREVIEW_DISTANCE) return dy < 0 ? 'wrong' : 'correct';
      return null;
    }

    function setRatingPreview(rating) {
      if (stage && stage.dataset) {
        if (rating) stage.dataset.dragIntent = rating;
        else delete stage.dataset.dragIntent;
      }
      if (!ratingDock) return;
      if (ratingDock.dataset) {
        if (rating) ratingDock.dataset.previewRating = rating;
        else delete ratingDock.dataset.previewRating;
      }
      if (typeof ratingDock.querySelectorAll !== 'function') return;
      for (const target of ratingDock.querySelectorAll('[data-rating]')) {
        if (target.classList && typeof target.classList.toggle === 'function') {
          target.classList.toggle('is-preview', Boolean(rating && target.dataset && target.dataset.rating === rating));
        }
      }
    }

    function flushDragFrame() {
      dragFrame = null;
      if (!activePointer || !pendingDrag || !cardFace || !cardFace.style) return;
      const rawX = pendingDrag.dx;
      const rawY = pendingDrag.dy;
      const isRecall = activePointer.originPhase === 'recall';
      const x = isRecall ? resistantOffset(rawX) : elasticPreviewOffset(rawX, activePointer.width);
      const y = isRecall ? resistantOffset(rawY) : elasticPreviewOffset(rawY, activePointer.height);
      const rotate = activePointer.width > 0 ? (x / activePointer.width) * 8 : 0;
      cardFace.style.transform = `translate3d(${cssNumber(x)}px, ${cssNumber(y)}px, 0) rotate(${cssNumber(rotate)}deg)`;
      setRatingPreview(isRecall ? null : previewRating(rawX, rawY));
    }

    function clearPointer() {
      if (dragFrame !== null) {
        cancelFrame(dragFrame);
        dragFrame = null;
      }
      pendingDrag = null;
      const pointer = activePointer;
      activePointer = null;
      if (pointer && stage && typeof stage.releasePointerCapture === 'function') {
        try {
          if (typeof stage.hasPointerCapture !== 'function' || stage.hasPointerCapture(pointer.id)) {
            stage.releasePointerCapture(pointer.id);
          }
        } catch (error) {
          // Pointer capture may already have been released by the browser.
        }
      }
      if (cardFace && cardFace.style) cardFace.style.transform = '';
      setRatingPreview(null);
      return pointer;
    }

    function directionForAnimation(value) {
      if (typeof value === 'string') {
        if (['up', 'down', 'left', 'right'].includes(value)) return value;
        return { wrong: 'up', correct: 'down', know: 'left' }[value] || null;
      }
      if (!value || typeof value !== 'object') return null;
      return directionForAnimation(value.direction || value.rating);
    }

    function prefersReducedMotion() {
      const preference = options.prefersReducedMotion;
      if (typeof preference === 'function') return Boolean(preference());
      if (preference && typeof preference === 'object') return Boolean(preference.matches);
      return Boolean(preference);
    }

    function clearRatingVisuals(direction) {
      if (!ratingTarget) return;
      if (ratingTarget.classList) {
        ratingTarget.classList.remove('is-rating');
        if (direction) ratingTarget.classList.remove(`is-rating-${direction}`);
      }
      if (ratingTarget.dataset) delete ratingTarget.dataset.ratingDirection;
      if (ratingTarget.style) ratingTarget.style.transform = '';
    }

    function animateRating(value) {
      if (ratingAnimation) return ratingAnimation.promise;
      const direction = directionForAnimation(value);
      if (!ratingTarget || !direction) return Promise.resolve();
      setPhase(reducePhase(currentPhase, { type: 'RAILS_SETTLED' }));

      if (ratingTarget.classList) {
        ratingTarget.classList.add('is-rating', `is-rating-${direction}`);
      }
      if (ratingTarget.dataset) ratingTarget.dataset.ratingDirection = direction;
      if (ratingTarget.style) {
        const transforms = {
          wrong: 'translate3d(0, -10px, 0)',
          correct: 'translate3d(0, 10px, 0)',
          know: 'translate3d(-10px, 0, 0)',
          up: 'translate3d(0, -10px, 0)',
          down: 'translate3d(0, 10px, 0)',
          left: 'translate3d(-10px, 0, 0)',
          right: 'translate3d(10px, 0, 0)'
        };
        const ratingKey = typeof value === 'string' ? value : value && value.rating;
        ratingTarget.style.transform = transforms[ratingKey] || transforms[direction];
      }

      if (prefersReducedMotion()) {
        clearRatingVisuals(direction);
        return Promise.resolve();
      }

      let resolveAnimation;
      let fallbackTimer;
      let settled = false;
      const promise = new Promise((resolve) => {
        resolveAnimation = resolve;
      });
      function finish() {
        if (settled) return;
        settled = true;
        if (ratingTarget && typeof ratingTarget.removeEventListener === 'function') {
          ratingTarget.removeEventListener('transitionend', onTransitionEnd);
        }
        clearTimer(fallbackTimer);
        clearRatingVisuals(direction);
        ratingAnimation = null;
        resolveAnimation();
      }
      function onTransitionEnd(event) {
        if (event.target !== ratingTarget) return;
        if (event.propertyName && event.propertyName !== 'transform') return;
        finish();
      }
      if (typeof ratingTarget.addEventListener === 'function') {
        ratingTarget.addEventListener('transitionend', onTransitionEnd);
      }
      fallbackTimer = setTimer(finish, RATING_ANIMATION_FALLBACK);
      ratingAnimation = { promise, finish };
      return promise;
    }

    function climateClassName(band) {
      if (!CLIMATE_BANDS.includes(band)) return null;
      return `is-climate-${band === 'onFire' ? 'on-fire' : band}`;
    }

    function syncAmbientVisibility() {
      if (!stage || !stage.classList) return;
      const hidden = Boolean(documentRef && documentRef.hidden);
      stage.classList.toggle('is-ambient-paused', hidden);
      for (const band of CLIMATE_BANDS) stage.classList.remove(climateClassName(band));
      if (!hidden && climateClass) stage.classList.add(climateClass);
    }

    function applyClimate(climate) {
      const source = climate && typeof climate === 'object' ? climate : {};
      const visuals = climateVisuals(source);
      if (stage && stage.style && typeof stage.style.setProperty === 'function') {
        const stability = bounded(source.stability, 0, 1, 0.5);
        stage.style.setProperty('--v17-ambient-color', visuals.ambient);
        stage.style.setProperty('--v17-word-color', visuals.word);
        stage.style.setProperty('--v17-section-color', visuals.section);
        stage.style.setProperty('--v17-glow-opacity', visuals.glowOpacity);
        stage.style.setProperty('--v17-bubble-opacity', visuals.bubbleOpacity);
        stage.style.setProperty('--v17-energy', bounded(source.energy, 0, 1, 0));
        stage.style.setProperty('--v17-stability', stability);
        stage.style.setProperty('--v17-turbulence', 1 - stability);
        stage.style.setProperty('--v17-flow-duration', `${bounded(source.flowDuration, 0.25, 60, 18)}s`);
      }
      climateClass = climateClassName(source.band);
      syncAmbientVisibility();
      return visuals;
    }

    function cancel() {
      clearPointer();
      if (ratingAnimation) ratingAnimation.finish();
      if (currentPhase === 'dragging') setPhase(reducePhase(currentPhase, { type: 'DRAG_CANCEL' }));
      return currentPhase;
    }

    function onPointerDown(event) {
      if (destroyed || activePointer || (event.button != null && event.button !== 0)) return;
      if (currentPhase !== 'recall' && currentPhase !== 'revealed') return;
      if (!isCardTarget(event.target) || isEditableTarget(event.target)) return;
      const rect = cardFace && typeof cardFace.getBoundingClientRect === 'function'
        ? cardFace.getBoundingClientRect()
        : { width: 0, height: 0 };
      activePointer = {
        id: event.pointerId,
        startX: numericEventValue(event.clientX),
        startY: numericEventValue(event.clientY),
        startTime: numericEventValue(event.timeStamp),
        width: Math.max(0, numericEventValue(rect.width)),
        height: Math.max(0, numericEventValue(rect.height)),
        originPhase: currentPhase
      };
      if (stage && typeof stage.setPointerCapture === 'function') {
        try {
          stage.setPointerCapture(activePointer.id);
        } catch (error) {
          // Capture is an enhancement; the drag can still be cancelled safely.
        }
      }
      if (currentPhase === 'revealed') setPhase(reducePhase(currentPhase, { type: 'DRAG_START' }));
    }

    function onPointerMove(event) {
      if (!pointerMatches(event)) return;
      pendingDrag = {
        dx: numericEventValue(event.clientX) - activePointer.startX,
        dy: numericEventValue(event.clientY) - activePointer.startY
      };
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (dragFrame === null) dragFrame = requestFrame(flushDragFrame);
    }

    function onPointerUp(event) {
      if (!pointerMatches(event)) return;
      const pointer = activePointer;
      const sample = {
        dx: numericEventValue(event.clientX) - pointer.startX,
        dy: numericEventValue(event.clientY) - pointer.startY,
        dt: Math.max(0, numericEventValue(event.timeStamp) - pointer.startTime),
        width: pointer.width,
        height: pointer.height
      };
      clearPointer();
      if (pointer.originPhase !== 'revealed') return;
      const intent = resolveGesture(sample);
      if (intent && intent.intent === 'rate') {
        onRate(intent.rating, { source: 'pointer', direction: intent.direction, event });
      }
      else cancel();
    }

    function onKeyDown(event) {
      if (destroyed || !isActiveViewTarget(event.target)) return;
      const intent = keyIntent({ key: event.key, phase: currentPhase, editable: isEditableTarget(event.target) });
      if (!intent) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (intent.intent === 'reveal') reveal();
      else onRate(intent.rating, { source: 'keyboard', key: event.key, event });
    }

    function destroy() {
      if (destroyed) return;
      cancel();
      destroyed = true;
      for (const listener of listeners.splice(0)) listener[0].removeEventListener(listener[1], listener[2]);
    }

    listen(stage, 'keydown', onKeyDown);
    listen(stage, 'pointerdown', onPointerDown);
    listen(stage, 'pointermove', onPointerMove);
    listen(stage, 'pointerup', onPointerUp);
    listen(stage, 'pointercancel', cancel);
    listen(view, 'blur', cancel);
    listen(view, 'resize', cancel);
    listen(view, 'routechange', cancel);
    listen(view, 'popstate', cancel);
    listen(view, 'hashchange', cancel);
    listen(documentRef, 'visibilitychange', syncAmbientVisibility);
    syncAmbientVisibility();

    return {
      phase,
      setPhase,
      beginRating,
      prepareCard,
      reveal,
      animateRating,
      applyClimate,
      cancel,
      destroy
    };
  }

  function calculateSectionAverage(cards, sectionKey, keyOf) {
    if (!Array.isArray(cards) || typeof keyOf !== 'function') return 0;
    let total = 0;
    let count = 0;
    for (const card of cards) {
      if (!card || typeof card !== 'object' || card.deleted || card.suspended || card.state === 'deleted' || card.state === 'suspended') continue;
      if (keyOf(card) !== sectionKey) continue;
      total += bounded(card.memoryScore, 0, 100, 0);
      count += 1;
    }
    return count ? total / count : 0;
  }

  return Object.freeze({
    VERSION,
    defaultClimateState,
    migrateClimateState,
    appendClimateEvidence,
    deriveSessionClimate,
    climateVisuals,
    typedRecallMatch,
    calculateSectionAverage,
    resolveGesture,
    keyIntent,
    reducePhase,
    createInteractionController
  });
});
