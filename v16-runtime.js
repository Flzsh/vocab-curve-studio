(function attachV16Runtime(root, factory) {
  const Rules = root && root.V16Rules
    ? root.V16Rules
    : (typeof require === 'function' ? require('./v16-rules.js') : null);
  const Learning = root && root.V16Learning
    ? root.V16Learning
    : (typeof require === 'function' ? require('./v16-learning.js') : null);
  const api = factory(Rules, Learning);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V16RuntimeModule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule(Rules, Learning) {
  'use strict';

  const ABILITY_COOLDOWNS = Object.freeze({
    overdrive: ['correct', 4],
    'second-wind': ['correct', 4], cleanse: ['damage', 18],
    siphon: ['correct', 5], 'arc-burst': ['round', 3],
    'flash-prism': ['round', 4], gleam: ['correct', 4],
    replay: ['round', 4], sample: ['round', 5],
    'root-access': ['correct', 4], backdoor: ['round', 6],
    'loaded-dice': ['correct', 5], mulligan: ['round', 5],
    'false-signal': ['round', 5], vanish: ['damage', 18],
    bulwark: ['damage', 20], 'null-field': ['correct', 6], intercept: ['round', 5],
    'demon-pulse': ['correct', 3], 'soul-rend': ['round', 5], 'blood-pact': ['round', 6]
  });

  function clamp(value, min, max) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
  }

  function copyPower(power) {
    return {
      ability: clamp(Math.floor(Number(power && power.ability) || 0), 0, 3),
      passive: clamp(Math.floor(Number(power && power.passive) || 0), 0, 3),
      super: clamp(Math.floor(Number(power && power.super) || 0), 0, 3)
    };
  }

  function idleArenaModel(baseHp) {
    const hp = Math.max(1, Math.round(Number(baseHp) || 100));
    return {
      playerHp: hp,
      playerMaxHp: hp,
      botHp: hp,
      botMaxHp: hp,
      playerHealthPercent: 100,
      botHealthPercent: 100,
      playerShieldPercent: 0,
      botShieldPercent: 0,
      playerCredits: 0,
      botCredits: 0,
      matchRemaining: hp === 120 ? 120 : hp === 225 ? 225 : 75,
      matchPercent: 100,
      questionPercent: 0
    };
  }

  function armWager(fighter, requestedStake, maximumStake) {
    const credits = Math.max(0, Math.floor(Number(fighter && fighter.credits) || 0));
    const current = Math.max(0, Math.floor(Number(fighter && fighter.wager) || 0));
    const stake = Math.max(0, Math.floor(Number(requestedStake) || 0));
    const limit = Math.max(0, Math.floor(Number(maximumStake) || 0));
    if (stake > limit) return { ok: false, credits, wager: current, reason: 'limit' };
    if (current > 0 && stake < current) return { ok: false, credits, wager: current, reason: 'armed' };
    const available = credits + current;
    if (stake > available) return { ok: false, credits, wager: current, reason: 'credits' };
    return { ok: true, credits: available - stake, wager: stake };
  }

  function advanceCooldown(state, eventType, amount) {
    if (!state || state.type !== eventType) return state;
    return { ...state, remaining: Math.max(0, Number(state.remaining || 0) - Math.max(0, Number(amount) || 0)) };
  }

  function consumeQueuedFlash(effects) {
    if (!effects || Number(effects.flashQuestions || 0) <= 0) return false;
    effects.flashQuestions = Math.max(0, Number(effects.flashQuestions || 0) - 1);
    return true;
  }

  function canStartRanked(pool) {
    return Array.isArray(pool) && pool.length >= 5;
  }

  function botAnswerChance(elo, difficulty, memory, debuff) {
    const profile = Rules.botProfileForElo(elo);
    return clamp(
      profile.accuracy + (clamp(memory, 0, 1) - 0.5) * 0.08 - (clamp(difficulty, 0, 1) - 0.35) * 0.12 - Math.max(0, Number(debuff || 0)),
      0.35,
      0.94
    );
  }

  function advanceExistingLock(currentRounds, roundsAtWindowStart) {
    const current = Math.max(0, Number(currentRounds || 0));
    return Number(roundsAtWindowStart || 0) > 0 ? Math.max(0, current - 1) : current;
  }

  function recordCompletedOvertime(rank, current) {
    if (!rank || !current || current.overtimeCounted !== true) return false;
    rank.overtime = Number(rank.overtime || 0) + 1;
    current.overtimeCounted = false;
    return true;
  }

  function createFighterModel(side, character, elo, power, matchRules) {
    const snapshot = copyPower(power);
    const rules = matchRules || Rules.matchRulesForElo(elo);
    const barrier = character.id === 'aegis' ? 12 + (snapshot.passive >= 1 ? 4 : 0) : 0;
    return {
      side,
      charId: character.id,
      elo,
      power: snapshot,
      hp: rules.baseHp,
      maxHp: rules.baseHp,
      baseMaxHp: rules.baseHp,
      shield: barrier,
      credits: rules.startingCredits,
      streak: 0,
      bankedStreak: false,
      correct: 0,
      wrong: 0,
      answered: 0,
      totalSeconds: 0,
      damageDealt: 0,
      damageTaken: 0,
      healing: 0,
      itemsUsed: 0,
      superMeter: 0,
      superUsed: 0,
      abilityStates: character.abilities.map((ability) => {
        const [type, value] = ABILITY_COOLDOWNS[ability.id] || ['round', 4];
        return { id: ability.id, type, value, remaining: 0 };
      }),
      effects: {
        overdrive: false,
        overclock: false,
        rootMax: false,
        freeUtility: false,
        firewall: false,
        intercept: false,
        sampleArmed: false,
        lockRounds: 0,
        flashQuestions: 0,
        accuracyDebuff: 0,
        nextTimeBonus: 0,
        nextTimePenalty: 0,
        regenRounds: 0,
        fortifyRounds: 0,
        vanishReduction: 0,
        hitReductions: 0,
        hitReductionValue: 0,
        healBlockRounds: 0,
        superDamageBonus: 0
      },
      lastItem: null,
      utilityHistory: [],
      copiedItem: null,
      echoCopied: false,
      echoCopiesUsed: 0,
      distinctUtilities: [],
      wager: 0,
      wagerProtected: false,
      jackpot: false,
      wagerWins: 0,
      successfulWagerStreak: 0,
      revenantUsed: false,
      vengeanceCharges: 0,
      mirageUsed: false,
      firstFastBonusCount: 0,
      fastCharges: 0,
      storedCharges: 0,
      lowestHp: rules.baseHp
    };
  }

  const testHelpers = Object.freeze({
    idleArenaModel,
    armWager,
    createFighterModel,
    advanceCooldown,
    consumeQueuedFlash,
    canStartRanked,
    botAnswerChance,
    advanceExistingLock,
    recordCompletedOvertime
  });

  function createV16Runtime(deps) {
    if (!Rules) throw new Error('V16Rules is required');
    if (!Learning) throw new Error('V16Learning is required');
    const {
      getState, getRankMatch, setRankMatch, getRankTimer, setRankTimer, els, achievements, appVersion,
      legacyCompetitiveFeatures, helpers
    } = deps;
    const h = helpers;
    const legacyFeatures = legacyCompetitiveFeatures == null
      ? (typeof document !== 'undefined' && document.documentElement?.dataset?.legacyRanked === 'true')
      : Boolean(legacyCompetitiveFeatures);
    let previewCharacterId = null;
    let activeRankTab = 'arena';
    let activeProgressTab = 'glory';
    let activeUtilityCategory = 'attack';
    let eventsBound = false;

    const state = () => getState();
    const match = () => getRankMatch();
    const progress = () => state().account.progress;
    const character = (id) => Rules.CHARACTERS.find((entry) => entry.id === id) || Rules.CHARACTERS[0];
    const selectedCharacter = () => character(progress().selectedCharacter);
    const item = (id) => Rules.UTILITIES.find((entry) => entry.id === id) || null;
    const powerFor = (id) => copyPower(progress().characterPower[id]);
    const fighterCharacter = (fighter) => character(fighter.charId);
    const isAdvancedFighter = (activeFighter) => ['rare', 'epic', 'legendary', 'mythic'].includes(fighterCharacter(activeFighter).rarity);
    const superCost = (activeFighter) => activeFighter.power.super >= (isAdvancedFighter(activeFighter) ? 2 : 3) ? 90 : 100;
    const opponent = (side) => side === 'player' ? match().bot : match().player;
    const fighter = (side) => side === 'player' ? match().player : match().bot;
    const safeText = (node, value) => { if (node) node.textContent = String(value); };

    function rankClockContextActive() {
      const rankedView = document.getElementById('view-ranked');
      const focused = typeof document.hasFocus !== 'function' || document.hasFocus();
      const confirmationOpen = Boolean(document.querySelector('.modal.show'));
      return !document.hidden && focused && !confirmationOpen && (!rankedView || rankedView.classList.contains('active'));
    }

    function runtimeHistorySource(entry) {
      return String(entry && (entry.kind || entry.source || entry.context) || '').toLowerCase();
    }

    function runtimeRankedHistory(entry) {
      return ['ranked', 'battle'].includes(runtimeHistorySource(entry));
    }

    function normalStudyEvidence(card) {
      const history = Array.isArray(card.history) ? card.history : [];
      return history.find((entry) => entry && (entry.time || entry.at || entry.reviewedAt) && !runtimeRankedHistory(entry)) || null;
    }

    function normalizeCardProgress(card) {
      if (!card.studySeenAt) {
        const evidence = normalStudyEvidence(card);
        const hasOnlyRanked = Array.isArray(card.history) && card.history.length && card.history.every(runtimeRankedHistory);
        if (evidence) card.studySeenAt = Number(evidence.time || evidence.at || evidence.reviewedAt);
        else if (!hasOnlyRanked && (card.state === 'known' || card.introducedAt)) card.studySeenAt = Number(card.introducedAt || card.createdAt || Date.now());
      }
      card.peakStudyMastery = clamp(Number(card.peakStudyMastery || 0), 0, 100);
      card.gloryStage = clamp(Math.floor(Number(card.gloryStage || 0)), 0, Rules.MEMORY_POINT_STAGES.length);
    }

    function ensureCharacterPower() {
      const p = progress();
      p.characterPower = p.characterPower && typeof p.characterPower === 'object' ? p.characterPower : {};
      for (const entry of Rules.CHARACTERS) p.characterPower[entry.id] = copyPower(p.characterPower[entry.id]);
    }

    function installExtendedAchievements() {
      const additions = [
        ['study_500_mastered', 'Living Lexicon', 'Reach 500 learned words.', 'positive', 'legendary', 'study', (s) => s.learned >= 500],
        ['study_250_longterm', 'Deep Roots', 'Hold 250 words at 30+ day intervals.', 'positive', 'legendary', 'study', (s) => s.longTerm >= 250],
        ['glory_aurora', 'Pulsar Scholar', 'Earn 6,000 Memory Points.', 'positive', 'mythic', 'study', (s) => s.memoryPoints >= 6000],
        ['hybrid_silver_scholar', 'Two Worlds, One Brain', 'Reach Silver S with 500 learned words.', 'positive', 'legendary', 'hybrid', (s) => s.rankElo >= 1500 && s.learned >= 500],
        ['hybrid_constellation', 'Black Hole Duelist', 'Earn 10,000 Memory Points and reach Platinum S.', 'positive', 'mythic', 'hybrid', (s) => s.rankElo >= 1800 && s.memoryPoints >= 10000],
        ['collection_power_45', 'Full Arsenal', 'Purchase 45 character power nodes.', 'positive', 'mythic', 'collection', (s) => s.characterUpgradeNodes >= 45]
      ];
      for (const [id, title, desc, type, rarity, source, condition] of additions) {
        if (!achievements.some((entry) => entry.id === id)) achievements.push({ id, title, desc, type, rarity, source, condition });
      }
    }

    function normalizeState() {
      const s = state();
      s.schemaVersion = Math.max(16, Number(s.schemaVersion) || 0);
      if (appVersion) s.appVersion = String(appVersion);
      s.profile = s.profile || {};
      s.profile.memoryCalibration = Learning.migrateCalibration(s.profile.memoryCalibration || {});
      s.settings = s.settings || {};
      s.settings.sectionFocus = typeof s.settings.sectionFocus === 'string' ? s.settings.sectionFocus : 'all';
      s.sectionUnlocks = s.sectionUnlocks && typeof s.sectionUnlocks === 'object' ? s.sectionUnlocks : {};
      s.account = s.account || {};
      s.account.progress = s.account.progress || {};
      const allCards = s.books.flatMap((book) => Array.isArray(book.cards) ? book.cards : []);
      for (const card of allCards) {
        Learning.migrateMemoryState(card);
        normalizeCardProgress(card);
      }
      s.sectionUnlocks = Learning.unlockEligibleSections(allCards, s.sectionUnlocks, Date.now()).unlocks;
      if (!legacyFeatures) return;

      const p = s.account.progress;
      p.unlockedCharacters = Array.isArray(p.unlockedCharacters) ? [...new Set(p.unlockedCharacters)] : ['nova'];
      if (!p.unlockedCharacters.includes('nova')) p.unlockedCharacters.unshift('nova');
      p.selectedCharacter = Rules.CHARACTERS.some((entry) => entry.id === p.selectedCharacter) ? p.selectedCharacter : 'nova';
      p.memoryPoints = Math.max(0, Number(p.memoryPoints || 0));
      p.gloryClaims = Array.isArray(p.gloryClaims) ? [...new Set(p.gloryClaims)] : [];
      if (Number(p.gloryClaimsVersion || 0) < 16) {
        p.gloryClaims = [...Rules.migrateGloryClaims(p.gloryClaims, true)];
        p.gloryClaimsVersion = 16;
      } else p.gloryClaims = [...Rules.migrateGloryClaims(p.gloryClaims, false)];
      if (!p.v15CurrencyMigrated) {
        const legacyTokens = Math.max(0, Number(p.trainingTokens || 0));
        p.characterCores = Math.max(0, Number(p.characterCores || 0)) + legacyTokens;
        p.legacyTrainingTokensConverted = legacyTokens;
        p.trainingTokens = 0;
        p.v15CurrencyMigrated = true;
      } else p.characterCores = Math.max(0, Number(p.characterCores || 0));
      const refund = Rules.refundLegacyUpgrades(p);
      Object.assign(p, refund);
      ensureCharacterPower();
      if (!p.memoryMigrationComplete) {
        let total = 0;
        for (const card of allCards) {
          if (!card.studySeenAt) continue;
          const mastery = Math.max(card.peakStudyMastery, Number(card.studyMastery || 0), card.state === 'known' && card.studySeenAt ? 100 : 0);
          const award = Rules.gloryAwardForStudy({ ...card, gloryStage: 0, peakStudyMastery: 0 }, mastery, true);
          card.gloryStage = award.stage;
          card.peakStudyMastery = award.peakStudyMastery;
          total += award.totalForCard;
        }
        p.memoryPoints = Math.max(p.memoryPoints, total);
        p.memoryMigrationComplete = true;
      }
      installExtendedAchievements();
      for (const id of Object.keys(s.achievements.unlocked || {})) grantAchievementReward(id, true);
      syncCharacterUnlocks(true);
    }

    function studyAward(card, result) {
      if (!legacyFeatures) return 0;
      card.studySeenAt = card.studySeenAt || Date.now();
      const p = progress();
      const award = Rules.gloryAwardForStudy(card, result && result.memoryScore != null ? result.memoryScore : Number(card.memoryScore || 0), true);
      card.gloryStage = award.stage;
      card.peakStudyMastery = award.peakStudyMastery;
      p.memoryPoints += award.award;
      syncCharacterUnlocks(true);
      return award.award;
    }

    function studyDays() {
      return Object.values(state().daily || {}).filter((day) => Number(day.reviewsDone || 0) + Number(day.newIntroduced || 0) > 0).length;
    }

    function todayReviews() {
      const day = h.todayLog();
      return Number(day.reviewsDone || 0) + Number(day.newIntroduced || 0);
    }

    function unlockSatisfied(entry) {
      const p = progress();
      const rank = state().account.rank || {};
      const rule = entry.unlock || {};
      if (rule.type === 'starter') return true;
      if (rule.type === 'study-days') return studyDays() >= Number(rule.value || 0);
      if (rule.type === 'memory-points') return p.memoryPoints >= Number(rule.value || 0);
      if (rule.type === 'rank-wins') return Number(rank.wins || 0) >= Number(rule.value || 0);
      if (rule.type === 'achievement') return Boolean(state().achievements.unlocked[rule.value] || state().achievements.unlocked[String(rule.value).replaceAll('-', '_')]);
      if (rule.type === 'daily-reviews') return todayReviews() >= Number(rule.value || 0) || Boolean(state().achievements.unlocked.hundred_reviews_day);
      if (rule.type === 'rank-win-streak') return Number(rank.bestStreak || 0) >= Number(rule.value || 0);
      if (rule.type === 'rank-overtime') return Number(rank.overtime || 0) >= Number(rule.value || 0);
      if (rule.type === 'elo') return Number(rank.peakElo || rank.elo || 0) >= Number(rule.value || 0);
      return false;
    }

    function syncCharacterUnlocks(quiet) {
      const p = progress();
      for (const entry of Rules.CHARACTERS) {
        if (unlockSatisfied(entry) && !p.unlockedCharacters.includes(entry.id)) {
          p.unlockedCharacters.push(entry.id);
          if (!quiet) h.toast('Character unlocked', `${entry.name} joined your roster.`);
        }
      }
      if (!p.unlockedCharacters.includes(p.selectedCharacter)) p.selectedCharacter = 'nova';
    }

    function isUnlocked(id) {
      return progress().unlockedCharacters.includes(id);
    }

    function setRankTab(name) {
      if (!['arena', 'characters', 'power', 'armory', 'road'].includes(name)) name = 'arena';
      activeRankTab = name;
      document.querySelectorAll('[data-rank-tab]').forEach((button) => {
        const active = button.dataset.rankTab === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll('[data-rank-panel]').forEach((panel) => { const active = panel.dataset.rankPanel === name; panel.classList.toggle('active', active); panel.hidden = !active; });
      if (name === 'characters') drawCharacterRadar();
    }

    function setProgressTab(name) {
      if (!['glory', 'achievements'].includes(name)) name = 'glory';
      activeProgressTab = name;
      document.querySelectorAll('[data-progress-tab]').forEach((button) => {
        const active = button.dataset.progressTab === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll('[data-progress-panel]').forEach((panel) => { const active = panel.dataset.progressPanel === name; panel.classList.toggle('active', active); panel.hidden = !active; });
    }

    function bindEvents() {
      if (!legacyFeatures || eventsBound) return;
      eventsBound = true;
      if (!legacyFeatures) return;
      document.getElementById('rankSubtabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-rank-tab]');
        if (button) setRankTab(button.dataset.rankTab);
      });
      document.getElementById('rankSubtabs')?.addEventListener('keydown', (event) => {
        const tabs = [...document.querySelectorAll('[data-rank-tab]')];
        const index = tabs.indexOf(event.target.closest('[data-rank-tab]'));
        if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setRankTab(tabs[next].dataset.rankTab); tabs[next].focus();
      });
      document.getElementById('progressSubtabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-progress-tab]');
        if (button) setProgressTab(button.dataset.progressTab);
      });
      document.getElementById('progressSubtabs')?.addEventListener('keydown', (event) => {
        const tabs = [...document.querySelectorAll('[data-progress-tab]')];
        const index = tabs.indexOf(event.target.closest('[data-progress-tab]'));
        if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setProgressTab(tabs[next].dataset.progressTab); tabs[next].focus();
      });
      els.characterRosterRail?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-character-preview]');
        if (!button) return;
        previewCharacterId = button.dataset.characterPreview;
        renderCharacters();
        renderPower();
      });
      document.querySelector('.v15-mobile-character-switch')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-character-mobile-view]');
        if (!button) return;
        const view = button.dataset.characterMobileView;
        document.querySelector('.v15-character-layout')?.setAttribute('data-mobile-view', view);
        document.querySelectorAll('[data-character-mobile-view]').forEach((entry) => { const active = entry === button; entry.classList.toggle('active', active); entry.setAttribute('aria-pressed', active ? 'true' : 'false'); });
        if (view === 'stats') drawCharacterRadar();
      });
      els.selectCharacterBtn?.addEventListener('click', () => {
        const id = previewCharacterId || progress().selectedCharacter;
        if (!isUnlocked(id)) return h.toast('Character locked', character(id).unlock.label);
        progress().selectedCharacter = id;
        h.saveState();
        renderRanked();
        h.toast('Character selected', character(id).name);
      });
      els.characterUpgradeTree?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-power-track]');
        if (button) purchaseUpgrade(button.dataset.powerCharacter, button.dataset.powerTrack);
      });
      els.armoryGroups?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-armory-category]');
        if (button) { activeUtilityCategory = button.dataset.armoryCategory; renderArmory(); }
      });
      els.battleUtilityCategories?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-utility-category]');
        if (button) { activeUtilityCategory = button.dataset.utilityCategory; renderItemShop(); }
      });
      els.itemShop?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-item]');
        if (button) useBattleItem('player', button.dataset.item);
      });
      els.battleAbilityBar?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ability]');
        if (button) useAbility('player', button.dataset.ability);
      });
      els.battleStatusStrip?.addEventListener('click', (event) => {
        if (event.target.closest('[data-live-forfeit]')) forfeitMatch();
      });
      els.characterActiveBtn?.addEventListener('click', () => {
        const active = match() && match().player.abilityStates[0];
        if (active) useAbility('player', active.id);
      });
      els.characterSuperBtn?.addEventListener('click', () => useSuper('player'));
      els.wagerButtons?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-wager]');
        if (button) setWager(Number(button.dataset.wager));
      });
      els.gloryRoad?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-glory-claim]');
        if (button) claimGlory(button.dataset.gloryClaim);
      });
      els.achievementSourceFilter?.addEventListener('change', renderAchievements);
      els.rankImportBtn?.addEventListener('click', () => els.rankImportFile?.click());
      window.addEventListener('resize', h.debounce(() => { if (activeRankTab === 'characters') drawCharacterRadar(); }, 100));
      window.addEventListener('blur', pauseClock);
      window.addEventListener('focus', () => { if (match() && rankClockContextActive()) resumeClock(); });
      document.addEventListener('visibilitychange', () => {
        const current = match();
        if (!current) return;
        const active = rankClockContextActive();
        current.clockPaused = !active;
        if (active) current.lastTick = performance.now();
      });
    }

    function activateView(name) {
      if (!legacyFeatures) {
        document.body.classList.remove('v15-hub-mode', 'ranked-mode');
        return;
      }
      document.body.classList.toggle('v15-hub-mode', name === 'ranked' || name === 'achievements');
      if (name === 'ranked') { setRankTab(activeRankTab); renderRanked(); resumeClock(); }
      else pauseClock();
      if (name === 'achievements') { setProgressTab(activeProgressTab); renderProgress(); }
    }

    function currentRadar(entry) {
      const power = powerFor(entry.id);
      const weights = {
        correctDamage: { ability: 0.25, passive: 0.45, super: 0.30 },
        ability: { ability: 0.65, passive: 0.10, super: 0.25 },
        sustain: { ability: 0.10, passive: 0.55, super: 0.35 },
        defense: { ability: 0.10, passive: 0.60, super: 0.30 },
        utility: { ability: 0.40, passive: 0.25, super: 0.35 }
      };
      const values = {};
      for (const axis of Rules.RADAR_AXES) {
        const ratio = Rules.UPGRADE_TRACKS.reduce((sum, track) => sum + (power[track] / 3) * weights[axis][track], 0);
        values[axis] = Math.round(entry.radar[axis] + (entry.maxRadar[axis] - entry.radar[axis]) * ratio);
      }
      return values;
    }

    function renderCharacters() {
      const p = progress();
      const id = previewCharacterId || p.selectedCharacter;
      const entry = character(id);
      const unlocked = isUnlocked(entry.id);
      document.querySelector('.v15-character-layout')?.style.setProperty('--v15-character-accent', entry.color);
      els.characterRosterRail.innerHTML = Rules.CHARACTERS.map((candidate) => {
        const open = isUnlocked(candidate.id);
        return `<button class="v15-roster-card rarity-${h.escAttr(candidate.rarity)} ${candidate.id === id ? 'selected' : ''} ${open ? '' : 'locked'}" data-character-preview="${h.escAttr(candidate.id)}" aria-pressed="${candidate.id === id ? 'true' : 'false'}"><img src="./${h.escAttr(candidate.portrait)}" alt=""><span><b>${h.esc(candidate.name)}</b><small>${h.esc(candidate.rarity)} · ${open ? 'Unlocked' : candidate.unlock.label}</small></span></button>`;
      }).join('');
      els.characterPortrait.src = `./${entry.portrait}`;
      els.characterPortrait.alt = entry.name;
      els.characterIdentity.innerHTML = `<span class="v15-rarity rarity-${h.escAttr(entry.rarity)}">${h.esc(entry.rarity)}</span><h3>${h.esc(entry.name)}</h3><p>${h.esc(entry.summary)}</p><div class="v15-damage-multiplier"><b>${Math.round(entry.damageMultiplier * 100)}%</b><span>correct dmg</span></div><small>${unlocked ? 'Unlocked' : `Unlock: ${h.esc(entry.unlock.label)}`}</small>`;
      els.selectCharacterBtn.disabled = !unlocked || p.selectedCharacter === entry.id;
      els.selectCharacterBtn.textContent = !unlocked ? 'Locked' : p.selectedCharacter === entry.id ? 'Selected' : 'Use character';
      const skill = (kind, value) => `<article class="v15-kit-card ${kind}"><div><span>${kind}</span><b>${h.esc(value.name)}</b></div><p>${h.esc(value.description)}</p><small>Reset: ${h.esc(value.reset)}</small></article>`;
      els.characterKit.innerHTML = `<div class="v15-kit-heading"><div><h3>Complete kit</h3><p>${entry.abilities.length} abilities · ${entry.passives.length} passive${entry.passives.length > 1 ? 's' : ''} · 1 super</p></div></div><div class="v15-kit-list" tabindex="0" role="region" aria-label="${h.escAttr(entry.name)} abilities, passives, and Super">${entry.abilities.map((value) => skill('ability', value)).join('')}${entry.passives.map((value) => skill('passive', value)).join('')}${skill('super', entry.super)}</div>`;
      drawCharacterRadar();
    }

    function drawCharacterRadar() {
      const canvas = els.characterRadar;
      if (!canvas || !canvas.getContext) return;
      const entry = character(previewCharacterId || progress().selectedCharacter);
      const current = currentRadar(entry);
      const context = canvas.getContext('2d');
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const cssWidth = Math.max(260, canvas.clientWidth || 360);
      const cssHeight = Math.max(240, canvas.clientHeight || 300);
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      const cx = cssWidth / 2, cy = cssHeight / 2 + 2, radius = Math.min(cssWidth, cssHeight) * 0.34;
      const labels = { correctDamage: 'Correct dmg', ability: 'Ability', sustain: 'Sustain', defense: 'Defense', utility: 'Utility' };
      const points = (values, scale = 1) => Rules.RADAR_AXES.map((axis, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / Rules.RADAR_AXES.length;
        const distance = radius * clamp(values[axis] / 100, 0, 1) * scale;
        return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance];
      });
      context.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring += 1) {
        const ringPoints = points(Object.fromEntries(Rules.RADAR_AXES.map((axis) => [axis, 100])), ring / 4);
        context.beginPath(); ringPoints.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath();
        context.strokeStyle = 'rgba(78,85,126,.18)'; context.stroke();
      }
      function polygon(values, fill, stroke) {
        const polygonPoints = points(values);
        context.beginPath(); polygonPoints.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath();
        context.fillStyle = fill; context.fill(); context.lineWidth = 2; context.strokeStyle = stroke; context.stroke();
      }
      polygon(entry.maxRadar, 'rgba(122,111,255,.08)', 'rgba(122,111,255,.35)');
      polygon(current, `${entry.color}30`, entry.color);
      context.font = '700 11px system-ui, sans-serif'; context.fillStyle = '#596078'; context.textAlign = 'center';
      Rules.RADAR_AXES.forEach((axis, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / Rules.RADAR_AXES.length;
        const x = cx + Math.cos(angle) * radius * 1.24;
        const y = cy + Math.sin(angle) * radius * 1.18 + 4;
        context.fillText(`${labels[axis]} ${current[axis]}`, x, y);
      });
      els.characterRadarLegend.innerHTML = `<span style="--legend:${h.escAttr(entry.color)}"><i></i>Current</span><span><i></i>Fully upgraded</span>`;
    }

    function renderPower() {
      const id = previewCharacterId || progress().selectedCharacter;
      const entry = character(id);
      const current = powerFor(id);
      els.powerCharacterSummary.innerHTML = `<img src="./${h.escAttr(entry.portrait)}" alt=""><span><b>${h.esc(entry.name)} · ${current.ability + current.passive + current.super}/9</b><small>${progress().characterCores} Character Cores available</small></span>`;
      els.characterUpgradeTree.innerHTML = Rules.UPGRADE_TRACKS.map((track) => {
        const nodes = entry.upgrades.filter((node) => node.track === track);
        return `<section class="v15-upgrade-track"><header><span>${track}</span><b>Level ${current[track]}/3</b></header>${nodes.map((node) => {
          const bought = current[track] >= node.level;
          const available = current[track] + 1 === node.level;
          return `<article class="v15-upgrade-node ${bought ? 'bought' : available ? 'available' : 'locked'}"><span class="v15-node-level">${node.level}</span><div><b>${h.esc(node.name)}</b><p>${h.esc(node.description)}</p><small>${node.mechanical ? 'Mechanism upgrade' : 'Power upgrade'}</small></div><button class="btn btn-mini ${available ? 'btn-primary' : ''}" data-power-character="${h.escAttr(id)}" data-power-track="${track}" ${available && progress().characterCores >= node.cost ? '' : 'disabled'}>${bought ? 'Owned' : `${node.cost} Cores`}</button></article>`;
        }).join('')}</section>`;
      }).join('');
    }

    function purchaseUpgrade(id, track) {
      if (!isUnlocked(id)) return h.toast('Character locked', character(id).unlock.label);
      const level = powerFor(id)[track];
      const cost = Rules.upgradeCost(id, track, level);
      if (cost == null) return h.toast('Track complete', `${track} is already level 3.`);
      if (progress().characterCores < cost) return h.toast('Not enough Character Cores', `This node costs ${cost}.`);
      progress().characterCores -= cost;
      progress().characterPower[id][track] = level + 1;
      state().profile.totals.upgradesPurchased = Number(state().profile.totals.upgradesPurchased || 0) + 1;
      h.saveState(); h.checkAchievements(); renderRanked(); renderProgress();
      h.toast('Power increased', `${character(id).name} ${track} is now level ${level + 1}.`);
    }

    function renderArmory() {
      const categories = Object.values(Rules.UTILITY_CATEGORIES);
      els.armoryGroups.innerHTML = `<div class="v15-armory-tabs" aria-label="Armory category">${categories.map((category) => `<button class="v15-armory-tab ${category.id === activeUtilityCategory ? 'active' : ''}" data-armory-category="${category.id}" aria-pressed="${category.id === activeUtilityCategory ? 'true' : 'false'}">${category.name}</button>`).join('')}</div>${categories.map((category) => `<section class="v15-armory-category ${category.id === activeUtilityCategory ? 'active' : ''}"><header><h3>${category.name}</h3><p>${category.description}</p></header><div class="v15-armory-grid" tabindex="0" role="region" aria-label="${category.name} utilities">${category.items.map((entry) => `<article class="v15-armory-card"><span>${entry.code}</span><div><b>${entry.name}</b><p>${entry.description}</p></div><strong>${entry.cost} BC</strong></article>`).join('')}</div></section>`).join('')}`;
    }

    function renderRankRoad() {
      const rank = state().account.rank;
      const current = Rules.rankBandForElo(rank.elo);
      els.rankRoadLadder.innerHTML = Rules.RANK_BANDS.map((band) => `<article class="v15-road-rank ${band.id === current.id ? 'active' : ''}"><span class="rank-medal ${rankClassForBand(band)}"></span><div><b>${band.name}</b><small>${band.description}</small></div><div><span>${band.min}${Number.isFinite(band.max) ? `–${band.max}` : '+'} Elo</span><small>${band.durationSeconds}s · ${band.baseHp} HP</small></div></article>`).join('');
      renderHistory();
    }

    function renderHistory() {
      const list = (state().account.rank.history || []).slice(0, 30);
      els.rankHistory.innerHTML = list.length ? list.map((entry) => `<div class="rank-history-item"><span class="rank-medal small ${rankClassForBand(Rules.rankBandForElo(entry.eloAfter || 850))}"></span><span><b>${h.esc(entry.result || 'Match')}</b><br><span class="tiny">${new Date(entry.time).toLocaleString()} · HP ${entry.playerHp ?? '—'}–${entry.botHp ?? '—'} · ${Math.round(Number(entry.playerAccuracy || 0) * 100)}%</span></span><span class="pill ${entry.delta > 0 ? 'ok' : entry.delta < 0 ? 'hot' : 'warn'}">${entry.delta > 0 ? '+' : ''}${entry.delta || 0} Elo</span></div>`).join('') : '<div class="tiny">No matches yet.</div>';
    }

    function rankClassForBand(band) {
      return band.tier === 'S' ? `rank-${band.id}` : `rank-${String(band.tier).replace('+', 'plus')}`;
    }

    function renderRanked() {
      if (!legacyFeatures) return;
      if (!els.rankDisplay) return;
      const rankedViewActive = document.getElementById('view-ranked')?.classList.contains('active');
      document.body.classList.toggle('ranked-mode', Boolean(match() && rankedViewActive));
      syncCharacterUnlocks(true);
      const rank = state().account.rank;
      const progressInfo = Rules.rankProgress(rank.elo);
      const band = progressInfo.band;
      const selected = match() ? fighterCharacter(match().player) : selectedCharacter();
      const bot = match() ? fighterCharacter(match().bot) : botCharacterForElo(rank.elo);
      safeText(els.rankDisplay, band.name);
      safeText(els.rankSubDisplay, `${rank.elo} Elo · peak ${rank.peakElo || rank.elo}`);
      safeText(els.rankEloDisplay, rank.elo);
      safeText(els.trainingTokenDisplay, progress().characterCores);
      const rankedPool = rankCards();
      safeText(els.rankPoolCount, rankedPool.length);
      safeText(els.rankProgressLabel, `${band.name} · ${rank.elo} Elo`);
      safeText(els.rankNextLabel, progressInfo.next ? `${Math.max(0, progressInfo.next.min - rank.elo)} Elo to ${progressInfo.next.name}` : 'Maximum rank reached');
      if (els.rankProgressFill) els.rankProgressFill.style.width = `${progressInfo.percent}%`;
      safeText(els.rankRecord, `${rank.wins || 0}–${rank.losses || 0}${rank.ties ? `–${rank.ties}` : ''}`);
      safeText(els.rankStreak, `${rank.winStreak || 0} · best ${rank.bestStreak || 0}`);
      safeText(els.rankTimeLimit, `${Rules.matchRulesForElo(rank.elo).questionSeconds.toFixed(1)}s`);
      safeText(els.rankPlayerName, state().account.name || 'You');
      safeText(els.rankPlayerLabel, `${band.name} · ${rank.elo} Elo`);
      safeText(els.rankStartBtn, match() ? 'Restart match' : 'Start match');
      if (els.rankStartBtn) {
        els.rankStartBtn.disabled = !match() && !canStartRanked(rankedPool);
        els.rankStartBtn.title = els.rankStartBtn.disabled ? 'Study at least 5 words before entering Ranked.' : '';
      }
      if (els.rankAccountName) els.rankAccountName.value = state().account.name || '';
      [els.rankPlayerBadge, els.accountRankBadge].forEach((badge) => { if (badge) badge.className = `rank-medal ${rankClassForBand(band)}`; });
      if (els.rankTopPill) els.rankTopPill.innerHTML = `<span class="mini-rank ${rankClassForBand(band)}"></span>`;
      if (els.playerCharAvatar) { els.playerCharAvatar.src = `./${selected.portrait}`; els.playerCharAvatar.alt = selected.name; }
      if (els.botCharAvatar) { els.botCharAvatar.src = `./${bot.portrait}`; els.botCharAvatar.alt = bot.name; }
      if (match()) {
        const botBand = Rules.rankBandForElo(match().bot.elo);
        els.rankBotBadge.className = `rank-medal ${rankClassForBand(botBand)}`;
        safeText(els.rankBotName, botNameForElo(match().bot.elo));
        safeText(els.rankBotLabel, `${botBand.name} · ${match().bot.elo} Elo`);
      } else {
        els.rankBotBadge.className = `rank-medal ${rankClassForBand(band)}`;
        safeText(els.rankBotName, 'Adaptive AI'); safeText(els.rankBotLabel, 'Matched near your Elo');
      }
      renderCharacters(); renderPower(); renderArmory(); renderRankRoad(); renderBattle(); setRankTab(activeRankTab);
    }

    function achievementSource(entry) {
      if (entry.source) return entry.source;
      if (['character_collector', 'first_upgrade'].includes(entry.id)) return 'collection';
      if (entry.id.startsWith('rank_') || ['silver_s', 'gold_s', 'platinum_s', 'diamond_s', 'demon_s', 'overtime', 'overtime_three', 'win_streak_5', 'perfect_arena', 'utility_user', 'comeback_king'].includes(entry.id)) return 'ranked';
      return 'study';
    }

    function achievementReward(id) {
      const achievement = achievements.find((entry) => entry.id === id);
      if (achievement && ['funny', 'negative'].includes(achievement.type)) return 0;
      const legacy = {
        first_import: 8, first_review: 5, rank_first: 8, rank_first_win: 15, seven_streak: 20,
        no_hint_hero: 30, hundred_reviews_day: 40, win_streak_5: 55, rank_a: 70,
        export_safe: 5, rank_export: 5, training_75: 20, overtime_three: 45,
        training_century: 25, first_upgrade: 20, character_collector: 40, perfect_arena: 35,
        utility_user: 15, comeback_king: 50,
        study_500_mastered: 90, study_250_longterm: 100, glory_aurora: 160,
        hybrid_silver_scholar: 110, hybrid_constellation: 220, collection_power_45: 180,
        demon_s: 180
      };
      return Number(legacy[id] || 0);
    }

    function grantAchievementReward(id, quiet) {
      const rewards = state().achievements.claimedRewards || (state().achievements.claimedRewards = {});
      if (rewards[id]) return false;
      const cores = achievementReward(id);
      const characterRewards = { rank_first_win: 'lumen', seven_streak: 'mender', no_hint_hero: 'echo', hundred_reviews_day: 'root', win_streak_5: 'ace', rank_a: 'aegis', training_75: 'volt' };
      let changed = false;
      if (cores) { progress().characterCores += cores; changed = true; }
      const characterId = characterRewards[id];
      if (characterId && !progress().unlockedCharacters.includes(characterId)) { progress().unlockedCharacters.push(characterId); changed = true; }
      if (changed) rewards[id] = Date.now();
      if (changed && !quiet) h.toast('Achievement reward', `${cores ? `+${cores} Character Cores` : ''}${characterId ? ` · ${character(characterId).name} unlocked` : ''}`);
      return changed;
    }

    function achievementRewardText(id) {
      const cores = achievementReward(id);
      const characterRewards = { rank_first_win: 'lumen', seven_streak: 'mender', no_hint_hero: 'echo', hundred_reviews_day: 'root', win_streak_5: 'ace', rank_a: 'aegis', training_75: 'volt' };
      const parts = [];
      if (cores) parts.push(`+${cores} Character Cores`);
      if (characterRewards[id]) parts.push(`Unlock ${character(characterRewards[id]).name}`);
      return parts.join(' · ') || 'Badge only';
    }

    function achievementStats() {
      h.recordSessionMinutes(false);
      const counts = h.counts();
      const day = h.todayLog();
      const totals = state().profile.totals || {};
      const rank = state().account.rank || {};
      const days = studyDays();
      const maxBookCards = Math.max(0, ...state().books.map((book) => book.cards.filter((card) => !card.deleted).length));
      const reviewsToday = Number(day.reviewsDone || 0) + Number(day.newIntroduced || 0);
      const correctToday = Number(day.correct || 0) + Number(day.know || 0);
      const characterUpgradeNodes = Object.values(progress().characterPower).reduce((sum, value) => sum + value.ability + value.passive + value.super, 0);
      return {
        totalCards: h.totalCards(), maxBookCards, imports: totals.imports || 0, totalReviews: totals.reviews || 0,
        todayReviews: reviewsToday, todayNew: day.newIntroduced || 0, todayAgain: day.wrong || 0,
        todayHints: day.hints || 0, todayInstant: day.know || 0, todayMinutes: day.minutes || 0,
        knownBefore: totals.knownBefore || 0, studyDays: days, books: state().books.length, exports: totals.exports || 0,
        backupImports: totals.backupImports || 0, dueAll: counts.dueAll, reviewCap: h.effectiveReviewLimit(),
        hints: totals.hints || 0, hard: totals.correct || 0, again: totals.wrong || 0,
        earlyStudy: Boolean(state().profile.flags.earlyStudy), lateStudy: Boolean(state().profile.flags.lateStudy),
        mobileStudy: Boolean(state().profile.flags.mobileStudy), typedCorrect: totals.typedCorrect || 0,
        heldBack: h.backlogHeld(), sampleLoaded: Boolean(state().profile.flags.sampleLoaded), answersShown: totals.answersShown || 0,
        suspended: totals.suspended || 0, learned: counts.learned + counts.known, longTerm: counts.longTerm + counts.known,
        todayAccuracy: reviewsToday ? correctToday / reviewsToday : 0,
        rankTier: rank.tier || 'D', rankStars: rank.sStars || 0, rankMatches: rank.matches || 0,
        rankWins: rank.wins || 0, rankLosses: rank.losses || 0, rankOvertime: rank.overtime || 0,
        rankBestStreak: rank.bestStreak || 0, rankExports: totals.rankExports || 0,
        lifetimeTrainingTokens: progress().memoryPoints, upgradesPurchased: totals.upgradesPurchased || 0,
        charactersUnlocked: progress().unlockedCharacters.length, perfectMatches: totals.perfectMatches || 0,
        itemsUsed: totals.itemsUsed || 0, comebackWins: totals.comebackWins || 0,
        rankElo: rank.elo || 850, memoryPoints: progress().memoryPoints, characterUpgradeNodes
      };
    }

    function renderAchievements() {
      if (!legacyFeatures) return;
      if (!els.achievementGrid) return;
      const filter = els.achievementFilter?.value || 'all';
      const source = els.achievementSourceFilter?.value || 'all';
      const unlocked = state().achievements.unlocked || {};
      let list = achievements.slice();
      if (source !== 'all') list = list.filter((entry) => achievementSource(entry) === source);
      if (filter === 'unlocked') list = list.filter((entry) => unlocked[entry.id]);
      else if (filter === 'locked') list = list.filter((entry) => !unlocked[entry.id]);
      else if (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].includes(filter)) list = list.filter((entry) => entry.rarity === filter);
      else if (['positive', 'funny', 'negative'].includes(filter)) list = list.filter((entry) => entry.type === filter);
      const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
      list.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity) || a.title.localeCompare(b.title));
      const renderCard = (entry) => `<article class="ach-card ${unlocked[entry.id] ? 'unlocked' : ''} rarity-${entry.rarity}"><div class="row" style="justify-content:space-between"><span class="ach-medal badge-${entry.rarity}"></span><span class="ach-tag ach-${entry.rarity}">${entry.rarity}</span></div><div class="ach-title">${h.esc(entry.title)}</div><div class="tiny">${h.esc(entry.desc)}</div><div class="v15-ach-source">${achievementSource(entry)}</div><div class="achievement-reward"><b>Reward</b><span>${h.esc(achievementRewardText(entry.id))}</span></div><div class="tiny">${unlocked[entry.id] ? `Unlocked ${new Date(unlocked[entry.id]).toLocaleDateString()}` : 'Locked'}</div></article>`;
      els.achievementGrid.innerHTML = list.length ? list.map(renderCard).join('') : '<div class="tiny">No achievements match these filters.</div>';
    }

    function renderGlory() {
      safeText(els.memoryPointDisplay, progress().memoryPoints);
      safeText(els.characterCoreDisplay, progress().characterCores);
      const levels = Rules.GLORY_LEVELS;
      const currentIndex = levels.reduce((last, level, index) => progress().memoryPoints >= level.threshold ? index : last, -1);
      const next = levels.find((level) => progress().memoryPoints < level.threshold) || null;
      els.glorySummary.innerHTML = `<div><span class="v15-eyebrow">DEDICATION LEVEL</span><h3>${currentIndex >= 0 ? levels[currentIndex].name : 'Unranked'}</h3><p>${next ? `${next.threshold - progress().memoryPoints} MP to ${next.name}` : 'Glory Road complete'}</p></div><div class="v15-glory-progress"><span style="width:${next ? clamp(progress().memoryPoints / next.threshold * 100, 0, 100) : 100}%"></span></div>`;
      els.gloryRoad.innerHTML = levels.map((level, index) => {
        const reached = progress().memoryPoints >= level.threshold;
        const claimed = progress().gloryClaims.includes(level.id);
        return `<article class="v15-glory-card ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}"><span class="v15-glory-index">${index + 1}</span><img src="./${h.escAttr(level.image)}" alt=""><div><b>${h.esc(level.name)}</b><p>${h.esc(level.description)}</p><small>${level.threshold} MP · ${level.coreReward} Cores</small></div><button class="btn btn-mini ${reached && !claimed ? 'btn-primary' : ''}" data-glory-claim="${level.id}" ${reached && !claimed ? '' : 'disabled'}>${claimed ? 'Claimed' : reached ? 'Claim' : 'Locked'}</button></article>`;
      }).join('');
    }

    function claimGlory(id) {
      const level = Rules.GLORY_LEVELS.find((entry) => entry.id === id);
      if (!level || progress().memoryPoints < level.threshold || progress().gloryClaims.includes(id)) return;
      progress().gloryClaims.push(id);
      progress().characterCores += level.coreReward;
      h.saveState(); renderProgress(); renderRanked();
      h.toast(`${level.name} reached`, `+${level.coreReward} Character Cores`);
    }

    function renderProgress() {
      if (!legacyFeatures) return;
      renderGlory(); renderAchievements(); setProgressTab(activeProgressTab);
    }

    function renderTodayStrip() {
      const counts = h.counts();
      if (!els.todayStrip) return;
      els.todayStrip.innerHTML = `<span class="pill cool">${h.todayKey()}</span><span class="pill ${h.dailyNewRemaining() ? 'ok' : 'warn'}">New ${h.dailyNewRemaining()}</span><span class="pill ${h.dailyReviewRemaining() ? 'ok' : 'hot'}">Review ${h.dailyReviewRemaining()}</span><span class="pill ${counts.dueAll > h.effectiveReviewLimit() ? 'hot' : 'cool'}">Due ${counts.dueAll}</span>`;
    }

    function renderStats() {
      const counts = h.counts(), day = h.todayLog(), adaptive = h.adaptiveModel(), rank = state().account.rank;
      const learnedTotal = counts.learned + counts.known;
      const longTermTotal = counts.longTerm + counts.known;
      const coreValues = [
        ['Book cards', counts.total, h.percent(counts.total, Math.max(1, state().settings.targetTotal)), `${counts.active} active · ${counts.known} known`],
        ['Learned', learnedTotal, h.percent(learnedTotal, Math.max(1, counts.total - counts.suspended)), `${counts.unseen} unseen`],
        ['Recall calibration', `${Math.round((adaptive.accuracyEMA || 0) * 100)}%`, Math.round((adaptive.accuracyEMA || 0) * 100), `${adaptive.samples || 0} samples`],
        ['Reviews today', day.reviewsDone, h.percent(day.reviewsDone, Math.max(1, h.effectiveReviewLimit())), `${counts.dueAll} currently due`],
        ['Long-term', longTermTotal, h.percent(longTermTotal, Math.max(1, counts.total - counts.suspended)), '30+ day interval or explicitly known']
      ];
      const legacyValues = legacyFeatures ? [
        ['Memory Points', progress().memoryPoints, Math.min(100, progress().memoryPoints / 100), 'lifetime dedication'],
        ['Character Cores', progress().characterCores, Math.min(100, progress().characterCores), 'spendable power currency'],
        ['Rank Elo', rank.elo || 850, h.percent((rank.elo || 850) - 600, 1600), Rules.rankBandForElo(rank.elo).name]
      ] : [];
      const values = [...coreValues, ...legacyValues];
      els.statGrid.innerHTML = values.map(([label, number, bar, sub]) => `<div class="stat"><div class="num">${number}</div><div class="label">${label}</div><div class="statbar"><span style="width:${clamp(bar, 0, 100)}%"></span></div><div class="tiny">${h.esc(sub)}</div></div>`).join('');
      h.renderHardWords(); h.renderBookBars(); h.renderDeck();
    }

    function rankCards() {
      const now = Date.now();
      return h.cards().filter(Rules.isRankEligible).map((card) => ({
        card,
        weight: 12 + (card.state === 'known' ? 4 : h.reviewUtility(card, now)) + (1 - h.predictRecall(card, now)) * 35 + Math.random() * 12
      })).sort((a, b) => b.weight - a.weight).slice(0, 48).map((entry) => entry.card);
    }

    function botCharacterForElo(elo) {
      const ids = elo < 1000 ? ['nova', 'mender'] : elo < 1300 ? ['nova', 'mender', 'volt', 'lumen'] : elo < 1600 ? ['volt', 'lumen', 'echo', 'root'] : elo < 1950 ? ['root', 'ace', 'mirage', 'aegis'] : ['ace', 'mirage', 'aegis', 'revenant'];
      return character(ids[Math.floor(Math.random() * ids.length)]);
    }

    function botNameForElo(elo) {
      const names = ['Mnemonic Goblin', 'Quizlet Ghost', 'Dictionary Droid', 'Etymology Imp', 'SAT Gremlin', 'Curve Crusher', 'Anki Android', 'Syntax Wraith'];
      return names[Math.abs(Math.floor(Number(elo || 0) / 100)) % names.length];
    }

    function botEloForMatch() {
      const player = state().account.rank.elo || 850;
      const spread = player < 1100 ? 55 : player < 1500 ? 70 : 90;
      return clamp(Math.round(player + (Math.random() * 2 - 1) * spread), 650, 2400);
    }

    function botPower(elo) {
      const level = clamp(Math.floor((elo - 850) / 350), 0, 3);
      return { ability: level, passive: Math.max(0, level - 1), super: Math.max(0, level - 1) };
    }

    function startMatch() {
      if (match()) { forfeitMatch(); return; }
      const pool = rankCards();
      if (!canStartRanked(pool)) return h.toast('Need studied words', 'Study at least 5 words before Ranked. Imported but unseen words are excluded.');
      clearInterval(getRankTimer());
      const playerElo = state().account.rank.elo || 850;
      const botElo = botEloForMatch();
      const rules = Rules.matchRulesForElo(playerElo);
      const playerCharacter = selectedCharacter();
      const botCharacter = botCharacterForElo(botElo);
      setRankMatch({
        cards: pool, idx: 0, round: 0, phase: 'ready', startedAt: Date.now(), lastTick: performance.now(),
        clockPaused: !rankClockContextActive(), matchRemaining: rules.durationSeconds, matchTotal: rules.durationSeconds,
        regulationSeconds: rules.durationSeconds, overtimeSeconds: rules.overtimeSeconds, questionRemaining: 0,
        questionLimit: rules.questionSeconds, pendingResult: null, pendingTimedOut: false, pendingElapsed: 0,
        resolved: false, resolvedRounds: 0, activeQuestionSeconds: 0,
        overtime: false, overtimeCounted: false, events: [],
        player: createFighterModel('player', playerCharacter, playerElo, powerFor(playerCharacter.id), rules),
        bot: createFighterModel('bot', botCharacter, botElo, botPower(botElo), rules),
        botAnswer: null, lastPlayer: '—', lastBot: '—'
      });
      activeRankTab = 'arena';
      beginQuestion(); startTimer(); h.saveState(); renderRanked();
      requestAnimationFrame(() => els.battleWord?.focus({ preventScroll: true }));
    }

    function beginQuestion() {
      const current = match();
      if (!current) return;
      current.round += 1;
      current.idx = (current.round - 1) % current.cards.length;
      current.pendingResult = null; current.pendingTimedOut = false; current.pendingElapsed = 0; current.resolved = false; current.matchExpiredPending = false;
      const lockAtWindowStart = new Map([[current.player, current.player.effects.lockRounds], [current.bot, current.bot.effects.lockRounds]]);
      // The bot acts in the same between-round window as the player, before the
      // next word becomes answerable.
      if (current.round > 1) botTacticalTurn();
      if (match() !== current) return;
      for (const activeFighter of [current.player, current.bot]) {
        activeFighter.effects.lockRounds = advanceExistingLock(activeFighter.effects.lockRounds, lockAtWindowStart.get(activeFighter));
      }
      current.playerFlashUntil = consumeQueuedFlash(current.player.effects) ? Date.now() + 3000 : 0;
      current.botFlashed = consumeQueuedFlash(current.bot.effects);
      const rules = Rules.matchRulesForElo(current.player.elo);
      const overtimeScale = current.overtime ? 0.72 : 1;
      const bonus = current.player.effects.nextTimeBonus || 0;
      const penalty = current.player.effects.nextTimePenalty || 0;
      const botBonus = current.bot.effects.nextTimeBonus || 0;
      const botPenalty = current.bot.effects.nextTimePenalty || 0;
      current.player.effects.nextTimeBonus = 0; current.player.effects.nextTimePenalty = 0;
      current.bot.effects.nextTimeBonus = 0; current.bot.effects.nextTimePenalty = 0;
      current.questionLimit = clamp(rules.questionSeconds * overtimeScale + bonus - penalty, current.overtime ? 2.8 : 3.5, 12);
      current.botQuestionLimit = clamp(rules.questionSeconds * overtimeScale + botBonus - botPenalty, current.overtime ? 2.8 : 3.5, 12);
      current.questionRemaining = current.questionLimit;
      current.botAnswer = chooseBotAnswer(current.cards[current.idx]);
      current.phase = 'question';
      renderBattle();
    }

    function startTimer() {
      clearInterval(getRankTimer());
      if (!match()) return;
      match().lastTick = performance.now();
      setRankTimer(setInterval(tick, 100));
    }

    function tick() {
      const current = match();
      if (!current) return;
      const now = performance.now();
      const delta = Math.min(0.35, Math.max(0, (now - current.lastTick) / 1000));
      current.lastTick = now;
      const clock = Rules.advanceRankClock(current, delta, rankClockContextActive());
      if (clock.advanced > 0) {
        if (current.playerFlashUntil && current.playerFlashUntil <= Date.now()) {
          current.playerFlashUntil = 0;
          els.flashOverlay?.classList.remove('show');
        }
      }
      if (current.phase === 'question' && (clock.questionExpired || clock.matchExpired)) {
        current.matchExpiredPending = clock.matchExpired;
        rateQuestion('wrong', true);
        renderMeters();
        return;
      }
      if (clock.advanced > 0) renderMeters();
    }

    function pauseClock() { if (match()) match().clockPaused = true; }
    function resumeClock() { if (match()) { match().clockPaused = !rankClockContextActive(); match().lastTick = performance.now(); } }

    function rateQuestion(result, timedOut) {
      const current = match();
      if (!current || !['question', 'confirm'].includes(current.phase) || current.resolved) return;
      result = result === 'correct' ? 'correct' : 'wrong';
      if (current.pendingTimedOut && !timedOut) return h.toast('Time expired', 'The timed-out answer is locked as Wrong.');
      if (current.phase === 'question') {
        current.pendingElapsed = clamp(current.questionLimit - current.questionRemaining, 0, current.questionLimit);
        current.phase = 'confirm';
      }
      current.pendingResult = result; current.pendingTimedOut = Boolean(timedOut); renderBattle();
    }

    function nextQuestion() {
      const current = match();
      if (!current) return;
      if (current.phase === 'confirm') { if (current.pendingResult) resolveRound(); return; }
      if (current.phase === 'between') { if (current.matchRemaining <= 0) finishMatch('clock'); else beginQuestion(); return; }
      h.toast('Choose Wrong or Correct', 'Inspect the answer before confirming.');
    }

    function chooseBotAnswer(card) {
      const current = match();
      const bot = current.bot;
      const botLimit = current.botQuestionLimit || current.questionLimit;
      const profile = Rules.botProfileForElo(bot.elo);
      const answer = Rules.chooseBotAnswer(profile, card, {
        questionLimit: botLimit,
        memory: h.predictRecall(card, Date.now()),
        accuracyDebuff: bot.effects.accuracyDebuff || 0,
        flashed: current.botFlashed,
        rootMax: bot.effects.rootMax
      });
      bot.effects.accuracyDebuff = 0;
      return answer;
    }

    function advanceFighterCooldowns(activeFighter, type, amount) {
      activeFighter.abilityStates = activeFighter.abilityStates.map((cooldown) => advanceCooldown(cooldown, type, amount));
    }

    function characterDamageMultiplier(activeFighter) {
      const entry = fighterCharacter(activeFighter);
      const total = activeFighter.power.ability + activeFighter.power.passive + activeFighter.power.super;
      return entry.damageMultiplier + (entry.maxDamageMultiplier - entry.damageMultiplier) * total / 9;
    }

    function calculateAttack(activeFighter, correct, elapsed, limit, card) {
      if (!correct) return 0;
      const speed = activeFighter.effects.rootMax ? 1 : clamp(1 - elapsed / Math.max(0.4, limit), 0, 1);
      const difficulty = clamp(0.25 + Number(card.difficulty || 0.35) * 0.45 + (1 - h.predictRecall(card, Date.now())) * 0.3, 0.2, 1);
      let damage = (6 + speed * 7 + Math.min(4, activeFighter.streak * 0.75) + difficulty * 3) * characterDamageMultiplier(activeFighter);
      if (elapsed <= 3) damage += 1.5;
      if (activeFighter.charId === 'nova' && activeFighter.correct > 0 && activeFighter.correct % 3 === 0) { damage += 3 + activeFighter.power.passive; activeFighter.credits += 1; }
      if (activeFighter.charId === 'volt') {
        if (elapsed < 4 + (activeFighter.power.passive >= 3 ? 0.5 : 0)) activeFighter.fastCharges += 1;
        if (activeFighter.fastCharges >= 2) { damage += 5 + activeFighter.power.passive; activeFighter.fastCharges = 0; }
      }
      if (activeFighter.charId === 'lumen' && elapsed < (activeFighter.power.passive >= 2 ? 3.5 : 3) && activeFighter.firstFastBonusCount < (activeFighter.power.passive >= 1 ? 2 : 1)) { activeFighter.firstFastBonusCount += 1; activeFighter.credits += 2; }
      if (activeFighter.charId === 'mirage' && activeFighter.correct > 0 && activeFighter.correct % 4 === 0) activeFighter.effects.freeUtility = true;
      if (activeFighter.vengeanceCharges > 0) { damage *= 1.2 + activeFighter.power.passive * 0.025; activeFighter.vengeanceCharges -= 1; }
      if (activeFighter.effects.overdrive) { damage *= 1.35 + activeFighter.power.ability * 0.04; activeFighter.effects.overdrive = false; }
      if (activeFighter.effects.overclock) { damage *= 1.7; activeFighter.effects.overclock = false; }
      if (activeFighter.effects.superDamageBonus) { damage *= 1 + activeFighter.effects.superDamageBonus; activeFighter.effects.superDamageBonus = 0; }
      if (activeFighter.wager > 0) {
        const stake = activeFighter.wager; activeFighter.wager = 0;
        damage += stake * (activeFighter.jackpot ? 4 * (1 + activeFighter.power.super * 0.1) : 2) + (activeFighter.power.passive >= 2 ? Math.floor(stake / 2) : 0);
        activeFighter.wagerWins += 1; activeFighter.successfulWagerStreak += 1;
        if (activeFighter.successfulWagerStreak >= 2) { activeFighter.credits += 1; activeFighter.successfulWagerStreak = 0; }
        if (activeFighter.jackpot && activeFighter.power.super >= 2) activeFighter.credits += Math.floor(stake / 2);
        activeFighter.jackpot = false;
      }
      activeFighter.effects.rootMax = false;
      return Math.round(damage * (match().overtime ? 1.2 : 1));
    }

    function addSuper(activeFighter, amount) {
      activeFighter.superMeter = clamp(activeFighter.superMeter + amount, 0, 100);
    }

    function heal(activeFighter, amount) {
      if (activeFighter.effects.healBlockRounds > 0) return 0;
      const before = activeFighter.hp;
      activeFighter.hp = clamp(activeFighter.hp + Math.round(amount), 0, activeFighter.maxHp);
      const actual = activeFighter.hp - before;
      activeFighter.healing += actual;
      if (activeFighter.charId === 'mender' && activeFighter.power.passive >= 3 && amount > actual) activeFighter.shield = Math.min(8, activeFighter.shield + amount - actual);
      return actual;
    }

    function addShield(activeFighter, amount) { activeFighter.shield = Math.max(0, activeFighter.shield + Math.round(amount)); }

    function damage(target, amount, source, options) {
      const config = options || {};
      amount = Math.max(0, Math.round(amount));
      if (!amount) return 0;
      const oneHitReduction = Number(target.effects.vanishReduction || 0);
      const multiHitReduction = target.effects.hitReductions > 0 ? Number(target.effects.hitReductionValue || 0) : 0;
      const activeReduction = Math.max(oneHitReduction, multiHitReduction);
      if (activeReduction > 0) {
        amount = Math.ceil(amount * (1 - activeReduction));
        if (oneHitReduction >= multiHitReduction) target.effects.vanishReduction = 0;
        else target.effects.hitReductions = Math.max(0, target.effects.hitReductions - 1);
      }
      if (target.charId === 'mirage' && !target.mirageUsed && amount > (target.power.passive >= 2 ? 10 : 12)) { amount = Math.ceil(amount / 2); target.mirageUsed = true; }
      if (target.charId === 'aegis' && target.shield > 0 && config.wordAttack) amount = Math.max(0, amount - (3 + (target.power.passive >= 2 ? 1 : 0)));
      if (target.effects.intercept && config.direct) { addShield(target, amount); target.effects.intercept = false; return 0; }
      const absorbed = Math.min(target.shield, amount); target.shield -= absorbed;
      let hpDamage = amount - absorbed;
      if (config.nonLethal) hpDamage = Math.min(hpDamage, Math.max(0, target.hp - 1));
      if (hpDamage >= target.hp && target.charId === 'revenant' && !target.revenantUsed) {
        hpDamage = Math.max(0, target.hp - (target.power.passive >= 1 ? 3 : 1));
        target.revenantUsed = true; target.vengeanceCharges = 2;
      }
      target.hp = Math.max(0, target.hp - hpDamage);
      target.lowestHp = Math.min(target.lowestHp, target.hp);
      target.damageTaken += hpDamage;
      advanceFighterCooldowns(target, 'damage', hpDamage);
      addSuper(target, hpDamage * 0.45);
      if (source) source.damageDealt += hpDamage;
      return hpDamage;
    }

    function wrongPenalties(activeFighter) {
      if (activeFighter.effects.overdrive) { damage(activeFighter, activeFighter.power.ability >= 2 ? 2 : 4, null); activeFighter.effects.overdrive = false; }
      if (activeFighter.effects.overclock) { damage(activeFighter, 5, null); activeFighter.effects.overclock = false; }
      if (activeFighter.wager > 0) {
        const stake = activeFighter.wager; activeFighter.wager = 0; activeFighter.successfulWagerStreak = 0;
        if (activeFighter.wagerProtected) activeFighter.wagerProtected = false;
        else damage(activeFighter, stake, null);
        activeFighter.jackpot = false;
      }
    }

    function afterRound(activeFighter) {
      advanceFighterCooldowns(activeFighter, 'round', 1);
      if (activeFighter.charId === 'mender' && activeFighter.streak > 0 && activeFighter.streak % (activeFighter.power.passive >= 3 ? 2 : 3) === 0) heal(activeFighter, 3 + activeFighter.power.passive);
      if (activeFighter.effects.regenRounds > 0) { heal(activeFighter, 3); activeFighter.effects.regenRounds -= 1; }
      if (activeFighter.effects.fortifyRounds > 0) {
        activeFighter.effects.fortifyRounds -= 1;
        if (!activeFighter.effects.fortifyRounds) { activeFighter.maxHp = activeFighter.baseMaxHp; activeFighter.hp = Math.min(activeFighter.hp, activeFighter.maxHp); }
      }
      if (activeFighter.effects.healBlockRounds > 0) activeFighter.effects.healBlockRounds -= 1;
    }

    function fighterResult(activeFighter, correct, elapsed, limit, card) {
      activeFighter.answered += 1; activeFighter.totalSeconds += elapsed;
      if (correct) {
        activeFighter.correct += 1; activeFighter.streak += 1;
        advanceFighterCooldowns(activeFighter, 'correct', 1);
        addSuper(activeFighter, 14 + (elapsed < 3 ? 3 : 0));
        if (activeFighter.power.passive >= 3 && activeFighter.correct % 5 === 0) {
          activeFighter.abilityStates.forEach((cooldown) => { cooldown.remaining = Math.max(0, cooldown.remaining - 1); });
          addSuper(activeFighter, 5);
          match()?.events.push(`${fighterCharacter(activeFighter).name}'s Mastery Loop advanced every ability.`);
        }
        const attack = calculateAttack(activeFighter, true, elapsed, limit, card);
        activeFighter.credits += clamp(1 + Math.floor((limit - elapsed) / Math.max(1, limit / 3)), 1, 4);
        return { correct: true, damage: attack, elapsed };
      }
      activeFighter.wrong += 1;
      if (!(activeFighter.charId === 'nova' && activeFighter.power.passive >= 3 && !activeFighter.bankedStreak && activeFighter.streak > 0)) activeFighter.streak = 0;
      else { activeFighter.streak = 1; activeFighter.bankedStreak = true; }
      wrongPenalties(activeFighter); addSuper(activeFighter, 6); activeFighter.credits += 1;
      return { correct: false, damage: 0, elapsed };
    }

    function applyRankMemory(card, correct, elapsed) {
      if (!Rules.isRankEligible(card)) return;
      const now = Date.now();
      const rating = correct ? 'correct' : 'wrong';
      const knownSnapshot = card.state === 'known' && correct ? {
        state: card.state,
        dueAt: card.dueAt,
        intervalDays: card.intervalDays,
        stability: card.stability,
        memoryStability: card.memoryStability,
        difficulty: card.difficulty,
        memoryDifficulty: card.memoryDifficulty,
        memoryScore: card.memoryScore,
        studyMastery: card.studyMastery,
        studyReviews: card.studyReviews
      } : null;
      const timing = { seconds: elapsed, rawMs: elapsed * 1000, afk: false, activeMs: elapsed * 1000, hiddenMs: 0, blurMs: 0 };
      const result = Learning.applyReview(card, rating, {
        now,
        source: 'ranked',
        timing,
        hints: 0,
        model: state().profile.memoryCalibration,
        profile: state().settings
      });
      if (knownSnapshot) Object.assign(card, knownSnapshot);
      card.lastReviewedAt = now; card.lastRating = rating; card.reps = Number(card.reps || 0) + 1; card.updatedAt = now;
      card.history.push({ time: now, rating, score: result.score, predBefore: result.predBefore, memoryScore: card.memoryScore, dueAt: card.dueAt, intervalDays: card.intervalDays, stability: card.stability, hints: 0, revealMs: elapsed * 1000, activeSeconds: elapsed, afk: false, kind: 'ranked' });
      card.history = card.history.slice(-80);
    }

    function resolveRound() {
      const current = match();
      if (!current || current.resolved || !current.pendingResult) return false;
      const card = current.cards[current.idx];
      const player = current.player, bot = current.bot;
      const playerCorrect = current.pendingResult === 'correct' && !current.pendingTimedOut;
      const elapsed = current.pendingElapsed || current.questionLimit;
      const botAnswer = current.botAnswer || chooseBotAnswer(card);
      const botLimit = current.botQuestionLimit || current.questionLimit;
      const botCorrect = botAnswer.correct && botAnswer.elapsed <= botLimit;
      const playerResult = fighterResult(player, playerCorrect, elapsed, current.questionLimit, card);
      const botResult = fighterResult(bot, botCorrect, botAnswer.elapsed, botLimit, card);
      const playerDamage = damage(bot, playerResult.damage, player, { wordAttack: true });
      const botDamage = damage(player, botResult.damage, bot, { wordAttack: true });
      afterRound(player); afterRound(bot);
      current.lastPlayer = playerCorrect ? `Correct · ${elapsed.toFixed(1)}s · ${playerDamage} dmg` : `Wrong · ${elapsed.toFixed(1)}s`;
      current.lastBot = botCorrect ? `Bot correct · ${botAnswer.elapsed.toFixed(1)}s · ${botDamage} dmg` : 'Bot wrong';
      current.events.push(`Round ${current.round}: ${current.lastPlayer}; ${current.lastBot}.`);
      current.resolved = true;
      current.resolvedRounds = Number(current.resolvedRounds || 0) + 1;
      current.phase = 'between';
      applyRankMemory(card, playerCorrect, elapsed);
      h.activeBook().updatedAt = Date.now(); h.saveState();
      if (player.hp <= 0 || bot.hp <= 0) finishMatch('knockout');
      else if (current.matchRemaining <= 0 || current.matchExpiredPending) finishMatch('clock');
      else renderBattle();
      return true;
    }

    function abilityState(activeFighter, id) { return activeFighter.abilityStates.find((entry) => entry.id === id); }
    function canUseAbility(activeFighter, id) { const cooldown = abilityState(activeFighter, id); return cooldown && cooldown.remaining <= 0 && activeFighter.effects.lockRounds <= 0; }
    function setAbilityCooldown(activeFighter, id) {
      const cooldown = abilityState(activeFighter, id);
      if (!cooldown) return;
      const reduction = activeFighter.power.ability >= (isAdvancedFighter(activeFighter) ? 2 : 3) ? 1 : 0;
      cooldown.remaining = Math.max(1, cooldown.value - reduction);
      if (activeFighter.power.ability >= 3) addSuper(activeFighter, 10);
    }

    function useAbility(side, id) {
      const current = match();
      if (!current) return side === 'player' && h.toast('Start a match', 'Abilities are used inside Ranked battles.');
      const user = fighter(side), target = opponent(side), entry = fighterCharacter(user);
      if (!entry.abilities.some((ability) => ability.id === id) || !canUseAbility(user, id)) return side === 'player' && h.toast('Ability recharging', 'Meet its reset condition before using it again.');
      if (current.phase === 'question' || current.phase === 'confirm') return side === 'player' && h.toast('Between rounds only', 'Confirm the current word first.');
      switch (id) {
        case 'overdrive': user.effects.overdrive = true; break;
        case 'second-wind': heal(user, user.hp < user.maxHp * 0.35 ? 17 + user.power.ability : 12 + user.power.ability); if (user.power.ability >= 3) cleanse(user); break;
        case 'cleanse': cleanse(user); break;
        case 'siphon': { const stolen = Math.min(4 + (user.power.ability >= 1 ? 1 : 0), target.credits); target.credits -= stolen; user.credits += stolen; break; }
        case 'arc-burst': damage(target, 7 + user.power.ability, user, { direct: true, nonLethal: true }); break;
        case 'flash-prism': target.effects.flashQuestions = Math.max(target.effects.flashQuestions, 1); target.effects.nextTimePenalty += user.power.ability >= 1 ? 1 : 0; break;
        case 'gleam': user.effects.nextTimeBonus += 3 + (user.power.ability >= 2 ? 1 : 0); break;
        case 'replay': if (user.lastItem) applyItem(side, user.lastItem, true, 0.65 + user.power.ability * 0.05); else return side === 'player' && h.toast('Nothing to replay', 'Use a utility first.'); break;
        case 'sample': user.effects.sampleArmed = true; break;
        case 'root-access': user.effects.rootMax = true; break;
        case 'backdoor': user.effects.freeUtility = true; break;
        case 'loaded-dice': user.wagerProtected = true; break;
        case 'mulligan': if (user.wager) { user.credits += user.power.ability >= 2 ? user.wager : Math.floor(user.wager / 2); user.wager = 0; } break;
        case 'false-signal': target.effects.accuracyDebuff = Math.max(target.effects.accuracyDebuff, 0.14); target.effects.flashQuestions = Math.max(target.effects.flashQuestions, 1); break;
        case 'vanish': user.effects.vanishReduction = user.power.ability >= 2 ? 0.45 : 0.35; break;
        case 'bulwark': addShield(user, 14 + user.power.ability); break;
        case 'null-field': target.effects.lockRounds = Math.max(target.effects.lockRounds, user.power.ability >= 2 ? 3 : 2); break;
        case 'intercept': user.effects.intercept = true; break;
        case 'demon-pulse': damage(target, 11 + user.power.ability, user, { direct: true, nonLethal: true }); damage(user, 3, null); break;
        case 'soul-rend': { const missing = 1 - user.hp / user.maxHp; damage(target, 7 + Math.round(missing * (7 + user.power.ability)), user, { direct: true, nonLethal: true }); break; }
        case 'blood-pact': damage(user, 8, null, { nonLethal: true }); user.abilityStates.filter((entryState) => entryState.id !== id).forEach((entryState) => { entryState.remaining = Math.max(0, entryState.remaining - 2); }); if (user.power.ability >= 3) addSuper(user, 20); break;
        default: return;
      }
      setAbilityCooldown(user, id);
      current.events.push(`${entry.name} used ${entry.abilities.find((ability) => ability.id === id).name}.`);
      if (user.hp <= 0 || target.hp <= 0) { finishMatch('knockout'); return; }
      renderBattle();
    }

    function cleanse(activeFighter) {
      activeFighter.effects.accuracyDebuff = 0; activeFighter.effects.flashQuestions = 0; activeFighter.effects.nextTimePenalty = 0; activeFighter.effects.lockRounds = 0;
    }

    function useSuper(side) {
      const current = match(); if (!current) return;
      const user = fighter(side), target = opponent(side), entry = fighterCharacter(user);
      const cost = superCost(user);
      if (user.superMeter < cost || user.effects.lockRounds > 0) return side === 'player' && h.toast('Super not ready', `${cost} meter required.`);
      if (current.phase === 'question' || current.phase === 'confirm') return side === 'player' && h.toast('Between rounds only', 'Confirm the current word first.');
      user.superMeter -= cost; user.superUsed += 1;
      const scale = 1 + user.power.super * 0.1;
      switch (entry.id) {
        case 'nova': damage(target, 16 * scale, user, { direct: true, nonLethal: true }); user.effects.superDamageBonus = 0.25; break;
        case 'mender': heal(user, 22 * scale); addShield(user, 10 + user.power.super * 2); break;
        case 'volt': damage(target, 15 * scale, user, { direct: true, nonLethal: true }); { const stolen = Math.min(2 + (user.power.super >= 2 ? 1 : 0), target.credits); target.credits -= stolen; user.credits += stolen; } break;
        case 'lumen': damage(target, 12 * scale, user, { direct: true, nonLethal: true }); cleanse(user); target.effects.flashQuestions = 1; break;
        case 'echo': {
          const loop = user.utilityHistory.slice(-2);
          loop.forEach((utilityId) => applyItem(side, utilityId, true, 0.55 * scale));
          break;
        }
        case 'root': target.effects.lockRounds = Math.max(target.effects.lockRounds, user.power.super >= 1 ? 3 : 2); user.credits += 6 + user.power.super; break;
        case 'ace': user.jackpot = true; user.wagerProtected = true; break;
        case 'mirage':
          target.abilityStates.forEach((cooldown) => { cooldown.remaining += 2; });
          user.effects.hitReductions = Math.max(user.effects.hitReductions, 2);
          user.effects.hitReductionValue = Math.min(0.55, 0.35 * scale);
          break;
        case 'aegis': addShield(user, 25 + user.power.super * 3); heal(user, 10 + user.power.super * 2); break;
        case 'revenant': { const dealt = damage(target, 18 * scale, user, { direct: true, nonLethal: true }); heal(user, dealt * 0.5 * (user.power.super >= 3 && user.hp < user.maxHp * 0.2 ? 2 : 1)); target.effects.healBlockRounds = user.power.super >= 2 ? 3 : 2; break; }
      }
      if (user.power.super >= 3) user.abilityStates.forEach((cooldown) => { cooldown.remaining = 0; });
      current.events.push(`${entry.name} used ${entry.super.name}.`); renderBattle();
    }

    function utilityCost(activeFighter, utility) {
      if (activeFighter.effects.freeUtility) return 0;
      return Math.max(1, utility.cost - (activeFighter.charId === 'root' ? 1 : 0));
    }

    function applyItem(side, id, free, scale) {
      const current = match(); if (!current) return false;
      const user = fighter(side), target = opponent(side), utility = item(id);
      if (!utility || user.effects.lockRounds > 0) return false;
      const cost = utilityCost(user, utility);
      if (!free && user.credits < cost) return false;
      const paid = free ? 0 : cost;
      if (!free) user.credits -= paid;
      user.effects.freeUtility = false; user.itemsUsed += 1; user.lastItem = id;
      if (target.effects.firewall) {
        target.effects.firewall = false;
        current.events.push(`${fighterCharacter(target).name}'s Firewall blocked ${utility.name}${paid ? `; the attempt still cost ${paid} BC` : ''}.`);
        return true;
      }
      const amount = Number(scale || 1);
      switch (id) {
        case 'patch': heal(user, 12 * amount); break;
        case 'pulse': damage(target, 9 * amount, user, { direct: true, nonLethal: true }); break;
        case 'barrier': addShield(user, 12 * amount); break;
        case 'flash': target.effects.flashQuestions = Math.max(target.effects.flashQuestions, 1); break;
        case 'firewall': user.effects.firewall = true; break;
        case 'chrono': user.effects.nextTimeBonus += 3 * amount; target.effects.nextTimePenalty += 1 * amount; break;
        case 'jammer': target.effects.lockRounds = Math.max(target.effects.lockRounds, 1); break;
        case 'overclock': user.effects.overclock = true; break;
        case 'regen': user.effects.regenRounds = Math.max(user.effects.regenRounds, Math.round(3 * amount)); break;
        case 'fortify': user.maxHp += Math.round(15 * amount); heal(user, 15 * amount); user.effects.fortifyRounds = Math.max(user.effects.fortifyRounds, 3); break;
      }
      user.utilityHistory = user.utilityHistory.filter((utilityId) => utilityId !== id).concat(id).slice(-3);
      if (!user.distinctUtilities.includes(id)) user.distinctUtilities.push(id);
      if (user.charId === 'root' && user.distinctUtilities.length >= 3) { heal(user, 6 + (user.power.passive >= 2 ? 2 : 0)); user.distinctUtilities = []; }
      if (target.charId === 'echo' && id !== 'firewall') {
        if (target.effects.sampleArmed) {
          target.effects.sampleArmed = false; target.copiedItem = id;
          setTimeout(() => { if (match()) applyItem(target.side, id, true, 0.5 + target.power.ability * 0.05); }, 0);
        } else if (target.echoCopiesUsed < (target.power.passive >= 2 ? 2 : 1)) {
          const copyIndex = target.echoCopiesUsed;
          target.echoCopiesUsed += 1; target.echoCopied = true;
          const copyScale = copyIndex === 0 ? 0.45 + target.power.passive * 0.05 : 0.35;
          setTimeout(() => { if (match()) applyItem(target.side, id, true, copyScale); }, 0);
        }
      }
      current.events.push(`${fighterCharacter(user).name} used ${utility.name}.`); return true;
    }

    function useBattleItem(side, id) {
      const current = match();
      if (!current) return side === 'player' && h.toast('Start a match', 'Utilities are purchased inside a battle.');
      if (!['between', 'ready'].includes(current.phase)) return side === 'player' && h.toast('Between rounds only', 'Confirm the current word first.');
      if (!applyItem(side, id, false, 1)) return side === 'player' && h.toast('Utility unavailable', 'Check credits, locks, and Firewall.');
      h.saveState(); renderBattle();
    }

    function setWager(stake) {
      const current = match();
      if (!current || current.player.charId !== 'ace') return h.toast('Ace only', 'Select Ace to wager.');
      if (!['between', 'ready'].includes(current.phase)) return h.toast('Between rounds only', 'Confirm the current word first.');
      const maximum = current.player.power.passive >= 1 ? 7 : 6;
      const result = armWager(current.player, stake, maximum);
      if (!result.ok) return h.toast('Wager rejected', result.reason === 'limit' ? `Maximum wager is ${maximum}.` : result.reason === 'armed' ? 'An armed wager can only be raised. Use Mulligan to cancel it.' : 'Not enough battle credits.');
      current.player.credits = result.credits; current.player.wager = result.wager; renderBattle();
    }

    function botTacticalTurn() {
      const current = match(); if (!current) return;
      const bot = current.bot, player = current.player;
      const decision = Rules.chooseBotActions({
        bot,
        player,
        character: fighterCharacter(bot),
        utilities: Rules.UTILITIES,
        phase: current.phase,
        matchRemaining: current.matchRemaining,
        matchTotal: current.matchTotal,
        superCost: superCost(bot)
      });
      if (decision.wager > 0) {
        const wager = armWager(bot, decision.wager, bot.power.passive >= 1 ? 7 : 6);
        if (wager.ok) { bot.credits = wager.credits; bot.wager = wager.wager; current.events.push(`Ace armed a ${wager.wager} BC wager.`); }
      }
      if (decision.abilityId) useAbility('bot', decision.abilityId);
      if (match() !== current) return;
      if (decision.useSuper) useSuper('bot');
      if (match() !== current) return;
      if (decision.utilityId) applyItem('bot', decision.utilityId, false, 1);
    }

    function eloPerformance(current) {
      const player = current.player, bot = current.bot;
      const health = player.hp / player.maxHp - bot.hp / bot.maxHp;
      const playerAccuracy = player.answered ? player.correct / player.answered : 0;
      const botAccuracy = bot.answered ? bot.correct / bot.answered : 0;
      const throughput = clamp((player.answered / Math.max(1, current.matchTotal - current.matchRemaining) - 0.12) / 0.12, -1, 1);
      const relativeDamage = clamp((player.damageDealt - bot.damageDealt) / Math.max(80, current.player.maxHp), -1, 1);
      return clamp(health * 0.45 + (playerAccuracy - botAccuracy) * 0.28 + throughput * 0.12 + relativeDamage * 0.15, -1, 1);
    }

    function applyElo(result, current) {
      const rank = state().account.rank, old = Number(rank.elo || 850), opponentElo = current.bot.elo;
      const expected = 1 / (1 + Math.pow(10, (opponentElo - old) / 400));
      const score = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5;
      const k = Number(rank.matches || 0) < 20 ? 36 : old >= 1800 ? 20 : 26;
      const performance = eloPerformance(current);
      let delta = Math.round(k * (score - expected) + performance * 6);
      delta = result === 'win' ? clamp(delta, 5, 38) : result === 'loss' ? clamp(delta, -38, -5) : clamp(delta, -9, 9);
      rank.elo = clamp(old + delta, 600, 2800); syncRank(rank); return { old, delta, performance };
    }

    function syncRank(rank) {
      rank.elo = clamp(Math.round(Number(rank.elo) || 850), 600, 2800);
      const band = Rules.rankBandForElo(rank.elo);
      rank.tier = band.tier; rank.sStars = band.tier === 'S' ? Math.max(0, Math.floor((rank.elo - 1500) / 10)) : 0;
      rank.pips = band.tier === 'S' ? 0 : clamp(Math.floor((rank.elo - Math.max(600, band.min)) / Math.max(1, ((band.max - Math.max(600, band.min) + 1) / 3))), 0, 2);
      rank.peakElo = Math.max(Number(rank.peakElo || rank.elo), rank.elo);
      rank.peakTier = Rules.rankBandForElo(rank.peakElo).tier; rank.peakSStars = Math.max(Number(rank.peakSStars || 0), rank.sStars);
      return band;
    }

    function finishMatch(reason, forfeit) {
      const current = match(); if (!current) return;
      clearInterval(getRankTimer());
      const player = current.player, bot = current.bot;
      if (reason === 'clock' && !forfeit && player.hp === bot.hp && !current.overtime) {
        current.overtime = true; current.overtimeCounted = true; current.matchRemaining = current.overtimeSeconds; current.matchTotal += current.overtimeSeconds;
        current.events.push('Sudden death: tied health after regulation.');
        beginQuestion(); startTimer(); renderBattle(); h.toast('Sudden death', `${current.overtimeSeconds} seconds · 20% more damage.`); return;
      }
      const result = forfeit ? 'loss' : player.hp > bot.hp ? 'win' : player.hp < bot.hp ? 'loss' : player.damageDealt > bot.damageDealt ? 'win' : player.damageDealt < bot.damageDealt ? 'loss' : 'tie';
      const elo = applyElo(result, current), rank = state().account.rank;
      rank.matches = Number(rank.matches || 0) + 1;
      state().profile.totals.itemsUsed = Number(state().profile.totals.itemsUsed || 0) + Number(player.itemsUsed || 0);
      progress().battleItemsUsed = Number(progress().battleItemsUsed || 0) + Number(player.itemsUsed || 0);
      recordCompletedOvertime(rank, current);
      if (result === 'win') { rank.wins = Number(rank.wins || 0) + 1; rank.winStreak = Number(rank.winStreak || 0) + 1; rank.bestStreak = Math.max(Number(rank.bestStreak || 0), rank.winStreak); if (player.damageTaken === 0) state().profile.totals.perfectMatches = Number(state().profile.totals.perfectMatches || 0) + 1; if (player.lowestHp < player.maxHp * 0.15) state().profile.totals.comebackWins = Number(state().profile.totals.comebackWins || 0) + 1; }
      else if (result === 'loss') { rank.losses = Number(rank.losses || 0) + 1; rank.winStreak = 0; }
      else { rank.ties = Number(rank.ties || 0) + 1; rank.winStreak = 0; }
      const playerAccuracy = player.answered ? player.correct / player.answered : 0;
      const botAccuracy = bot.answered ? bot.correct / bot.answered : 0;
      rank.history.unshift({ time: Date.now(), result: result[0].toUpperCase() + result.slice(1), delta: elo.delta, eloBefore: elo.old, eloAfter: rank.elo, opponentElo: bot.elo, playerHp: Math.round(player.hp), botHp: Math.round(bot.hp), playerAccuracy, botAccuracy, questions: player.answered, performance: elo.performance, overtime: current.overtime, character: player.charId, botCharacter: bot.charId, reason });
      rank.history = rank.history.slice(0, 60);
      const summary = `${result.toUpperCase()} · ${elo.delta > 0 ? '+' : ''}${elo.delta} Elo · HP ${Math.round(player.hp)}–${Math.round(bot.hp)}`;
      setRankMatch(null); h.saveState(); syncCharacterUnlocks(false); h.checkAchievements(); renderRanked(); h.toast(`Ranked ${result}`, summary);
    }

    async function forfeitMatch() {
      const current = match(); if (!current) return false;
      const policy = Rules.forfeitPolicy(current);
      const wasPaused = current.clockPaused;
      current.clockPaused = true;
      const confirmed = await h.confirmBox(policy.rated ? 'Confirm rated forfeit?' : 'Leave this match?', policy.message);
      if (!confirmed || match() !== current) {
        if (match() === current) { current.clockPaused = wasPaused || document.hidden; current.lastTick = performance.now(); }
        return false;
      }
      if (policy.rated) { finishMatch('forfeit', true); return true; }
      cancelMatch();
      h.saveState(); renderRanked();
      h.toast('Match voided', 'Early exit · no Elo, record, streak, history, or match-count change.');
      return true;
    }

    function cancelMatch() {
      if (!match()) return false;
      clearInterval(getRankTimer()); setRankTimer(null);
      setRankMatch(null);
      document.body.classList.remove('ranked-mode');
      resetArenaPresentation();
      return true;
    }

    function resetArenaPresentation() {
      const rules = Rules.matchRulesForElo(state().account.rank.elo || 850);
      const entry = selectedCharacter();
      document.body.classList.remove('ranked-mode');
      safeText(els.battleUserScore, rules.baseHp); safeText(els.playerMaxHealthText, rules.baseHp);
      safeText(els.battleAiScore, rules.baseHp); safeText(els.botMaxHealthText, rules.baseHp);
      if (els.playerHealthFill) els.playerHealthFill.style.width = '100%';
      if (els.botHealthFill) els.botHealthFill.style.width = '100%';
      if (els.playerShieldFill) els.playerShieldFill.style.width = '0%';
      if (els.botShieldFill) els.botShieldFill.style.width = '0%';
      safeText(els.playerCredits, 0); safeText(els.botCredits, 0);
      safeText(els.matchTimerText, rules.durationSeconds.toFixed(1));
      if (els.matchTimerFill) els.matchTimerFill.style.width = '100%';
      if (els.battleTimerFill) { els.battleTimerFill.style.width = '0%'; els.battleTimerFill.classList.remove('danger'); }
      safeText(els.battleRoundLabel, 'Ready'); safeText(els.battleWord, 'Start a match');
      safeText(els.battleUserLast, '—'); safeText(els.battleAiLast, '—');
      safeText(els.battleInstantLabel, 'Health wins the match');
      if (els.battleMeaning) { els.battleMeaning.classList.remove('show'); els.battleMeaning.innerHTML = ''; }
      if (els.flashOverlay) els.flashOverlay.classList.remove('show');
      if (els.battleNextBtn) { els.battleNextBtn.textContent = 'Choose an answer'; els.battleNextBtn.disabled = true; }
      if (els.battleFinishBtn) els.battleFinishBtn.disabled = true;
      if (els.characterSuperBtn) { els.characterSuperBtn.textContent = 'Super 0%'; els.characterSuperBtn.disabled = true; }
      if (els.battleAbilityBar) els.battleAbilityBar.innerHTML = '';
      if (els.characterActiveBtn) { els.characterActiveBtn.disabled = true; els.characterActiveBtn.classList.add('hidden'); }
      if (els.activeCharMini) { els.activeCharMini.src = `./${entry.portrait}`; els.activeCharMini.alt = entry.name; }
      safeText(els.activeCharacterName, entry.name); safeText(els.activeCharacterPassive, entry.passives.map((passive) => passive.name).join(' · '));
      els.wagerPanel?.classList.remove('available', 'open');
      els.wagerButtons?.querySelectorAll('button').forEach((button) => { const selected = Number(button.dataset.wager) === 0; button.disabled = true; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected ? 'true' : 'false'); });
      safeText(els.wagerStatus, 'Ace only · wager credits on recall');
      if (els.battleStatusStrip) els.battleStatusStrip.innerHTML = '<span class="pill cool">Choose a character, then start.</span>';
      els.battleRateGrid?.querySelectorAll('button').forEach((button) => { button.disabled = true; button.classList.remove('pending'); });
      renderItemShop();
    }

    function renderMeters() {
      const current = match(); if (!current) return;
      const player = current.player, bot = current.bot;
      if (els.playerHealthFill) els.playerHealthFill.style.width = `${h.percent(player.hp, player.maxHp)}%`;
      if (els.botHealthFill) els.botHealthFill.style.width = `${h.percent(bot.hp, bot.maxHp)}%`;
      if (els.playerShieldFill) els.playerShieldFill.style.width = `${h.percent(player.shield, Math.max(1, player.maxHp))}%`;
      if (els.botShieldFill) els.botShieldFill.style.width = `${h.percent(bot.shield, Math.max(1, bot.maxHp))}%`;
      safeText(els.battleUserScore, Math.round(player.hp)); safeText(els.playerMaxHealthText, player.maxHp);
      safeText(els.battleAiScore, Math.round(bot.hp)); safeText(els.botMaxHealthText, bot.maxHp);
      safeText(els.playerCredits, player.credits); safeText(els.botCredits, bot.credits);
      safeText(els.matchTimerText, current.matchRemaining.toFixed(1));
      if (els.matchTimerFill) els.matchTimerFill.style.width = `${h.percent(current.matchRemaining, current.overtime ? current.overtimeSeconds : current.regulationSeconds)}%`;
      if (els.battleTimerFill) { els.battleTimerFill.style.width = `${h.percent(current.questionRemaining, current.questionLimit || 1)}%`; els.battleTimerFill.classList.toggle('danger', current.questionRemaining < 2); }
    }

    function renderAbilityBar() {
      const current = match();
      if (!current) { if (els.battleAbilityBar) els.battleAbilityBar.innerHTML = ''; return; }
      const player = current.player, entry = fighterCharacter(player);
      if (els.activeCharMini) { els.activeCharMini.src = `./${entry.portrait}`; els.activeCharMini.alt = entry.name; }
      safeText(els.activeCharacterName, entry.name); safeText(els.activeCharacterPassive, entry.passives.map((passive) => passive.name).join(' · '));
      if (els.battleAbilityBar) els.battleAbilityBar.innerHTML = entry.abilities.map((ability) => {
        const cooldown = abilityState(player, ability.id);
        const ready = cooldown.remaining <= 0 && player.effects.lockRounds <= 0 && match().phase === 'between';
        return `<button class="btn btn-mini ${ready ? 'btn-primary' : ''}" data-ability="${h.escAttr(ability.id)}" ${ready ? '' : 'disabled'}>${h.esc(ability.name)}${cooldown.remaining > 0 ? ` · ${Math.ceil(cooldown.remaining)}` : ''}</button>`;
      }).join('');
      if (els.characterActiveBtn) els.characterActiveBtn.classList.add('hidden');
      const cost = superCost(player);
      if (els.characterSuperBtn) { els.characterSuperBtn.textContent = `${entry.super.name} ${Math.round(player.superMeter)}%`; els.characterSuperBtn.disabled = player.superMeter < cost || player.effects.lockRounds > 0 || match().phase !== 'between'; }
    }

    function renderItemShop() {
      if (!els.itemShop) return;
      const categories = Object.values(Rules.UTILITY_CATEGORIES);
      if (els.battleUtilityCategories) els.battleUtilityCategories.innerHTML = categories.map((category) => `<button class="${category.id === activeUtilityCategory ? 'active' : ''}" data-utility-category="${category.id}" aria-pressed="${category.id === activeUtilityCategory ? 'true' : 'false'}">${category.name}</button>`).join('');
      const utilities = Rules.UTILITY_CATEGORIES[activeUtilityCategory].items;
      const current = match();
      if (!current) {
        els.itemShop.innerHTML = utilities.map((utility) => `<button class="item-card" disabled><span class="item-code">${utility.code}</span><b>${utility.name}</b><small>${utility.description}</small><span class="item-price"><b>${utility.cost} BC</b></span></button>`).join(''); return;
      }
      const player = current.player, usable = ['between', 'ready'].includes(current.phase) && player.effects.lockRounds <= 0;
      els.itemShop.innerHTML = utilities.map((utility) => {
        const cost = utilityCost(player, utility), disabled = !usable || player.credits < cost;
        return `<button class="item-card" data-item="${utility.id}" ${disabled ? 'disabled' : ''}><span class="item-code">${utility.code}</span><b>${utility.name}</b><small>${utility.description}</small><span class="item-price"><b>${cost} BC</b></span></button>`;
      }).join('');
    }

    function renderBattle() {
      const current = match();
      if (!current) { resetArenaPresentation(); return; }
      const card = current.cards[current.idx], player = current.player, phase = current.phase;
      if (els.battleFinishBtn) els.battleFinishBtn.disabled = false;
      safeText(els.battleRoundLabel, `${current.overtime ? 'Sudden death · ' : ''}Round ${current.round}`);
      safeText(els.battleWord, card ? card.word : 'Settle match');
      const reveal = phase === 'confirm' || phase === 'between';
      if (els.battleMeaning) {
        els.battleMeaning.innerHTML = card ? `<b>Meaning</b><br>${h.esc(card.fullMeaning || card.meaning)}${card.bridge ? `<br><span class="tiny"><b>Bridge:</b> ${h.esc(card.bridge)}</span>` : ''}${card.example ? `<br><span class="tiny"><b>Example:</b> ${h.esc(card.example)}</span>` : ''}` : '';
        els.battleMeaning.classList.toggle('show', reveal);
      }
      const flashed = Number(current.playerFlashUntil || 0) > Date.now() && phase === 'question';
      els.flashOverlay?.classList.toggle('show', flashed);
      safeText(els.battleUserLast, current.lastPlayer); safeText(els.battleAiLast, current.lastBot);
      safeText(els.battleInstantLabel, phase === 'question' ? 'Correct damage scales with speed, streak, mastery, and character power' : phase === 'confirm' ? (current.pendingTimedOut ? 'Timed out · locked Wrong' : `Selected ${current.pendingResult} · change or confirm`) : 'Round resolved · use abilities or utilities, then continue');
      els.battleRateGrid?.querySelectorAll('[data-battle-result]').forEach((button) => { button.disabled = !(phase === 'question' || (phase === 'confirm' && !current.pendingTimedOut)); button.classList.toggle('pending', phase === 'confirm' && button.dataset.battleResult === current.pendingResult); });
      if (els.battleNextBtn) { els.battleNextBtn.disabled = phase === 'question'; els.battleNextBtn.textContent = phase === 'confirm' ? 'Confirm result' : phase === 'between' ? 'Next question' : 'Choose an answer'; }
      els.wagerPanel?.classList.toggle('available', player.charId === 'ace');
      els.wagerPanel?.classList.toggle('open', player.charId === 'ace' && phase === 'between');
      els.wagerButtons?.querySelectorAll('button').forEach((button) => { const stake = Number(button.dataset.wager); button.disabled = player.charId !== 'ace' || phase !== 'between' || stake < player.wager || stake > player.credits + player.wager || (stake === 7 && player.power.passive < 1); const selected = player.wager === stake; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected ? 'true' : 'false'); });
      safeText(els.wagerStatus, player.charId === 'ace' ? `Armed stake: ${player.wager} BC · paid immediately${player.wagerProtected ? ' · recoil protected' : ''}` : 'Ace only · wager credits on recall');
      if (els.battleStatusStrip) {
        const events = current.events.slice(-2).map((event) => `<span class="pill cool">${h.esc(event)}</span>`).join('') || '<span class="pill cool">Correct answers drive damage; abilities create tempo.</span>';
        els.battleStatusStrip.innerHTML = `${events}<button class="btn btn-mini btn-danger v15-live-forfeit" type="button" data-live-forfeit>Forfeit</button>`;
      }
      renderAbilityBar(); renderMeters(); renderItemShop();
    }

    function saveRankName() {
      const value = String(els.rankAccountName?.value || '').trim().slice(0, 40);
      if (!value) return h.toast('Name required', 'Enter an account name.');
      state().account.name = value; h.saveState(); renderRanked(); h.toast('Rank account saved', value);
    }

    return {
      normalizeState,
      bindEvents,
      activateView,
      renderRanked,
      renderProgress,
      renderAchievements,
      renderTodayStrip,
      renderStats,
      studyAward,
      rankCards,
      startMatch,
      rateQuestion,
      nextQuestion,
      finishMatch,
      forfeitMatch,
      cancelMatch,
      setWager,
      useAbility,
      useSuper,
      useBattleItem,
      renderBattle,
      renderMeters,
      renderItemShop,
      syncRank,
      achievementStats,
      grantAchievementReward,
      achievementRewardText,
      saveRankName,
      pauseClock,
      resumeClock,
      character,
      selectedCharacter,
      isUnlocked
    };
  }

  return Object.freeze({ createV16Runtime, testHelpers });
});
