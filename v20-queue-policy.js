(function attachV20QueuePolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20QueuePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20QueuePolicy() {
  'use strict';

  const VERSION = '43.0.0-beta';
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const cardId = card => card && card.id !== null && card.id !== undefined ? String(card.id).trim() : '';

  function hasStudyEvidence(card) {
    return finite(card && card.introducedAt) > 0
      || finite(card && card.studySeenAt) > 0
      || finite(card && card.studyReviews) > 0
      || finite(card && card.sessionAttempts) > 0;
  }

  function reviewable(card) {
    return Boolean(cardId(card)
      && card
      && !card.deleted
      && card.state !== 'suspended'
      && card.state !== 'known'
      && hasStudyEvidence(card));
  }

  function recentHistory(values, gap) {
    return (Array.isArray(values) ? values : [])
      .map(value => value == null ? '' : String(value).trim())
      .filter(Boolean)
      .slice(-Math.max(1, gap));
  }

  function isSpaced(id, history, gap) {
    return Boolean(id) && !history.slice(-gap).includes(id);
  }

  /**
   * Keeps a recently rated card from appearing immediately again.
   * The nearest one or two eligible review cards are pulled forward as spacers.
   * When only one spacer exists, the original card may return after that spacer;
   * when none exists, the queue waits rather than serving a useless immediate repeat.
   */
  function interleaveRecentReviews(normalQueue, reviewableCards, options = {}) {
    const gap = Math.max(1, Math.min(4, Math.floor(finite(options.gap, 2))));
    const now = finite(options.now, Date.now());
    const allHistory = (Array.isArray(options.recentCardIds) ? options.recentCardIds : [])
      .map(value => value == null ? '' : String(value).trim())
      .filter(Boolean);
    const history = recentHistory(allHistory, gap);

    const ordinary = [];
    const ordinaryIds = new Set();
    for (const raw of Array.isArray(normalQueue) ? normalQueue : []) {
      if (!raw || !raw.card) continue;
      const id = cardId(raw.card);
      if (!id || ordinaryIds.has(id)) continue;
      ordinary.push({ ...raw, card: raw.card });
      ordinaryIds.add(id);
    }
    if (!history.length) return ordinary;

    if (!ordinary.length) {
      if (options.allowEmptyNormalBridge === false) return [];
      const candidates = [];
      const candidateIds = new Set();
      for (const card of Array.isArray(reviewableCards) ? reviewableCards : []) {
        const id = cardId(card);
        if (!reviewable(card) || !id || candidateIds.has(id)) continue;
        candidateIds.add(id);
        candidates.push(card);
      }
      candidates.sort((left, right) => {
        const a = finite(left.dueAt, Number.MAX_SAFE_INTEGER);
        const b = finite(right.dueAt, Number.MAX_SAFE_INTEGER);
        const aFuture = a > now ? 1 : 0;
        const bFuture = b > now ? 1 : 0;
        return aFuture - bFuture || a - b || cardId(left).localeCompare(cardId(right));
      });

      const maturedId = allHistory.length > gap ? allHistory[allHistory.length - gap - 1] : '';
      const waitingId = maturedId || allHistory[Math.max(0, allHistory.length - gap)] || '';
      const waitingCard = candidates.find(card => cardId(card) === waitingId) || null;
      if (!waitingCard) return [];

      const waitingIsMature = Boolean(maturedId && !history.includes(maturedId));
      if (waitingIsMature) {
        return [{ card: waitingCard, kind: finite(waitingCard.dueAt) <= now ? 'review' : 'early-review', spacingCycle: true }];
      }

      const spacers = candidates
        .filter(card => cardId(card) !== waitingId && isSpaced(cardId(card), history, gap))
        .slice(0, gap);
      if (!spacers.length) return [];
      return spacers
        .map(card => ({ card, kind: finite(card.dueAt) <= now ? 'review' : 'early-review', spacingCycle: true }))
        .concat({ card: waitingCard, kind: finite(waitingCard.dueAt) <= now ? 'review' : 'early-review', spacingCycle: true });
    }

    // If a card has already had the requested number of intervening cards,
    // prioritise it again when it is present in the normal queue.
    const maturedId = allHistory.length > gap ? allHistory[allHistory.length - gap - 1] : '';
    if (maturedId && !history.includes(maturedId)) {
      const maturedIndex = ordinary.findIndex(entry => cardId(entry.card) === maturedId);
      if (maturedIndex > 0) {
        const [matured] = ordinary.splice(maturedIndex, 1);
        ordinary.unshift(matured);
      }
    }

    const seen = new Set(ordinaryIds);
    const bridges = (Array.isArray(reviewableCards) ? reviewableCards : [])
      .filter(reviewable)
      .filter(card => {
        const id = cardId(card);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice()
      .sort((left, right) => {
        const a = finite(left.dueAt, Number.MAX_SAFE_INTEGER);
        const b = finite(right.dueAt, Number.MAX_SAFE_INTEGER);
        const aFuture = a > now ? 1 : 0;
        const bFuture = b > now ? 1 : 0;
        return aFuture - bFuture || a - b || cardId(left).localeCompare(cardId(right));
      });

    const pending = ordinary.slice();
    const output = [];
    const used = new Set();
    let bridgeIndex = 0;
    const maxSteps = pending.length + bridges.length + gap + 8;

    function commit(entry) {
      const id = cardId(entry.card);
      output.push(entry);
      used.add(id);
      history.push(id);
      if (history.length > gap) history.splice(0, history.length - gap);
    }

    for (let step = 0; pending.length && step < maxSteps; step += 1) {
      const safeIndex = pending.findIndex(entry => isSpaced(cardId(entry.card), history, gap));
      if (safeIndex >= 0) {
        const [entry] = pending.splice(safeIndex, 1);
        commit(entry);
        continue;
      }

      let bridge = null;
      while (bridgeIndex < bridges.length && !bridge) {
        const candidate = bridges[bridgeIndex++];
        const id = cardId(candidate);
        if (!used.has(id) && isSpaced(id, history, gap)) bridge = candidate;
      }
      if (bridge) {
        commit({ card: bridge, kind: finite(bridge.dueAt) <= now ? 'review' : 'early-review' });
        continue;
      }

      // There are not enough distinct cards to satisfy the ideal gap.
      // One real spacer is still useful; allow the oldest pending card after it.
      const lastOutputId = output.length ? cardId(output[output.length - 1].card) : '';
      const fallbackIndex = pending.findIndex(entry => cardId(entry.card) !== lastOutputId);
      if (output.length > 0 && fallbackIndex >= 0) {
        const [entry] = pending.splice(fallbackIndex, 1);
        commit(entry);
        continue;
      }
      break;
    }

    const spacingApplied = output.length > 0 && cardId(output[0].card) !== cardId(ordinary[0]?.card);
    return spacingApplied ? output.map(entry => ({ ...entry, spacingCycle: true })) : output;
  }

  function isActiveReview(entry) {
    if (!entry || !entry.card || entry.kind === 'new') return false;
    return reviewable(entry.card)
      || ['review', 'early-review', 'reinforcement', 'repair'].includes(String(entry.kind || ''));
  }

  function normalizeQueueEntry(entry, now) {
    if (!entry || !entry.card || entry.kind === 'new') return null;
    const kind = String(entry.kind || '').toLowerCase();
    if (kind === 'reinforcement' || kind === 'repair') return { ...entry, normalizedKind: 'reinforcement' };
    if (kind === 'early-review' || finite(entry.card.dueAt, 0) > now) return { ...entry, normalizedKind: 'early-review' };
    return { ...entry, normalizedKind: 'review' };
  }

  function reviewWorkSnapshot(options = {}) {
    const now = finite(options.now, Date.now());
    const dueEntries = (Array.isArray(options.dueEntries) ? options.dueEntries : [])
      .filter(entry => entry && entry.card && finite(entry.card.dueAt, 0) > 0 && finite(entry.card.dueAt, 0) <= now);
    const queue = [];
    const seen = new Set();
    for (const raw of Array.isArray(options.queueEntries) ? options.queueEntries : []) {
      const entry = normalizeQueueEntry(raw, now);
      const id = entry && cardId(entry.card);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      queue.push(entry);
    }
    const current = normalizeQueueEntry(options.currentEntry, now);
    if (current) {
      const id = cardId(current.card);
      if (id && !seen.has(id)) queue.unshift(current);
    }
    return Object.freeze({
      dueNow: dueEntries.length,
      queueCount: queue.length,
      earlyCount: queue.filter(entry => entry.normalizedKind === 'early-review').length,
      reinforcementCount: queue.filter(entry => entry.normalizedKind === 'reinforcement').length,
      activeKind: current ? current.normalizedKind : '',
      entries: queue
    });
  }

  function visibleReviewCount(dueCount, currentEntry) {
    const due = Math.max(0, Math.floor(finite(dueCount)));
    return isActiveReview(currentEntry) ? Math.max(1, due) : due;
  }

  function reviewKindLabel(entry, now = Date.now()) {
    if (!entry || !entry.card) return 'No card';
    const kind = String(entry.kind || '').toLowerCase();
    if (kind === 'new') return 'New word';
    if (kind === 'reinforcement' || kind === 'repair') return 'Reinforcement';
    if (kind === 'early-review') return 'Early review';
    return finite(entry.card.dueAt, 0) > finite(now, Date.now()) ? 'Early review' : 'Due review';
  }

  return Object.freeze({
    VERSION,
    interleaveRecentReviews,
    reviewWorkSnapshot,
    visibleReviewCount,
    reviewKindLabel
  });
});
