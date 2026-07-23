(function attachV16Learning(root, factory) {
  const metrics = typeof module === 'object' && module.exports
    ? require('./v20-study-memory.js')
    : root && root.V20StudyMemory;
  const api = factory(metrics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V16Learning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV16Learning(Metrics) {
  'use strict';

  const DAY = 86_400_000;
  const MINUTE = 60_000;
  const DECAY = 0.1542;
  const FACTOR = Math.pow(0.9, 1 / -DECAY) - 1;
  const SHORT_TERM_READY = 90;
  const metricShortTerm = Metrics && typeof Metrics.effectiveShortTerm === 'function'
    ? Metrics.effectiveShortTerm
    : (card) => clamp(card && (card.shortTermMastery ?? card.studyMastery), 0, 100);

  function clamp(value, min, max) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRating(value) {
    if (['wrong', 'again', 'hard'].includes(value)) return 'wrong';
    if (['know', 'known'].includes(value)) return 'know';
    return 'correct';
  }

  function historySource(entry) {
    return String(entry && (entry.kind || entry.source || entry.context) || '').toLowerCase();
  }

  function isRankedHistory(entry) {
    return ['ranked', 'battle'].includes(historySource(entry));
  }

  function defaultCalibration() {
    return {
      version: 16,
      studyOutcomes: 0,
      observedRecall: 0.75,
      predictedRecall: 0.75,
      brierScore: 0.1875,
      avgCorrectSeconds: 7.5,
      avgWrongSeconds: 9.5,
      intervalScale: 1
    };
  }

  function migrateCalibration(model) {
    const target = model && typeof model === 'object' ? model : {};
    const defaults = defaultCalibration();
    for (const key of Object.keys(defaults)) {
      if (key !== 'version' && !Number.isFinite(Number(target[key]))) target[key] = defaults[key];
    }
    target.version = 16;
    target.studyOutcomes = Math.max(0, Math.floor(finite(target.studyOutcomes, defaults.studyOutcomes)));
    target.observedRecall = clamp(target.observedRecall, 0.01, 0.99);
    target.predictedRecall = clamp(target.predictedRecall, 0.01, 0.99);
    target.brierScore = clamp(target.brierScore, 0, 1);
    target.avgCorrectSeconds = clamp(target.avgCorrectSeconds, 1, 45);
    target.avgWrongSeconds = clamp(target.avgWrongSeconds, 1, 60);
    target.intervalScale = clamp(target.intervalScale, 0.70, 1.30);
    return target;
  }

  function desiredRetention(profile) {
    const source = profile && profile.settings ? profile.settings : (profile || {});
    if (Number.isFinite(Number(source.desiredRetention))) return clamp(source.desiredRetention, 0.84, 0.95);
    const curve = String(source.curve || 'balanced');
    return curve === 'cram' ? 0.86 : curve === 'retention' ? 0.93 : 0.90;
  }

  function memoryStability(card) {
    return clamp(
      finite(card && card.memoryStability,
        finite(card && card.stability,
          Math.max(0.16, finite(card && card.intervalDays, 0.16)))),
      0.02,
      36_500
    );
  }

  function retrievability(card, now = Date.now()) {
    if (!card || card.state === 'known') return card ? 1 : 0;
    const introducedAt = finite(card.introducedAt, 0);
    if (introducedAt <= 0) return 0;
    const reviewedAt = Number.isFinite(Number(card.lastReviewedAt))
      ? Number(card.lastReviewedAt)
      : introducedAt;
    const elapsedDays = Math.max(0, (finite(now, reviewedAt) - reviewedAt) / DAY);
    const value = Math.pow(1 + FACTOR * elapsedDays / memoryStability(card), -DECAY);
    return clamp(value, 0.01, 1);
  }

  function migrateMemoryState(card) {
    const target = card && typeof card === 'object' ? card : {};
    const rawDueAt = Number(target.dueAt);
    const hasValidDueAt = Number.isFinite(rawDueAt) && rawDueAt > 0;
    const legacyInterval = clamp(target.intervalDays, 0, 36_500);
    target.memoryStability = memoryStability(target);
    const legacyDifficulty = finite(target.difficulty, 0.35);
    const mappedDifficulty = legacyDifficulty <= 1
      ? 1 + legacyDifficulty * 9
      : legacyDifficulty;
    target.memoryDifficulty = clamp(
      finite(target.memoryDifficulty, mappedDifficulty),
      1,
      10
    );
    target.stability = target.memoryStability;
    target.difficulty = (target.memoryDifficulty - 1) / 9;
    target.intervalDays = legacyInterval || Math.min(target.memoryStability, 1);
    const history = (Array.isArray(target.history) ? target.history : [])
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const leftTime = finite(left.entry && (left.entry.time ?? left.entry.reviewedAt ?? left.entry.at), 0);
        const rightTime = finite(right.entry && (right.entry.time ?? right.entry.reviewedAt ?? right.entry.at), 0);
        return leftTime - rightTime || left.index - right.index;
      })
      .map(item => item.entry);
    target.history = history;
    const sourceOf = entry => String(entry && (entry.kind || entry.source || entry.context) || '').toLowerCase();
    const isRankedEntry = entry => ['ranked', 'battle'].includes(sourceOf(entry));
    const studyHistory = history.filter((entry) => entry && !isRankedEntry(entry));
    const hasRankedHistory = history.some(isRankedEntry);
    const latestStudyScore = studyHistory
      .slice()
      .reverse()
      .map((entry) => [entry.studyMastery, entry.memoryScore, entry.score]
        .map(Number)
        .find((value) => Number.isFinite(value)))
      .find((value) => Number.isFinite(value));
    const legacyStudyMastery = studyHistory.length > 0
      ? (target.state === 'known' ? 100 : finite(latestStudyScore, 0))
      : hasRankedHistory
        ? 0
        : target.state === 'known' ? 100 : finite(target.memoryScore, 0);
    target.studyMastery = clamp(
      finite(target.studyMastery, legacyStudyMastery),
      0,
      100
    );
    const legacyStudyReviews = studyHistory.length;
    target.studyReviews = Math.max(0, Math.floor(finite(target.studyReviews, legacyStudyReviews)));
    const latestStudyRating = studyHistory.length ? normalizeRating(studyHistory[studyHistory.length - 1].rating) : '';
    const inferredShortTerm = latestStudyRating === 'wrong' ? 18 : latestStudyRating === 'know' ? 100 : latestStudyRating ? 90 : target.studyMastery;
    target.shortTermMastery = clamp(finite(target.shortTermMastery, inferredShortTerm), 0, 100);
    target.shortTermUpdatedAt = Math.max(0, finite(target.shortTermUpdatedAt,
      finite(target.lastReviewedAt, finite(target.introducedAt, 0))));
    target.shortTermEvidenceCount = Math.max(0, Math.floor(finite(target.shortTermEvidenceCount, target.studyReviews)));
    target.sessionAttempts = Math.max(0, Math.floor(finite(target.sessionAttempts, target.shortTermEvidenceCount)));
    target.sessionIndependentCorrect = Math.max(0, Math.floor(finite(target.sessionIndependentCorrect, 0)));
    target.sessionUpdatedAt = Math.max(0, finite(target.sessionUpdatedAt, target.shortTermUpdatedAt));
    target.sessionLastRating = String(target.sessionLastRating || '');
    target.usabilityScore = target.usabilityScore === null || target.usabilityScore === undefined || target.usabilityScore === ''
      ? null
      : clamp(target.usabilityScore, 0, 100);
    target.memoryScore = clamp(finite(target.memoryScore, target.studyMastery), 0, 100);
    target.memoryStateVersion = 16;
    const explicitStudyEvidence = finite(target.introducedAt, 0) > 0
      || finite(target.studySeenAt, 0) > 0
      || finite(target.studyReviews, 0) > 0
      || finite(target.studyMastery, 0) > 0
      || studyHistory.length > 0;
    const compatibleReviewedAt = finite(target.lastReviewedAt, 0) > 0
      && (!hasRankedHistory || studyHistory.length > 0 || explicitStudyEvidence);
    const legacyRepsOnly = finite(target.reps, 0) > 0 && history.length === 0;
    const hasStudyEvidence = explicitStudyEvidence || compatibleReviewedAt || legacyRepsOnly;
    if (target.state === 'known') target.dueAt = 0;
    else if (!hasStudyEvidence) {
      target.dueAt = 0;
      if (target.state !== 'suspended') target.state = 'new';
      target.studyMastery = 0;
      target.shortTermMastery = 0;
      target.studyReviews = 0;
    } else if (hasValidDueAt) target.dueAt = rawDueAt;
    else {
      const anchor = compatibleReviewedAt
        ? finite(target.lastReviewedAt)
        : finite(target.studySeenAt, finite(target.introducedAt, Date.now()));
      target.dueAt = anchor + target.intervalDays * DAY;
    }
    return target;
  }

  function sanitizeTiming(timing) {
    const source = timing && typeof timing === 'object' ? timing : {};
    const seconds = clamp(
      Number.isFinite(Number(source.seconds)) ? Number(source.seconds) : finite(source.activeMs, 0) / 1000,
      0,
      600
    );
    return {
      ...source,
      seconds,
      rawMs: Math.max(0, finite(source.rawMs, seconds * 1000)),
      activeMs: Math.max(0, finite(source.activeMs, seconds * 1000)),
      hiddenMs: Math.max(0, finite(source.hiddenMs, 0)),
      blurMs: Math.max(0, finite(source.blurMs, 0)),
      afk: Boolean(source.afk)
    };
  }

  function intervalForRetention(stability, retention) {
    const target = clamp(retention, 0.80, 0.97);
    return clamp(
      memoryStability({ memoryStability: stability }) * (Math.pow(target, -1 / DECAY) - 1) / FACTOR,
      1 / 1440,
      36_500
    );
  }

  function studySeen(card) {
    if (finite(card.studyReviews, 0) > 0 || finite(card.studySeenAt, 0) > 0 || finite(card.studyMastery, 0) > 0) return true;
    return Array.isArray(card.history) && card.history.some((entry) => entry && !isRankedHistory(entry));
  }

  function sectionIndex(card, fallbackIndex = 0) {
    const index = Number.isFinite(Number(card && card.batchIndex))
      ? Math.floor(Number(card.batchIndex))
      : Math.floor(finite(fallbackIndex, 0));
    return Math.floor(Math.max(0, index) / 20);
  }

  function sectionKey(card, fallbackIndex = 0) {
    const batchId = String(card && card.batchId || 'default');
    return `${batchId}:${sectionIndex(card, fallbackIndex)}`;
  }

  function hasStoredUnlock(unlocks, key) {
    return Boolean(unlocks && Object.prototype.hasOwnProperty.call(unlocks, key));
  }

  function isSectionUnlocked(card, unlocks = {}) {
    return sectionIndex(card) === 0 || hasStoredUnlock(unlocks, sectionKey(card));
  }

  function summarizeSections(cards, unlocks = {}, now = Date.now()) {
    const groups = new Map();
    const batchCounts = new Map();
    const batchOrders = new Map();
    let nextBatchOrder = 0;
    for (const card of Array.isArray(cards) ? cards : []) {
      if (!card || card.deleted) continue;
      const batchId = String(card.batchId || 'default');
      if (!batchOrders.has(batchId)) batchOrders.set(batchId, nextBatchOrder += 1);
      const fallbackIndex = batchCounts.get(batchId) || 0;
      batchCounts.set(batchId, fallbackIndex + 1);
      const index = sectionIndex(card, fallbackIndex);
      const key = `${batchId}:${index}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          batchId,
          batchName: String(card.batchName || 'Imported'),
          batchOrder: batchOrders.get(batchId),
          index,
          cards: []
        });
      }
      groups.get(key).cards.push(card);
    }

    return [...groups.values()]
      .sort((left, right) => left.batchOrder - right.batchOrder || left.index - right.index)
      .map((group) => {
        const ordered = group.cards.slice().sort((left, right) => finite(left.batchIndex, 0) - finite(right.batchIndex, 0));
        const active = ordered.filter((card) => card.state !== 'suspended');
        const mastered = active.filter((card) => clamp(card.studyMastery, 0, 100) >= 70).length;
        const unseen = active.filter((card) => !finite(card.introducedAt, 0) && !studySeen(card) && card.state !== 'known').length;
        const introduced = Math.max(0, active.length - unseen);
        const start = ordered.length ? Math.min(...ordered.map((card) => Math.max(0, Math.floor(finite(card.batchIndex, 0))))) + 1 : group.index * 20 + 1;
        const end = ordered.length ? Math.max(...ordered.map((card) => Math.max(0, Math.floor(finite(card.batchIndex, 0))))) + 1 : start;
        const unlocked = group.index === 0 || hasStoredUnlock(unlocks, group.key);
        const introducedComplete = active.length === 0 || unseen === 0;
        const masteredComplete = active.length === 0 || mastered === active.length;
        const shortTermAverage = active.length
          ? active.reduce((sum, card) => sum + metricShortTerm(card, now, finite(card.memoryScore, 0)), 0) / active.length
          : 0;
        const longTermAverage = active.length
          ? Math.round(active.reduce((sum, card) => sum + clamp(card.memoryScore, 0, 100), 0) / active.length)
          : 0;
        const shortTermComplete = introducedComplete && active.length > 0 && shortTermAverage >= SHORT_TERM_READY;
        const longTermComplete = active.length > 0 && longTermAverage >= 90;
        const completed = shortTermComplete;
        return {
          key: group.key,
          batchId: group.batchId,
          batchName: group.batchName,
          index: group.index,
          number: group.index + 1,
          total: ordered.length,
          required: active.length,
          mastered,
          unseen,
          introduced,
          introducedComplete,
          masteredComplete,
          shortTermAverage,
          shortTermComplete,
          readyForNext: shortTermComplete,
          shortTermThreshold: SHORT_TERM_READY,
          longTermAverage,
          longTermComplete,
          retired: longTermComplete,
          unlocked,
          locked: !unlocked,
          completed,
          status: longTermComplete ? 'retired' : completed ? 'completed' : introducedComplete && unlocked ? 'building' : unlocked ? 'unlocked' : 'locked',
          start,
          end,
          rangeLabel: `Words ${start}–${end}`
        };
      });
  }

  function unlockEligibleSections(cards, unlocks = {}, now = Date.now()) {
    const nextUnlocks = unlocks && typeof unlocks === 'object' ? { ...unlocks } : {};
    const summaries = summarizeSections(cards, nextUnlocks, now);
    const byBatch = new Map();
    for (const summary of summaries) {
      if (!byBatch.has(summary.batchId)) byBatch.set(summary.batchId, []);
      byBatch.get(summary.batchId).push(summary);
    }
    const newlyUnlocked = [];
    for (const sections of byBatch.values()) {
      sections.sort((left, right) => left.index - right.index);
      for (let position = 0; position < sections.length - 1; position += 1) {
        const current = sections[position];
        const next = sections[position + 1];
        const currentUnlocked = current.index === 0 || hasStoredUnlock(nextUnlocks, current.key);
        if (!currentUnlocked || !current.shortTermComplete) break;
        if (!hasStoredUnlock(nextUnlocks, next.key)) {
          nextUnlocks[next.key] = finite(now, Date.now());
          newlyUnlocked.push(next.key);
        }
      }
    }
    return {
      unlocks: nextUnlocks,
      changed: newlyUnlocked.length > 0,
      newlyUnlocked,
      summaries: summarizeSections(cards, nextUnlocks, now)
    };
  }

  function eligibleNewCards(cards, unlocks = {}) {
    const source = Array.isArray(cards) ? cards : [];
    const first = summarizeSections(source, unlocks)
      .find((section) => section.unlocked && section.unseen > 0);
    if (!first) return [];
    return source
      .filter((card) => card && !card.deleted && card.state !== 'suspended' && card.state !== 'known')
      .filter((card) => !finite(card.introducedAt, 0) && sectionKey(card) === first.key)
      .sort((left, right) => finite(left.batchIndex, 0) - finite(right.batchIndex, 0));
  }

  function filterForSection(cards, focus, unlocks = {}) {
    const source = (Array.isArray(cards) ? cards : []).filter((card) => card && !card.deleted);
    if (!focus || focus === 'all') return source;
    const sample = source.find((card) => sectionKey(card) === focus);
    if (!sample || !isSectionUnlocked(sample, unlocks)) return [];
    return source.filter((card) => sectionKey(card) === focus);
  }

  function updateCalibration(model, evidence) {
    const target = migrateCalibration(model);
    const timing = sanitizeTiming(evidence && evidence.timing);
    const valid = evidence
      && evidence.source === 'study'
      && !evidence.first
      && !evidence.timedOut
      && finite(evidence.hints, 0) === 0
      && !timing.afk;
    if (!valid) return target;

    const observed = evidence.correct ? 1 : 0;
    const predicted = clamp(evidence.predicted, 0.01, 0.99);
    const alpha = target.studyOutcomes < 10 ? 0.12 : 0.055;
    target.studyOutcomes += 1;
    target.observedRecall += alpha * (observed - target.observedRecall);
    target.predictedRecall += alpha * (predicted - target.predictedRecall);
    const brier = Math.pow(observed - predicted, 2);
    target.brierScore += alpha * (brier - target.brierScore);
    if (timing.seconds > 0) {
      const key = evidence.correct ? 'avgCorrectSeconds' : 'avgWrongSeconds';
      target[key] += 0.06 * (timing.seconds - target[key]);
      target[key] = clamp(target[key], 1, key === 'avgCorrectSeconds' ? 45 : 60);
    }
    if (target.studyOutcomes >= 30) {
      const calibrationGap = target.observedRecall - target.predictedRecall;
      const adjustment = clamp(calibrationGap * 0.008, -0.004, 0.004);
      target.intervalScale = clamp(target.intervalScale * Math.exp(adjustment), 0.70, 1.30);
    }
    return target;
  }

  function reviewTransition(card, rating, context = {}) {
    const current = migrateMemoryState({ ...(card || {}) });
    const normalizedRating = normalizeRating(rating);
    const source = ['ranked', 'battle'].includes(String(context.source || '').toLowerCase()) ? 'ranked' : 'study';
    const now = finite(context.now, Date.now());
    const timing = sanitizeTiming(context.timing);
    const hints = Math.max(0, Math.floor(finite(context.hints, 0)));
    const first = !finite(current.lastReviewedAt, 0) && finite(current.studyReviews, 0) === 0;
    const predicted = retrievability(current, now);
    const previousStability = memoryStability(current);
    const previousDifficulty = clamp(current.memoryDifficulty, 1, 10);
    const canUseRankedEvidence = source !== 'ranked' || studySeen(current);
    const sourceWeight = source === 'study' ? 1 : canUseRankedEvidence ? 0.22 : 0;
    const correct = normalizedRating !== 'wrong';
    const intervalScale = clamp(context.model && context.model.intervalScale, 0.70, 1.30);
    const hintWeight = Math.min(0.24, hints * 0.08);
    const speedBaseline = correct
      ? finite(context.model && context.model.avgCorrectSeconds, 7.5)
      : finite(context.model && context.model.avgWrongSeconds, 9.5);
    const speedSignal = timing.afk || timing.seconds <= 0
      ? 0
      : clamp((speedBaseline - timing.seconds) / Math.max(3, speedBaseline * 2), -0.08, 0.08);

    let nextStability = previousStability;
    let nextDifficulty = previousDifficulty;
    let intervalDays = Math.max(1 / 1440, finite(current.intervalDays, previousStability));
    let dueAt = finite(current.dueAt, now + intervalDays * DAY);
    let state = current.state || (current.introducedAt ? 'review' : 'new');

    if (sourceWeight > 0 && normalizedRating === 'wrong') {
      const targetStability = clamp(
        previousStability * (0.32 + 0.18 * (1 - predicted)),
        0.02,
        Math.max(0.02, previousStability)
      );
      nextStability = previousStability + (targetStability - previousStability) * sourceWeight;
      nextDifficulty = clamp(previousDifficulty + 0.62 * sourceWeight, 1, 10);
      const baseMinutes = context.timedOut || timing.afk
        ? 10
        : timing.seconds > 0 && timing.seconds <= 4 ? 2
          : timing.seconds <= 8 ? 5 : 8;
      const relearningMinutes = clamp(baseMinutes + finite(current.lapses, 0) * 0.5, 2, 15);
      intervalDays = relearningMinutes / 1440;
      dueAt = now + relearningMinutes * MINUTE;
      state = first && source === 'study' ? 'learning' : 'relearning';
    } else if (sourceWeight > 0 && normalizedRating === 'know' && source === 'study') {
      nextStability = clamp(Math.max(120, previousStability * 4), 0.02, 36_500);
      nextDifficulty = clamp(previousDifficulty - 0.72, 1, 10);
      intervalDays = 9_999;
      dueAt = 0;
      state = 'known';
    } else if (sourceWeight > 0) {
      const recallSurprise = Math.max(0.0001, 1 - predicted);
      const stabilityDamping = Math.pow(Math.max(0.02, previousStability), -0.18);
      let stabilityIncrease = 0.85
        * (11 - previousDifficulty)
        * stabilityDamping
        * Math.expm1(recallSurprise * 1.2);
      stabilityIncrease = clamp(stabilityIncrease, 0.0001, 5);
      stabilityIncrease *= 1 - hintWeight;
      stabilityIncrease *= 1 + speedSignal;
      if (timing.afk) stabilityIncrease *= 0.96;
      const gain = 1 + Math.max(0.0001, stabilityIncrease);
      const targetStability = clamp(
        Math.max(previousStability + 0.02, previousStability * gain),
        0.02,
        36_500
      );
      nextStability = previousStability + (targetStability - previousStability) * sourceWeight;
      nextDifficulty = clamp(previousDifficulty - 0.18 * sourceWeight, 1, 10);
      intervalDays = intervalForRetention(nextStability, desiredRetention(context.profile)) * intervalScale;
      if (first && source === 'study') intervalDays = clamp(intervalDays, 0.12, 1.4);
      else intervalDays = clamp(intervalDays, 0.04, 3_650);
      dueAt = now + intervalDays * DAY;
      state = intervalDays < 1 ? 'learning' : 'review';
    }

    const previousMastery = clamp(current.studyMastery, 0, 100);
    let studyMastery = previousMastery;
    if (source === 'study') {
      if (normalizedRating === 'wrong') {
        studyMastery = clamp(previousMastery - Math.max(8, 12 + predicted * 6), 0, 100);
      } else if (normalizedRating === 'know') {
        studyMastery = 100;
      } else {
        const firstGain = first ? 36 : 0;
        const recallGain = clamp(9 + (1 - predicted) * 8 + (10 - previousDifficulty) * 0.3, 8, 20);
        const evidenceGain = (firstGain || recallGain) * (1 - hintWeight) * (timing.afk ? 0.92 : 1);
        studyMastery = clamp(previousMastery + evidenceGain + speedSignal * 10 + (context.typed ? 1 : 0), 0, 99);
      }
    }

    const oldMemoryScore = clamp(current.memoryScore, 0, 100);
    const memoryScore = source === 'study'
      ? Math.round(studyMastery)
      : Math.round(clamp(oldMemoryScore * 0.92 + (correct ? 88 : 18) * 0.08, 0, 100));

    return {
      rating: normalizedRating,
      source,
      sourceWeight,
      applied: sourceWeight > 0,
      correct,
      first,
      timing,
      predicted,
      predBefore: predicted,
      memoryStability: clamp(nextStability, 0.02, 36_500),
      stability: clamp(nextStability, 0.02, 36_500),
      memoryDifficulty: clamp(nextDifficulty, 1, 10),
      difficulty: (clamp(nextDifficulty, 1, 10) - 1) / 9,
      intervalDays,
      dueAt,
      state,
      studyMastery,
      memoryScore,
      score: memoryScore,
      reviewTime: now
    };
  }

  function applyReview(card, rating, context = {}) {
    const target = migrateMemoryState(card);
    const transition = reviewTransition(target, rating, context);
    if (transition.applied) {
      target.memoryStability = transition.memoryStability;
      target.stability = transition.stability;
      target.memoryDifficulty = transition.memoryDifficulty;
      target.difficulty = transition.difficulty;
      target.intervalDays = transition.intervalDays;
      target.dueAt = transition.dueAt;
      target.state = transition.state;
      target.memoryScore = transition.memoryScore;
      if (transition.source === 'study') {
        target.studyMastery = transition.studyMastery;
        target.studyReviews = Math.max(0, Math.floor(finite(target.studyReviews, 0))) + 1;
        if (!(finite(target.studySeenAt, 0) > 0)) target.studySeenAt = transition.reviewTime;
        if (!finite(target.introducedAt, 0)) target.introducedAt = transition.reviewTime;
      }
    }
    updateCalibration(context.model || defaultCalibration(), {
      source: transition.source,
      first: transition.first,
      correct: transition.correct,
      predicted: transition.predicted,
      hints: context.hints,
      timedOut: context.timedOut,
      timing: transition.timing
    });
    return transition;
  }

  return Object.freeze({
    DAY,
    MINUTE,
    DECAY,
    FACTOR,
    SHORT_TERM_READY,
    defaultCalibration,
    migrateCalibration,
    desiredRetention,
    retrievability,
    migrateMemoryState,
    sectionIndex,
    sectionKey,
    summarizeSections,
    unlockEligibleSections,
    isSectionUnlocked,
    eligibleNewCards,
    filterForSection,
    reviewTransition,
    applyReview,
    updateCalibration
  });
});
