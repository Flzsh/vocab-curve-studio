(function attachV20Forecast(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20Forecast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV20Forecast() {
  'use strict';

  const VERSION = '20.0.0-alpha.20';
  const DAY = 86400000;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

  function localDaySerial(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return 0;
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
  }

  function calendarDayIndex(dueAt, now = Date.now()) {
    const due = Number(dueAt);
    const anchor = Number(now);
    if (!Number.isFinite(due) || !Number.isFinite(anchor)) return 0;
    if (due <= anchor) return 0;
    return Math.max(0, localDaySerial(due) - localDaySerial(anchor));
  }

  function labelFor(index, now) {
    if (index === 0) return 'Today';
    const date = new Date(now);
    date.setDate(date.getDate() + index);
    return date.toLocaleDateString(undefined, { weekday:'short' });
  }

  function hasLearningEvidence(card) {
    const history = Array.isArray(card && card.history) ? card.history : [];
    const hasStudyHistory = history.some(entry => {
      if (!entry || typeof entry !== 'object') return false;
      const source = String(entry.kind || entry.source || entry.context || '').toLowerCase();
      return source !== 'ranked' && source !== 'battle';
    });
    return Number(card && card.introducedAt) > 0
      || Number(card && card.studySeenAt) > 0
      || Number(card && card.studyReviews) > 0
      || Number(card && card.lastReviewedAt) > 0
      || (Number(card && card.reps) > 0 && hasStudyHistory)
      || hasStudyHistory;
  }

  function build(cards, options = {}) {
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const count = Math.max(1, Math.min(14, Math.floor(Number(options.days) || 7)));
    const days = Array.from({ length:count }, (_, index) => ({ index, label:labelFor(index, now), count:0 }));
    for (const card of Array.isArray(cards) ? cards : []) {
      const dueAt = Number(card && card.dueAt);
      if (!card || card.deleted || card.state === 'suspended' || card.state === 'known' || !hasLearningEvidence(card) || !(dueAt > 0)) continue;
      const index = calendarDayIndex(dueAt, now);
      if (index >= 0 && index < count) days[index].count += 1;
    }
    const total = days.reduce((sum, day) => sum + day.count, 0);
    const today = days[0]?.count || 0;
    const nextSix = days.slice(1).reduce((sum, day) => sum + day.count, 0);
    const max = Math.max(1, ...days.map(day => day.count));
    return Object.freeze({ now, total, today, nextSix, max, days:Object.freeze(days.map(day => Object.freeze(day))) });
  }

  function render(model) {
    const safe = model && Array.isArray(model.days) ? model : build([], {});
    const summary = safe.total
      ? `<div class="forecast-overview"><span><small>Due today</small><b>${escapeHtml(safe.today)}</b></span><span><small>Next 6 days</small><b>${escapeHtml(safe.nextSix)}</b></span></div>`
      : '<div class="forecast-overview"><span class="forecast-clear"><small>Schedule</small><b>Clear</b></span></div>';
    const bars = safe.days.map(day => {
      const ratio = clamp(day.count / Math.max(1, safe.max), 0, 1);
      const height = day.count ? Math.max(10, Math.round(ratio * 100)) : 4;
      return `<div class="forecast-day" title="${escapeHtml(day.label)}: ${escapeHtml(day.count)} due"><div class="forecast-bar-track" aria-hidden="true"><i class="forecast-day-bar" style="height:${height}%"></i></div><b class="forecast-day-count">${escapeHtml(day.count)}</b><span class="forecast-day-label">${escapeHtml(day.label)}</span></div>`;
    }).join('');
    return `${summary}<div class="forecast-spark">${bars}</div>`;
  }

  return Object.freeze({ VERSION, DAY, localDaySerial, calendarDayIndex, build, render });
});
