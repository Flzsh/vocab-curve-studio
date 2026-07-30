// Studio Workspace v43.0.0-beta-studio.14
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VocabCurveStudioWorkspace = api;
  if (root && root.document) {
    try {
      api.boot(root.document);
    } catch (error) {
      if (root.console && typeof root.console.warn === 'function') {
        root.console.warn('Studio workspace enhancement unavailable', error);
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var PALETTES = Object.freeze({
    new: Object.freeze({ a: '#0A84FF', b: '#64D2FF', glow: 'rgba(10,132,255,.16)' }),
    learning: Object.freeze({ a: '#5E5CE6', b: '#BF5AF2', glow: 'rgba(94,92,230,.16)' }),
    relearning: Object.freeze({ a: '#FF9F0A', b: '#FFD60A', glow: 'rgba(255,159,10,.16)' }),
    known: Object.freeze({ a: '#30D158', b: '#64D2FF', glow: 'rgba(48,209,88,.16)' }),
    import: Object.freeze({ a: '#0A84FF', b: '#5AC8FA', glow: 'rgba(10,132,255,.14)' }),
    planner: Object.freeze({ a: '#5E5CE6', b: '#AF52DE', glow: 'rgba(94,92,230,.14)' }),
    books: Object.freeze({ a: '#30D158', b: '#64D2FF', glow: 'rgba(48,209,88,.14)' }),
    stats: Object.freeze({ a: '#5856D6', b: '#64D2FF', glow: 'rgba(88,86,214,.14)' }),
    settings: Object.freeze({ a: '#8E8E93', b: '#0A84FF', glow: 'rgba(142,142,147,.12)' }),
    more: Object.freeze({ a: '#8E8E93', b: '#5E5CE6', glow: 'rgba(142,142,147,.12)' })
  });
  var OWNERS = new WeakMap();
  var TABLET_QUERY = '(min-width: 721px) and (max-width: 1179px)';
  var PHONE_QUERY = '(max-width: 720px), (min-width: 721px) and (max-width: 900px) and (max-height: 520px)';
  var REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
  var CONTROL_SELECTOR = 'button,.btn,.rate,.v19-side-tab';

  function finiteNumber(value, fallback) {
    try {
      var number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function classifyContext(input) {
    var source = input && typeof input === 'object' ? input : {};
    var normalizedView = String(source.view || 'study').trim().toLowerCase();
    if (normalizedView !== 'study') return PALETTES[normalizedView] ? normalizedView : 'more';
    var explicitState = String(source.stateText || '').trim().toLowerCase();
    if (/known|mastered/.test(explicitState)) return 'known';
    if (/relearn/.test(explicitState)) return 'relearning';
    var mode = String(source.modeText || '').toLowerCase();
    if (/known|mastered|\bknow\b/.test(mode)) return 'known';
    if (/relearn|wrong|difficult|\bhard\b|reinforce|repair/.test(mode)) return 'relearning';
    if (/learn|review|due/.test(mode)) return 'learning';
    return 'new';
  }

  function paletteFor(context) {
    var palette = PALETTES[context] || PALETTES.new;
    return { a: palette.a, b: palette.b, glow: palette.glow };
  }

  function springStep(spring, target, dt, options) {
    var source = spring && typeof spring === 'object' ? spring : {};
    var value = finiteNumber(source.value, 0);
    var velocity = finiteNumber(source.velocity, 0);
    var destination = finiteNumber(target, value);
    var step = Math.min(0.05, Math.max(0, finiteNumber(dt, 0)));
    var settings = options && typeof options === 'object' ? options : {};
    var response = finiteNumber(settings.response, 0.36);
    if (response <= 0) response = 0.36;
    response = Math.max(0.1, response);
    var damping = finiteNumber(settings.damping, 1);
    if (damping < 0) damping = 1;
    var omega = (Math.PI * 2) / response;
    var frequencySquared = omega * omega;
    var denominator = 1 + (2 * step * damping * omega) + (step * step * frequencySquared);
    return {
      value: ((1 + (2 * step * damping * omega)) * value + (step * velocity) + (step * step * frequencySquared * destination)) / denominator,
      velocity: (velocity + (step * frequencySquared * (destination - value))) / denominator
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function popoverPlacement(anchorRect, menuRect, viewport) {
    var anchor = anchorRect && typeof anchorRect === 'object' ? anchorRect : {};
    var menu = menuRect && typeof menuRect === 'object' ? menuRect : {};
    var frame = viewport && typeof viewport === 'object' ? viewport : {};
    var margin = 12;
    var gap = 8;
    var width = Math.max(0, finiteNumber(menu.width, 0));
    var height = Math.max(0, finiteNumber(menu.height, 0));
    var viewportWidth = Math.max(width + (margin * 2), finiteNumber(frame.width, width + (margin * 2)));
    var viewportHeight = Math.max(height + (margin * 2), finiteNumber(frame.height, height + (margin * 2)));
    var anchorRight = finiteNumber(anchor.right, finiteNumber(anchor.left, margin));
    var anchorTop = finiteNumber(anchor.top, margin);
    var anchorBottom = finiteNumber(anchor.bottom, anchorTop);
    var roomBelow = viewportHeight - anchorBottom - margin;
    var roomAbove = anchorTop - margin;
    var side = roomBelow >= height + gap || roomBelow >= roomAbove ? 'below' : 'above';
    var preferredTop = side === 'below' ? anchorBottom + gap : anchorTop - height - gap;
    return {
      left: Math.round(clamp(anchorRight - width, margin, viewportWidth - width - margin)),
      top: Math.round(clamp(preferredTop, margin, viewportHeight - height - margin)),
      side: side
    };
  }

  function nextComboboxIndex(current, key, count) {
    var length = Math.max(0, Math.floor(finiteNumber(count, 0)));
    if (!length) return -1;
    var index = clamp(Math.floor(finiteNumber(current, 0)), 0, length - 1);
    if (key === 'ArrowDown') return (index + 1) % length;
    if (key === 'ArrowUp') return (index - 1 + length) % length;
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    return index;
  }

  function snapshotSelectOptions(selectLike) {
    return Array.prototype.slice.call(selectLike && selectLike.options || []).map(function(option, index) {
      return {
        index: index,
        value: String(option.value),
        label: String(option.textContent || option.label || option.value),
        disabled: Boolean(option.disabled),
      };
    });
  }

  function selectedOptionIndex(records, value) {
    var target = String(value);
    return (Array.isArray(records) ? records : []).findIndex(function(record) {
      return String(record.value) === target;
    });
  }

  function consumeSelectKeyEvent(event, open) {
    if (!event) return false;
    var key = event.key;
    var printable = key && key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
    var consumed = key === 'Enter'
      || key === ' '
      || ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)
      || (key === 'Escape' && Boolean(open))
      || printable;
    if (!consumed) return false;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    return true;
  }

  function enabledIndexes(records) {
    return (Array.isArray(records) ? records : []).map(function(record, index) {
      return record.disabled ? -1 : index;
    }).filter(function(index) { return index >= 0; });
  }

  function nextEnabledOptionIndex(records, current, key) {
    var enabled = enabledIndexes(records);
    if (!enabled.length) return -1;
    if (key === 'Home') return enabled[0];
    if (key === 'End') return enabled[enabled.length - 1];
    var position = enabled.indexOf(current);
    if (position < 0) position = 0;
    if (key === 'ArrowDown') return enabled[(position + 1) % enabled.length];
    if (key === 'ArrowUp') return enabled[(position - 1 + enabled.length) % enabled.length];
    return enabled[position];
  }

  function typeaheadOptionIndex(records, current, query) {
    var needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return -1;
    var source = Array.isArray(records) ? records : [];
    for (var offset = 1; offset <= source.length; offset += 1) {
      var index = (Math.max(-1, current) + offset) % source.length;
      if (!source[index].disabled && String(source[index].label).toLocaleLowerCase().startsWith(needle)) return index;
    }
    return -1;
  }

  function nodeContainsSelect(node) {
    if (!node) return false;
    if (String(node.tagName || '').toUpperCase() === 'SELECT') return true;
    return typeof node.querySelector === 'function' && Boolean(node.querySelector('select'));
  }

  function nodeBelongsToSelect(node) {
    var current = node;
    while (current) {
      if (String(current.tagName || '').toUpperCase() === 'SELECT') return true;
      current = current.parentElement || current.parentNode;
    }
    return false;
  }

  function selectMutationIsRelevant(mutation) {
    if (!mutation || !mutation.target) return false;
    if (nodeBelongsToSelect(mutation.target)) return true;
    if (mutation.type !== 'childList') return false;
    var changedNodes = Array.prototype.slice.call(mutation.addedNodes || []).concat(Array.prototype.slice.call(mutation.removedNodes || []));
    return changedNodes.some(nodeContainsSelect);
  }

  function reflectDisabledState(control, disabled) {
    if (!control) return false;
    var next = Boolean(disabled);
    if (Boolean(control.disabled) === next) return false;
    control.disabled = next;
    return true;
  }

  function ensureSelectShellAdjacency(select, shell) {
    if (!select || !shell || !select.parentElement) return false;
    if (select.nextSibling === shell && shell.parentElement === select.parentElement) return false;
    if (typeof select.parentElement.insertBefore === 'function') select.parentElement.insertBefore(shell, select.nextSibling || null);
    else if (!select.nextSibling && typeof select.parentElement.appendChild === 'function') select.parentElement.appendChild(shell);
    else return false;
    return true;
  }

  function removeSelectShell(record) {
    var shell = record && record.shell;
    if (!shell || !shell.parentElement || typeof shell.parentElement.removeChild !== 'function') return false;
    try {
      shell.parentElement.removeChild(shell);
      return true;
    } catch (error) {
      return false;
    }
  }

  function configureSelectOptionFocus(option) {
    if (!option) return option;
    option.tabIndex = -1;
    return option;
  }

  function attributeSnapshot(element, name) {
    var present = Boolean(element && typeof element.hasAttribute === 'function' && element.hasAttribute(name));
    return {
      present: present,
      value: present && typeof element.getAttribute === 'function' ? element.getAttribute(name) : null
    };
  }

  function restoreAttributeSnapshot(element, name, snapshot) {
    if (!element || !snapshot) return;
    try {
      if (snapshot.present && typeof element.setAttribute === 'function') element.setAttribute(name, snapshot.value);
      else if (typeof element.removeAttribute === 'function') element.removeAttribute(name);
    } catch (error) {
      // Rollback continues so one hostile reflection does not strand other native state.
    }
  }

  function snapshotNativeSelectState(select, sourceLabel, labelledElement) {
    return {
      tabIndex: select ? select.tabIndex : 0,
      tabIndexAttribute: attributeSnapshot(select, 'tabindex'),
      ariaHidden: attributeSnapshot(select, 'aria-hidden'),
      hadNativeClass: Boolean(select && select.classList && select.classList.contains('studio-native-select')),
      labelFor: attributeSnapshot(sourceLabel, 'for'),
      labelId: attributeSnapshot(sourceLabel, 'id'),
      labelledElement: labelledElement || sourceLabel || null,
      labelledElementId: attributeSnapshot(labelledElement || sourceLabel, 'id')
    };
  }

  function restoreNativeSelectState(select, sourceLabel, snapshot) {
    if (!select || !snapshot) return;
    try {
      if (select.classList) {
        if (snapshot.hadNativeClass && typeof select.classList.add === 'function') select.classList.add('studio-native-select');
        else if (typeof select.classList.remove === 'function') select.classList.remove('studio-native-select');
      }
    } catch (error) {
      // Continue restoring keyboard and accessibility state.
    }
    try {
      select.tabIndex = snapshot.tabIndex;
    } catch (error) {
      // The tabindex attribute snapshot below remains the native fallback.
    }
    restoreAttributeSnapshot(select, 'tabindex', snapshot.tabIndexAttribute);
    restoreAttributeSnapshot(select, 'aria-hidden', snapshot.ariaHidden);
    restoreAttributeSnapshot(sourceLabel, 'for', snapshot.labelFor);
    restoreAttributeSnapshot(sourceLabel, 'id', snapshot.labelId);
    if (snapshot.labelledElement && snapshot.labelledElement !== sourceLabel) {
      restoreAttributeSnapshot(snapshot.labelledElement, 'id', snapshot.labelledElementId);
    }
  }

  function rollbackSelectEnhancement(select, record, sourceLabel, nativeState, registry, records, shell) {
    try {
      if (registry && typeof registry.delete === 'function') registry.delete(select);
    } catch (error) {
      // Weak registry cleanup is best-effort; the visible/native state still rolls back.
    }
    removeSelectShell(record || { shell: shell });
    restoreNativeSelectState(select, sourceLabel, nativeState);
    return (Array.isArray(records) ? records : []).filter(function(candidate) {
      return candidate !== record;
    });
  }

  function rangeFillPercentage(value, minimum, maximum) {
    var min = finiteNumber(minimum, 0);
    var max = finiteNumber(maximum, min);
    if (max <= min) return 0;
    return Math.round(clamp((finiteNumber(value, min) - min) / (max - min), 0, 1) * 10000) / 100;
  }

  function supportsSelectPopover(element) {
    return Boolean(element &&
      typeof element.showPopover === 'function' &&
      typeof element.hidePopover === 'function');
  }

  function showSelectPopover(element) {
    if (!supportsSelectPopover(element)) return false;
    element.hidden = false;
    try {
      element.showPopover();
      return true;
    } catch (error) {
      element.hidden = true;
      return false;
    }
  }

  function hideSelectPopover(element) {
    if (!element) return false;
    var hiddenFromTopLayer = false;
    if (typeof element.hidePopover === 'function') {
      try {
        element.hidePopover();
        hiddenFromTopLayer = true;
      } catch (error) {
        hiddenFromTopLayer = false;
      }
    }
    element.hidden = true;
    return hiddenFromTopLayer;
  }

  function selectOptionScrollTop(listboxRect, optionRect, currentScrollTop, maximumScrollTop) {
    var current = Math.max(0, finiteNumber(currentScrollTop, 0));
    var maximum = Math.max(0, finiteNumber(maximumScrollTop, current));
    var next = current;
    if (optionRect && listboxRect && finiteNumber(optionRect.top, 0) < finiteNumber(listboxRect.top, 0)) {
      next -= finiteNumber(listboxRect.top, 0) - finiteNumber(optionRect.top, 0);
    } else if (optionRect && listboxRect && finiteNumber(optionRect.bottom, 0) > finiteNumber(listboxRect.bottom, 0)) {
      next += finiteNumber(optionRect.bottom, 0) - finiteNumber(listboxRect.bottom, 0);
    }
    return Math.min(maximum, Math.max(0, next));
  }

  function scrollOriginatesInSelectListbox(record, event) {
    var target = event && event.target;
    return Boolean(record && record.open && record.listbox && target &&
      (target === record.listbox ||
        (typeof record.listbox.contains === 'function' && record.listbox.contains(target))));
  }

  function boot(documentRef) {
    if (!documentRef || !documentRef.body) return null;
    if (OWNERS.has(documentRef)) return OWNERS.get(documentRef);

    var body = documentRef.body;
    var windowRef = documentRef.defaultView || root || {};
    var controller = {};
    OWNERS.set(documentRef, controller);

    var cardMode = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('cardMode') : null;
    var currentMeta = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('currentMeta') : null;
    var answerPanel = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('answerPanel') : null;
    var tabs = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('tabs') : null;
    var headerNav = typeof documentRef.querySelector === 'function' ? documentRef.querySelector('.header-nav') : null;
    var headerNavHome = headerNav ? headerNav.parentNode : null;
    var headerNavNext = headerNav ? headerNav.nextSibling : null;
    var savePill = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('savePill') : null;
    var toastZone = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('toastZone') : null;
    var booksView = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('view-books') : null;
    var libraryOrganizer = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('libraryOrganizer') : null;
    var protectBacklog = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('protectBacklog') : null;
    var requireTypingInstant = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('requireTypingInstant') : null;
    var sideTabs = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('studySideTabs') : null;
    var side = typeof documentRef.querySelector === 'function' ? documentRef.querySelector('.study-side') : null;
    var actionRow = typeof documentRef.querySelector === 'function' ? documentRef.querySelector('.study-top .row') : null;
    var toggle = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('macInspectorToggle') : null;
    var closeButton = side && typeof side.querySelector === 'function' ? side.querySelector('.mac-inspector-close') : null;
    var reducedMedia = safeMedia(REDUCED_QUERY);
    var updateFrame = 0;
    var inspectorFrame = 0;
    var lastTimestamp = 0;
    var inspectorTarget = 0;
    var inspectorSpring = { value: 0, velocity: 0 };
    var pressedControl = null;
    var lastViewportMode = '';
    var lastActiveView = '';
    var openLibraryMenu = null;
    var selectRecords = new WeakMap();
    var enhancedSelects = [];
    var activeSelectRecord = null;
    var typeaheadBuffer = '';
    var typeaheadTimer = 0;
    var generatedId = 0;

    if (body.classList && typeof body.classList.add === 'function') body.classList.add('studio-workspace');

    function safeMedia(query) {
      if (typeof windowRef.matchMedia !== 'function') return null;
      try {
        return windowRef.matchMedia(query);
      } catch (error) {
        return null;
      }
    }

    function currentView() {
      var dataset = body.dataset || {};
      return String(dataset.activeView || dataset.v19View || 'study').trim().toLowerCase();
    }

    function viewportMatches(query, minimum, maximum) {
      var media = safeMedia(query);
      if (media) return Boolean(media.matches);
      var width = finiteNumber(windowRef.innerWidth, NaN);
      return Number.isFinite(width) && width >= minimum && width <= maximum;
    }

    function isTablet() {
      return viewportMatches(TABLET_QUERY, 721, 1179);
    }

    function isPhone() {
      return viewportMatches(PHONE_QUERY, 0, 720);
    }

    function isCompact() {
      return isPhone() || isTablet();
    }

    function isWide() {
      return !isCompact();
    }

    function viewportMode() {
      return isPhone() ? 'phone' : isTablet() ? 'tablet' : 'wide';
    }

    function hasReducedMotion() {
      return Boolean(reducedMedia && reducedMedia.matches);
    }

    function isLowPower() {
      return Boolean(body.classList && body.classList.contains('low-power'));
    }

    function requestFrame(callback) {
      if (typeof windowRef.requestAnimationFrame !== 'function') return 0;
      try {
        return windowRef.requestAnimationFrame(callback);
      } catch (error) {
        return 0;
      }
    }

    function cancelFrame(handle) {
      if (!handle || typeof windowRef.cancelAnimationFrame !== 'function') return;
      try {
        windowRef.cancelAnimationFrame(handle);
      } catch (error) {
        // Presentation cancellation is best-effort.
      }
    }

    function setAttributeIfChanged(element, name, value) {
      if (!element || typeof element.setAttribute !== 'function') return;
      if (typeof element.getAttribute !== 'function' || element.getAttribute(name) !== value) element.setAttribute(name, value);
    }

    function removeAttributeIfPresent(element, name) {
      if (!element || typeof element.removeAttribute !== 'function') return;
      if (typeof element.hasAttribute !== 'function' || element.hasAttribute(name)) element.removeAttribute(name);
    }

    function renderInspector() {
      if (!body.style || typeof body.style.setProperty !== 'function') return;
      var rendered = Math.min(1, Math.max(0, finiteNumber(inspectorSpring.value, inspectorTarget)));
      body.style.setProperty('--mac-inspector-progress', rendered.toFixed(4));
    }

    function stopInspectorAt(target) {
      cancelFrame(inspectorFrame);
      inspectorFrame = 0;
      lastTimestamp = 0;
      inspectorSpring = { value: target, velocity: 0 };
      renderInspector();
    }

    function inspectorTick(timestamp) {
      inspectorFrame = 0;
      if (hasReducedMotion() || isLowPower()) {
        stopInspectorAt(inspectorTarget);
        return;
      }
      var now = finiteNumber(timestamp, lastTimestamp ? lastTimestamp + (1000 / 60) : 1000 / 60);
      var dt = lastTimestamp ? (now - lastTimestamp) / 1000 : 1 / 60;
      lastTimestamp = now;
      inspectorSpring = springStep(inspectorSpring, inspectorTarget, dt, { response: 0.36, damping: 1 });
      if (Math.abs(inspectorSpring.value - inspectorTarget) < 0.0005 && Math.abs(inspectorSpring.velocity) < 0.0005) {
        stopInspectorAt(inspectorTarget);
        return;
      }
      renderInspector();
      inspectorFrame = requestFrame(inspectorTick);
      if (!inspectorFrame) stopInspectorAt(inspectorTarget);
    }

    function toggleUsable() {
      return Boolean(toggle && !toggle.hidden && !toggle.disabled && (typeof documentRef.contains !== 'function' || documentRef.contains(toggle)));
    }

    function moveFocusOutsidePanel() {
      var active = documentRef.activeElement;
      if (!side || !active || typeof side.contains !== 'function' || !side.contains(active)) return;
      if (toggleUsable() && typeof toggle.focus === 'function') {
        toggle.focus();
        return;
      }
      var activeTab = tabs && typeof tabs.querySelector === 'function' ? tabs.querySelector('.tab.active') : null;
      if (activeTab && !activeTab.hidden && !activeTab.disabled && typeof activeTab.focus === 'function') {
        activeTab.focus();
        return;
      }
      if (typeof active.blur === 'function') active.blur();
    }

    function syncPanelExposure(open) {
      if (!side) return;
      var exposed = currentView() === 'study' && (isWide() || (isCompact() && open));
      if (!exposed) moveFocusOutsidePanel();
      if (exposed) {
        removeAttributeIfPresent(side, 'inert');
        removeAttributeIfPresent(side, 'aria-hidden');
      } else {
        setAttributeIfChanged(side, 'inert', '');
        setAttributeIfChanged(side, 'aria-hidden', 'true');
      }
    }

    function focusPanelEntry() {
      if (!sideTabs || typeof sideTabs.querySelector !== 'function') return;
      var entry = sideTabs.querySelector('.v19-side-tab.active') || sideTabs.querySelector('.v19-side-tab');
      if (entry && !entry.hidden && !entry.disabled && typeof entry.focus === 'function') entry.focus();
    }

    function setInspector(open, options) {
      var settings = options && typeof options === 'object' ? options : {};
      var allowed = isCompact() && currentView() === 'study' && Boolean(toggle && side && sideTabs);
      var nextOpen = Boolean(open && allowed);
      inspectorTarget = nextOpen ? 1 : 0;
      if (body.classList && typeof body.classList.toggle === 'function') body.classList.toggle('mac-inspector-open', nextOpen);
      setAttributeIfChanged(toggle, 'aria-expanded', String(nextOpen));
      syncPanelExposure(nextOpen);
      if (nextOpen && settings.focusPanel) focusPanelEntry();
      if (settings.immediate || hasReducedMotion() || isLowPower() || typeof windowRef.requestAnimationFrame !== 'function') {
        stopInspectorAt(inspectorTarget);
      } else if (!inspectorFrame) {
        lastTimestamp = 0;
        inspectorFrame = requestFrame(inspectorTick);
        if (!inspectorFrame) stopInspectorAt(inspectorTarget);
      }
      if (!nextOpen && settings.returnFocus && toggleUsable() && typeof toggle.focus === 'function') toggle.focus();
    }

    function toggleInspector() {
      var open = Boolean(body.classList && body.classList.contains('mac-inspector-open'));
      setInspector(!open, { focusPanel: !open });
    }

    function ensureToggle() {
      var usable = isCompact() && currentView() === 'study' && side && sideTabs && actionRow;
      if (!toggle && usable && typeof documentRef.createElement === 'function') {
        try {
          toggle = documentRef.createElement('button');
          toggle.id = 'macInspectorToggle';
          toggle.type = 'button';
          toggle.className = 'btn btn-mini mac-inspector-toggle';
          setAttributeIfChanged(toggle, 'aria-controls', 'studySideTabs');
          setAttributeIfChanged(toggle, 'aria-expanded', 'false');
          if (typeof toggle.addEventListener === 'function') toggle.addEventListener('click', toggleInspector);
          if (typeof actionRow.appendChild === 'function') actionRow.appendChild(toggle);
        } catch (error) {
          toggle = null;
        }
      }
      if (toggle) {
        var label = isPhone() ? 'Details' : 'Inspector';
        toggle.textContent = label;
        setAttributeIfChanged(toggle, 'aria-label', label);
        toggle.hidden = !usable;
        toggle.disabled = !usable;
      }
      var closeUsable = Boolean(usable);
      if (!closeButton && closeUsable && typeof documentRef.createElement === 'function') {
        try {
          closeButton = documentRef.createElement('button');
          closeButton.type = 'button';
          closeButton.className = 'btn btn-mini mac-inspector-close';
          closeButton.textContent = '×';
          if (typeof closeButton.addEventListener === 'function') {
            closeButton.addEventListener('click', function () {
              setInspector(false, { returnFocus: true });
            });
          }
          if (typeof side.appendChild === 'function') side.appendChild(closeButton);
        } catch (error) {
          closeButton = null;
        }
      }
      if (closeButton) {
        setAttributeIfChanged(closeButton, 'aria-label', isPhone() ? 'Close Details' : 'Close Inspector');
        closeButton.hidden = !closeUsable;
        closeButton.disabled = !closeUsable;
      }
      return toggle;
    }

    function syncNavPortal() {
      if (!headerNav || !headerNavHome) return;
      if (isPhone()) {
        if (headerNav.parentNode !== body && typeof body.appendChild === 'function') body.appendChild(headerNav);
        body.classList && body.classList.add('mac-phone-nav-portal');
      } else {
        if (headerNav.parentNode !== headerNavHome) {
          if (headerNavNext && headerNavNext.parentNode === headerNavHome && typeof headerNavHome.insertBefore === 'function') headerNavHome.insertBefore(headerNav, headerNavNext);
          else if (typeof headerNavHome.appendChild === 'function') headerNavHome.appendChild(headerNav);
        }
        body.classList && body.classList.remove('mac-phone-nav-portal');
      }
    }

    function syncTabs(view) {
      syncNavPortal();
      if (!tabs || typeof tabs.querySelectorAll !== 'function') return;
      var destination = isPhone() ? (view === 'study' ? 'study' : view === 'import' ? 'import' : 'more') : view;
      setAttributeIfChanged(tabs, 'data-mac-destination', destination);
      var tabList = tabs.querySelectorAll('.tab');
      if (!tabList || typeof tabList.forEach !== 'function') return;
      tabList.forEach(function (tab) {
        if (!tab || !tab.dataset || !tab.classList || typeof tab.classList.toggle !== 'function') return;
        var selected = tab.dataset.view === destination;
        tab.classList.toggle('active', selected);
        if (selected) setAttributeIfChanged(tab, 'aria-current', 'page');
        else removeAttributeIfPresent(tab, 'aria-current');
      });
    }

    function directChild(element, tagName) {
      if (!element || !element.children) return null;
      var expected = String(tagName || '').toUpperCase();
      for (var index = 0; index < element.children.length; index += 1) {
        if (element.children[index] && element.children[index].tagName === expected) return element.children[index];
      }
      return null;
    }

    function nextGeneratedId(prefix) {
      generatedId += 1;
      return String(prefix || 'mac-control') + '-' + generatedId;
    }

    function setMenuBodyState(open) {
      if (body.classList && typeof body.classList.toggle === 'function') body.classList.toggle('mac-library-menu-open', Boolean(open));
    }

    function libraryControlUsable(control) {
      if (!control || control.hidden || control.disabled || typeof control.focus !== 'function') return false;
      if (typeof control.getAttribute === 'function' && control.getAttribute('tabindex') === '-1') return false;
      return typeof documentRef.contains !== 'function' || documentRef.contains(control);
    }

    function focusLibraryEntry(menu) {
      if (!menu || typeof menu.querySelectorAll !== 'function') return false;
      var controls = menu.querySelectorAll('button,input,select,textarea,a,[href],[tabindex]');
      for (var index = 0; controls && index < controls.length; index += 1) {
        if (!libraryControlUsable(controls[index])) continue;
        controls[index].focus();
        return true;
      }
      return false;
    }

    function focusLibraryReturn(record, preferTab) {
      var activeTab = tabs && typeof tabs.querySelector === 'function' ? tabs.querySelector('.tab.active') : null;
      if (preferTab && libraryControlUsable(activeTab)) {
        activeTab.focus();
        return true;
      }
      if (record && libraryControlUsable(record.summary)) {
        record.summary.focus();
        return true;
      }
      if (libraryControlUsable(activeTab)) {
        activeTab.focus();
        return true;
      }
      var active = documentRef.activeElement;
      if (active && typeof active.blur === 'function') active.blur();
      return false;
    }

    function closeActiveLibraryMenu(options) {
      if (!openLibraryMenu) return false;
      var settings = options && typeof options === 'object' ? options : {};
      var record = openLibraryMenu;
      var active = documentRef.activeElement;
      var focusWasInside = Boolean(active && record.menu && typeof record.menu.contains === 'function' && record.menu.contains(active));
      openLibraryMenu = null;
      try {
        if (record.menu && typeof record.menu.hidePopover === 'function') record.menu.hidePopover();
      } catch (error) {
        // A detached popover is already effectively closed.
      }
      if (record.menu) {
        record.menu.hidden = true;
        removeAttributeIfPresent(record.menu, 'data-mac-popover-open');
      }
      if (record.details) record.details.open = false;
      setAttributeIfChanged(record.summary, 'aria-expanded', 'false');
      setMenuBodyState(false);
      if (settings.returnFocus || (focusWasInside && !settings.preserveFocus)) focusLibraryReturn(record, Boolean(settings.preferTab));
      return true;
    }

    function positionActiveLibraryMenu() {
      if (!openLibraryMenu) return;
      var record = openLibraryMenu;
      if (!record.summary || !record.menu || typeof record.summary.getBoundingClientRect !== 'function' || typeof record.menu.getBoundingClientRect !== 'function') return;
      var anchorRect = record.summary.getBoundingClientRect();
      var menuRect = record.menu.getBoundingClientRect();
      var placement = popoverPlacement(anchorRect, {
        width: finiteNumber(menuRect.width, 260),
        height: finiteNumber(menuRect.height, 180)
      }, {
        width: finiteNumber(windowRef.innerWidth, 1024),
        height: finiteNumber(windowRef.innerHeight, 768)
      });
      if (record.menu.style && typeof record.menu.style.setProperty === 'function') {
        record.menu.style.setProperty('--mac-menu-left', placement.left + 'px');
        record.menu.style.setProperty('--mac-menu-top', placement.top + 'px');
      }
      setAttributeIfChanged(record.menu, 'data-mac-popover-side', placement.side);
    }

    function openEnhancedLibraryMenu(details, summary, menu) {
      if (openLibraryMenu && openLibraryMenu.details === details) {
        closeActiveLibraryMenu({ returnFocus: true });
        return;
      }
      closeActiveSelect();
      closeActiveLibraryMenu();
      details.open = true;
      menu.hidden = false;
      setAttributeIfChanged(summary, 'aria-expanded', 'true');
      setAttributeIfChanged(menu, 'data-mac-popover-open', 'true');
      openLibraryMenu = { details: details, summary: summary, menu: menu };
      setMenuBodyState(true);
      try {
        if (typeof menu.showPopover === 'function') menu.showPopover();
      } catch (error) {
        // Fixed positioning below is the intentional fallback.
      }
      positionActiveLibraryMenu();
      focusLibraryEntry(menu);
    }

    function enhanceLibraryMenus() {
      if (!libraryOrganizer || typeof libraryOrganizer.querySelectorAll !== 'function') return;
      if (openLibraryMenu && typeof documentRef.contains === 'function' && !documentRef.contains(openLibraryMenu.details)) closeActiveLibraryMenu();
      var menus = libraryOrganizer.querySelectorAll('.v20-library-more');
      if (!menus || typeof menus.forEach !== 'function') return;
      menus.forEach(function (details) {
        if (!details || (details.dataset && details.dataset.macMenuEnhanced === 'true')) return;
        var summary = directChild(details, 'summary');
        var menu = directChild(details, 'div');
        if (!summary || !menu || typeof summary.addEventListener !== 'function') return;
        if (details.dataset) details.dataset.macMenuEnhanced = 'true';
        if (!summary.id) summary.id = nextGeneratedId('mac-library-disclosure');
        if (!menu.id) menu.id = nextGeneratedId('mac-library-menu');
        menu.classList && menu.classList.add('mac-library-menu');
        menu.hidden = true;
        setAttributeIfChanged(menu, 'role', 'dialog');
        setAttributeIfChanged(menu, 'aria-labelledby', summary.id);
        setAttributeIfChanged(menu, 'popover', 'manual');
        setAttributeIfChanged(summary, 'aria-haspopup', 'dialog');
        setAttributeIfChanged(summary, 'aria-controls', menu.id);
        setAttributeIfChanged(summary, 'aria-expanded', 'false');
        details.open = false;
        summary.addEventListener('click', function (event) {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          openEnhancedLibraryMenu(details, summary, menu);
        });
        menu.addEventListener('focusout', function (event) {
          var next = event && event.relatedTarget;
          if (next && ((typeof menu.contains === 'function' && menu.contains(next)) || next === summary)) return;
          if (openLibraryMenu && openLibraryMenu.details === details) closeActiveLibraryMenu({ preserveFocus: true });
        });
      });
    }

    function selectOptionSignature(select, snapshots) {
      return JSON.stringify({
        options: (snapshots || snapshotSelectOptions(select)).map(function (option) {
          return [option.value, option.label, option.disabled];
        }),
        value: String(select && select.value),
        disabled: Boolean(select && select.disabled)
      });
    }

    function closeActiveSelect(options) {
      if (!activeSelectRecord || !activeSelectRecord.open) return false;
      var settings = options && typeof options === 'object' ? options : {};
      var record = activeSelectRecord;
      record.open = false;
      hideSelectPopover(record.listbox);
      setAttributeIfChanged(record.trigger, 'aria-expanded', 'false');
      removeAttributeIfPresent(record.trigger, 'aria-activedescendant');
      activeSelectRecord = null;
      typeaheadBuffer = '';
      if (typeaheadTimer && typeof windowRef.clearTimeout === 'function') windowRef.clearTimeout(typeaheadTimer);
      typeaheadTimer = 0;
      if (settings.returnFocus && typeof record.trigger.focus === 'function') record.trigger.focus();
      return true;
    }

    function optionStructureChanged(record, snapshots) {
      if (!record || record.options.length !== snapshots.length) return true;
      return snapshots.some(function (snapshot, index) {
        var option = record.options[index];
        return !option ||
          String(option.value) !== String(snapshot.value) ||
          String(option.label) !== String(snapshot.label) ||
          Boolean(option.disabled) !== Boolean(snapshot.disabled);
      });
    }

    function renderSelectOptions(record, snapshots) {
      while (record.listbox.firstChild) record.listbox.removeChild(record.listbox.firstChild);
      record.options = snapshots.map(function (snapshot, index) {
        var button = documentRef.createElement('button');
        var check = documentRef.createElement('span');
        var text = documentRef.createElement('span');
        button.type = 'button';
        button.id = record.listbox.id + '-option-' + index;
        button.className = 'studio-combobox-option';
        configureSelectOptionFocus(button);
        button.disabled = Boolean(snapshot.disabled);
        check.className = 'studio-combobox-check';
        check.setAttribute && check.setAttribute('aria-hidden', 'true');
        text.className = 'studio-combobox-option-label';
        text.textContent = snapshot.label;
        setAttributeIfChanged(button, 'role', 'option');
        setAttributeIfChanged(button, 'aria-disabled', String(Boolean(snapshot.disabled)));
        if (button.dataset) button.dataset.value = snapshot.value;
        button.appendChild(check);
        button.appendChild(text);
        button.addEventListener('pointerenter', function () {
          if (!snapshot.disabled) setSelectActive(record, index);
        });
        button.addEventListener('click', function () { commitSelectOption(record, index); });
        record.listbox.appendChild(button);
        return {
          button: button,
          check: check,
          value: snapshot.value,
          label: snapshot.label,
          disabled: snapshot.disabled
        };
      });
    }

    function syncSelect(record) {
      if (!record || !record.select) return;
      var snapshots = snapshotSelectOptions(record.select);
      var signature = selectOptionSignature(record.select, snapshots);
      if (signature !== record.signature && optionStructureChanged(record, snapshots)) renderSelectOptions(record, snapshots);
      record.signature = signature;
      var selectedIndex = selectedOptionIndex(snapshots, record.select.value);
      if (selectedIndex < 0) selectedIndex = nextEnabledOptionIndex(snapshots, -1, 'Home');
      record.activeIndex = selectedIndex;
      record.options.forEach(function (option, index) {
        var selected = index === selectedIndex && String(option.value) === String(record.select.value);
        setAttributeIfChanged(option.button, 'aria-selected', String(selected));
        option.button.classList && option.button.classList.toggle('selected', selected);
        option.button.classList && option.button.classList.toggle('active', record.open && index === record.activeIndex);
        if (option.check && option.check.textContent !== (selected ? '✓' : '')) option.check.textContent = selected ? '✓' : '';
      });
      var selectedRecord = record.options[selectedIndex];
      var visibleText = selectedRecord ? selectedRecord.label : '';
      if (record.label.textContent !== visibleText) record.label.textContent = visibleText;
      reflectDisabledState(record.trigger, record.select.disabled);
      setAttributeIfChanged(record.trigger, 'aria-disabled', String(Boolean(record.select.disabled)));
      if (record.open && selectedRecord) setAttributeIfChanged(record.trigger, 'aria-activedescendant', selectedRecord.button.id);
      else if (!record.open) removeAttributeIfPresent(record.trigger, 'aria-activedescendant');
      if (record.open && record.trigger.disabled) closeActiveSelect();
    }

    function setSelectActive(record, index) {
      if (!record || index < 0 || !record.options[index] || record.options[index].disabled) return;
      record.activeIndex = index;
      record.options.forEach(function (option, optionIndex) {
        option.button.classList && option.button.classList.toggle('active', optionIndex === index);
      });
      var active = record.options[index];
      setAttributeIfChanged(record.trigger, 'aria-activedescendant', active.button.id);
      if (typeof record.listbox.getBoundingClientRect === 'function' &&
          typeof active.button.getBoundingClientRect === 'function') {
        record.listbox.scrollTop = selectOptionScrollTop(
          record.listbox.getBoundingClientRect(),
          active.button.getBoundingClientRect(),
          record.listbox.scrollTop,
          Math.max(0, finiteNumber(record.listbox.scrollHeight, 0) - finiteNumber(record.listbox.clientHeight, 0)),
        );
      }
    }

    function positionSelect(record) {
      if (!record || !record.open) return;
      if (isCompact()) {
        setAttributeIfChanged(record.shell, 'data-studio-sheet', 'true');
        removeAttributeIfPresent(record.listbox, 'data-studio-side');
        return;
      }
      removeAttributeIfPresent(record.shell, 'data-studio-sheet');
      if (typeof record.trigger.getBoundingClientRect !== 'function' || typeof record.listbox.getBoundingClientRect !== 'function') return;
      var anchorRect = record.trigger.getBoundingClientRect();
      var menuRect = record.listbox.getBoundingClientRect();
      var width = Math.max(finiteNumber(anchorRect.width, 0), finiteNumber(menuRect.width, 0));
      var placement = popoverPlacement(anchorRect, {
        width: width,
        height: finiteNumber(menuRect.height, 0)
      }, {
        width: finiteNumber(windowRef.innerWidth, 1024),
        height: finiteNumber(windowRef.innerHeight, 768)
      });
      if (record.listbox.style && typeof record.listbox.style.setProperty === 'function') {
        record.listbox.style.setProperty('--studio-menu-left', placement.left + 'px');
        record.listbox.style.setProperty('--studio-menu-top', placement.top + 'px');
        record.listbox.style.setProperty('--studio-menu-width', width + 'px');
      }
      setAttributeIfChanged(record.listbox, 'data-studio-side', placement.side);
      if (record.shell.style && typeof record.shell.style.setProperty === 'function') {
        record.shell.style.setProperty('--studio-menu-origin-y', placement.side === 'above' ? '100%' : '0%');
      }
    }

    function openSelect(record) {
      if (!record || record.trigger.disabled) return false;
      if (activeSelectRecord && activeSelectRecord !== record) closeActiveSelect();
      closeActiveLibraryMenu();
      syncSelect(record);
      if (!showSelectPopover(record.listbox)) return false;
      record.open = true;
      activeSelectRecord = record;
      setAttributeIfChanged(record.trigger, 'aria-expanded', 'true');
      positionSelect(record);
      var activeIndex = record.activeIndex;
      if (activeIndex < 0 || !record.options[activeIndex] || record.options[activeIndex].disabled) {
        activeIndex = nextEnabledOptionIndex(record.options, -1, 'Home');
      }
      setSelectActive(record, activeIndex);
      return true;
    }

    function commitSelectOption(record, index) {
      var option = record && record.options[index];
      if (!option || option.disabled) return;
      var changed = String(record.select.value) !== String(option.value);
      record.select.value = option.value;
      syncSelect(record);
      closeActiveSelect({ returnFocus: true });
      if (changed && typeof record.select.dispatchEvent === 'function') {
        var changeEvent = typeof windowRef.Event === 'function'
          ? new windowRef.Event('change', { bubbles: true })
          : { type: 'change', bubbles: true };
        record.select.dispatchEvent(changeEvent);
      }
    }

    function resetTypeaheadSoon() {
      if (typeaheadTimer && typeof windowRef.clearTimeout === 'function') windowRef.clearTimeout(typeaheadTimer);
      if (typeof windowRef.setTimeout === 'function') {
        typeaheadTimer = windowRef.setTimeout(function () {
          typeaheadBuffer = '';
          typeaheadTimer = 0;
        }, 500);
      }
    }

    function selectKeydown(record, event) {
      if (!record || !event) return;
      var key = event.key;
      if (key === 'Escape') {
        if (record.open) {
          consumeSelectKeyEvent(event, record.open);
          closeActiveSelect({ returnFocus: true });
        }
        return;
      }
      if (key === 'Tab') {
        closeActiveSelect({ preserveFocus: true });
        return;
      }
      if (key === 'Enter' || key === ' ') {
        consumeSelectKeyEvent(event, record.open);
        if (record.open) commitSelectOption(record, record.activeIndex);
        else openSelect(record);
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
        consumeSelectKeyEvent(event, record.open);
        if (!record.open) openSelect(record);
        setSelectActive(record, nextEnabledOptionIndex(record.options, record.activeIndex, key));
        return;
      }
      if (key && key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        consumeSelectKeyEvent(event, record.open);
        typeaheadBuffer += key;
        resetTypeaheadSoon();
        if (!record.open) openSelect(record);
        var match = typeaheadOptionIndex(record.options, record.activeIndex, typeaheadBuffer);
        if (match >= 0) {
          setSelectActive(record, match);
        }
      }
    }

    function sourceLabelFor(select) {
      if (select.labels && select.labels[0]) return select.labels[0];
      var field = typeof select.closest === 'function' ? select.closest('.field') : null;
      return field && typeof field.querySelector === 'function' ? field.querySelector('label') : null;
    }

    function enhanceSelect(select) {
      if (!select) return null;
      var existing = selectRecords.get(select);
      if (existing) {
        if (enhancedSelects.indexOf(existing) < 0) enhancedSelects.push(existing);
        ensureSelectShellAdjacency(select, existing.shell);
        return existing;
      }
      if (!select.parentElement || typeof documentRef.createElement !== 'function') return null;
      if (select.multiple || finiteNumber(select.size, 0) > 1 || (typeof select.hasAttribute === 'function' && select.hasAttribute('data-studio-native-select'))) return null;
      var sourceLabel = null;
      var labelledElement = null;
      var nativeState = null;
      var shell = null;
      var record = null;
      try {
        sourceLabel = sourceLabelFor(select);
        labelledElement = sourceLabel;
        if (sourceLabel && typeof sourceLabel.contains === 'function' && sourceLabel.contains(select) && typeof sourceLabel.querySelector === 'function') {
          labelledElement = sourceLabel.querySelector('span') || sourceLabel;
        }
        nativeState = snapshotNativeSelectState(select, sourceLabel, labelledElement);
        var snapshots = snapshotSelectOptions(select);
        shell = documentRef.createElement('div');
        var trigger = documentRef.createElement('button');
        var visibleLabel = documentRef.createElement('span');
        var disclosure = documentRef.createElement('span');
        var listbox = documentRef.createElement('div');
        if (!supportsSelectPopover(listbox)) return null;
        setAttributeIfChanged(listbox, 'popover', 'manual');
        var listboxId = nextGeneratedId('studio-combobox-listbox');
        shell.className = 'studio-combobox';
        trigger.type = 'button';
        trigger.id = nextGeneratedId('studio-combobox-trigger');
        trigger.className = 'studio-combobox-trigger';
        visibleLabel.className = 'studio-combobox-label';
        disclosure.className = 'studio-combobox-disclosure';
        disclosure.textContent = '⌄';
        disclosure.setAttribute && disclosure.setAttribute('aria-hidden', 'true');
        listbox.id = listboxId;
        listbox.className = 'studio-combobox-listbox';
        listbox.hidden = true;
        setAttributeIfChanged(trigger, 'role', 'combobox');
        setAttributeIfChanged(trigger, 'aria-haspopup', 'listbox');
        setAttributeIfChanged(trigger, 'aria-expanded', 'false');
        setAttributeIfChanged(trigger, 'aria-controls', listboxId);
        if (sourceLabel) {
          labelledElement.id = labelledElement.id || nextGeneratedId('studio-combobox-source-label');
          setAttributeIfChanged(trigger, 'aria-labelledby', labelledElement.id);
        } else if (typeof select.getAttribute === 'function' && select.getAttribute('aria-label')) {
          setAttributeIfChanged(trigger, 'aria-label', select.getAttribute('aria-label'));
        }
        setAttributeIfChanged(listbox, 'role', 'listbox');
        trigger.appendChild(visibleLabel);
        trigger.appendChild(disclosure);
        shell.appendChild(trigger);
        shell.appendChild(listbox);
        ensureSelectShellAdjacency(select, shell);
        record = {
          select: select,
          shell: shell,
          trigger: trigger,
          label: visibleLabel,
          disclosure: disclosure,
          listbox: listbox,
          options: [],
          activeIndex: selectedOptionIndex(snapshots, select.value),
          open: false,
          sourceLabel: sourceLabel,
          labelledElement: labelledElement,
          nativeState: nativeState,
          signature: ''
        };
        renderSelectOptions(record, snapshots);
        record.signature = selectOptionSignature(select, snapshots);
        trigger.addEventListener('click', function () {
          if (record.open) closeActiveSelect({ returnFocus: true });
          else openSelect(record);
        });
        trigger.addEventListener('keydown', function (event) { selectKeydown(record, event); });
        listbox.addEventListener('keydown', function (event) { selectKeydown(record, event); });
        selectRecords.set(select, record);
        enhancedSelects.push(record);
        select.classList && select.classList.add('studio-native-select');
        select.tabIndex = -1;
        setAttributeIfChanged(select, 'aria-hidden', 'true');
        syncSelect(record);
        if (sourceLabel) setAttributeIfChanged(sourceLabel, 'for', trigger.id);
        return record;
      } catch (error) {
        if (activeSelectRecord === record) closeActiveSelect();
        enhancedSelects = rollbackSelectEnhancement(select, record, sourceLabel, nativeState, selectRecords, enhancedSelects, shell);
        return null;
      }
    }

    function disposeSelectRecord(record) {
      if (!record) return;
      if (activeSelectRecord === record) closeActiveSelect();
      removeSelectShell(record);
      if (record.select) {
        selectRecords.delete(record.select);
        restoreNativeSelectState(record.select, record.sourceLabel, record.nativeState);
      }
    }

    function enhanceSelects(rootNode) {
      var scope = rootNode && typeof rootNode.querySelectorAll === 'function' ? rootNode : documentRef;
      var selects = Array.prototype.slice.call(scope.querySelectorAll('select'));
      selects.forEach(enhanceSelect);
      var connectedRecords = [];
      enhancedSelects.forEach(function(record) {
        if (!record.select || record.select.isConnected === false) {
          disposeSelectRecord(record);
          return;
        }
        ensureSelectShellAdjacency(record.select, record.shell);
        connectedRecords.push(record);
      });
      enhancedSelects = connectedRecords;
      enhancedSelects.forEach(syncSelect);
      return enhancedSelects.length;
    }

    function syncSharedControls() {
      [protectBacklog, requireTypingInstant].forEach(function (control) {
        if (control) removeAttributeIfPresent(control, 'aria-checked');
      });
    }

    function severityFor(element) {
      if (!element) return '';
      var classes = String(element.className || '').toLowerCase().split(/\s+/);
      if (classes.includes('save-pill')) {
        if (classes.includes('error')) return 'error';
        if (classes.includes('warn') || classes.includes('dirty')) return 'warning';
        if (classes.includes('saved')) return 'success';
        return '';
      }
      var title = typeof element.querySelector === 'function' ? element.querySelector('b') : null;
      var text = String(title && title.textContent || '').toLowerCase();
      if (/\b(?:fail(?:ed|ure)?|error|invalid)\b|connection[\s-]+fail/.test(text)) return 'error';
      if (/\b(?:stale|conflict|warning|warn)\b|newer\s+(?:save|progress)/.test(text)) return 'warning';
      if (/\b(?:saved|success(?:ful|fully)?|complete(?:d)?|done|pass(?:ed)?)\b/.test(text)) return 'success';
      return '';
    }

    function applySeverity(element) {
      var severity = severityFor(element);
      if (severity) setAttributeIfChanged(element, 'data-mac-severity', severity);
      else removeAttributeIfPresent(element, 'data-mac-severity');
    }

    function syncSeverity() {
      applySeverity(savePill);
      if (!toastZone || typeof toastZone.querySelectorAll !== 'function') return;
      var toasts = toastZone.querySelectorAll('.toast');
      if (toasts && typeof toasts.forEach === 'function') toasts.forEach(applySeverity);
    }

    function syncContext() {
      var view = currentView();
      if (lastActiveView && view !== lastActiveView) closeActiveSelect();
      lastActiveView = view;
      var context = classifyContext({
        view: view,
        modeText: cardMode && cardMode.textContent,
        stateText: currentMeta && currentMeta.dataset && currentMeta.dataset.cardState,
      });
      var palette = paletteFor(context);
      if (body.dataset && body.dataset.macContext !== context) body.dataset.macContext = context;
      if (body.style && typeof body.style.setProperty === 'function') {
        if (body.style.getPropertyValue('--mac-context-a') !== palette.a) body.style.setProperty('--mac-context-a', palette.a);
        if (body.style.getPropertyValue('--mac-context-b') !== palette.b) body.style.setProperty('--mac-context-b', palette.b);
        if (body.style.getPropertyValue('--mac-context-glow') !== palette.glow) body.style.setProperty('--mac-context-glow', palette.glow);
      }
      var answerVisible = Boolean(answerPanel && answerPanel.classList && answerPanel.classList.contains('show'));
      if (answerPanel && typeof answerPanel.hasAttribute === 'function' && answerPanel.hasAttribute('hidden')) answerVisible = false;
      if (body.classList && typeof body.classList.toggle === 'function') {
        body.classList.toggle('mac-is-recalling', view === 'study' && !answerVisible);
      }
      if (view !== 'books') closeActiveLibraryMenu();
      enhanceLibraryMenus();
      enhanceSelects(documentRef);
      syncSharedControls();
      syncTabs(view);
      ensureToggle();
      if (!isCompact() || view !== 'study') setInspector(false, { immediate: true });
      else syncPanelExposure(Boolean(body.classList && body.classList.contains('mac-inspector-open')));
      lastViewportMode = viewportMode();
      syncSeverity();
    }

    function runUpdate() {
      updateFrame = 0;
      syncContext();
    }

    function queueUpdate() {
      if (updateFrame) return;
      updateFrame = requestFrame(runUpdate);
      if (!updateFrame) runUpdate();
    }

    function clearPress() {
      removeAttributeIfPresent(pressedControl, 'data-mac-pressed');
      pressedControl = null;
    }

    function press(event) {
      var target = event && event.target;
      var control = target && typeof target.closest === 'function' ? target.closest(CONTROL_SELECTOR) : null;
      if (!control) {
        clearPress();
        return;
      }
      if (pressedControl && pressedControl !== control) removeAttributeIfPresent(pressedControl, 'data-mac-pressed');
      pressedControl = control;
      setAttributeIfChanged(control, 'data-mac-pressed', 'true');
    }

    function keydown(event) {
      if (!event || event.key !== 'Escape') return;
      if (closeActiveSelect({ returnFocus: true })) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
      if (closeActiveLibraryMenu({ returnFocus: true })) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
      if (body.classList && body.classList.contains('mac-inspector-open')) setInspector(false, { returnFocus: true });
    }

    function dismissPointer(event) {
      var target = event && event.target;
      if (openLibraryMenu && target && !openLibraryMenu.details.contains(target) && !openLibraryMenu.menu.contains(target)) closeActiveLibraryMenu();
      if (activeSelectRecord && target && !activeSelectRecord.shell.contains(target) && !activeSelectRecord.listbox.contains(target)) closeActiveSelect();
    }

    function dismissSurfaceFocus(event) {
      var target = event && event.target;
      if (!target) return;
      if (openLibraryMenu && !openLibraryMenu.details.contains(target) && !openLibraryMenu.menu.contains(target)) closeActiveLibraryMenu({ preserveFocus: true });
      if (activeSelectRecord && !activeSelectRecord.shell.contains(target) && !activeSelectRecord.listbox.contains(target)) closeActiveSelect({ preserveFocus: true });
    }

    function dismissSurfaceScroll(event) {
      if (scrollOriginatesInSelectListbox(activeSelectRecord, event)) return;
      if (openLibraryMenu) closeActiveLibraryMenu({ returnFocus: true });
      closeActiveSelect();
    }

    function dismissAfterAction(event) {
      var target = event && event.target;
      var action = target && typeof target.closest === 'function' ? target.closest('[data-library-action]') : null;
      if (action) closeActiveLibraryMenu({ returnFocus: true });
    }

    function controlsSync() {
      enhanceSelects(documentRef);
      syncSharedControls();
    }

    function resize() {
      var nextViewportMode = viewportMode();
      ensureToggle();
      if (nextViewportMode !== lastViewportMode || currentView() !== 'study') setInspector(false, { immediate: true });
      else syncPanelExposure(Boolean(body.classList && body.classList.contains('mac-inspector-open')));
      lastViewportMode = nextViewportMode;
      positionActiveLibraryMenu();
      if (activeSelectRecord && nextViewportMode !== 'wide') closeActiveSelect();
      else if (activeSelectRecord) positionSelect(activeSelectRecord);
      queueUpdate();
    }

    if (typeof documentRef.addEventListener === 'function') {
      documentRef.addEventListener('keydown', keydown);
      documentRef.addEventListener('pointerdown', dismissPointer, true);
      documentRef.addEventListener('focusin', dismissSurfaceFocus, true);
      documentRef.addEventListener('scroll', dismissSurfaceScroll, true);
      documentRef.addEventListener('pointerdown', press, { passive: true });
      documentRef.addEventListener('click', dismissAfterAction);
      documentRef.addEventListener('studio:controls-sync', controlsSync);
      documentRef.addEventListener('pointerup', clearPress, { passive: true });
      documentRef.addEventListener('pointercancel', clearPress, { passive: true });
      documentRef.addEventListener('pointerleave', clearPress, { passive: true });
      documentRef.addEventListener('lostpointercapture', clearPress, { passive: true });
    }
    if (booksView && typeof booksView.addEventListener === 'function') booksView.addEventListener('scroll', dismissSurfaceScroll, { capture: true, passive: true });
    if (typeof windowRef.addEventListener === 'function') windowRef.addEventListener('resize', resize, { passive: true });
    if (windowRef.visualViewport && typeof windowRef.visualViewport.addEventListener === 'function') {
      windowRef.visualViewport.addEventListener('scroll', dismissSurfaceScroll, { passive: true });
    }
    if (reducedMedia && typeof reducedMedia.addEventListener === 'function') {
      reducedMedia.addEventListener('change', function (event) {
        if (event && event.matches) stopInspectorAt(inspectorTarget);
      });
    }

    var Observer = windowRef.MutationObserver;
    if (typeof Observer === 'function') {
      try {
        var observer = new Observer(queueUpdate);
        observer.observe(body, { attributes: true, attributeFilter: ['data-active-view', 'data-v19-view'], subtree: false });
        if (cardMode) observer.observe(cardMode, { childList: true, characterData: true, subtree: true });
        if (currentMeta) observer.observe(currentMeta, { attributes: true, attributeFilter: ['data-card-state'], subtree: false });
        if (answerPanel) observer.observe(answerPanel, { attributes: true, attributeFilter: ['class', 'hidden'], subtree: false });
        if (savePill) observer.observe(savePill, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
        if (toastZone) observer.observe(toastZone, { childList: true, characterData: true, subtree: true });
        if (libraryOrganizer) observer.observe(libraryOrganizer, { childList: true, subtree: true });
        var selectObserver = new Observer(function(mutations) {
          if (Array.prototype.some.call(mutations || [], selectMutationIsRelevant)) queueUpdate();
        });
        selectObserver.observe(body, {
          attributes: true,
          attributeFilter: ['disabled', 'label', 'selected', 'value'],
          childList: true,
          characterData: true,
          subtree: true
        });
        controller.observer = observer;
        controller.selectObserver = selectObserver;
      } catch (error) {
        controller.observer = null;
        controller.selectObserver = null;
      }
    }

    controller.setInspector = setInspector;
    controller.closeLibraryMenu = closeActiveLibraryMenu;
    controller.enhanceSelect = enhanceSelect;
    controller.enhanceSelects = enhanceSelects;
    controller.syncSelect = syncSelect;
    controller.closeActiveSelect = closeActiveSelect;
    controller.closeQueueCombobox = closeActiveSelect;
    syncContext();
    renderInspector();
    return controller;
  }

  return Object.freeze({
    classifyContext: classifyContext,
    paletteFor: paletteFor,
    springStep: springStep,
    popoverPlacement: popoverPlacement,
    supportsSelectPopover: supportsSelectPopover,
    showSelectPopover: showSelectPopover,
    hideSelectPopover: hideSelectPopover,
    nextComboboxIndex: nextComboboxIndex,
    snapshotSelectOptions: snapshotSelectOptions,
    selectedOptionIndex: selectedOptionIndex,
    consumeSelectKeyEvent: consumeSelectKeyEvent,
    nextEnabledOptionIndex: nextEnabledOptionIndex,
    typeaheadOptionIndex: typeaheadOptionIndex,
    selectMutationIsRelevant: selectMutationIsRelevant,
    reflectDisabledState: reflectDisabledState,
    ensureSelectShellAdjacency: ensureSelectShellAdjacency,
    removeSelectShell: removeSelectShell,
    configureSelectOptionFocus: configureSelectOptionFocus,
    snapshotNativeSelectState: snapshotNativeSelectState,
    restoreNativeSelectState: restoreNativeSelectState,
    rollbackSelectEnhancement: rollbackSelectEnhancement,
    rangeFillPercentage: rangeFillPercentage,
    selectOptionScrollTop: selectOptionScrollTop,
    scrollOriginatesInSelectListbox: scrollOriginatesInSelectListbox,
    boot: boot
  });
});
