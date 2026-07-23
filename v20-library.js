(function attachV20Library(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20Library = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20Library() {
  'use strict';

  const VERSION = 1;
  const DEFAULT_SET_SIZE = 20;
  const SHORT_TERM_TARGET = 90;
  const LONG_TERM_TARGET = 90;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, finite(value, min)));
  }

  function historySource(entry) {
    return String(entry && (entry.kind || entry.source || entry.context) || '').toLowerCase();
  }

  function isRankedHistory(entry) {
    return ['ranked', 'battle'].includes(historySource(entry));
  }

  function unique(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
  }

  function defaultId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function cardMap(book) {
    return new Map((Array.isArray(book && book.cards) ? book.cards : [])
      .filter(card => card && card.id && !card.deleted)
      .map(card => [String(card.id), card]));
  }

  function fallbackOrder(book) {
    const cards = (Array.isArray(book && book.cards) ? book.cards : [])
      .filter(card => card && card.id && !card.deleted)
      .map((card, position) => ({ card, position }));
    const batchOrder = new Map();
    for (const batch of Array.isArray(book && book.batches) ? book.batches : []) {
      if (batch && batch.id && !batchOrder.has(String(batch.id))) batchOrder.set(String(batch.id), batchOrder.size);
    }
    for (const entry of cards) {
      const batchId = String(entry.card.batchId || 'default');
      if (!batchOrder.has(batchId)) batchOrder.set(batchId, batchOrder.size);
    }
    return cards
      .sort((left, right) => {
        const leftBatch = batchOrder.has(String(left.card.batchId)) ? batchOrder.get(String(left.card.batchId)) : Number.MAX_SAFE_INTEGER;
        const rightBatch = batchOrder.has(String(right.card.batchId)) ? batchOrder.get(String(right.card.batchId)) : Number.MAX_SAFE_INTEGER;
        return leftBatch - rightBatch
          || finite(left.card.batchIndex, left.position) - finite(right.card.batchIndex, right.position)
          || finite(left.card.createdAt, left.position) - finite(right.card.createdAt, right.position)
          || left.position - right.position;
      })
      .map(entry => String(entry.card.id));
  }

  function normalizeGroup(group, type, validIds, options = {}) {
    if (!group || typeof group !== 'object') return null;
    const id = String(group.id || '');
    if (!id) return null;
    const now = finite(options.now, Date.now());
    const cardIds = unique(group.cardIds).filter(cardId => validIds.has(cardId));
    if (!cardIds.length) return null;
    const result = {
      id,
      name: String(group.name || (type === 'chapter' ? 'Chapter' : 'Set')).trim() || (type === 'chapter' ? 'Chapter' : 'Set'),
      cardIds,
      order: Math.max(0, Math.floor(finite(group.order, 0))),
      reviewOutside: group.reviewOutside !== false,
      createdAt: finite(group.createdAt, now),
      updatedAt: finite(group.updatedAt, now)
    };
    if (type === 'set') {
      result.chapterId = group.chapterId ? String(group.chapterId) : null;
      result.targetSize = Math.max(1, Math.floor(finite(group.targetSize, DEFAULT_SET_SIZE)));
    }
    return result;
  }

  function normalizeScope(scope, book) {
    const organization = book && book.organization && typeof book.organization === 'object' ? book.organization : {};
    const validIds = new Set((Array.isArray(organization.bookOrder) ? organization.bookOrder : fallbackOrder(book)).map(String));
    const source = scope && typeof scope === 'object' ? scope : {};
    const type = ['automatic', 'chapter', 'set', 'selection'].includes(source.type) ? source.type : 'automatic';
    const includeOutsideReviews = source.includeOutsideReviews !== false;
    if (type === 'chapter') {
      const chapter = (Array.isArray(organization.chapters) ? organization.chapters : []).find(entry => entry.id === String(source.id || ''));
      if (chapter) return { type, id: chapter.id, label: chapter.name, cardIds: chapter.cardIds.slice(), includeOutsideReviews };
    }
    if (type === 'set') {
      const set = (Array.isArray(organization.sets) ? organization.sets : []).find(entry => entry.id === String(source.id || ''));
      if (set) return { type, id: set.id, label: set.name, chapterId: set.chapterId || null, cardIds: set.cardIds.slice(), includeOutsideReviews };
    }
    if (type === 'selection') {
      const cardIds = unique(source.cardIds).filter(id => validIds.has(id));
      if (cardIds.length) return {
        type,
        id: source.id ? String(source.id) : null,
        label: String(source.label || 'Manual selection'),
        cardIds,
        includeOutsideReviews
      };
    }
    return { type: 'automatic', id: null, label: 'Automatic study', cardIds: [], includeOutsideReviews: true };
  }

  function normalizeBook(book, options = {}) {
    if (!book || typeof book !== 'object') throw new TypeError('book is required');
    const now = finite(options.now, Date.now());
    const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultId;
    const before = JSON.stringify(book.organization || null);
    const map = cardMap(book);
    const existing = book.organization && typeof book.organization === 'object' ? book.organization : {};
    const fallback = fallbackOrder(book);
    const order = unique(existing.bookOrder).filter(id => map.has(id));
    for (const id of fallback) if (!order.includes(id)) order.push(id);

    const validIds = new Set(order);
    const chapters = (Array.isArray(existing.chapters) ? existing.chapters : [])
      .map(group => normalizeGroup(group, 'chapter', validIds, { now }))
      .filter(Boolean)
      .sort((left, right) => left.order - right.order || left.createdAt - right.createdAt)
      .map((group, orderIndex) => ({ ...group, order: orderIndex }));
    const chapterIds = new Set(chapters.map(chapter => chapter.id));
    const sets = (Array.isArray(existing.sets) ? existing.sets : [])
      .map(group => normalizeGroup(group, 'set', validIds, { now }))
      .filter(Boolean)
      .map(group => ({ ...group, chapterId: group.chapterId && chapterIds.has(group.chapterId) ? group.chapterId : null }))
      .sort((left, right) => {
        const leftChapter = left.chapterId ? chapters.findIndex(chapter => chapter.id === left.chapterId) : Number.MAX_SAFE_INTEGER;
        const rightChapter = right.chapterId ? chapters.findIndex(chapter => chapter.id === right.chapterId) : Number.MAX_SAFE_INTEGER;
        return leftChapter - rightChapter || left.order - right.order || left.createdAt - right.createdAt;
      });
    const orderWithinChapter = new Map();
    for (const set of sets) {
      const key = set.chapterId || '__ungrouped__';
      const next = orderWithinChapter.get(key) || 0;
      set.order = next;
      orderWithinChapter.set(key, next + 1);
    }

    book.organization = {
      version: VERSION,
      migrationId: existing.migrationId ? String(existing.migrationId) : '',
      bookOrder: order,
      chapters,
      sets,
      activeScope: { type: 'automatic', id: null, label: 'Automatic study', cardIds: [], includeOutsideReviews: true },
      createdAt: finite(existing.createdAt, now),
      updatedAt: finite(existing.updatedAt, now)
    };
    book.organization.activeScope = normalizeScope(existing.activeScope, book);

    if (!book.organization.createdAt) book.organization.createdAt = now;
    if (!book.organization.updatedAt) book.organization.updatedAt = now;
    if (!book.organization.version) book.organization.version = VERSION;
    if (!book.organization.migrationId) book.organization.migrationId = idFactory('library-migration');

    const after = JSON.stringify(book.organization);
    return { organization: book.organization, changed: before !== after };
  }

  function orderedCards(book) {
    normalizeBook(book);
    const map = cardMap(book);
    return book.organization.bookOrder.map(id => map.get(id)).filter(Boolean);
  }

  function parseSelectionExpression(expression, total) {
    const limit = Math.max(0, Math.floor(finite(total, 0)));
    const result = new Set();
    for (const raw of String(expression || '').split(/[;,\s]+/u).filter(Boolean)) {
      const range = raw.match(/^(\d+)\s*-\s*(\d+)$/u);
      if (range) {
        let start = Number(range[1]);
        let end = Number(range[2]);
        if (start > end) [start, end] = [end, start];
        if (start < 1 || end > limit) continue;
        for (let value = start; value <= end; value += 1) result.add(value - 1);
        continue;
      }
      if (/^\d+$/u.test(raw)) {
        const value = Number(raw);
        if (value >= 1 && value <= limit) result.add(value - 1);
      }
    }
    return [...result].sort((left, right) => left - right);
  }

  function chunkIds(ids, requestedSize) {
    const source = unique(ids);
    const size = Math.max(1, Math.floor(finite(requestedSize, DEFAULT_SET_SIZE)));
    if (!source.length) return [];
    if (source.length <= size) return [source];
    const chunks = [];
    let offset = 0;
    while (offset + size <= source.length) {
      chunks.push(source.slice(offset, offset + size));
      offset += size;
    }
    const remainder = source.slice(offset);
    if (!remainder.length) return chunks;
    if (!chunks.length || remainder.length >= size * 0.5) chunks.push(remainder);
    else chunks[chunks.length - 1].push(...remainder);
    return chunks;
  }

  function equalDivide(ids, requestedCount) {
    const source = unique(ids);
    const count = Math.max(1, Math.min(source.length || 1, Math.floor(finite(requestedCount, 1))));
    if (!source.length) return [];
    const base = Math.floor(source.length / count);
    let extra = source.length % count;
    const groups = [];
    let offset = 0;
    for (let index = 0; index < count; index += 1) {
      const size = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      groups.push(source.slice(offset, offset + size));
      offset += size;
    }
    return groups.filter(group => group.length);
  }

  function cardIdsForRange(book, startPosition, endPosition) {
    const order = orderedCards(book).map(card => String(card.id));
    let start = Math.floor(finite(startPosition, 1));
    let end = Math.floor(finite(endPosition, order.length));
    if (start > end) [start, end] = [end, start];
    start = clamp(start, 1, Math.max(1, order.length));
    end = clamp(end, 1, Math.max(1, order.length));
    return order.slice(start - 1, end);
  }

  function cardIdsFromExpression(book, expression) {
    const order = orderedCards(book).map(card => String(card.id));
    return parseSelectionExpression(expression, order.length).map(index => order[index]).filter(Boolean);
  }

  function touchOrganization(book, now = Date.now()) {
    normalizeBook(book, { now });
    book.organization.updatedAt = finite(now, Date.now());
    if ('updatedAt' in book) book.updatedAt = book.organization.updatedAt;
  }

  function addChapter(book, input = {}, options = {}) {
    normalizeBook(book, options);
    const now = finite(options.now, Date.now());
    const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultId;
    const validIds = new Set(book.organization.bookOrder);
    const cardIds = unique(input.cardIds).filter(id => validIds.has(id));
    if (!cardIds.length) throw new Error('Chapter must contain at least one card');
    const chapter = {
      id: input.id ? String(input.id) : idFactory('chapter'),
      name: String(input.name || `Chapter ${book.organization.chapters.length + 1}`).trim() || `Chapter ${book.organization.chapters.length + 1}`,
      cardIds,
      order: book.organization.chapters.length,
      reviewOutside: input.reviewOutside !== false,
      createdAt: now,
      updatedAt: now
    };
    book.organization.chapters.push(chapter);
    touchOrganization(book, now);
    return chapter;
  }

  function addEqualChapters(book, input = {}, options = {}) {
    normalizeBook(book, options);
    const source = unique(input.cardIds && input.cardIds.length ? input.cardIds : book.organization.bookOrder);
    const groups = input.mode === 'size'
      ? chunkIds(source, input.value)
      : equalDivide(source, input.value);
    const prefix = String(input.namePrefix || 'Chapter').trim() || 'Chapter';
    return groups.map((cardIds, index) => addChapter(book, {
      name: `${prefix} ${book.organization.chapters.length + 1}`,
      cardIds,
      reviewOutside: input.reviewOutside !== false
    }, options));
  }

  function removeChapter(book, chapterId) {
    normalizeBook(book);
    const id = String(chapterId || '');
    const before = book.organization.chapters.length;
    book.organization.chapters = book.organization.chapters.filter(chapter => chapter.id !== id);
    for (const set of book.organization.sets) if (set.chapterId === id) set.chapterId = null;
    if (book.organization.activeScope.type === 'chapter' && book.organization.activeScope.id === id) {
      book.organization.activeScope = normalizeScope(null, book);
    }
    if (before !== book.organization.chapters.length) touchOrganization(book);
    return before !== book.organization.chapters.length;
  }

  function splitIntoSets(book, cardIds, input = {}, options = {}) {
    normalizeBook(book, options);
    const now = finite(options.now, Date.now());
    const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultId;
    const validIds = new Set(book.organization.bookOrder);
    const source = unique(cardIds).filter(id => validIds.has(id));
    const chunks = chunkIds(source, input.size);
    const chapterId = input.chapterId && book.organization.chapters.some(chapter => chapter.id === String(input.chapterId))
      ? String(input.chapterId)
      : null;
    if (input.replaceChapterSets && chapterId) {
      book.organization.sets = book.organization.sets.filter(set => set.chapterId !== chapterId);
    }
    const baseOrder = book.organization.sets.filter(set => set.chapterId === chapterId).length;
    const prefix = String(input.namePrefix || 'Set').trim() || 'Set';
    const created = chunks.map((group, index) => ({
      id: idFactory('set'),
      chapterId,
      name: `${prefix} ${baseOrder + index + 1}`,
      cardIds: group,
      order: baseOrder + index,
      targetSize: Math.max(1, Math.floor(finite(input.size, DEFAULT_SET_SIZE))),
      reviewOutside: input.reviewOutside !== false,
      createdAt: now,
      updatedAt: now
    }));
    book.organization.sets.push(...created);
    touchOrganization(book, now);
    return created;
  }

  function removeSet(book, setId) {
    normalizeBook(book);
    const id = String(setId || '');
    const before = book.organization.sets.length;
    book.organization.sets = book.organization.sets.filter(set => set.id !== id);
    if (book.organization.activeScope.type === 'set' && book.organization.activeScope.id === id) {
      book.organization.activeScope = normalizeScope(null, book);
    }
    if (before !== book.organization.sets.length) touchOrganization(book);
    return before !== book.organization.sets.length;
  }

  function renameChapter(book, chapterId, name) {
    normalizeBook(book);
    const chapter = book.organization.chapters.find(entry => entry.id === String(chapterId || ''));
    if (!chapter) return false;
    const next = String(name || '').trim();
    if (!next) return false;
    chapter.name = next;
    chapter.updatedAt = Date.now();
    touchOrganization(book);
    if (book.organization.activeScope.type === 'chapter' && book.organization.activeScope.id === chapter.id) {
      book.organization.activeScope.label = next;
    }
    return true;
  }

  function renameSet(book, setId, name) {
    normalizeBook(book);
    const set = book.organization.sets.find(entry => entry.id === String(setId || ''));
    if (!set) return false;
    const next = String(name || '').trim();
    if (!next) return false;
    set.name = next;
    set.updatedAt = Date.now();
    touchOrganization(book);
    if (book.organization.activeScope.type === 'set' && book.organization.activeScope.id === set.id) {
      book.organization.activeScope.label = next;
    }
    return true;
  }

  function setActiveScope(book, scope) {
    normalizeBook(book);
    book.organization.activeScope = normalizeScope(scope, book);
    touchOrganization(book);
    return book.organization.activeScope;
  }

  function scopeCardIds(book, scope = null) {
    normalizeBook(book);
    const normalized = normalizeScope(scope || book.organization.activeScope, book);
    if (normalized.type === 'automatic') return book.organization.bookOrder.slice();
    const allowed = new Set(normalized.cardIds);
    return book.organization.bookOrder.filter(id => allowed.has(id));
  }

  function scopeCards(book, scope = null) {
    const ids = scopeCardIds(book, scope);
    const map = cardMap(book);
    return ids.map(id => map.get(id)).filter(Boolean);
  }

  function scopeContainsCard(book, scope, cardId) {
    const id = String(cardId || '');
    if (!id) return false;
    const normalized = normalizeScope(scope || (book.organization && book.organization.activeScope), book);
    if (normalized.type === 'automatic') return scopeCardIds(book, normalized).includes(id);
    return normalized.cardIds.includes(id);
  }

  function scopeForCard(book, cardId, preferredScope = null) {
    normalizeBook(book);
    const id = String(cardId || '');
    const preferred = normalizeScope(preferredScope || book.organization.activeScope, book);
    if (!id || !book.organization.bookOrder.includes(id)) return preferred;
    if (preferred.type !== 'automatic' && scopeContainsCard(book, preferred, id)) return preferred;

    const sets = book.organization.sets
      .filter(set => set.cardIds.includes(id))
      .slice()
      .sort((left, right) => left.cardIds.length - right.cardIds.length || left.order - right.order || left.createdAt - right.createdAt);
    if (sets.length) {
      const set = sets[0];
      return normalizeScope({ type:'set', id:set.id, includeOutsideReviews:set.reviewOutside }, book);
    }

    const chapters = book.organization.chapters
      .filter(chapter => chapter.cardIds.includes(id))
      .slice()
      .sort((left, right) => left.cardIds.length - right.cardIds.length || left.order - right.order || left.createdAt - right.createdAt);
    if (chapters.length) {
      const chapter = chapters[0];
      return normalizeScope({ type:'chapter', id:chapter.id, includeOutsideReviews:chapter.reviewOutside }, book);
    }

    return normalizeScope(null, book);
  }

  function cardHasLearningEvidence(card) {
    if (!card || card.deleted || card.state === 'suspended') return false;
    const history = Array.isArray(card.history) ? card.history.filter(Boolean) : [];
    const studyHistory = history.some(entry => !isRankedHistory(entry));
    const rankedHistory = history.some(isRankedHistory);
    const explicitStudy = finite(card.introducedAt, 0) > 0
      || finite(card.studySeenAt, 0) > 0
      || finite(card.studyReviews, 0) > 0
      || finite(card.sessionAttempts, 0) > 0
      || finite(card.studyMastery, 0) > 0
      || studyHistory;
    const legacyStudyOnly = history.length === 0 && finite(card.reps, 0) > 0;
    const compatibleReviewedAt = finite(card.lastReviewedAt, 0) > 0 && (!rankedHistory || studyHistory || explicitStudy);
    return card.state === 'known' || explicitStudy || legacyStudyOnly || compatibleReviewedAt;
  }

  function filterNewCards(book, cards, scope = null) {
    normalizeBook(book);
    const normalized = normalizeScope(scope || book.organization.activeScope, book);
    if (normalized.type === 'automatic') return Array.isArray(cards) ? cards.slice() : [];
    const source = new Map((Array.isArray(cards) ? cards : []).filter(Boolean).map(card => [String(card.id), card]));
    return scopeCardIds(book, normalized).map(id => source.get(id)).filter(Boolean);
  }

  function filterReviewCards(book, cards, scope = null) {
    normalizeBook(book);
    const normalized = normalizeScope(scope || book.organization.activeScope, book);
    const source = Array.isArray(cards) ? cards.slice() : [];
    if (normalized.type === 'automatic' || normalized.includeOutsideReviews) return source;
    const allowed = new Set(scopeCardIds(book, normalized));
    return source.filter(card => card && allowed.has(String(card.id)));
  }

  function scopeSummary(book, scope = null, metrics = {}) {
    const normalized = normalizeScope(scope || (book.organization && book.organization.activeScope), book);
    const cards = scopeCards(book, normalized).filter(card => !card.deleted && card.state !== 'suspended');
    const shortTermOf = typeof metrics.shortTermOf === 'function' ? metrics.shortTermOf : card => finite(card.studyMastery, 0);
    const longTermOf = typeof metrics.longTermOf === 'function' ? metrics.longTermOf : card => finite(card.memoryScore, 0);
    const observedCards = cards.filter(cardHasLearningEvidence);
    const introduced = observedCards.length;
    const shortTermAverage = cards.length
      ? Math.round(cards.reduce((sum, card) => sum + clamp(shortTermOf(card), 0, 100), 0) / cards.length)
      : 0;
    // The full-set average remains the retirement metric so unseen words can never be
    // hidden by a strong score on only a few cards.
    const longTermAverage = cards.length
      ? Math.round(cards.reduce((sum, card) => sum + clamp(longTermOf(card), 0, 100), 0) / cards.length)
      : 0;
    // The world display reflects the cards that have actual learning evidence. This
    // avoids a reviewed outside-scope card showing a misleading 0% simply because the
    // currently selected new set is untouched.
    const displayLongTermAverage = observedCards.length
      ? Math.round(observedCards.reduce((sum, card) => sum + clamp(longTermOf(card), 0, 100), 0) / observedCards.length)
      : 0;
    return {
      scope: normalized,
      total: cards.length,
      introduced,
      unseen: Math.max(0, cards.length - introduced),
      shortTermAverage,
      longTermAverage,
      displayLongTermAverage,
      longTermObserved: observedCards.length,
      longTermCoverage: cards.length ? observedCards.length / cards.length : 0,
      complete: cards.length > 0 && introduced === cards.length && shortTermAverage >= SHORT_TERM_TARGET,
      retired: cards.length > 0 && introduced === cards.length && longTermAverage >= LONG_TERM_TARGET
    };
  }

  return Object.freeze({
    VERSION,
    DEFAULT_SET_SIZE,
    SHORT_TERM_TARGET,
    LONG_TERM_TARGET,
    normalizeBook,
    normalizeScope,
    orderedCards,
    parseSelectionExpression,
    chunkIds,
    equalDivide,
    cardIdsForRange,
    cardIdsFromExpression,
    addChapter,
    addEqualChapters,
    removeChapter,
    renameChapter,
    splitIntoSets,
    removeSet,
    renameSet,
    setActiveScope,
    scopeCardIds,
    scopeCards,
    scopeContainsCard,
    scopeForCard,
    cardHasLearningEvidence,
    filterNewCards,
    filterReviewCards,
    scopeSummary
  });
});
