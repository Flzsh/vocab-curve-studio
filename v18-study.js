(function attachV18Study(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V18Study = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV18Study() {
  'use strict';

  const VERSION = 18;
  const MEMORY_STOPS = Object.freeze([
    Object.freeze([0.00, '#F0645A']),
    Object.freeze([0.24, '#EFA85E']),
    Object.freeze([0.52, '#7668F5']),
    Object.freeze([0.72, '#3B8FD3']),
    Object.freeze([1.00, '#2BB67D'])
  ]);
  const CLIMATE_STOPS = Object.freeze([
    Object.freeze([-1, '#4B7CF4']),
    Object.freeze([0, '#7764EE']),
    Object.freeze([1, '#FF754C'])
  ]);
  const FEEDBACK = Object.freeze({
    wrong: Object.freeze({ kind: 'wrong', color: '#FF4D65', strength: 0.74, duration: 760 }),
    correct: Object.freeze({ kind: 'correct', color: '#26C98A', strength: 0.48, duration: 680 }),
    know: Object.freeze({ kind: 'know', color: '#20C6CE', strength: 0.58, duration: 760 }),
    none: Object.freeze({ kind: 'none', color: null, strength: 0, duration: 0 })
  });

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function parseHex(value) {
    const source = String(value || '').replace('#', '');
    const expanded = source.length === 3 ? source.split('').map((part) => part + part).join('') : source;
    if (!/^[0-9a-f]{6}$/i.test(expanded)) return [115, 87, 242];
    return [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16));
  }

  function srgbToLinear(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function linearToSrgb(channel) {
    const value = channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
    return Math.round(clamp(value, 0, 1) * 255);
  }

  function rgbToOKLab(rgb) {
    const red = srgbToLinear(rgb[0]);
    const green = srgbToLinear(rgb[1]);
    const blue = srgbToLinear(rgb[2]);
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
      linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }

  function mixLab(left, right, amount) {
    const ratio = clamp(amount);
    return left.map((part, index) => part + (right[index] - part) * ratio);
  }

  function labFromHex(value) {
    return rgbToOKLab(parseHex(value));
  }

  function colorAt(stops, value) {
    const number = finite(value, stops[0][0]);
    if (number <= stops[0][0]) return labFromHex(stops[0][1]);
    for (let index = 1; index < stops.length; index += 1) {
      const lower = stops[index - 1];
      const upper = stops[index];
      if (number <= upper[0]) {
        const amount = (number - lower[0]) / (upper[0] - lower[0]);
        return mixLab(labFromHex(lower[1]), labFromHex(upper[1]), amount);
      }
    }
    return labFromHex(stops[stops.length - 1][1]);
  }

  function serialize(lab) {
    const rgb = oklabToRgb(lab);
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  }

  function feedbackFor(rating) {
    return FEEDBACK[rating] || FEEDBACK.none;
  }

  function memoryBand(score) {
    const value = clamp(finite(score) / 100);
    if (value < 0.24) return 'fragile';
    if (value < 0.48) return 'forming';
    if (value < 0.72) return 'developing';
    if (value < 0.88) return 'strong';
    return 'durable';
  }

  function resolvePalette(input = {}) {
    const memory = clamp(finite(input.memoryScore) / 100);
    const section = clamp(finite(input.sectionScore) / 100);
    const climate = input.climate && typeof input.climate === 'object' ? input.climate : {};
    const temperature = clamp(finite(climate.temperature), -1, 1);
    const energy = clamp(finite(climate.energy));
    const stability = clamp(finite(climate.stability, 1));
    const phase = input.phase === 'revealed' ? 'revealed' : 'recall';
    const feedback = feedbackFor(input.feedback);

    const semanticPrimary = colorAt(MEMORY_STOPS, memory);
    const semanticSecondary = colorAt(MEMORY_STOPS, section);
    const climateLab = colorAt(CLIMATE_STOPS, temperature);
    // Climate is intentionally limited: it changes atmosphere while memory state keeps semantic authority.
    const band = memoryBand(memory * 100);
    const semanticSpread = Math.abs(memory - section);
    const climateInfluence = clamp(0.038 + 0.072 * energy + 0.03 * (1 - stability) + 0.018 * Math.abs(temperature), 0.04, 0.19);
    const primaryLab = mixLab(semanticPrimary, climateLab, climateInfluence);
    const secondaryLab = mixLab(semanticSecondary, labFromHex('#28A9C8'), 0.10 + 0.07 * stability + 0.03 * (1 - semanticSpread));
    const activeLab = feedback.color
      ? mixLab(primaryLab, labFromHex(feedback.color), clamp(feedback.strength * (0.9 + 0.18 * energy), 0, 0.92))
      : mixLab(primaryLab, secondaryLab, clamp(0.02 + 0.08 * (1 - semanticSpread), 0.02, 0.12));

    const revealCalm = phase === 'revealed' ? 0.80 : 1;
    const motionEnergy = clamp(0.20 + 0.54 * energy + 0.12 * Math.abs(temperature) + 0.12 * (1 - stability) + (feedback.kind === 'none' ? 0 : 0.08), 0.18, 1);
    const flowSpeed = clamp(0.24 + 0.56 * energy + 0.10 * Math.abs(temperature) + 0.16 * (1 - stability), 0.22, 1);
    const toneDepth = clamp(0.20 + 0.36 * (1 - stability) + 0.18 * energy + 0.08 * Math.abs(temperature) + (phase === 'revealed' ? 0.07 : 0), 0.18, 0.84);
    const glow = clamp((0.16 + 0.27 * motionEnergy + 0.08 * toneDepth) * revealCalm, 0.15, 0.68);
    const surfaceStrength = clamp((0.21 + 0.13 * motionEnergy + 0.07 * toneDepth) * (phase === 'revealed' ? 0.85 : 1), 0.16, 0.54);

    return Object.freeze({
      primary: serialize(primaryLab),
      secondary: serialize(secondaryLab),
      active: serialize(activeLab),
      memory,
      section,
      band,
      phase,
      glow,
      surfaceStrength,
      motionEnergy,
      flowSpeed,
      toneDepth,
      stability,
      energy,
      temperature,
      feedback
    });
  }

  function cssVariables(palette) {
    const source = palette || resolvePalette();
    const percentage = (value) => `${Math.max(0, value).toFixed(2)}%`;
    return Object.freeze({
      '--v18-primary': source.primary,
      '--v18-secondary': source.secondary,
      '--v18-active': source.active,
      '--v18-surface-strength': source.surfaceStrength.toFixed(3),
      '--v18-glow-strength': source.glow.toFixed(3),
      '--v18-motion-energy': source.motionEnergy.toFixed(3),
      '--v18-stability': source.stability.toFixed(3),
      '--v18-feedback-strength': source.feedback.strength.toFixed(3),
      '--v18-word-level': `${(source.memory * 100).toFixed(2)}%`,
      '--v18-section-level': `${(source.section * 100).toFixed(2)}%`,
      // Precomputed presentation values avoid CSS variable multiplication, which is not
      // consistently supported by the Safari versions used by installed iPhone PWAs.
      '--v18-glass-alpha': (0.50 + source.surfaceStrength * 0.23 + source.toneDepth * 0.12).toFixed(3),
      '--v18-surface-tint-pct': percentage(source.surfaceStrength * 21 + source.toneDepth * 3),
      '--v18-secondary-tint-pct': percentage(source.surfaceStrength * 13 + source.flowSpeed * 2),
      '--v18-glow-shadow-pct': percentage(source.glow * 19 + source.toneDepth * 6),
      '--v18-overlay-opacity': (0.60 + source.glow * 0.20 + source.toneDepth * 0.14).toFixed(3),
      '--v18-sheen-duration': `${(17 - source.flowSpeed * 9).toFixed(2)}s`,
      '--v18-atmosphere-opacity': (0.36 + source.glow * 0.34 + source.toneDepth * 0.24).toFixed(3),
      '--v18-atmosphere-saturation': (0.92 + source.motionEnergy * 0.10 + source.toneDepth * 0.10).toFixed(3),
      '--v18-ambient-blob-opacity': (0.05 + source.glow * 0.10 + source.toneDepth * 0.12).toFixed(3),
      '--v18-atmosphere-duration': `${(19 - source.flowSpeed * 10).toFixed(2)}s`,
      '--v18-rail-glow-pct': percentage(source.glow * 44 + source.toneDepth * 9),
      '--v18-liquid-sheen-opacity': (0.16 + source.stability * 0.18 + source.flowSpeed * 0.18 + source.toneDepth * 0.08).toFixed(3),
      '--v18-particle-duration': `${(15.5 - source.flowSpeed * 9).toFixed(2)}s`,
      '--v18-face-tint-pct': percentage(source.surfaceStrength * 12 + source.toneDepth * 4),
      '--v18-face-glow-pct': percentage(source.glow * 15 + source.flowSpeed * 4),
      '--v18-word-shadow-pct': percentage(source.glow * 22 + source.toneDepth * 6),
      '--v18-page-wash-opacity': (0.26 + source.glow * 0.22 + source.toneDepth * 0.22).toFixed(3),
      '--v18-flow-opacity': (0.18 + source.toneDepth * 0.30 + source.flowSpeed * 0.14).toFixed(3),
      '--v18-flow-shift': `${(18 + source.flowSpeed * 38).toFixed(2)}px`
    });
  }

  function applyVisualState(stage, input = {}) {
    const palette = resolvePalette(input);
    if (!stage) return palette;
    if (stage.style && typeof stage.style.setProperty === 'function') {
      for (const [name, value] of Object.entries(cssVariables(palette))) stage.style.setProperty(name, value);
    }
    if (stage.dataset) {
      stage.dataset.v18MemoryBand = palette.band;
      stage.dataset.v18Phase = palette.phase;
      if (palette.feedback.kind === 'none') delete stage.dataset.v18Feedback;
      else stage.dataset.v18Feedback = palette.feedback.kind;
    }
    return palette;
  }

  return Object.freeze({
    VERSION,
    feedbackFor,
    memoryBand,
    resolvePalette,
    cssVariables,
    applyVisualState
  });
});
