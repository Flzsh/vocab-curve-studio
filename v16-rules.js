(function attachV16Rules(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.V16Rules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV16Rules() {
  'use strict';

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
    return Object.freeze(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  const RADAR_AXES = deepFreeze(['correctDamage', 'ability', 'sustain', 'defense', 'utility']);
  const UPGRADE_TRACKS = deepFreeze(['ability', 'passive', 'super']);

  const RANK_BANDS = deepFreeze([
    { id: 'd', tier: 'D', name: 'D', min: 0, max: 899, description: 'Foundation', durationSeconds: 75, baseHp: 100, questionSeconds: 8.0 },
    { id: 'c', tier: 'C', name: 'C', min: 900, max: 999, description: 'Apprentice', durationSeconds: 75, baseHp: 100, questionSeconds: 7.8 },
    { id: 'cplus', tier: 'C+', name: 'C+', min: 1000, max: 1099, description: 'Adept', durationSeconds: 75, baseHp: 100, questionSeconds: 7.6 },
    { id: 'b', tier: 'B', name: 'B', min: 1100, max: 1199, description: 'Skilled', durationSeconds: 90, baseHp: 115, questionSeconds: 7.4 },
    { id: 'bplus', tier: 'B+', name: 'B+', min: 1200, max: 1299, description: 'Expert', durationSeconds: 90, baseHp: 115, questionSeconds: 7.2 },
    { id: 'a', tier: 'A', name: 'A', min: 1300, max: 1399, description: 'Master', durationSeconds: 120, baseHp: 135, questionSeconds: 7.0 },
    { id: 'aplus', tier: 'A+', name: 'A+', min: 1400, max: 1499, description: 'Grandmaster', durationSeconds: 120, baseHp: 135, questionSeconds: 6.8 },
    { id: 's-silver', tier: 'S', sId: 'silver', name: 'Silver S', min: 1500, max: 1649, description: 'Peak entry', durationSeconds: 150, baseHp: 155, questionSeconds: 6.6 },
    { id: 's-gold', tier: 'S', sId: 'gold', name: 'Gold S', min: 1650, max: 1799, description: 'Elite', durationSeconds: 165, baseHp: 170, questionSeconds: 6.4 },
    { id: 's-platinum', tier: 'S', sId: 'platinum', name: 'Platinum S', min: 1800, max: 1949, description: 'Apex', durationSeconds: 180, baseHp: 185, questionSeconds: 6.2 },
    { id: 's-diamond', tier: 'S', sId: 'diamond', name: 'Diamond S', min: 1950, max: 2149, description: 'Exalted', durationSeconds: 195, baseHp: 200, questionSeconds: 6.0 },
    { id: 's-demon', tier: 'S', sId: 'demon', name: 'Demon S', min: 2150, max: Infinity, description: 'Final boss', durationSeconds: 225, baseHp: 225, questionSeconds: 5.8 }
  ]);

  const utilityList = [
    { id: 'pulse', category: 'attack', code: 'DM', name: 'Pulse', cost: 5, description: 'Deal 9 direct damage.' },
    { id: 'overclock', category: 'attack', code: 'OC', name: 'Overclock', cost: 7, description: 'Next correct deals 70% more damage; a miss costs 5 HP.' },
    { id: 'barrier', category: 'defense', code: 'SH', name: 'Barrier', cost: 5, description: 'Gain 12 shield.' },
    { id: 'firewall', category: 'defense', code: 'FW', name: 'Firewall', cost: 6, description: 'Block the next enemy utility.' },
    { id: 'fortify', category: 'defense', code: 'MX', name: 'Fortify', cost: 9, description: 'Gain 15 temporary maximum HP and heal 15 HP.' },
    { id: 'patch', category: 'sustain', code: 'HP', name: 'Patch', cost: 4, description: 'Heal 12 HP immediately.' },
    { id: 'regen', category: 'sustain', code: 'RG', name: 'Regen', cost: 8, description: 'Heal 3 HP after each of the next three rounds.' },
    { id: 'flash', category: 'control', code: 'FX', name: 'Flash', cost: 6, description: 'Hide the next opponent word for 3 seconds.' },
    { id: 'chrono', category: 'control', code: 'TM', name: 'Chrono', cost: 6, description: 'Gain 3 seconds next question; the opponent loses 1 second.' },
    { id: 'jammer', category: 'control', code: 'LK', name: 'Jammer', cost: 7, description: 'Block enemy utilities and abilities through their next between-round action.' }
  ];
  const UTILITIES = deepFreeze(utilityList);
  const UTILITY_CATEGORIES = deepFreeze({
    attack: {
      id: 'attack', name: 'Attack', description: 'Convert credits into direct pressure and burst damage.',
      items: utilityList.filter((item) => item.category === 'attack')
    },
    defense: {
      id: 'defense', name: 'Defense', description: 'Block, absorb, or raise the ceiling of incoming damage.',
      items: utilityList.filter((item) => item.category === 'defense')
    },
    sustain: {
      id: 'sustain', name: 'Sustain', description: 'Recover health immediately or over several rounds.',
      items: utilityList.filter((item) => item.category === 'sustain')
    },
    control: {
      id: 'control', name: 'Control', description: 'Change time, visibility, and access to the opponent kit.',
      items: utilityList.filter((item) => item.category === 'control')
    }
  });

  const GLORY_LEVELS = deepFreeze([
    { id: 'spark', name: 'Spark', threshold: 10, coreReward: 10, image: 'assets/glory/spark.png', description: 'The first flash of durable recall.' },
    { id: 'flame', name: 'Flame', threshold: 100, coreReward: 20, image: 'assets/glory/flame.png', description: 'Practice holds a steady flame.' },
    { id: 'blaze', name: 'Blaze', threshold: 300, coreReward: 35, image: 'assets/glory/blaze.png', description: 'Twenty-word sections begin to burn bright.' },
    { id: 'inferno', name: 'Inferno', threshold: 700, coreReward: 55, image: 'assets/glory/inferno.png', description: 'A broad vocabulary answers under pressure.' },
    { id: 'sun', name: 'Sun', threshold: 1500, coreReward: 80, image: 'assets/glory/sun.png', description: 'Consistent retrieval becomes a radiant core.' },
    { id: 'white-dwarf', name: 'White Dwarf', threshold: 3000, coreReward: 120, image: 'assets/glory/white-dwarf.png', description: 'Dense mastery shines through every review.' },
    { id: 'pulsar', name: 'Pulsar', threshold: 6000, coreReward: 180, image: 'assets/glory/pulsar.png', description: 'Precise recall pulses with a diamond rhythm.' },
    { id: 'black-hole', name: 'Black Hole', threshold: 10000, coreReward: 260, image: 'assets/glory/black-hole.png', description: 'Deep memory bends the whole vocabulary around it.' }
  ]);
  const LEGACY_GLORY_IDS = deepFreeze(['seed', 'spark', 'scribe', 'beacon', 'spire', 'crown', 'aurora', 'constellation']);

  const MEMORY_POINT_STAGES = deepFreeze([
    { id: 'first-study', mastery: 0, total: 1 },
    { id: 'mastery-40', mastery: 40, total: 3 },
    { id: 'mastery-70', mastery: 70, total: 6 },
    { id: 'mastery-90', mastery: 90, total: 10 }
  ]);

  const rarityCostBase = deepFreeze({ common: 8, uncommon: 9, rare: 10, epic: 11, legendary: 12, mythic: 14 });

  function upgradeTemplate(characterName, rarity, track, level) {
    const advanced = ['rare', 'epic', 'legendary', 'mythic'].includes(rarity);
    const templates = {
      ability: [
        ['Ability Output I', `Raises ${characterName}'s correct-damage potential and strengthens numeric ability effects where applicable.`, false],
        advanced
          ? ['Accelerated Reset', `Strengthens ${characterName}'s abilities and makes every ability require one fewer reset unit.`, true]
          : ['Ability Output II', `Raises ${characterName}'s correct-damage potential again and strengthens numeric ability effects where applicable.`, false],
        ['Super Link', `Reaches maximum ability-track scaling; ability resets require one fewer reset unit and each use grants 10 Super meter.`, true]
      ],
      passive: [
        ['Passive Tuning I', `Strengthens ${characterName}'s passive values and raises correct-damage potential.`, false],
        advanced
          ? ['Evolved Passive', `Strengthens ${characterName}'s passive values and unlocks its second passive threshold.`, true]
          : ['Passive Tuning II', `Strengthens ${characterName}'s passive values and correct-damage potential a second time.`, false],
        ['Mastery Loop', `Reaches maximum passive scaling; every fifth correct answer advances all ability resets by one and grants 5 Super meter.`, true]
      ],
      super: [
        ['Amplified Super I', `Raises ${characterName}'s Super scaling by 10% where applicable and increases correct-damage potential.`, false],
        advanced
          ? ['Efficient Super', `Raises Super scaling again and lowers its activation cost from 100 to 90 meter.`, true]
          : ['Amplified Super II', `Raises ${characterName}'s numeric Super effects to 20% above base where applicable.`, false],
        ['Full Circuit', `Reaches maximum Super scaling, lowers its cost to 90 meter, and refreshes every ability when activated.`, true]
      ]
    };
    return templates[track][level - 1];
  }

  function upgradeNodes(characterId, characterName, rarity) {
    const base = rarityCostBase[rarity];
    return UPGRADE_TRACKS.flatMap((track) => [1, 2, 3].map((level) => {
      const node = upgradeTemplate(characterName, rarity, track, level);
      return {
      id: `${characterId}-${track}-${level}`,
      track,
      level,
      name: node[0],
      description: node[1],
      mechanical: Boolean(node[2]),
      cost: base * level
    };
    }));
  }

  function kitEntry(id, name, description, reset) {
    return { id, name, description, reset };
  }

  function makeCharacter(definition) {
    const radar = {};
    const maxRadar = {};
    RADAR_AXES.forEach((axis, index) => {
      radar[axis] = definition.radar[index];
      maxRadar[axis] = definition.maxRadar[index];
    });
    return {
      id: definition.id,
      name: definition.name,
      mark: definition.mark,
      rarity: definition.rarity,
      color: definition.color,
      unlock: definition.unlock,
      portrait: `assets/characters/${definition.id}.png`,
      summary: definition.summary,
      damageMultiplier: definition.damageMultiplier,
      maxDamageMultiplier: definition.maxDamageMultiplier,
      abilities: definition.abilities,
      passives: definition.passives,
      super: definition.super,
      radar,
      maxRadar,
      upgrades: upgradeNodes(definition.id, definition.name, definition.rarity)
    };
  }

  const CHARACTERS = deepFreeze([
    makeCharacter({
      id: 'nova', name: 'Nova', mark: 'N', rarity: 'common', color: '#5f64ef',
      unlock: { type: 'starter', value: 0, label: 'Starter character' },
      summary: 'A direct, forgiving attacker built around correct-answer streaks.',
      damageMultiplier: 1.05, maxDamageMultiplier: 1.19,
      abilities: [kitEntry('overdrive', 'Overdrive', 'Queue 35% bonus damage on the next correct answer; a miss costs 4 HP.', '4 correct answers')],
      passives: [kitEntry('momentum', 'Momentum', 'Every third consecutive correct answer deals 3 bonus damage and grants 1 battle credit.', 'Streak counter')],
      super: kitEntry('supernova', 'Supernova', 'Deal 16 direct damage and empower the next correct answer by 25%.', '100 Super meter'),
      radar: [75, 45, 20, 25, 35], maxRadar: [90, 65, 30, 38, 48],
      upgradeTracks: {
        ability: [['Hotter Core', 'Overdrive bonus rises from 35% to 43%.'], ['Stable Burn', 'Overdrive miss recoil falls from 4 HP to 2 HP.'], ['Chain Ignition', 'A correct Overdrive immediately advances its own reset by one answer.', true]],
        passive: [['More Momentum', 'Momentum bonus damage rises from 3 to 4.'], ['Efficient Momentum', 'Every second Momentum trigger grants 2 credits instead of 1.'], ['Banked Streak', 'One streak count survives the first wrong answer each match.', true]],
        super: [['Bigger Supernova', 'Supernova direct damage rises from 16 to 20.'], ['Solar Penetration', 'Supernova ignores 20% of shield.'], ['Fresh Orbit', 'Supernova also refreshes Overdrive.', true]]
      }
    }),
    makeCharacter({
      id: 'mender', name: 'Mender', mark: 'M', rarity: 'uncommon', color: '#36bca5',
      unlock: { type: 'study-days', value: 7, label: 'Study on 7 different days' },
      summary: 'A calm sustain specialist who turns consistent recall into recovery.',
      damageMultiplier: 0.90, maxDamageMultiplier: 0.98,
      abilities: [
        kitEntry('second-wind', 'Second Wind', 'Heal 12 HP, increased to 17 HP while below 35% health.', '4 correct answers'),
        kitEntry('cleanse', 'Cleanse', 'Remove one negative control effect.', '18 damage taken')
      ],
      passives: [kitEntry('recovery', 'Recovery', 'Every third consecutive correct answer heals 3 HP.', 'Streak counter')],
      super: kitEntry('revival-pulse', 'Revival Pulse', 'Heal 22 HP and gain 10 shield.', '100 Super meter'),
      radar: [45, 48, 75, 45, 35], maxRadar: [55, 67, 92, 60, 48],
      upgradeTracks: {
        ability: [['Deeper Breath', 'Second Wind healing rises by 3 HP.'], ['Quick Triage', 'Second Wind resets after 3 correct answers instead of 4.'], ['Purifying Wind', 'Second Wind also removes one negative control effect.', true]],
        passive: [['Steady Recovery', 'Recovery heals 4 HP instead of 3.'], ['Gentle Rhythm', 'The first Recovery trigger needs only two consecutive correct answers.'], ['Overflow Care', 'Healing above maximum health becomes shield, up to 8.', true]],
        super: [['Wide Pulse', 'Revival Pulse healing rises from 22 to 27 HP.'], ['Reinforced Pulse', 'Revival Pulse shield rises from 10 to 15.'], ['Second Chance', 'Revival Pulse can revive once per match at 1 HP if charged before fatal damage.', true]]
      }
    }),
    makeCharacter({
      id: 'volt', name: 'Volt', mark: 'V', rarity: 'uncommon', color: '#2979e7',
      unlock: { type: 'memory-points', value: 75, label: 'Earn 75 Memory Points' },
      summary: 'A fast tempo fighter who manipulates credits and rewards quick recall.',
      damageMultiplier: 1.02, maxDamageMultiplier: 1.14,
      abilities: [
        kitEntry('siphon', 'Siphon', 'Steal up to 4 battle credits from the opponent.', '5 correct answers'),
        kitEntry('arc-burst', 'Arc Burst', 'Deal 7 direct damage.', '3 rounds')
      ],
      passives: [kitEntry('charge', 'Charge', 'Two correct answers under 4 seconds empower the next hit by 5 damage.', 'Fast-answer counter')],
      super: kitEntry('thunderline', 'Thunderline', 'Deal 15 damage and drain 2 battle credits.', '100 Super meter'),
      radar: [65, 70, 25, 25, 70], maxRadar: [78, 88, 34, 38, 88],
      upgradeTracks: {
        ability: [['Stronger Siphon', 'Siphon can steal up to 5 credits.'], ['Faster Arc', 'Arc Burst resets after 2 rounds instead of 3.'], ['Closed Circuit', 'Using either ability advances the other ability reset by one.', true]],
        passive: [['Higher Voltage', 'Charge bonus damage rises from 5 to 7.'], ['Wider Window', 'Fast answers count under 4.5 seconds instead of 4.'], ['Capacitor', 'A third fast answer stores a second Charge for later.', true]],
        super: [['Heavy Thunder', 'Thunderline damage rises from 15 to 19.'], ['Power Drain', 'Thunderline drains 3 credits instead of 2.'], ['Storm Front', 'Thunderline instantly grants one stored Charge.', true]]
      }
    }),
    makeCharacter({
      id: 'lumen', name: 'Lumen', mark: 'L', rarity: 'rare', color: '#e2a72c',
      unlock: { type: 'rank-wins', value: 1, label: 'Win one Ranked match' },
      summary: 'A readable control character who creates extra thinking time and visual pressure.',
      damageMultiplier: 0.98, maxDamageMultiplier: 1.10,
      abilities: [
        kitEntry('flash-prism', 'Flash Prism', 'Hide the opponent word for 3 seconds.', '4 rounds'),
        kitEntry('gleam', 'Gleam', 'Add 3 seconds to your next question.', '4 correct answers')
      ],
      passives: [kitEntry('afterimage', 'Afterimage', 'The first correct answer under 3 seconds grants 2 extra credits.', 'Once per match')],
      super: kitEntry('daybreak', 'Daybreak', 'Deal 12 damage, clear your control effects, and Flash the enemy next question.', '100 Super meter'),
      radar: [55, 65, 30, 38, 80], maxRadar: [67, 84, 40, 54, 94],
      upgradeTracks: {
        ability: [['Prismatic Split', 'Flash Prism also removes 1 second from the enemy question.', true], ['Lingering Gleam', 'Gleam grants 4 seconds instead of 3.'], ['Whiteout', 'Using both abilities within four rounds makes the next Flash Prism unblockable.', true]],
        passive: [['Bright Start', 'Afterimage can trigger twice per match.', true], ['Faster Light', 'Afterimage threshold rises from 3 to 3.5 seconds.'], ['Refraction', 'Each Afterimage also advances both ability resets by one.', true]],
        super: [['Hot Daybreak', 'Daybreak damage rises from 12 to 16.'], ['Clear Horizon', 'Daybreak also clears one negative time effect.'], ['Solar Flare', 'Daybreak immediately applies a 1.5-second Flash Prism.', true]]
      }
    }),
    makeCharacter({
      id: 'echo', name: 'Echo', mark: 'E', rarity: 'rare', color: '#9f58de',
      unlock: { type: 'achievement', value: 'no-hint-hero', label: 'Complete No-Hint Mini Hero' },
      summary: 'A flexible utility specialist whose value depends on planning and timing.',
      damageMultiplier: 0.92, maxDamageMultiplier: 1.04,
      abilities: [
        kitEntry('replay', 'Replay', 'Repeat your last utility for free at 65% strength.', '4 rounds'),
        kitEntry('sample', 'Sample', 'Mirror the next enemy utility at 50% strength.', '5 rounds')
      ],
      passives: [kitEntry('copycat', 'Copycat', 'The first enemy utility each match is mirrored at 45% strength.', 'Once per match')],
      super: kitEntry('feedback-loop', 'Feedback Loop', 'Repeat your last two different utilities at 55% strength.', '100 Super meter'),
      radar: [45, 78, 35, 38, 88], maxRadar: [58, 95, 48, 52, 100],
      upgradeTracks: {
        ability: [['Clean Replay', 'Replay strength rises from 65% to 75%.'], ['Live Sample', 'Sample copies at 65% strength instead of 50%.', true], ['Double Track', 'Replay can target either of your last two utilities.', true]],
        passive: [['Louder Copycat', 'Copycat strength rises from 45% to 60%.'], ['Second Echo', 'Copycat can trigger a second time at 35% strength.', true], ['Safe Reflection', 'Copied harmful utilities never produce self-recoil.', true]],
        super: [['Strong Feedback', 'Feedback Loop strength rises from 55% to 65%.'], ['Long Memory', 'Feedback Loop may repeat the last three different utilities.', true], ['Perfect Loop', 'The final repeated utility uses full strength.', true]]
      }
    }),
    makeCharacter({
      id: 'root', name: 'Root', mark: 'R', rarity: 'epic', color: '#268a5b',
      unlock: { type: 'daily-reviews', value: 100, label: 'Complete 100 Study reviews in one day' },
      summary: 'A technical economy controller who gains power by sequencing utilities.',
      damageMultiplier: 0.96, maxDamageMultiplier: 1.08,
      abilities: [
        kitEntry('root-access', 'Root Access', 'The next correct answer receives maximum speed damage.', '4 correct answers'),
        kitEntry('backdoor', 'Backdoor', 'Your next utility costs 0 credits.', '6 rounds')
      ],
      passives: [
        kitEntry('exploit', 'Exploit', 'Utilities cost 1 fewer battle credit, minimum 1.', 'Always active'),
        kitEntry('patch-notes', 'Patch Notes', 'Using three different utilities heals 6 HP.', 'Distinct-utility set')
      ],
      super: kitEntry('admin-override', 'Admin Override', 'Lock enemy abilities for two rounds and gain 6 credits.', '100 Super meter'),
      radar: [55, 80, 35, 48, 85], maxRadar: [68, 96, 50, 65, 100],
      upgradeTracks: {
        ability: [['Persistent Access', 'Root Access also ignores 25% of shield.', true], ['Zero Day', 'Backdoor advances Root Access reset by one.', true], ['Privilege Escalation', 'A Root Access correct answer makes the following utility free.', true]],
        passive: [['Better Exploit', 'Every third utility receives a second credit of discount.', true], ['Readable Notes', 'Patch Notes heals 8 HP instead of 6.'], ['Hotfix', 'Patch Notes also clears one control effect.', true]],
        super: [['Long Override', 'Admin Override locks for three rounds.'], ['Admin Budget', 'Admin Override grants 8 credits instead of 6.'], ['System Restore', 'Admin Override refreshes the ability with the longer remaining reset.', true]]
      }
    }),
    makeCharacter({
      id: 'ace', name: 'Ace', mark: 'A', rarity: 'epic', color: '#d04b87',
      unlock: { type: 'rank-win-streak', value: 5, label: 'Win 5 Ranked matches in a row' },
      summary: 'A high-damage risk manager who stakes real credits on confident answers.',
      damageMultiplier: 1.10, maxDamageMultiplier: 1.22,
      abilities: [
        kitEntry('loaded-dice', 'Loaded Dice', 'Protect the next failed wager from self-damage, but not loss of stake.', '5 correct answers'),
        kitEntry('mulligan', 'Mulligan', 'Cancel an armed wager before answering and recover half its stake.', '5 rounds')
      ],
      passives: [
        kitEntry('high-roller', 'High Roller', 'Stake up to 6 credits before a word; a correct answer converts stake to bonus damage, while a miss loses it and deals recoil.', 'Each question'),
        kitEntry('house-edge', 'House Edge', 'Two successful wagers in a row return 1 credit.', 'Wager streak')
      ],
      super: kitEntry('jackpot', 'Jackpot', 'The next wager has double bonus damage and no recoil, but its stake is still paid.', '100 Super meter'),
      radar: [82, 75, 24, 30, 68], maxRadar: [96, 92, 34, 43, 86],
      upgradeTracks: {
        ability: [['Weighted Dice', 'Loaded Dice also refunds 25% of a failed stake.', true], ['Full Mulligan', 'Mulligan recovers the entire stake instead of half.'], ['Card Counter', 'A successful protected wager refreshes Mulligan.', true]],
        passive: [['Higher Limit', 'Maximum wager rises from 6 to 7 credits.', true], ['Better Odds', 'Successful wager damage gains 1 extra damage per 2 stake.'], ['Parlay', 'After a successful wager, half the next stake is prepaid.', true]],
        super: [['Larger Jackpot', 'Jackpot bonus rises from double to 2.25 times.'], ['Cash Out', 'A successful Jackpot refunds half its stake.'], ['Winning Hand', 'Jackpot also makes the next ability reset two steps faster.', true]]
      }
    }),
    makeCharacter({
      id: 'mirage', name: 'Mirage', mark: 'I', rarity: 'epic', color: '#7653d9',
      unlock: { type: 'rank-overtime', value: 3, label: 'Finish 3 overtime matches' },
      summary: 'A defensive deception specialist who blunts bursts and disrupts precision.',
      damageMultiplier: 0.95, maxDamageMultiplier: 1.06,
      abilities: [
        kitEntry('false-signal', 'False Signal', 'Lower enemy next-answer accuracy and blur their word briefly.', '5 rounds'),
        kitEntry('vanish', 'Vanish', 'Reduce the next incoming correct-answer hit by 35%.', '18 damage taken')
      ],
      passives: [
        kitEntry('decoy', 'Decoy', 'Reduce the first incoming hit above 12 damage by half.', 'Once per match'),
        kitEntry('misdirection', 'Misdirection', 'Every fourth correct answer makes your next utility free.', 'Correct-answer counter')
      ],
      super: kitEntry('hall-of-mirrors', 'Hall of Mirrors', 'Extend enemy ability resets by two and reduce your next two incoming hits by 35%.', '100 Super meter'),
      radar: [50, 75, 36, 75, 78], maxRadar: [62, 94, 48, 94, 94],
      upgradeTracks: {
        ability: [['Noisy Signal', 'False Signal lasts 0.6 seconds longer.', true], ['Deep Vanish', 'Vanish reduction rises from 35% to 45%.'], ['Swap Image', 'When Vanish triggers, False Signal advances two reset steps.', true]],
        passive: [['Second Decoy', 'A weaker 25% Decoy returns after four correct answers.', true], ['Lower Threshold', 'The first Decoy triggers on hits above 10 damage.'], ['Perfect Misdirection', 'Misdirection also makes the next utility unblockable.', true]],
        super: [['Long Hall', 'Hall of Mirrors affects the next three hits.'], ['Cracked Mirrors', 'Affected hits deal 45% less damage.'], ['Infinite Reflection', 'The first enemy ability used during Hall of Mirrors is copied at half strength.', true]]
      }
    }),
    makeCharacter({
      id: 'aegis', name: 'Aegis', mark: 'G', rarity: 'legendary', color: '#315cad',
      unlock: { type: 'elo', value: 1300, label: 'Reach A rank' },
      summary: 'A layered tank with several answers to burst, utility, and direct damage.',
      damageMultiplier: 0.88, maxDamageMultiplier: 0.98,
      abilities: [
        kitEntry('bulwark', 'Bulwark', 'Gain 14 shield.', '20 damage taken'),
        kitEntry('null-field', 'Null Field', 'Lock enemy utilities and abilities for two rounds.', '6 correct answers'),
        kitEntry('intercept', 'Intercept', 'Convert the next direct-damage utility into shield.', '5 rounds')
      ],
      passives: [
        kitEntry('barrier-core', 'Barrier Core', 'Start every match with 12 shield.', 'Match start'),
        kitEntry('bastion', 'Bastion', 'While shielded, correct-answer hits deal 3 less damage.', 'Always active')
      ],
      super: kitEntry('citadel-protocol', 'Citadel Protocol', 'Gain 25 shield and heal 10 HP; excess shield can reach 35.', '100 Super meter'),
      radar: [42, 72, 58, 92, 72], maxRadar: [54, 91, 73, 100, 90],
      upgradeTracks: {
        ability: [['Reactive Bulwark', 'Bulwark gains 3 extra shield if triggered by damage.', true], ['Wide Null', 'Null Field also removes one armed enemy ability.', true], ['Perfect Intercept', 'Intercept reflects 30% of converted damage.', true]],
        passive: [['Hardened Core', 'Barrier Core starts with 16 shield.'], ['Fortified Bastion', 'Bastion reduction rises from 3 to 4 damage.'], ['Shield Engine', 'Every 20 shield lost advances all ability resets by one.', true]],
        super: [['Higher Walls', 'Citadel Protocol grants 30 shield.'], ['Emergency Stores', 'Citadel Protocol heals 14 HP instead of 10.'], ['Living Citadel', 'For three rounds, half of healing also becomes shield.', true]]
      }
    }),
    makeCharacter({
      id: 'revenant', name: 'Revenant', mark: 'X', rarity: 'mythic', color: '#a52b3e',
      unlock: { type: 'elo', value: 1950, label: 'Reach Diamond S' },
      summary: 'A volatile expert character who trades health for pressure and one final comeback.',
      damageMultiplier: 1.18, maxDamageMultiplier: 1.25,
      abilities: [
        kitEntry('demon-pulse', 'Demon Pulse', 'Deal 11 direct damage for 3 self-damage.', '3 correct answers'),
        kitEntry('soul-rend', 'Soul Rend', 'Deal 7-14 damage based on your missing health.', '5 rounds'),
        kitEntry('blood-pact', 'Blood Pact', 'Spend 8 HP to advance both other ability resets by two.', 'Once every 6 rounds')
      ],
      passives: [
        kitEntry('last-word', 'Last Word', 'Survive fatal damage once at 1 HP.', 'Once per match'),
        kitEntry('vengeance', 'Vengeance', 'After Last Word, the next two correct attacks deal 20% more damage.', 'After Last Word')
      ],
      super: kitEntry('eclipse', 'Eclipse', 'Deal 18 damage, heal for half the damage dealt, and block enemy healing for two rounds.', '100 Super meter'),
      radar: [90, 90, 60, 55, 62], maxRadar: [100, 100, 80, 73, 80],
      upgradeTracks: {
        ability: [['Hungry Pulse', 'Demon Pulse heals 2 HP when it breaks shield.', true], ['Deep Rend', 'Soul Rend maximum damage rises from 14 to 17.'], ['Shared Blood', 'Blood Pact also grants 20 Super meter.', true]],
        passive: [['Final Refusal', 'Last Word returns at 3 HP instead of 1.'], ['Furious Vengeance', 'Vengeance bonus rises from 20% to 28%.'], ['Undying Rhythm', 'The first Vengeance correct answer refreshes Demon Pulse.', true]],
        super: [['Darker Eclipse', 'Eclipse damage rises from 18 to 22.'], ['Total Eclipse', 'Enemy healing is blocked for three rounds.'], ['Rebirth', 'If Eclipse is used below 20% health, its healing is doubled.', true]]
      }
    })
  ]);

  const LEGACY_UPGRADES = deepFreeze({
    vitality: [25, 45, 70, 105, 150],
    regen: [30, 55, 90, 140],
    focus: [25, 50, 80, 120, 170],
    wallet: [35, 65, 105, 160],
    arsenal: [40, 75, 120, 180]
  });

  function normalizedElo(elo) {
    const number = Number(elo);
    if (number === Infinity) return Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, number);
  }

  function rankBandForElo(elo) {
    const value = normalizedElo(elo);
    return RANK_BANDS.find((band) => value >= band.min && value <= band.max) || RANK_BANDS[0];
  }

  function rankProgress(elo) {
    const value = normalizedElo(elo);
    const band = rankBandForElo(value);
    const index = RANK_BANDS.indexOf(band);
    const next = RANK_BANDS[index + 1] || null;
    if (!next) {
      return Object.freeze({ band, next: null, elo: value, start: band.min, end: band.min, value: 0, span: 1, fraction: 1, percent: 100 });
    }
    const span = Math.max(1, next.min - band.min);
    const completed = clamp(value - band.min, 0, span);
    const fraction = completed / span;
    return Object.freeze({
      band,
      next,
      elo: value,
      start: band.min,
      end: next.min,
      value: completed,
      span,
      fraction,
      percent: Math.round(fraction * 10000) / 100
    });
  }

  function matchRulesForElo(elo) {
    const band = rankBandForElo(elo);
    return Object.freeze({
      band,
      durationSeconds: band.durationSeconds,
      baseHp: band.baseHp,
      questionSeconds: band.questionSeconds,
      overtimeSeconds: 15,
      startingCredits: 2,
      correctDamageMultiplier: 1
    });
  }

  function advanceRankClock(match, deltaSeconds, visible = true) {
    const current = match && typeof match === 'object' ? match : null;
    const delta = Math.max(0, finiteNumber(deltaSeconds, 0));
    const canAdvance = Boolean(current)
      && visible !== false
      && !current.clockPaused
      && current.phase === 'question'
      && delta > 0;
    if (!canAdvance) {
      return Object.freeze({
        advanced: 0,
        questionExpired: Boolean(current && finiteNumber(current.questionRemaining, 0) <= 0),
        matchExpired: Boolean(current && finiteNumber(current.matchRemaining, 0) <= 0)
      });
    }
    const matchRemaining = Math.max(0, finiteNumber(current.matchRemaining, 0));
    const questionRemaining = Math.max(0, finiteNumber(current.questionRemaining, 0));
    const advanced = Math.min(delta, matchRemaining, questionRemaining);
    current.matchRemaining = Math.max(0, matchRemaining - advanced);
    current.questionRemaining = Math.max(0, questionRemaining - advanced);
    if (!current.overtime) {
      current.activeQuestionSeconds = Math.max(0, finiteNumber(current.activeQuestionSeconds, 0)) + advanced;
    }
    return Object.freeze({
      advanced,
      questionExpired: current.questionRemaining <= 0,
      matchExpired: current.matchRemaining <= 0
    });
  }

  function forfeitPolicy(match) {
    const resolvedRounds = Math.max(0, Math.floor(finiteNumber(match && match.resolvedRounds, 0)));
    const regulationSeconds = Math.max(1, finiteNumber(match && match.regulationSeconds, 75));
    const activeQuestionSeconds = Math.max(0, finiteNumber(match && match.activeQuestionSeconds, 0));
    const requiredSeconds = regulationSeconds * 0.40;
    const rated = resolvedRounds >= 3 && activeQuestionSeconds + 1e-9 >= requiredSeconds;
    return Object.freeze({
      rated,
      resolvedRounds,
      activeQuestionSeconds,
      regulationSeconds,
      requiredRounds: 3,
      requiredSeconds,
      message: rated
        ? 'Rated forfeit — this will record a loss and change Elo.'
        : 'Early exit — this match will be void with no Elo change.'
    });
  }

  function smoothstep(value) {
    const bounded = clamp(finiteNumber(value, 0), 0, 1);
    return bounded * bounded * (3 - 2 * bounded);
  }

  function botProfileForElo(elo) {
    const rankProgress = smoothstep((finiteNumber(elo, 850) - 700) / 1600);
    return Object.freeze({
      elo: clamp(Math.round(finiteNumber(elo, 850)), 600, 2800),
      skill: rankProgress,
      accuracy: 0.54 + rankProgress * 0.30,
      responseCenter: 7.25 - rankProgress * 3.45,
      responseSpread: 0.36 - rankProgress * 0.14,
      participation: 0.25 + rankProgress * 0.58,
      resourceDiscipline: 0.22 + rankProgress * 0.70,
      healthAwareness: 0.27 + rankProgress * 0.66,
      cooldownAwareness: 0.24 + rankProgress * 0.68,
      comboAwareness: 0.18 + rankProgress * 0.75,
      mistakeRate: 0.30 - rankProgress * 0.22
    });
  }

  function randomUnit(random) {
    const value = typeof random === 'function' ? finiteNumber(random(), 0.5) : Math.random();
    return clamp(value, 0, 0.999999999);
  }

  function chooseBotAnswer(profile, card, effects, random) {
    const calibrated = profile && Number.isFinite(Number(profile.accuracy))
      ? profile
      : botProfileForElo(profile && profile.elo);
    const context = effects && typeof effects === 'object' ? effects : {};
    const difficulty = clamp(finiteNumber(card && card.difficulty, 0.35), 0, 1);
    const memory = Number.isFinite(Number(context.memory))
      ? clamp(Number(context.memory), 0, 1)
      : clamp(finiteNumber(card && card.memoryScore, 50) / 100, 0, 1);
    const accuracyDebuff = Math.max(0, finiteNumber(context.accuracyDebuff, 0));
    const flashed = context.flashed === true;
    const chance = clamp(
      finiteNumber(calibrated.accuracy, 0.6) +
      (memory - 0.5) * 0.08 -
      (difficulty - 0.35) * 0.12 -
      accuracyDebuff -
      (flashed ? 0.06 : 0),
      0.35,
      0.94
    );
    const correct = randomUnit(random) < chance;
    const questionLimit = clamp(finiteNumber(context.questionLimit, 8), 1, 30);
    const center = finiteNumber(calibrated.responseCenter, 6) + (difficulty - 0.35) * 1.1;
    const spread = clamp(finiteNumber(calibrated.responseSpread, 0.3), 0.1, 0.55);
    const triangularJitter = randomUnit(random) + randomUnit(random) - 1;
    let elapsed = center + triangularJitter * center * spread;
    if (flashed) elapsed += Math.min(3, questionLimit * 0.45);
    if (context.rootMax === true && correct) elapsed = 0.65;
    elapsed = clamp(elapsed, 0.65, Math.max(0.65, questionLimit * 0.98));
    return Object.freeze({ correct, elapsed, chance });
  }

  function emptyBotDecision() {
    return { abilityId: null, useSuper: false, utilityId: null, wager: 0 };
  }

  function botHealthRatio(fighter) {
    return clamp(finiteNumber(fighter && fighter.hp, 0) / Math.max(1, finiteNumber(fighter && fighter.maxHp, 100)), 0, 1);
  }

  function botUtilityCost(bot, utility) {
    if (bot && bot.effects && bot.effects.freeUtility) return 0;
    return Math.max(1, Math.floor(finiteNumber(utility && utility.cost, 0)) - (bot && bot.charId === 'root' ? 1 : 0));
  }

  function botHasNegativeEffect(fighter) {
    const effects = fighter && fighter.effects ? fighter.effects : {};
    return finiteNumber(effects.accuracyDebuff, 0) > 0 ||
      finiteNumber(effects.flashQuestions, 0) > 0 ||
      finiteNumber(effects.nextTimePenalty, 0) > 0 ||
      finiteNumber(effects.lockRounds, 0) > 0;
  }

  function botAbilityAvailable(id, bot) {
    const effects = bot && bot.effects ? bot.effects : {};
    if (id === 'replay' && !bot.lastItem) return false;
    if (id === 'cleanse' && !botHasNegativeEffect(bot)) return false;
    if (id === 'mulligan' && finiteNumber(bot.wager, 0) <= 0) return false;
    if (id === 'loaded-dice' && finiteNumber(bot.wager, 0) <= 0) return false;
    if (id === 'overdrive' && effects.overdrive) return false;
    if (id === 'sample' && effects.sampleArmed) return false;
    if (id === 'root-access' && effects.rootMax) return false;
    if (id === 'backdoor' && effects.freeUtility) return false;
    if (id === 'vanish' && finiteNumber(effects.vanishReduction, 0) > 0) return false;
    if (id === 'intercept' && effects.intercept) return false;
    if (id === 'blood-pact' && finiteNumber(bot.hp, 0) <= 9) return false;
    return true;
  }

  function botAbilityScore(id, bot, player, profile) {
    const health = botHealthRatio(bot);
    const missing = 1 - health;
    const opponentHealth = botHealthRatio(player);
    const opponentMissing = 1 - opponentHealth;
    const combo = finiteNumber(profile.comboAwareness, 0.5);
    const healthSense = finiteNumber(profile.healthAwareness, 0.5);
    const targetReady = Array.isArray(player && player.abilityStates) && player.abilityStates.some((state) => finiteNumber(state.remaining, 1) <= 0);
    const scores = {
      overdrive: 0.40 + combo * 0.45 + clamp(finiteNumber(bot.streak, 0) / 8, 0, 1) * 0.18,
      'second-wind': 0.34 + missing * 0.72 + healthSense * 0.16,
      cleanse: botHasNegativeEffect(bot) ? 0.72 + healthSense * 0.18 : 0.05,
      siphon: 0.34 + clamp(finiteNumber(player && player.credits, 0) / 10, 0, 1) * 0.52,
      'arc-burst': 0.42 + opponentMissing * 0.45 + (finiteNumber(player && player.hp, 100) <= 8 ? 0.42 : 0),
      'flash-prism': 0.47 + combo * 0.25,
      gleam: 0.40 + combo * 0.36,
      replay: bot.lastItem ? 0.48 + combo * 0.28 : 0.05,
      sample: 0.42 + clamp(finiteNumber(player && player.credits, 0) / 12, 0, 1) * 0.30,
      'root-access': 0.48 + combo * 0.40,
      backdoor: 0.40 + clamp(1 - finiteNumber(bot.credits, 0) / 10, 0, 1) * 0.36,
      'loaded-dice': finiteNumber(bot.wager, 0) > 0 ? 0.62 + combo * 0.24 : 0.05,
      mulligan: finiteNumber(bot.wager, 0) > 0 ? 0.36 + (1 - combo) * 0.34 : 0.05,
      'false-signal': 0.50 + combo * 0.30,
      vanish: 0.34 + missing * 0.58 + healthSense * 0.18,
      bulwark: 0.38 + missing * 0.48 + (finiteNumber(bot.shield, 0) <= 2 ? 0.18 : 0),
      'null-field': 0.42 + (targetReady ? 0.28 : 0.04) + combo * 0.18,
      intercept: 0.36 + clamp(finiteNumber(player && player.superMeter, 0) / 100, 0, 1) * 0.42,
      'demon-pulse': 0.46 + opponentMissing * 0.42 - (health < 0.18 ? 0.38 : 0),
      'soul-rend': 0.38 + missing * 0.44 + opponentMissing * 0.26,
      'blood-pact': 0.25 + health * 0.32 + (Array.isArray(bot.abilityStates) && bot.abilityStates.some((state) => finiteNumber(state.remaining, 0) >= 2) ? 0.32 : 0)
    };
    return finiteNumber(scores[id], 0.4);
  }

  function botSuperScore(characterId, bot, player, profile) {
    const missing = 1 - botHealthRatio(bot);
    const opponentMissing = 1 - botHealthRatio(player);
    const healthSense = finiteNumber(profile.healthAwareness, 0.5);
    const combo = finiteNumber(profile.comboAwareness, 0.5);
    if (characterId === 'mender') return 0.42 + missing * 0.76 + healthSense * 0.15;
    if (characterId === 'aegis') return 0.42 + missing * 0.62 + (finiteNumber(bot.shield, 0) < 8 ? 0.18 : 0);
    if (characterId === 'revenant') return 0.50 + missing * 0.38 + opponentMissing * 0.34;
    if (characterId === 'ace') return finiteNumber(bot.wager, 0) > 0 ? 0.72 + combo * 0.20 : 0.38;
    if (characterId === 'mirage') return 0.46 + clamp(finiteNumber(player && player.superMeter, 0) / 100, 0, 1) * 0.30;
    if (characterId === 'root') return 0.48 + clamp(1 - finiteNumber(bot.credits, 0) / 12, 0, 1) * 0.22;
    return 0.48 + opponentMissing * 0.38 + combo * 0.16;
  }

  function botUtilityScore(id, bot, player, profile, matchRemaining, matchTotal) {
    const missing = 1 - botHealthRatio(bot);
    const opponentMissing = 1 - botHealthRatio(player);
    const healthSense = finiteNumber(profile.healthAwareness, 0.5);
    const combo = finiteNumber(profile.comboAwareness, 0.5);
    const effects = bot && bot.effects ? bot.effects : {};
    const targetEffects = player && player.effects ? player.effects : {};
    const timeRatio = clamp(finiteNumber(matchRemaining, 45) / Math.max(1, finiteNumber(matchTotal, 90)), 0, 1);
    const targetReady = Array.isArray(player && player.abilityStates) && player.abilityStates.some((state) => finiteNumber(state.remaining, 1) <= 0);
    const scores = {
      pulse: 0.34 + opponentMissing * 0.48 + (finiteNumber(player && player.hp, 100) <= 9 ? 0.55 : 0),
      overclock: effects.overclock ? 0.04 : 0.28 + combo * 0.58 + clamp(finiteNumber(bot.streak, 0) / 7, 0, 1) * 0.14,
      barrier: 0.31 + missing * 0.37 + (finiteNumber(bot.shield, 0) <= 2 ? 0.20 : 0.02),
      firewall: effects.firewall ? 0.04 : 0.34 + clamp(finiteNumber(player && player.credits, 0) / 12, 0, 1) * 0.30,
      fortify: 0.22 + missing * 0.75 + healthSense * 0.20,
      patch: healthSense * 0.15 + (missing > 0.02 ? 0.25 + missing * 0.85 : 0.03),
      regen: finiteNumber(effects.regenRounds, 0) > 0 ? 0.05 : 0.24 + missing * 0.56 + timeRatio * 0.25,
      flash: finiteNumber(targetEffects.flashQuestions, 0) > 0 ? 0.08 : 0.40 + combo * 0.25 + timeRatio * 0.08,
      chrono: finiteNumber(effects.nextTimeBonus, 0) > 0 ? 0.08 : 0.38 + combo * 0.30,
      jammer: finiteNumber(targetEffects.lockRounds, 0) > 0 ? 0.08 : 0.38 + (targetReady ? 0.32 : 0.05) + combo * 0.12
    };
    return finiteNumber(scores[id], 0.3);
  }

  function chooseScoredBotCandidate(candidates, profile, random) {
    if (!candidates.length) return null;
    if (randomUnit(random) < finiteNumber(profile.mistakeRate, 0.2)) {
      return candidates[Math.floor(randomUnit(random) * candidates.length)];
    }
    const noise = 0.22 * (1 - finiteNumber(profile.resourceDiscipline, 0.5));
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = finiteNumber(candidate.score, 0) + (randomUnit(random) - 0.5) * noise;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function chooseBotActions(context) {
    const input = context && typeof context === 'object' ? context : {};
    const bot = input.bot && typeof input.bot === 'object' ? input.bot : {};
    const player = input.player && typeof input.player === 'object' ? input.player : {};
    const character = input.character && typeof input.character === 'object'
      ? input.character
      : CHARACTERS.find((entry) => entry.id === bot.charId);
    const utilities = Array.isArray(input.utilities) ? input.utilities : UTILITIES;
    const random = input.random;
    const decision = emptyBotDecision();
    const phase = String(input.phase || 'between');
    if (!character || !['between', 'ready'].includes(phase)) return Object.freeze(decision);
    const profile = botProfileForElo(bot.elo);
    if (randomUnit(random) > profile.participation) return Object.freeze(decision);

    let availableCredits = Math.max(0, Math.floor(finiteNumber(bot.credits, 0)));
    const maximumWager = bot && bot.power && finiteNumber(bot.power.passive, 0) >= 1 ? 7 : 6;
    if (character.id === 'ace' && finiteNumber(bot.wager, 0) <= 0 && availableCredits >= 2) {
      const wagerChance = 0.30 + profile.comboAwareness * 0.48;
      if (randomUnit(random) < wagerChance) {
        const reserve = profile.resourceDiscipline > 0.65 ? Math.min(4, Math.floor(availableCredits * 0.3)) : 0;
        const spendable = Math.max(0, availableCredits - reserve);
        if (spendable >= 2) {
          const ambitious = randomUnit(random) > profile.mistakeRate;
          const target = ambitious && spendable >= 4 ? (profile.comboAwareness > 0.82 && spendable >= 6 ? 6 : 4) : 2;
          decision.wager = Math.min(maximumWager, spendable, target);
          availableCredits -= decision.wager;
        }
      }
    }

    const locked = finiteNumber(bot && bot.effects && bot.effects.lockRounds, 0) > 0;
    if (!locked) {
      const readyIds = new Set((Array.isArray(bot.abilityStates) ? bot.abilityStates : [])
        .filter((state) => finiteNumber(state.remaining, 1) <= 0)
        .map((state) => state.id));
      const kitCandidates = [];
      for (const ability of character.abilities || []) {
        if (readyIds.has(ability.id) && botAbilityAvailable(ability.id, bot)) {
          kitCandidates.push({ kind: 'ability', id: ability.id, score: botAbilityScore(ability.id, bot, player, profile) });
        }
      }
      const requiredSuper = Math.max(1, finiteNumber(input.superCost, 100));
      if (finiteNumber(bot.superMeter, 0) >= requiredSuper) {
        kitCandidates.push({ kind: 'super', id: character.super && character.super.id, score: botSuperScore(character.id, bot, player, profile) });
      }
      const kitChance = 0.38 + profile.cooldownAwareness * 0.57;
      if (kitCandidates.length && randomUnit(random) < kitChance) {
        const kit = chooseScoredBotCandidate(kitCandidates, profile, random);
        if (kit && kit.kind === 'ability') decision.abilityId = kit.id;
        if (kit && kit.kind === 'super') decision.useSuper = true;
      }

      const urgent = botHealthRatio(bot) < 0.30;
      const reserve = urgent || profile.resourceDiscipline < 0.68
        ? 0
        : Math.min(3, Math.floor(availableCredits * 0.25));
      const spendable = Math.max(0, availableCredits - reserve);
      const utilityCandidates = utilities
        .filter((utility) => botUtilityCost(bot, utility) <= spendable)
        .map((utility) => ({
          kind: 'utility',
          id: utility.id,
          score: botUtilityScore(utility.id, bot, player, profile, input.matchRemaining, input.matchTotal)
        }));
      const utilityChance = 0.34 + profile.resourceDiscipline * 0.56;
      if (utilityCandidates.length && randomUnit(random) < utilityChance) {
        const utility = chooseScoredBotCandidate(utilityCandidates, profile, random);
        const carefulHold = utility && utility.score < 0.42 && randomUnit(random) > profile.mistakeRate;
        if (utility && !carefulHold) decision.utilityId = utility.id;
      }
    }
    return Object.freeze(decision);
  }

  function isRankEligible(card) {
    return Boolean(
      card &&
      !card.deleted &&
      !card.suspended &&
      card.state !== 'suspended' &&
      Number.isFinite(Number(card.studySeenAt)) &&
      Number(card.studySeenAt) > 0
    );
  }

  function gloryAwardForStudy(card, mastery, studiedNow) {
    const previousStage = clamp(Math.floor(finiteNumber(card && card.gloryStage, 0)), 0, MEMORY_POINT_STAGES.length);
    const previousPeak = clamp(finiteNumber(card && card.peakStudyMastery, 0), 0, 100);
    const hasStudyEvidence = studiedNow === true || (studiedNow !== false && card && Number(card.studySeenAt) > 0);
    if (!hasStudyEvidence) {
      return Object.freeze({
        award: 0,
        stage: previousStage,
        peakStudyMastery: previousPeak,
        totalForCard: previousStage ? MEMORY_POINT_STAGES[previousStage - 1].total : 0,
        reached: []
      });
    }

    const peakStudyMastery = Math.max(previousPeak, clamp(finiteNumber(mastery, 0), 0, 100));
    let earnedStage = 1;
    for (let index = 1; index < MEMORY_POINT_STAGES.length; index += 1) {
      if (peakStudyMastery >= MEMORY_POINT_STAGES[index].mastery) earnedStage = index + 1;
    }
    const stage = Math.max(previousStage, earnedStage);
    const previousTotal = previousStage ? MEMORY_POINT_STAGES[previousStage - 1].total : 0;
    const totalForCard = stage ? MEMORY_POINT_STAGES[stage - 1].total : 0;
    return Object.freeze({
      award: Math.max(0, totalForCard - previousTotal),
      stage,
      peakStudyMastery,
      totalForCard,
      reached: MEMORY_POINT_STAGES.slice(previousStage, stage).map((milestone) => milestone.id)
    });
  }

  function migrateGloryClaims(claims, legacy = true) {
    const source = Array.isArray(claims) ? claims : [];
    const currentIds = new Set(GLORY_LEVELS.map((level) => level.id));
    const migrated = [];
    for (const rawId of source) {
      const id = String(rawId || '');
      let nextId = null;
      if (legacy) {
        const legacyIndex = LEGACY_GLORY_IDS.indexOf(id);
        if (legacyIndex >= 0) nextId = GLORY_LEVELS[legacyIndex].id;
        else if (currentIds.has(id)) nextId = id;
      } else if (currentIds.has(id)) nextId = id;
      if (nextId && !migrated.includes(nextId)) migrated.push(nextId);
    }
    return Object.freeze(migrated);
  }

  function upgradeCost(characterId, track, currentLevel) {
    const character = CHARACTERS.find((candidate) => candidate.id === characterId);
    if (!character) throw new RangeError(`Unknown character: ${characterId}`);
    if (!UPGRADE_TRACKS.includes(track)) throw new RangeError(`Unknown upgrade track: ${track}`);
    const level = Math.max(0, Math.floor(finiteNumber(currentLevel, 0)));
    if (level >= 3) return null;
    const node = character.upgrades.find((candidate) => candidate.track === track && candidate.level === level + 1);
    return node ? node.cost : null;
  }

  function calculateLegacyRefund(upgrades) {
    return Object.entries(LEGACY_UPGRADES).reduce((total, [id, costs]) => {
      const level = clamp(Math.floor(finiteNumber(upgrades && upgrades[id], 0)), 0, costs.length);
      return total + costs.slice(0, level).reduce((sum, cost) => sum + cost, 0);
    }, 0);
  }

  function refundLegacyUpgrades(progress) {
    const source = progress && typeof progress === 'object' ? progress : {};
    const currentCores = Math.max(0, finiteNumber(source.characterCores, 0));
    if (source.legacyUpgradeRefunded === true) {
      return Object.freeze({
        refund: 0,
        characterCores: currentCores,
        legacyUpgradeRefunded: true,
        legacyUpgradeRefundAmount: Math.max(0, finiteNumber(source.legacyUpgradeRefundAmount, 0))
      });
    }
    const refund = calculateLegacyRefund(source.upgrades);
    return Object.freeze({
      refund,
      characterCores: currentCores + refund,
      legacyUpgradeRefunded: true,
      legacyUpgradeRefundAmount: refund
    });
  }

  return deepFreeze({
    RADAR_AXES,
    UPGRADE_TRACKS,
    RANK_BANDS,
    CHARACTERS,
    UTILITIES,
    UTILITY_CATEGORIES,
    GLORY_LEVELS,
    MEMORY_POINT_STAGES,
    LEGACY_UPGRADES,
    rankBandForElo,
    rankProgress,
    matchRulesForElo,
    advanceRankClock,
    forfeitPolicy,
    botProfileForElo,
    chooseBotAnswer,
    chooseBotActions,
    isRankEligible,
    gloryAwardForStudy,
    migrateGloryClaims,
    upgradeCost,
    refundLegacyUpgrades
  });
});
