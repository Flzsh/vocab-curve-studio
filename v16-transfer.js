(function attachV16Transfer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V16Transfer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV16Transfer() {
  'use strict';

  const PREFIX = 'VCS16:';
  const MAX_TEXT_LENGTH = 12 * 1024 * 1024;
  const MAX_DEPTH = 96;
  const MAX_NODES = 750000;
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const SCOPES = Object.freeze({
    full: Object.freeze({
      code: 'f',
      label: 'Full backup',
      description: 'All books, Study memory, settings, and backward-compatible legacy data.'
    }),
    book: Object.freeze({
      code: 'b',
      label: 'Current book',
      description: 'The current book with its words, 20-word sections, and complete memory progress.'
    }),
    ranked: Object.freeze({
      code: 'r',
      label: 'Ranked profile',
      description: 'Elo, match history, characters, upgrades, currencies, and arena progress.'
    })
  });
  const SCOPE_BY_CODE = Object.freeze({ f: 'full', b: 'book', r: 'ranked' });

  // Stable v16 dictionary. Repeated state/card field names become one- or
  // two-character keys without placing a dictionary inside every transfer.
  const KEYS = Object.freeze([
    'id', 'word', 'meaning', 'fullMeaning', 'bridge', 'example', 'state', 'dueAt',
    'intervalDays', 'stability', 'memoryScore', 'difficulty', 'reps', 'lapses',
    'createdAt', 'updatedAt', 'history', 'time', 'rating', 'batchId', 'batchName',
    'batchIndex', 'sectionIndex', 'studyMastery', 'studyReviews', 'memoryStability',
    'memoryDifficulty', 'norm', 'cards', 'batches', 'name', 'count', 'books',
    'activeBookId', 'daily', 'achievements', 'profile', 'account', 'settings',
    'schemaVersion', 'appVersion', 'unlocked', 'recent', 'claimedRewards', 'totals',
    'flags', 'memoryCalibration', 'rank', 'progress', 'elo', 'peakElo', 'matches',
    'wins', 'losses', 'ties', 'overtime', 'winStreak', 'bestStreak', 'peakTier',
    'peakSStars', 'tier', 'pips', 'sStars', 'result', 'delta', 'eloBefore', 'eloAfter',
    'opponentElo', 'playerHp', 'botHp', 'playerAccuracy', 'botAccuracy', 'questions',
    'healthDiff', 'performance', 'character', 'botCharacter', 'reason', 'memoryPoints',
    'characterCores', 'trainingTokens', 'lifetimeTrainingTokens', 'selectedCharacter',
    'unlockedCharacters', 'characterPower', 'characterStats', 'gloryClaims',
    'gloryClaimsVersion', 'memoryMigrationComplete', 'sectionUnlocks', 'dailyNewLimit',
    'dailyReviewLimit', 'targetTotal', 'targetDays', 'curve', 'queueStyle', 'frontMode',
    'protectBacklog', 'requireTypingInstant', 'reviewsBeforeNew', 'learningPullAheadMin',
    'smartReview', 'newBatchFilter', 'sectionFocus', 'introducedAt', 'lastReviewedAt',
    'lastRating', 'peakStudyMastery', 'gloryStage', 'suspended', 'deleted', 'correctStreak',
    'personalScale', 'modelBias', 'ease', 'retrievability', 'shortTermStep', 'learningStep',
    'reviewSinceNew', 'reviewsDone', 'newIntroduced', 'correct', 'wrong', 'know', 'hints',
    'minutes', 'pauseNew', 'boostReview', 'activeSeconds', 'rawMs', 'afk', 'hiddenMs',
    'blurMs', 'predBefore', 'score', 'kind', 'installId', 'bias', 'speedWeight',
    'observations', 'lastCalibratedAt', 'legacyUpgradeRefunded', 'legacyUpgradeRefundAmount', 'shortTermMastery', 'shortTermUpdatedAt',
    'shortTermEvidenceCount', 'usabilityScore', 'sessionAttempts', 'sessionIndependentCorrect',
    'sessionUpdatedAt', 'sessionLastRating', 'sectionRetirements'
  ]);
  const TOKEN_BY_KEY = new Map(KEYS.map((key, index) => [key, index.toString(36)]));
  const KEY_BY_TOKEN = new Map(KEYS.map((key, index) => [index.toString(36), key]));

  function safeName(value) {
    return String(value || 'transfer')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 42) || 'transfer';
  }

  function encodeKey(key) {
    if (TOKEN_BY_KEY.has(key)) return TOKEN_BY_KEY.get(key);
    if (KEY_BY_TOKEN.has(key) || key.startsWith('~')) return `~${key}`;
    return key;
  }

  function decodeKey(key) {
    if (KEY_BY_TOKEN.has(key)) return KEY_BY_TOKEN.get(key);
    return key.startsWith('~') ? key.slice(1) : key;
  }

  function copyTree(value, mode, depth, budget, ancestors) {
    if (depth > MAX_DEPTH) throw new RangeError('Transfer data is nested too deeply.');
    budget.count += 1;
    if (budget.count > MAX_NODES) throw new RangeError('Transfer contains too many values.');
    if (value === null || typeof value !== 'object') return value;
    if (ancestors.has(value)) throw new TypeError('Transfer data cannot contain circular references.');
    ancestors.add(value);
    let output;
    if (Array.isArray(value)) {
      output = value.map((entry) => copyTree(entry, mode, depth + 1, budget, ancestors));
    } else {
      output = {};
      for (const sourceKey of Object.keys(value)) {
        const cleanSourceKey = mode === 'decode' ? decodeKey(sourceKey) : sourceKey;
        if (BLOCKED_KEYS.has(cleanSourceKey)) continue;
        const targetKey = mode === 'encode' ? encodeKey(cleanSourceKey) : cleanSourceKey;
        const nextValue = copyTree(value[sourceKey], mode, depth + 1, budget, ancestors);
        Object.defineProperty(output, targetKey, {
          value: nextValue,
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
    }
    ancestors.delete(value);
    return output;
  }

  function compact(value) {
    return copyTree(value, 'encode', 0, { count: 0 }, new WeakSet());
  }

  function expand(value) {
    return copyTree(value, 'decode', 0, { count: 0 }, new WeakSet());
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  const CARD_FINITE_FIELDS = Object.freeze([
    'dueAt', 'intervalDays', 'stability', 'memoryStability', 'difficulty', 'memoryDifficulty',
    'memoryScore', 'studyMastery', 'studyReviews', 'reps', 'lapses', 'createdAt', 'updatedAt',
    'introducedAt', 'lastReviewedAt', 'peakStudyMastery', 'gloryStage', 'batchIndex',
    'shortTermMastery', 'shortTermUpdatedAt', 'shortTermEvidenceCount', 'usabilityScore',
    'sessionAttempts', 'sessionIndependentCorrect', 'sessionUpdatedAt'
  ]);
  const RANK_FINITE_FIELDS = Object.freeze([
    'elo', 'peakElo', 'matches', 'wins', 'losses', 'ties', 'overtime', 'winStreak',
    'bestStreak', 'peakSStars', 'pips', 'sStars'
  ]);
  const PROGRESS_FINITE_FIELDS = Object.freeze([
    'memoryPoints', 'characterCores', 'trainingTokens', 'lifetimeTrainingTokens',
    'battleItemsUsed', 'legacyTrainingTokensConverted', 'legacyUpgradeRefundAmount'
  ]);

  function assertFiniteProperties(value, fields, label) {
    if (!isRecord(value)) return;
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
      const candidate = value[field];
      if (candidate === null || candidate === '' || !Number.isFinite(Number(candidate))) {
        throw new TypeError(`${label}.${field} must be a finite number.`);
      }
    }
  }

  function assertFiniteMap(value, label) {
    if (!isRecord(value)) return;
    for (const [key, candidate] of Object.entries(value)) {
      if (typeof candidate === 'boolean') continue;
      if (candidate === null || candidate === '' || !Number.isFinite(Number(candidate))) {
        throw new TypeError(`${label}.${key} must be a finite number.`);
      }
    }
  }

  function validateCard(card, label) {
    if (!isRecord(card)) throw new TypeError(`${label} contains an invalid card.`);
    if (typeof card.word !== 'string' || !card.word.trim()) throw new TypeError(`${label} contains a card without a word.`);
    if (typeof card.meaning !== 'string' && typeof card.fullMeaning !== 'string') {
      throw new TypeError(`${label} contains a card without a meaning.`);
    }
    assertFiniteProperties(card, CARD_FINITE_FIELDS, `${label} card`);
    if (card.history != null) {
      if (!Array.isArray(card.history) || !card.history.every(isRecord)) throw new TypeError(`${label} contains invalid card history.`);
      for (const entry of card.history) {
        assertFiniteProperties(entry, ['time', 'score', 'memoryScore', 'dueAt', 'intervalDays', 'stability', 'activeSeconds', 'revealMs'], `${label} history`);
      }
    }
  }

  function assertUniqueNonemptyIds(items, kind, label) {
    const seen = new Set();
    for (const item of items) {
      const id = String(item && item.id || '').trim();
      if (!id) continue;
      if (seen.has(id)) throw new TypeError(`${label} contains duplicate ${kind} id: ${id}.`);
      seen.add(id);
    }
  }

  function validateBookData(book, label = 'Book transfer') {
    if (!isRecord(book) || !Array.isArray(book.cards) || !Array.isArray(book.batches)) {
      throw new TypeError(`${label} is incomplete: cards or sections are missing.`);
    }
    assertUniqueNonemptyIds(book.cards, 'card', label);
    assertUniqueNonemptyIds(book.batches, 'batch', label);
    book.cards.forEach((card) => validateCard(card, label));
    if (!book.batches.every(isRecord)) throw new TypeError(`${label} contains an invalid section batch.`);
    assertFiniteProperties(book, ['createdAt', 'updatedAt'], label);
    for (const batch of book.batches) assertFiniteProperties(batch, ['count', 'createdAt', 'updatedAt'], `${label} batch`);
    return book;
  }

  function validateRankedData(account, label = 'Ranked profile transfer') {
    if (!isRecord(account) || !isRecord(account.rank) || !isRecord(account.progress)) {
      throw new TypeError(`${label} is incomplete: rank or progression data is missing.`);
    }
    assertFiniteProperties(account.rank, RANK_FINITE_FIELDS, `${label} rank`);
    assertFiniteProperties(account.progress, PROGRESS_FINITE_FIELDS, `${label} progress`);
    if (account.rank.history != null && (!Array.isArray(account.rank.history) || !account.rank.history.every(isRecord))) {
      throw new TypeError(`${label} contains invalid match history.`);
    }
    for (const entry of account.rank.history || []) {
      assertFiniteProperties(entry, ['time', 'delta', 'eloBefore', 'eloAfter', 'opponentElo', 'playerHp', 'botHp', 'playerAccuracy', 'botAccuracy', 'questions'], `${label} match history`);
    }
    if (isRecord(account.progress.upgrades)) assertFiniteMap(account.progress.upgrades, `${label} upgrades`);
    return account;
  }

  function validateFullData(data, label = 'Full backup') {
    if (!isRecord(data) || !Array.isArray(data.books) || data.books.length === 0) {
      throw new TypeError(`${label} is incomplete: books are missing.`);
    }
    assertUniqueNonemptyIds(data.books, 'book', label);
    data.books.forEach((book) => validateBookData(book, label));
    if (!isRecord(data.profile) || !isRecord(data.profile.totals) || !isRecord(data.account) || !isRecord(data.settings)) {
      throw new TypeError(`${label} is incomplete: Study, Ranked, or settings data is missing.`);
    }
    validateRankedData(data.account, label);
    assertFiniteMap(data.profile.totals, `${label} profile totals`);
    assertFiniteProperties(data.profile.memoryCalibration, [
      'version', 'bias', 'speedWeight', 'observations', 'lastCalibratedAt', 'intervalScale',
      'studyOutcomes', 'observedRecall', 'predictedRecall', 'brierScore',
      'avgCorrectSeconds', 'avgWrongSeconds'
    ], `${label} memory calibration`);
    assertFiniteProperties(data.profile.model, [
      'reviews', 'accuracy', 'wrongRate', 'avgCorrectSec', 'avgWrongSec', 'hintUseRate',
      'hintCorrectRate', 'shortTermSlipRate', 'intervalScale', 'speedTrust', 'reviewUrgency',
      'afkRate', 'rankAccuracy', 'rankAvgSec', 'rankStreakSkill'
    ], `${label} legacy memory model`);
    assertFiniteProperties(data, ['schemaVersion', 'createdAt', 'updatedAt'], label);
    assertFiniteProperties(data.settings, ['dailyNewLimit', 'dailyReviewLimit', 'targetTotal', 'targetDays', 'reviewsBeforeNew', 'learningPullAheadMin'], `${label} settings`);
    return data;
  }

  function validateStudyData(data) {
    if (!isRecord(data)) throw new TypeError('Legacy Study transfer is incomplete.');
    const hasBooks = Array.isArray(data.books) && data.books.length > 0;
    const hasStudyProgress = isRecord(data.studyProgress);
    const hasProfile = isRecord(data.profile);
    if (!hasBooks && !hasStudyProgress && !hasProfile) throw new TypeError('Legacy Study transfer is incomplete.');
    if (data.books != null) {
      if (!hasBooks) throw new TypeError('Legacy Study transfer has invalid books.');
      assertUniqueNonemptyIds(data.books, 'book', 'Legacy Study transfer');
      data.books.forEach((book) => validateBookData(book, 'Legacy Study transfer'));
    }
    if (data.settings != null && !isRecord(data.settings)) throw new TypeError('Legacy Study transfer has invalid settings.');
    if (hasStudyProgress) assertFiniteProperties(data.studyProgress, PROGRESS_FINITE_FIELDS, 'Legacy Study transfer progress');
    return data;
  }

  function validateV16Data(scope, data) {
    if (scope === 'full') return validateFullData(data);
    if (scope === 'book') return validateBookData(data, 'Current book transfer');
    if (scope === 'ranked') return validateRankedData(data);
    throw new TypeError('Unsupported VCS16 transfer scope.');
  }

  function validateSectionUnlocks(value) {
    if (!isRecord(value)) throw new TypeError('Current book transfer has invalid section unlock data.');
    assertFiniteMap(value, 'Section unlocks');
    return value;
  }

  function scopeData(scope, state, activeBookId) {
    if (!Object.prototype.hasOwnProperty.call(SCOPES, scope)) throw new RangeError(`Unknown transfer scope: ${scope}`);
    if (!state || typeof state !== 'object') throw new TypeError('A valid application state is required.');
    if (scope === 'full') return state;
    if (scope === 'ranked') {
      if (!state.account || typeof state.account !== 'object') throw new TypeError('Ranked account data is unavailable.');
      return state.account;
    }
    const selectedId = activeBookId || state.activeBookId;
    const book = Array.isArray(state.books) ? state.books.find((entry) => entry && entry.id === selectedId) : null;
    if (!book) throw new RangeError('The active book could not be found.');
    return book;
  }

  function sectionUnlocksForBook(state, book) {
    const batchIds = new Set();
    for (const batch of Array.isArray(book && book.batches) ? book.batches : []) {
      if (batch && batch.id) batchIds.add(String(batch.id));
    }
    for (const card of Array.isArray(book && book.cards) ? book.cards : []) {
      if (card && card.batchId) batchIds.add(String(card.batchId));
    }
    const output = {};
    const source = state && state.sectionUnlocks && typeof state.sectionUnlocks === 'object' ? state.sectionUnlocks : {};
    for (const [key, value] of Object.entries(source)) {
      if ([...batchIds].some((batchId) => key.startsWith(`${batchId}:`))) output[key] = value;
    }
    return output;
  }

  function isolateBook(source, sourceUnlocks = {}, idFactory) {
    validateBookData(source, 'Transferred book');
    const unlocks = validateSectionUnlocks(sourceUnlocks || {});
    const book = copyTree(source, 'clone', 0, { count: 0 }, new WeakSet());
    let fallbackCounter = 0;
    const factory = typeof idFactory === 'function'
      ? idFactory
      : (prefix) => `${prefix}-${Date.now().toString(36)}-${(++fallbackCounter).toString(36)}`;
    const issued = new Set();
    const nextId = (prefix) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = String(factory(prefix) || '').trim();
        if (candidate && !issued.has(candidate)) { issued.add(candidate); return candidate; }
      }
      throw new TypeError(`Could not create a unique ${prefix} identifier for the transferred book.`);
    };

    const batchMap = new Map();
    const representedBatches = new Set();
    const originalBatchIds = book.batches.map((batch, index) => String(batch.id || `legacy-batch-${index}`));
    const mappedBatch = (oldId) => {
      const key = String(oldId || 'default');
      if (!batchMap.has(key)) batchMap.set(key, nextId('batch'));
      return batchMap.get(key);
    };
    book.batches.forEach((batch, index) => {
      const oldId = originalBatchIds[index];
      representedBatches.add(oldId);
      batch.id = mappedBatch(oldId);
    });

    const cardMap = new Map();
    const missingBatches = new Map();
    const fallbackBatchId = originalBatchIds[0] || 'default';
    book.cards.forEach((card) => {
      const oldBatchId = String(card.batchId || fallbackBatchId);
      const oldCardId = String(card.id || '');
      const newCardId = nextId('card');
      if (oldCardId && !cardMap.has(oldCardId)) cardMap.set(oldCardId, newCardId);
      card.id = newCardId;
      card.batchId = mappedBatch(oldBatchId);
      if (!representedBatches.has(oldBatchId)) {
        const detail = missingBatches.get(oldBatchId) || { count: 0, name: String(card.batchName || 'Imported') };
        detail.count += 1;
        missingBatches.set(oldBatchId, detail);
      }
    });
    for (const [oldBatchId, detail] of missingBatches) {
      book.batches.push({ id: mappedBatch(oldBatchId), name: detail.name, count: detail.count, createdAt: Date.now() });
    }

    const remapCardIds = (values) => {
      const output = [];
      const seen = new Set();
      for (const value of Array.isArray(values) ? values : []) {
        const mapped = cardMap.get(String(value || ''));
        if (!mapped || seen.has(mapped)) continue;
        seen.add(mapped);
        output.push(mapped);
      }
      return output;
    };
    if (isRecord(book.organization)) {
      if (Array.isArray(book.organization.bookOrder)) book.organization.bookOrder = remapCardIds(book.organization.bookOrder);
      for (const chapter of Array.isArray(book.organization.chapters) ? book.organization.chapters : []) {
        if (isRecord(chapter) && Array.isArray(chapter.cardIds)) chapter.cardIds = remapCardIds(chapter.cardIds);
      }
      for (const set of Array.isArray(book.organization.sets) ? book.organization.sets : []) {
        if (isRecord(set) && Array.isArray(set.cardIds)) set.cardIds = remapCardIds(set.cardIds);
      }
      if (isRecord(book.organization.activeScope) && Array.isArray(book.organization.activeScope.cardIds)) {
        book.organization.activeScope.cardIds = remapCardIds(book.organization.activeScope.cardIds);
      }
    }

    const sectionUnlocks = {};
    for (const [key, value] of Object.entries(unlocks)) {
      for (const [oldBatchId, newBatchId] of batchMap) {
        if (key.startsWith(`${oldBatchId}:`)) sectionUnlocks[`${newBatchId}:${key.slice(oldBatchId.length + 1)}`] = value;
      }
    }
    book.id = nextId('book');
    return { book, sectionUnlocks };
  }

  function encode(scope, state, activeBookId) {
    const data = scopeData(scope, state, activeBookId);
    const payload = [16, SCOPES[scope].code, compact(data)];
    if (scope === 'book') payload.push(compact(sectionUnlocksForBook(state, data)));
    return `${PREFIX}${JSON.stringify(payload)}`;
  }

  function parseJson(text, prefixed) {
    const source = prefixed ? text.slice(PREFIX.length) : text;
    try {
      return JSON.parse(source);
    } catch (error) {
      throw new SyntaxError('Invalid transfer text or JSON file.');
    }
  }

  function v16Envelope(payload) {
    if (!Array.isArray(payload) || payload.length < 3 || Number(payload[0]) !== 16 || !SCOPE_BY_CODE[payload[1]]) {
      throw new TypeError('Invalid or unsupported VCS16 transfer envelope.');
    }
    const scope = SCOPE_BY_CODE[payload[1]];
    const data = validateV16Data(scope, expand(payload[2]));
    const result = {
      version: 16,
      scope,
      format: 'vcs16',
      legacy: false,
      data
    };
    if (scope === 'book') {
      result.sectionUnlocks = validateSectionUnlocks(expand(payload[3] || {}));
    }
    return Object.freeze(result);
  }

  function legacyEnvelope(parsed) {
    const data = expand(parsed);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Unsupported backup format.');
    if (data.kind === 'vocab-curve-all-3' && data.state && typeof data.state === 'object') {
      return Object.freeze({ version: Number.parseInt(data.version, 10) || 0, scope: 'full', format: 'legacy', legacy: true, data: validateFullData(data.state, 'Legacy Full backup') });
    }
    if (data.kind === 'vocab-curve-words' && data.book && typeof data.book === 'object') {
      return Object.freeze({ version: Number.parseInt(data.version, 10) || 0, scope: 'book', format: 'legacy', legacy: true, legacyWords: true, data: validateBookData(data.book, 'Legacy book transfer') });
    }
    if (data.kind === 'vocab-curve-rank-account' && data.account && typeof data.account === 'object') {
      return Object.freeze({ version: Number.parseInt(data.version, 10) || 0, scope: 'ranked', format: 'legacy', legacy: true, data: validateRankedData(data.account, 'Legacy Ranked transfer') });
    }
    if (data.kind === 'vocab-curve-study-save') {
      return Object.freeze({ version: Number.parseInt(data.version, 10) || 0, scope: 'study', format: 'legacy', legacy: true, data: validateStudyData(data) });
    }
    if (Array.isArray(data.books)) {
      return Object.freeze({ version: Number(data.schemaVersion) || 0, scope: 'full', format: 'legacy', legacy: true, data: validateFullData(data, 'Legacy Full backup') });
    }
    if (data.rank && typeof data.rank === 'object') {
      return Object.freeze({ version: 0, scope: 'ranked', format: 'legacy', legacy: true, data: validateRankedData(data, 'Legacy Ranked transfer') });
    }
    throw new TypeError('Unsupported backup format.');
  }

  function decode(input) {
    const text = String(input == null ? '' : input).trim();
    if (!text) throw new TypeError('Transfer text is empty.');
    if (text.length > MAX_TEXT_LENGTH) throw new RangeError('Transfer text is larger than the 12 MB safety limit.');
    if (text.startsWith(PREFIX)) return v16Envelope(parseJson(text, true));

    const looksJson = text.startsWith('{') || text.startsWith('[');
    if (looksJson) {
      const parsed = parseJson(text, false);
      if (Array.isArray(parsed) && Number(parsed[0]) === 16) return v16Envelope(parsed);
      return legacyEnvelope(parsed);
    }
    return Object.freeze({
      version: 0,
      scope: 'words',
      format: 'plain',
      legacy: false,
      data: Object.freeze({ text })
    });
  }

  function filename(scope, state, dateKey) {
    if (!Object.prototype.hasOwnProperty.call(SCOPES, scope)) throw new RangeError(`Unknown transfer scope: ${scope}`);
    const date = String(dateKey || new Date().toISOString().slice(0, 10));
    let detail = 'all-data';
    if (scope === 'book') {
      const book = Array.isArray(state && state.books)
        ? state.books.find((entry) => entry && entry.id === state.activeBookId)
        : null;
      detail = safeName(book && book.name || 'current-book');
    }
    if (scope === 'ranked') detail = safeName(state && state.account && state.account.name || 'profile');
    return `vcs16-${scope}-${detail}-${safeName(date)}.vcs`;
  }

  return Object.freeze({ PREFIX, SCOPES, encode, decode, isolateBook, filename });
});
