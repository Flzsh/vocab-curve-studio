(function attachV20Storage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20Storage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20Storage() {
  'use strict';

  const VERSION = '20.0.0-alpha.20';
  const FORMAT = 'vocab-curve-save-envelope-v1';
  const LEGACY_PRIMARY_KEY = 'vocab-curve-studio:stable-v20';
  const LEGACY_BACKUP_KEY = 'vocab-curve-studio:stable-v20:backups';
  const PRIMARY_KEY = 'vocab-curve-studio:stable-v20-coordinated';
  const BACKUP_KEY = 'vocab-curve-studio:stable-v20-coordinated:backups';
  const DEFAULT_BACKUP_LIMIT = 3;
  const DEFAULT_LOCK_WAIT_MS = 24;
  const EXCLUSIVE_LOCK_TOKEN = Object.freeze({});

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nowValue(now) {
    return typeof now === 'function' ? finite(now(), Date.now()) : finite(now, Date.now());
  }

  function hashText(value) {
    const source = String(value || '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function createWriterId(random = Math.random) {
    const entropy = Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * 0xffffffff)
      .toString(36)
      .padStart(7, '0');
    return `writer-${Date.now().toString(36)}-${entropy}`;
  }

  function validStateShape(state) {
    return !!state && typeof state === 'object' && !Array.isArray(state) && Array.isArray(state.books);
  }

  function makeEnvelope(state, options = {}) {
    const payload = JSON.stringify(state);
    return {
      format: FORMAT,
      revision: Math.max(1, Math.round(finite(options.revision, 1))),
      writerId: String(options.writerId || ''),
      writtenAt: Math.max(0, Math.round(nowValue(options.now))),
      reason: String(options.reason || 'save').slice(0, 80),
      checksum: hashText(payload),
      payload
    };
  }

  function parseEnvelopeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.format !== FORMAT) return null;
    if (!Number.isFinite(Number(value.revision)) || Number(value.revision) < 1) return null;
    if (typeof value.payload !== 'string') return null;
    if (hashText(value.payload) !== String(value.checksum || '')) return null;
    let state;
    try { state = JSON.parse(value.payload); } catch (_error) { return null; }
    if (!validStateShape(state)) return null;
    return {
      envelope: {
        format: FORMAT,
        revision: Math.round(Number(value.revision)),
        writerId: String(value.writerId || ''),
        writtenAt: Math.max(0, Math.round(finite(value.writtenAt, 0))),
        reason: String(value.reason || ''),
        checksum: String(value.checksum || ''),
        payload: value.payload
      },
      state
    };
  }

  function readEnvelope(raw) {
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parseEnvelopeObject(parsed);
    } catch (_error) {
      return null;
    }
  }

  function readBackups(storage, key = BACKUP_KEY) {
    let parsed;
    try { parsed = JSON.parse(storage.getItem(key) || '[]'); } catch (_error) { parsed = []; }
    return (Array.isArray(parsed) ? parsed : [])
      .map(parseEnvelopeObject)
      .filter(Boolean)
      .sort((left, right) => right.envelope.revision - left.envelope.revision || right.envelope.writtenAt - left.envelope.writtenAt);
  }

  function writeBackups(storage, envelopes, options = {}) {
    const key = options.backupKey || BACKUP_KEY;
    const limit = Math.max(1, Math.min(8, Math.round(finite(options.backupLimit, DEFAULT_BACKUP_LIMIT))));
    const unique = [];
    const seen = new Set();
    for (const candidate of envelopes) {
      const parsed = parseEnvelopeObject(candidate && candidate.envelope ? candidate.envelope : candidate);
      if (!parsed || seen.has(parsed.envelope.revision)) continue;
      seen.add(parsed.envelope.revision);
      unique.push(parsed.envelope);
      if (unique.length >= limit) break;
    }
    for (let size = unique.length; size >= 0; size -= 1) {
      try {
        storage.setItem(key, JSON.stringify(unique.slice(0, size)));
        return { ok: true, retained: size };
      } catch (_error) {
        // Retry with fewer snapshots if the origin is near its quota.
      }
    }
    return { ok: false, retained: 0 };
  }

  function storageKeys(storage) {
    if (!storage || typeof storage.key !== 'function') return [];
    const keys = [];
    const length = Math.max(0, Math.round(finite(storage.length, 0)));
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string') keys.push(key);
    }
    return keys;
  }

  function readLockRecord(storage, key) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return { ok: true, record: null };
      const record = JSON.parse(raw);
      if (!record || typeof record !== 'object') return { ok: false, error: new Error(`Invalid save-lock record: ${key}`) };
      return {
        ok: true,
        record: {
          choosing: record.choosing === true,
          ticket: Math.max(0, Math.round(finite(record.ticket, 0))),
          heartbeat: Math.max(0, Math.round(finite(record.heartbeat, 0)))
        }
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function acquireWriteLock(storage, primaryKey, writerId, options = {}) {
    if (typeof storage.key !== 'function' || typeof storage.removeItem !== 'function' || !Number.isFinite(Number(storage.length))) {
      return { ok: false, error: new TypeError('Storage coordination requires length, key(), and removeItem().') };
    }
    const prefix = `${primaryKey}:write-lock:`;
    const ownKey = `${prefix}${encodeURIComponent(writerId)}`;
    const waitMs = Math.max(0, Math.min(500, Math.round(finite(options.lockWaitMs, DEFAULT_LOCK_WAIT_MS))));
    const startedAt = Date.now();
    let ticket = 0;
    const release = () => {
      try { if (typeof storage.removeItem === 'function') storage.removeItem(ownKey); } catch (_error) {}
    };
    const writeOwn = choosing => storage.setItem(ownKey, JSON.stringify({ choosing, ticket, heartbeat: Date.now() }));
    try {
      writeOwn(true);
      for (const key of storageKeys(storage)) {
        if (!key.startsWith(prefix) || key === ownKey) continue;
        const inspected = readLockRecord(storage, key);
        if (!inspected.ok) throw inspected.error;
        const record = inspected.record;
        if (record) ticket = Math.max(ticket, record.ticket);
      }
      ticket += 1;
      writeOwn(false);
      while (true) {
        const wallNow = Date.now();
        let blocked = false;
        for (const key of storageKeys(storage)) {
          if (!key.startsWith(prefix) || key === ownKey) continue;
          const inspected = readLockRecord(storage, key);
          if (!inspected.ok) throw inspected.error;
          const record = inspected.record;
          if (!record) continue;
          const contenderWins = record.choosing
            || (record.ticket > 0 && (record.ticket < ticket || (record.ticket === ticket && key < ownKey)));
          if (contenderWins) { blocked = true; break; }
        }
        if (!blocked) return { ok: true, ticket, release };
        if (wallNow - startedAt >= waitMs) {
          release();
          return { ok: false, locked: true };
        }
        writeOwn(false);
        const pauseUntil = Date.now() + 1;
        while (Date.now() < pauseUntil) { /* Bounded Bakery-lock wait. */ }
      }
    } catch (error) {
      release();
      return { ok: false, error };
    }
  }

  function studyHistoryEntries(card) {
    return (Array.isArray(card && card.history) ? card.history : []).filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      const source = String(entry.kind || entry.source || entry.context || '').toLowerCase();
      return source !== 'ranked' && source !== 'battle';
    });
  }

  function encounterEvidence(card) {
    const allHistory = Array.isArray(card && card.history) ? card.history.filter(Boolean) : [];
    const history = studyHistoryEntries(card);
    const rankedHistory = allHistory.filter(entry => {
      const source = String(entry && (entry.kind || entry.source || entry.context) || '').toLowerCase();
      return source === 'ranked' || source === 'battle';
    });
    const explicitStudy = finite(card && card.studySeenAt, 0) > 0
      || finite(card && card.studyReviews, 0) > 0
      || finite(card && card.studyMastery, 0) > 0
      || history.length > 0;
    const compatibleReviewedAt = finite(card && card.lastReviewedAt, 0) > 0
      && (rankedHistory.length === 0 || history.length > 0 || explicitStudy);
    const repsOnly = finite(card && card.reps, 0) > 0 && allHistory.length === 0;
    return { reliable: explicitStudy || compatibleReviewedAt || repsOnly, history };
  }

  function repairEncounterHistory(state, options = {}) {
    if (!validStateShape(state)) return { repaired: 0, cardIds: [] };
    const currentTime = Math.max(1, Math.round(finite(options.now, Date.now())));
    const repairedIds = [];
    for (const book of state.books) {
      if (!book || !Array.isArray(book.cards)) continue;
      for (const card of book.cards) {
        if (!card || finite(card.introducedAt, 0) > 0) continue;
        const evidence = encounterEvidence(card);
        if (!evidence.reliable) continue;
        const timestamps = [card.studySeenAt, card.lastReviewedAt]
          .concat(evidence.history.map(entry => entry.time || entry.reviewedAt || entry.at))
          .map(value => finite(value, 0))
          .filter(value => value > 0);
        const fallback = finite(card.updatedAt, 0) || finite(card.createdAt, 0) || currentTime;
        card.introducedAt = Math.max(1, Math.round(timestamps.length ? Math.min(...timestamps) : fallback));
        if (!card.studySeenAt) card.studySeenAt = card.introducedAt;
        if (String(card.state || 'new') === 'new') {
          const repeated = finite(card.studyReviews, 0) > 0 || finite(card.reps, 0) > 1 || evidence.history.length > 1;
          card.state = repeated ? 'review' : 'learning';
        }
        repairedIds.push(String(card.id || card.word || repairedIds.length));
      }
    }
    return { repaired: repairedIds.length, cardIds: repairedIds };
  }

  function load(storage, options = {}) {
    if (!storage || typeof storage.getItem !== 'function') throw new TypeError('storage is required');
    const primaryKey = options.primaryKey || PRIMARY_KEY;
    const backupKey = options.backupKey || BACKUP_KEY;
    const writerId = String(options.writerId || createWriterId());
    const migrateState = typeof options.migrateState === 'function' ? options.migrateState : value => value;
    const defaultState = typeof options.defaultState === 'function' ? options.defaultState : () => ({ books: [] });
    const current = readEnvelope(storage.getItem(primaryKey));
    if (current) {
      const beforeMigration = hashText(JSON.stringify(current.state));
      const state = migrateState(current.state, primaryKey);
      const repairs = repairEncounterHistory(state, { now: nowValue(options.now) });
      const migrated = hashText(JSON.stringify(state)) !== beforeMigration;
      return {
        state,
        meta: {
          source: 'primary',
          revision: current.envelope.revision,
          writerId,
          loadedWriterId: current.envelope.writerId,
          loadedAt: nowValue(options.now),
          stale: false,
          needsInitialSave: repairs.repaired > 0 || migrated,
          migrated,
          repairedCards: repairs.repaired,
          recoveredFromRevision: 0
        }
      };
    }

    const backup = readBackups(storage, backupKey)[0];
    if (backup) {
      const state = migrateState(backup.state, backupKey);
      const repairs = repairEncounterHistory(state, { now: nowValue(options.now) });
      return {
        state,
        meta: {
          source: 'backup',
          revision: backup.envelope.revision,
          writerId,
          loadedWriterId: backup.envelope.writerId,
          loadedAt: nowValue(options.now),
          stale: false,
          needsInitialSave: true,
          migrated: true,
          repairedCards: repairs.repaired,
          recoveredFromRevision: backup.envelope.revision
        }
      };
    }

    for (const key of Array.isArray(options.legacyKeys) ? options.legacyKeys : []) {
      try {
        const raw = storage.getItem(key);
        const legacyEnvelope = readEnvelope(raw) || readBackups(storage, `${key}:backups`)[0] || null;
        if (!raw && !legacyEnvelope) continue;
        const state = migrateState(legacyEnvelope ? legacyEnvelope.state : JSON.parse(raw), key);
        const repairs = repairEncounterHistory(state, { now: nowValue(options.now) });
        return {
          state,
          meta: {
            source: 'legacy',
            legacyKey: key,
            revision: 0,
            writerId,
            loadedWriterId: legacyEnvelope ? legacyEnvelope.envelope.writerId : '',
            loadedAt: nowValue(options.now),
            stale: false,
            needsInitialSave: true,
            migrated: true,
            repairedCards: repairs.repaired,
            recoveredFromRevision: legacyEnvelope ? legacyEnvelope.envelope.revision : 0
          }
        };
      } catch (_error) {
        // Continue to the next legacy source.
      }
    }

    const state = migrateState(defaultState(), 'default');
    const repairs = repairEncounterHistory(state, { now: nowValue(options.now) });
    return {
      state,
      meta: {
        source: 'default',
        revision: 0,
        writerId,
        loadedWriterId: '',
        loadedAt: nowValue(options.now),
        stale: false,
        needsInitialSave: true,
        migrated: true,
        repairedCards: repairs.repaired,
        recoveredFromRevision: 0
      }
    };
  }

  function save(storage, state, meta = {}, options = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('storage is required');
    if (!validStateShape(state)) return { ok: false, error: new TypeError('state is invalid') };
    const primaryKey = options.primaryKey || PRIMARY_KEY;
    const backupKey = options.backupKey || BACKUP_KEY;
    const writerId = String(options.writerId || meta.writerId || createWriterId());
    const loadedRevision = Math.max(0, Math.round(finite(meta.revision, 0)));
    const lock = options.exclusiveLockToken === EXCLUSIVE_LOCK_TOKEN
      ? { ok: true, release() {} }
      : acquireWriteLock(storage, primaryKey, writerId, options);
    if (!lock.ok) {
      if (lock.locked) {
        let latest;
        try { latest = readEnvelope(storage.getItem(primaryKey)); }
        catch (error) { return { ok: false, error, locked: true, meta: { ...meta, stale: false } }; }
        const latestRevision = latest ? latest.envelope.revision : 0;
        const sameRevisionWriterSwap = !!latest
          && latestRevision === loadedRevision
          && !!meta.loadedWriterId
          && latest.envelope.writerId !== meta.loadedWriterId;
        if (latestRevision > loadedRevision || sameRevisionWriterSwap) {
          return {
            ok: false,
            conflict: true,
            locked: true,
            currentRevision: latestRevision,
            currentWriterId: latest ? latest.envelope.writerId : '',
            meta: { ...meta, stale: true }
          };
        }
        return {
          ok: false,
          busy: true,
          locked: true,
          currentRevision: latestRevision,
          currentWriterId: latest ? latest.envelope.writerId : '',
          meta: { ...meta, stale: false }
        };
      }
      return { ok: false, error: lock.error || new Error('Could not acquire the save lock.'), meta: { ...meta, stale: false } };
    }
    const migratingLegacyV20 = primaryKey === PRIMARY_KEY
      && meta.source === 'legacy'
      && meta.legacyKey === LEGACY_PRIMARY_KEY;
    try {
      if (migratingLegacyV20) {
        if (typeof storage.removeItem !== 'function') throw new TypeError('Legacy migration requires removeItem().');
        storage.removeItem(LEGACY_BACKUP_KEY);
      }
      const initialPrimaryRaw = storage.getItem(primaryKey);
      const current = readEnvelope(initialPrimaryRaw);
      const existingBackups = readBackups(storage, backupKey);
      const newestBackup = existingBackups[0] || null;
      const newestStoredRevision = Math.max(
        current ? current.envelope.revision : 0,
        newestBackup ? newestBackup.envelope.revision : 0
      );
      const newestWriterId = current && current.envelope.revision === newestStoredRevision
        ? current.envelope.writerId
        : newestBackup && newestBackup.envelope.revision === newestStoredRevision
          ? newestBackup.envelope.writerId
          : '';
      if (newestStoredRevision > loadedRevision) {
        return {
          ok: false,
          conflict: true,
          currentRevision: newestStoredRevision,
          currentWriterId: newestWriterId,
          meta: { ...meta, stale: true }
        };
      }

      const revision = Math.max(loadedRevision, newestStoredRevision) + 1;
      const envelope = makeEnvelope(state, { revision, writerId, now: options.now, reason: options.reason });
      const backupWrite = current
        ? writeBackups(storage, [current, ...existingBackups], { backupKey, backupLimit: options.backupLimit })
        : { ok: true, retained: existingBackups.length };
      const latestPrimaryRaw = storage.getItem(primaryKey);
      if (latestPrimaryRaw !== initialPrimaryRaw) {
        const latest = readEnvelope(latestPrimaryRaw);
        return {
          ok: false,
          conflict: true,
          currentRevision: latest ? latest.envelope.revision : loadedRevision + 1,
          currentWriterId: latest ? latest.envelope.writerId : '',
          backupWrite,
          meta: { ...meta, stale: true }
        };
      }
      const serializedEnvelope = JSON.stringify(envelope);
      try {
        storage.setItem(primaryKey, serializedEnvelope);
      } catch (error) {
        return { ok: false, error, backupWrite, meta: { ...meta, stale: false } };
      }
      const committedRaw = storage.getItem(primaryKey);
      if (committedRaw !== serializedEnvelope) {
        const latest = readEnvelope(committedRaw);
        return {
          ok: false,
          conflict: true,
          currentRevision: latest ? latest.envelope.revision : revision,
          currentWriterId: latest ? latest.envelope.writerId : '',
          backupWrite,
          meta: { ...meta, stale: true }
        };
      }
      let legacyCleanup = null;
      if (migratingLegacyV20) {
        try {
          storage.removeItem(LEGACY_PRIMARY_KEY);
          storage.removeItem(LEGACY_BACKUP_KEY);
          legacyCleanup = { ok: true };
        } catch (error) {
          legacyCleanup = { ok: false, error };
        }
      }
      return {
        ok: true,
        backupWrite,
        legacyCleanup,
        meta: {
          ...meta,
          source: 'primary',
          revision,
          writerId,
          loadedWriterId: writerId,
          writtenAt: envelope.writtenAt,
          stale: false,
          needsInitialSave: false,
          recoveredFromRevision: 0
        }
      };
    } catch (error) {
      return { ok: false, error, meta: { ...meta, stale: false } };
    } finally {
      lock.release();
    }
  }

  async function saveCoordinated(storage, state, meta = {}, options = {}) {
    try {
      const lockManager = options.lockManager
        || (typeof navigator !== 'undefined' && navigator && navigator.locks)
        || null;
      if (!lockManager || typeof lockManager.request !== 'function') return save(storage, state, meta, options);
      const primaryKey = options.primaryKey || PRIMARY_KEY;
      const lockName = `vocab-curve-write:${primaryKey}`;
      return await lockManager.request(lockName, { mode: 'exclusive' }, () => save(storage, state, meta, {
        ...options,
        primaryKey,
        exclusiveLockToken: EXCLUSIVE_LOCK_TOKEN
      }));
    } catch (error) {
      return { ok: false, error, meta: { ...meta, stale: false } };
    }
  }

  function reset(storage, options = {}) {
    if (!storage || typeof storage.removeItem !== 'function') return { ok: false, error: new TypeError('storage is required') };
    const primaryKey = options.primaryKey || PRIMARY_KEY;
    const backupKey = options.backupKey || BACKUP_KEY;
    const writerId = String(options.writerId || createWriterId());
    const lock = options.exclusiveLockToken === EXCLUSIVE_LOCK_TOKEN
      ? { ok: true, release() {} }
      : acquireWriteLock(storage, primaryKey, writerId, options);
    if (!lock.ok) return { ok: false, busy: lock.locked === true, locked: lock.locked === true, error: lock.error };
    try {
      storage.removeItem(primaryKey);
      storage.removeItem(backupKey);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    } finally {
      lock.release();
    }
  }

  async function resetCoordinated(storage, options = {}) {
    try {
      const lockManager = options.lockManager
        || (typeof navigator !== 'undefined' && navigator && navigator.locks)
        || null;
      if (!lockManager || typeof lockManager.request !== 'function') return reset(storage, options);
      const primaryKey = options.primaryKey || PRIMARY_KEY;
      return await lockManager.request(`vocab-curve-write:${primaryKey}`, { mode: 'exclusive' }, () => reset(storage, {
        ...options,
        primaryKey,
        exclusiveLockToken: EXCLUSIVE_LOCK_TOKEN
      }));
    } catch (error) {
      return { ok: false, error };
    }
  }

  function inspect(storage, options = {}) {
    const primary = readEnvelope(storage.getItem(options.primaryKey || PRIMARY_KEY));
    const backups = readBackups(storage, options.backupKey || BACKUP_KEY);
    return {
      primaryValid: !!primary,
      revision: primary ? primary.envelope.revision : 0,
      writerId: primary ? primary.envelope.writerId : '',
      backupCount: backups.length,
      backupRevisions: backups.map(item => item.envelope.revision)
    };
  }

  return {
    VERSION,
    FORMAT,
    LEGACY_PRIMARY_KEY,
    LEGACY_BACKUP_KEY,
    PRIMARY_KEY,
    BACKUP_KEY,
    DEFAULT_BACKUP_LIMIT,
    hashText,
    createWriterId,
    makeEnvelope,
    readEnvelope,
    readBackups,
    repairEncounterHistory,
    load,
    save,
    saveCoordinated,
    reset,
    resetCoordinated,
    inspect
  };
});
