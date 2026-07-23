(function attachV20StudyMemory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20StudyMemory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20StudyMemory() {
  'use strict';

  const VERSION = '20.0.0-alpha.20';
  const HOUR = 60 * 60 * 1000;
  const SESSION_HOLD_HOURS = 6;
  const DECAY_HOURS = 12;
  const SHORT_TERM_TARGET = 90;
  const LONG_TERM_TARGET = 90;
  const COLOR_STOPS = Object.freeze([
    Object.freeze([0, '#F05A4A']),
    Object.freeze([35, '#E99745']),
    Object.freeze([68, '#6D5DFC']),
    Object.freeze([100, '#21A685'])
  ]);

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function usableNumber(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function clamp(value, minimum = 0, maximum = 100) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function normalizeRating(value) {
    const rating = String(value || '').toLowerCase();
    if (['wrong', 'again', 'hard'].includes(rating)) return 'wrong';
    if (['know', 'known', 'instant'].includes(rating)) return 'know';
    return 'correct';
  }

  function historySource(entry) {
    return String(entry && (entry.kind || entry.source || entry.context) || '').toLowerCase();
  }

  function isRankedHistory(entry) {
    return ['ranked', 'battle'].includes(historySource(entry));
  }

  function storedShortTerm(card) {
    if (!card || typeof card !== 'object') return 0;
    if (Number.isFinite(Number(card.shortTermMastery))) return clamp(card.shortTermMastery);
    if (Number.isFinite(Number(card.studyMastery))) return clamp(card.studyMastery);
    const history = (Array.isArray(card.history) ? card.history : [])
      .filter((entry) => entry && !isRankedHistory(entry))
      .slice()
      .sort((left, right) => finite(right.time) - finite(left.time));
    const latest = history[0];
    if (!latest) return 0;
    const rating = normalizeRating(latest.rating);
    if (rating === 'know') return 100;
    if (rating === 'correct') return clamp(90 - Math.min(36, finite(latest.hints) * 12));
    return 18;
  }

  function effectiveShortTerm(card, now = Date.now(), longTerm = finite(card && card.memoryScore, 0)) {
    const stored = storedShortTerm(card);
    const hasExplicitTimestamp = Number.isFinite(Number(card && card.shortTermUpdatedAt)) && Number(card.shortTermUpdatedAt) > 0;
    if (!hasExplicitTimestamp && Number.isFinite(Number(card && card.shortTermMastery))) return stored;
    const updatedAt = finite(
      card && card.shortTermUpdatedAt,
      finite(card && card.lastReviewedAt, finite(card && card.introducedAt, now))
    );
    const ageHours = Math.max(0, (finite(now, Date.now()) - updatedAt) / HOUR);
    if (ageHours <= SESSION_HOLD_HOURS) return stored;
    const anchor = clamp(longTerm);
    const decay = Math.exp(-(ageHours - SESSION_HOLD_HOURS) / DECAY_HOURS);
    return clamp(anchor + (stored - anchor) * decay);
  }

  function responseSeconds(context = {}) {
    if (Number.isFinite(Number(context.responseSeconds))) return Math.max(0, Number(context.responseSeconds));
    if (context.timing && Number.isFinite(Number(context.timing.seconds))) return Math.max(0, Number(context.timing.seconds));
    return 0;
  }

  function speedAdjustment(context = {}) {
    if (context.timing && context.timing.afk) return -12;
    const seconds = responseSeconds(context);
    const baseline = Math.max(2.5, finite(context.correctSeconds, 8));
    if (!seconds) return 0;
    if (seconds <= baseline * 0.55) return 3;
    if (seconds <= baseline * 1.25) return 0;
    if (seconds <= baseline * 2.2) return -4;
    return -8;
  }

  function nextShortTerm(card, rating, context = {}) {
    const normalized = normalizeRating(rating);
    const first = context.first === true || context.firstExposure === true;
    const hints = Math.max(0, Math.floor(finite(context.hints)));
    const now = finite(context.now, Date.now());
    const longTerm = finite(context.longTerm, finite(card && card.memoryScore, 0));
    const previous = effectiveShortTerm(card, now, longTerm);
    const speed = speedAdjustment(context);
    const typedBoost = String(context.typed || '').trim().length >= 2 ? 2 : 0;

    if (normalized === 'wrong') {
      if (first && finite(card && card.shortTermEvidenceCount, finite(card && card.sessionAttempts, 0)) === 0) {
        return clamp(18 - Math.min(4, hints));
      }
      return clamp(Math.max(5, previous * 0.45 - Math.min(10, hints * 2)));
    }
    if (normalized === 'know') return 100;

    const hintPenalty = hints === 0 ? 0 : hints === 1 ? 13 : hints === 2 ? 30 : 43 + (hints - 3) * 5;
    if (first) return clamp(92 + speed + typedBoost - hintPenalty);
    const repaired = Math.max(90, previous + (100 - previous) * 0.72);
    return clamp(repaired + speed + typedBoost - hintPenalty);
  }

  function updateUsabilityEvidence(card, rating, context = {}) {
    const normalized = normalizeRating(rating);
    const hints = Math.max(0, Math.floor(finite(context.hints)));
    const typed = String(context.typed || '').trim().length >= 2;
    const seconds = responseSeconds(context);
    const previous = usableNumber(card.usabilityScore) ? clamp(card.usabilityScore) : null;
    const independentBefore = Math.max(0, Math.floor(finite(card.sessionIndependentCorrect)));
    const independentAfter = independentBefore + (normalized !== 'wrong' && hints === 0 ? 1 : 0);
    card.sessionIndependentCorrect = independentAfter;

    if (normalized === 'wrong') {
      if (previous !== null) card.usabilityScore = Math.round(clamp(previous * 0.68 - 4));
      return;
    }
    if (normalized === 'know') {
      card.usabilityScore = Math.round(Math.max(previous === null ? 0 : previous, typed ? 86 : 78));
      return;
    }
    if (independentAfter < 2) {
      if (previous === null) card.usabilityScore = null;
      return;
    }
    const base = typed ? 68 : 58;
    const speed = seconds > 0 && seconds <= 7 ? 5 : seconds > 18 ? -6 : 0;
    const breadth = Math.min(14, (independentAfter - 2) * 4);
    const candidate = clamp(base + speed + breadth - Math.min(18, hints * 8));
    card.usabilityScore = Math.round(previous === null ? candidate : Math.max(previous * 0.82 + candidate * 0.18, candidate - 8));
  }

  function applyOutcome(card, rating, context = {}) {
    if (!card || typeof card !== 'object') return Object.freeze({
      shortTermMastery: 0,
      usabilityScore: null,
      usabilityMeasured: false,
      sessionAttempts: 0,
      sessionIndependentCorrect: 0,
      sessionLastRating: normalizeRating(rating),
      sessionUpdatedAt: finite(context.now, Date.now())
    });
    const now = finite(context.now, Date.now());
    const shortTerm = Math.round(nextShortTerm(card, rating, { ...context, now }) * 10) / 10;
    card.shortTermMastery = shortTerm;
    card.shortTermUpdatedAt = now;
    card.shortTermEvidenceCount = Math.max(0, Math.floor(finite(card.shortTermEvidenceCount, finite(card.sessionAttempts)))) + 1;
    card.sessionAttempts = Math.max(0, Math.floor(finite(card.sessionAttempts))) + 1;
    card.sessionLastRating = normalizeRating(rating);
    card.sessionUpdatedAt = now;
    updateUsabilityEvidence(card, rating, context);
    return cardSnapshot(card, now, finite(context.longTerm, finite(card.memoryScore, 0)));
  }

  function applyShortTermEvidence(card, rating, context = {}) {
    return applyOutcome(card, rating, context).shortTermMastery;
  }

  function usabilityScore(card, now = Date.now(), longTerm = finite(card && card.memoryScore, 0)) {
    if (!card || typeof card !== 'object') return null;
    const stored = usableNumber(card.usabilityScore) ? clamp(card.usabilityScore) : null;
    const history = (Array.isArray(card.history) ? card.history : [])
      .filter((entry) => entry && !isRankedHistory(entry))
      .slice(-10);
    let independent = Math.max(0, Math.floor(finite(card.sessionIndependentCorrect)));
    let weighted = 0;
    let weightTotal = 0;
    history.forEach((entry, index) => {
      const rating = normalizeRating(entry.rating);
      const hints = Math.max(0, finite(entry.hints));
      if (rating !== 'wrong' && hints === 0) independent += 1;
      const recency = 0.58 + 0.42 * ((index + 1) / Math.max(1, history.length));
      const seconds = Math.max(0, finite(entry.activeSeconds, finite(entry.seconds)));
      const typed = entry.typed === true || String(entry.typed || '').trim().length >= 2;
      let evidence = rating === 'wrong' ? 10 : rating === 'know' ? 96 : 74;
      evidence -= Math.min(36, hints * 12);
      if (seconds > 18) evidence -= 7;
      else if (seconds > 0 && seconds <= 7) evidence += 4;
      if (typed) evidence += 5;
      weighted += clamp(evidence) * recency;
      weightTotal += recency;
    });
    if (independent < 2 && stored === null) return null;
    const recallEvidence = weightTotal ? weighted / weightTotal : (stored === null ? 0 : stored);
    const breadth = clamp(Math.min(Math.max(history.length, independent), 6) / 6 * 100);
    let result = recallEvidence * 0.58 + clamp(longTerm) * 0.27 + breadth * 0.15;
    if (stored !== null) result = result ? result * 0.72 + stored * 0.28 : stored;
    if (independent === 2) result = Math.min(result, 76);
    return Math.round(clamp(result));
  }

  function cardSnapshot(card = {}, now = Date.now(), longTerm = finite(card && card.memoryScore, 0)) {
    const usability = usabilityScore(card, now, longTerm);
    return Object.freeze({
      shortTermMastery: Math.round(effectiveShortTerm(card, now, longTerm)),
      shortTerm: Math.round(effectiveShortTerm(card, now, longTerm)),
      longTerm: Math.round(clamp(longTerm)),
      usabilityScore: usability,
      usability: usability === null ? 0 : usability,
      usabilityMeasured: usability !== null,
      usabilityLabel: usability === null ? '—' : String(usability),
      sessionAttempts: Math.max(0, Math.floor(finite(card.sessionAttempts))),
      sessionIndependentCorrect: Math.max(0, Math.floor(finite(card.sessionIndependentCorrect))),
      sessionLastRating: String(card.sessionLastRating || '')
    });
  }

  function activeCards(cards) {
    return (Array.isArray(cards) ? cards : []).filter((card) => card && !card.deleted && card.state !== 'suspended');
  }

  function sectionSnapshot(cards, sectionKey, keyOf, options = {}) {
    let source = activeCards(cards);
    let settings = options;
    if (typeof sectionKey === 'object' && sectionKey !== null && typeof keyOf !== 'function') {
      settings = sectionKey;
      sectionKey = undefined;
    }
    if (sectionKey !== undefined && typeof keyOf === 'function') {
      source = source.filter((card, index) => keyOf(card, index) === sectionKey);
    }
    const now = finite(settings.now, Date.now());
    const longTermOf = typeof settings.longTermOf === 'function'
      ? settings.longTermOf
      : (card) => finite(card && card.memoryScore, 0);
    const introduced = source.filter((card) => finite(card.introducedAt) > 0 || finite(card.studyReviews) > 0 || finite(card.sessionAttempts) > 0 || card.state === 'known');
    const shortTermAverage = source.length
      ? source.reduce((sum, card) => sum + effectiveShortTerm(card, now, longTermOf(card)), 0) / source.length
      : 0;
    const longTermAverage = source.length
      ? source.reduce((sum, card) => sum + clamp(longTermOf(card)), 0) / source.length
      : 0;
    const displayLongTermAverage = introduced.length
      ? introduced.reduce((sum, card) => sum + clamp(longTermOf(card)), 0) / introduced.length
      : 0;
    const measuredUsability = source.map((card) => usabilityScore(card, now, longTermOf(card))).filter((value) => value !== null);
    const usabilityAverage = measuredUsability.length
      ? measuredUsability.reduce((sum, value) => sum + value, 0) / measuredUsability.length
      : 0;
    const introducedComplete = source.length === 0 || introduced.length === source.length;
    return Object.freeze({
      count: source.length,
      required: source.length,
      introduced: introduced.length,
      introducedComplete,
      shortTermAverage,
      shortTermReady: source.length > 0 && introducedComplete && shortTermAverage >= finite(settings.shortTermThreshold, SHORT_TERM_TARGET),
      ready: source.length > 0 && introducedComplete && shortTermAverage >= finite(settings.shortTermThreshold, SHORT_TERM_TARGET),
      longTermAverage,
      displayLongTermAverage,
      longTermObserved: introduced.length,
      longTermCoverage: source.length ? introduced.length / source.length : 0,
      longTermRetired: source.length > 0 && introducedComplete && longTermAverage >= finite(settings.longTermThreshold, LONG_TERM_TARGET),
      retirementEligible: source.length > 0 && introducedComplete && longTermAverage >= finite(settings.longTermThreshold, LONG_TERM_TARGET),
      usabilityAverage,
      usabilityMeasured: measuredUsability.length > 0
    });
  }

  function routineCards(cards, retirements = {}, keyOf, options = {}) {
    const source = activeCards(cards);
    if (options.includeRetired === true || typeof keyOf !== 'function') return source;
    const stored = retirements && typeof retirements === 'object' ? retirements : {};
    return source.filter((card, index) => !Object.prototype.hasOwnProperty.call(stored, keyOf(card, index)));
  }

  function stableCardId(card) {
    if (!card || card.id === null || card.id === undefined) return '';
    return String(card.id).trim();
  }

  function introducedReviewCard(card) {
    const id = stableCardId(card);
    const hasStudyEvidence = finite(card && card.introducedAt) > 0
      || finite(card && card.studySeenAt) > 0
      || finite(card && card.studyReviews) > 0
      || finite(card && card.sessionAttempts) > 0;
    return Boolean(
      id
      && card
      && !card.deleted
      && card.state !== 'suspended'
      && card.state !== 'known'
      && hasStudyEvidence
    );
  }

  function recentDistinctIds(values, limit = 2) {
    const result = [];
    const source = Array.isArray(values) ? values : [];
    for (let index = source.length - 1; index >= 0 && result.length < limit; index -= 1) {
      const id = source[index] === null || source[index] === undefined
        ? ''
        : String(source[index]).trim();
      if (id && !result.includes(id)) result.push(id);
    }
    return result;
  }

  function applyPauseNewBridge(normalQueue, reviewableCards, options = {}) {
    const ordinary = Array.isArray(normalQueue) ? normalQueue : [];
    if (options.pauseNew !== true) return ordinary;

    const now = finite(options.now, Date.now());
    const recent = recentDistinctIds(options.recentCardIds, 2);
    const blocked = new Set(recent);
    const selected = [];
    const selectedIds = new Set();

    for (const entry of ordinary) {
      const card = entry && entry.card;
      const id = stableCardId(card);
      if (!introducedReviewCard(card) || blocked.has(id) || selectedIds.has(id)) continue;
      selected.push(entry);
      selectedIds.add(id);
    }

    if (!recent.length || selected.length >= 2) return selected;

    const bridges = (Array.isArray(reviewableCards) ? reviewableCards : [])
      .filter(introducedReviewCard)
      .filter((card) => {
        const id = stableCardId(card);
        const dueAt = finite(card.dueAt, Number.NaN);
        return !blocked.has(id)
          && !selectedIds.has(id)
          && Number.isFinite(dueAt)
          && dueAt > now;
      })
      .slice()
      .sort((left, right) => {
        const dueDifference = finite(left.dueAt) - finite(right.dueAt);
        return dueDifference || stableCardId(left).localeCompare(stableCardId(right));
      });

    for (const card of bridges) {
      const id = stableCardId(card);
      if (selectedIds.has(id)) continue;
      selected.push({ card, kind: 'review' });
      selectedIds.add(id);
      if (selected.length >= 2) break;
    }
    return selected;
  }

  function reinforcementCandidates(cards, options = {}) {
    const recent = new Set(Array.isArray(options.recentCardIds) ? options.recentCardIds.map(String) : []);
    const now = finite(options.now, Date.now());
    const longTermOf = typeof options.longTermOf === 'function' ? options.longTermOf : (card) => finite(card.memoryScore, 0);
    return activeCards(cards)
      .filter((card) => finite(card.introducedAt) > 0 || finite(card.studyReviews) > 0 || finite(card.sessionAttempts) > 0 || card.state === 'known')
      .filter((card) => card.state !== 'known' && effectiveShortTerm(card, now, longTermOf(card)) < finite(options.threshold, SHORT_TERM_TARGET))
      .slice()
      .sort((left, right) => {
        const leftRecent = recent.has(String(left.id)) ? 1 : 0;
        const rightRecent = recent.has(String(right.id)) ? 1 : 0;
        if (leftRecent !== rightRecent) return leftRecent - rightRecent;
        const scoreDifference = effectiveShortTerm(left, now, longTermOf(left)) - effectiveShortTerm(right, now, longTermOf(right));
        if (Math.abs(scoreDifference) > 0.01) return scoreDifference;
        const attemptsDifference = finite(left.sessionAttempts) - finite(right.sessionAttempts);
        if (attemptsDifference) return attemptsDifference;
        return finite(left.batchIndex) - finite(right.batchIndex);
      });
  }

  function hexToRgb(hex) {
    const clean = String(hex).replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }

  function memoryColor(score) {
    const value = clamp(score);
    let left = COLOR_STOPS[0];
    let right = COLOR_STOPS[COLOR_STOPS.length - 1];
    for (let index = 1; index < COLOR_STOPS.length; index += 1) {
      if (value <= COLOR_STOPS[index][0]) {
        left = COLOR_STOPS[index - 1];
        right = COLOR_STOPS[index];
        break;
      }
    }
    const ratio = right[0] === left[0] ? 0 : (value - left[0]) / (right[0] - left[0]);
    const a = hexToRgb(left[1]);
    const b = hexToRgb(right[1]);
    return rgbToHex({
      r: a.r + (b.r - a.r) * ratio,
      g: a.g + (b.g - a.g) * ratio,
      b: a.b + (b.b - a.b) * ratio
    });
  }

  return Object.freeze({
    VERSION,
    SHORT_TERM_TARGET,
    LONG_TERM_TARGET,
    clamp,
    normalizeRating,
    effectiveShortTerm,
    nextShortTerm,
    applyOutcome,
    applyShortTermEvidence,
    usabilityScore,
    cardSnapshot,
    sectionSnapshot,
    routineCards,
    applyPauseNewBridge,
    reinforcementCandidates,
    memoryColor
  });
});
