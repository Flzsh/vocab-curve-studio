// macOS Workspace v20.0.0-alpha.20-macos.10
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MacOSWorkspace = api;
  if (root && root.document) {
    try {
      api.boot(root.document);
    } catch (error) {
      if (root.console && typeof root.console.warn === 'function') {
        root.console.warn('macOS workspace enhancement unavailable', error);
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
  var PHONE_QUERY = '(max-width: 720px)';
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

  function rangeFillPercentage(value, minimum, maximum) {
    var min = finiteNumber(minimum, 0);
    var max = finiteNumber(maximum, min);
    if (max <= min) return 0;
    return Math.round(clamp((finiteNumber(value, min) - min) / (max - min), 0, 1) * 10000) / 100;
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
    var savePill = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('savePill') : null;
    var toastZone = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('toastZone') : null;
    var booksView = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('view-books') : null;
    var libraryOrganizer = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('libraryOrganizer') : null;
    var queueSelect = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('queueStyle') : null;
    var dailyNewRange = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('dailyNewRange') : null;
    var dailyReviewRange = typeof documentRef.getElementById === 'function' ? documentRef.getElementById('dailyReviewRange') : null;
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
    var openLibraryMenu = null;
    var queueCombobox = null;
    var generatedId = 0;

    if (body.classList && typeof body.classList.add === 'function') body.classList.add('macos-workspace');

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
        var label = isPhone() ? 'Study tools' : 'Inspector';
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
        setAttributeIfChanged(closeButton, 'aria-label', isPhone() ? 'Close Study tools' : 'Close Inspector');
        closeButton.hidden = !closeUsable;
        closeButton.disabled = !closeUsable;
      }
      return toggle;
    }

    function syncTabs(view) {
      if (!tabs || typeof tabs.querySelectorAll !== 'function') return;
      var destination = isPhone() ? (view === 'study' ? 'study' : view === 'books' ? 'books' : 'more') : view;
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

    function closeQueueCombobox(options) {
      if (!queueCombobox || !queueCombobox.open) return false;
      var settings = options && typeof options === 'object' ? options : {};
      queueCombobox.open = false;
      queueCombobox.listbox.hidden = true;
      setAttributeIfChanged(queueCombobox.trigger, 'aria-expanded', 'false');
      removeAttributeIfPresent(queueCombobox.trigger, 'aria-activedescendant');
      if (settings.returnFocus && typeof queueCombobox.trigger.focus === 'function') queueCombobox.trigger.focus();
      return true;
    }

    function syncQueueCombobox() {
      if (!queueCombobox || !queueSelect) return;
      var selectedIndex = -1;
      queueCombobox.options.forEach(function (record, index) {
        var selected = String(record.value) === String(queueSelect.value);
        if (selected) selectedIndex = index;
        setAttributeIfChanged(record.button, 'aria-selected', String(selected));
        record.button.classList && record.button.classList.toggle('selected', selected);
        if (record.check) record.check.textContent = selected ? '✓' : '';
      });
      if (selectedIndex < 0 && queueCombobox.options.length) selectedIndex = 0;
      queueCombobox.activeIndex = selectedIndex;
      var selectedRecord = queueCombobox.options[selectedIndex];
      if (selectedRecord) queueCombobox.label.textContent = selectedRecord.label;
      queueCombobox.trigger.disabled = Boolean(queueSelect.disabled);
      if (queueCombobox.open && selectedRecord) setAttributeIfChanged(queueCombobox.trigger, 'aria-activedescendant', selectedRecord.button.id);
    }

    function setQueueActive(index) {
      if (!queueCombobox || !queueCombobox.options.length) return;
      queueCombobox.activeIndex = clamp(index, 0, queueCombobox.options.length - 1);
      queueCombobox.options.forEach(function (record, optionIndex) {
        record.button.classList && record.button.classList.toggle('active', optionIndex === queueCombobox.activeIndex);
      });
      var active = queueCombobox.options[queueCombobox.activeIndex];
      setAttributeIfChanged(queueCombobox.trigger, 'aria-activedescendant', active.button.id);
      if (typeof active.button.scrollIntoView === 'function') active.button.scrollIntoView({ block: 'nearest' });
    }

    function openQueueCombobox() {
      if (!queueCombobox || queueCombobox.trigger.disabled) return;
      closeActiveLibraryMenu();
      syncQueueCombobox();
      queueCombobox.open = true;
      queueCombobox.listbox.hidden = false;
      setAttributeIfChanged(queueCombobox.trigger, 'aria-expanded', 'true');
      setQueueActive(queueCombobox.activeIndex < 0 ? 0 : queueCombobox.activeIndex);
    }

    function commitQueueOption(index) {
      if (!queueCombobox || !queueSelect) return;
      var record = queueCombobox.options[index];
      if (!record) return;
      var changed = String(queueSelect.value) !== String(record.value);
      queueSelect.value = record.value;
      syncQueueCombobox();
      closeQueueCombobox({ returnFocus: true });
      if (changed && typeof queueSelect.dispatchEvent === 'function') {
        var changeEvent = typeof windowRef.Event === 'function'
          ? new windowRef.Event('change', { bubbles: true })
          : { type: 'change', bubbles: true };
        queueSelect.dispatchEvent(changeEvent);
      }
    }

    function queueKeydown(event) {
      if (!queueCombobox || !event) return;
      var key = event.key;
      if (key === 'Escape') {
        if (queueCombobox.open) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          closeQueueCombobox({ returnFocus: true });
        }
        return;
      }
      if (key === 'Tab') {
        closeQueueCombobox();
        return;
      }
      if (key === 'Enter' || key === ' ') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (queueCombobox.open) commitQueueOption(queueCombobox.activeIndex);
        else openQueueCombobox();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (!queueCombobox.open) openQueueCombobox();
      setQueueActive(nextComboboxIndex(queueCombobox.activeIndex, key, queueCombobox.options.length));
    }

    function enhanceQueueSelect() {
      if (!queueSelect || queueCombobox || !queueSelect.parentElement || typeof documentRef.createElement !== 'function') return;
      var nativeOptions = Array.prototype.slice.call(queueSelect.options || []);
      if (!nativeOptions.length) return;
      try {
        var shell = documentRef.createElement('div');
        var trigger = documentRef.createElement('button');
        var label = documentRef.createElement('span');
        var disclosure = documentRef.createElement('span');
        var listbox = documentRef.createElement('div');
        var sourceLabel = directChild(queueSelect.parentElement, 'label');
        var listboxId = nextGeneratedId('mac-queue-listbox');
        shell.className = 'mac-queue-combobox';
        trigger.type = 'button';
        trigger.id = nextGeneratedId('mac-queue-trigger');
        trigger.className = 'mac-queue-trigger';
        label.className = 'mac-queue-label';
        disclosure.className = 'mac-queue-disclosure';
        disclosure.textContent = '⌄';
        listbox.id = listboxId;
        listbox.className = 'mac-queue-listbox';
        listbox.hidden = true;
        setAttributeIfChanged(trigger, 'role', 'combobox');
        setAttributeIfChanged(trigger, 'aria-haspopup', 'listbox');
        setAttributeIfChanged(trigger, 'aria-expanded', 'false');
        setAttributeIfChanged(trigger, 'aria-controls', listboxId);
        if (sourceLabel) {
          sourceLabel.id = sourceLabel.id || nextGeneratedId('mac-queue-source-label');
          setAttributeIfChanged(trigger, 'aria-labelledby', sourceLabel.id);
        }
        setAttributeIfChanged(listbox, 'role', 'listbox');
        trigger.appendChild(label);
        trigger.appendChild(disclosure);
        shell.appendChild(trigger);
        shell.appendChild(listbox);
        var records = nativeOptions.map(function (option, index) {
          var button = documentRef.createElement('button');
          var check = documentRef.createElement('span');
          var text = documentRef.createElement('span');
          var value = String(option.value);
          var optionLabel = String(option.textContent || option.label || value);
          button.type = 'button';
          button.id = nextGeneratedId('mac-queue-option');
          button.className = 'mac-queue-option';
          check.className = 'mac-queue-check';
          text.textContent = optionLabel;
          setAttributeIfChanged(button, 'role', 'option');
          if (button.dataset) button.dataset.value = value;
          button.appendChild(check);
          button.appendChild(text);
          button.addEventListener('click', function () { commitQueueOption(index); });
          listbox.appendChild(button);
          return { button: button, check: check, value: value, label: optionLabel };
        });
        if (queueSelect.nextSibling && typeof queueSelect.parentElement.insertBefore === 'function') queueSelect.parentElement.insertBefore(shell, queueSelect.nextSibling);
        else queueSelect.parentElement.appendChild(shell);
        queueCombobox = { shell: shell, trigger: trigger, label: label, listbox: listbox, options: records, activeIndex: 0, open: false, sourceLabel: sourceLabel };
        trigger.addEventListener('click', function () {
          if (queueCombobox.open) closeQueueCombobox({ returnFocus: true });
          else openQueueCombobox();
        });
        trigger.addEventListener('keydown', queueKeydown);
        listbox.addEventListener('keydown', queueKeydown);
        queueSelect.classList && queueSelect.classList.add('mac-native-select');
        queueSelect.tabIndex = -1;
        setAttributeIfChanged(queueSelect, 'aria-hidden', 'true');
        if (sourceLabel) setAttributeIfChanged(sourceLabel, 'for', trigger.id);
        syncQueueCombobox();
      } catch (error) {
        queueCombobox = null;
        queueSelect.classList && queueSelect.classList.remove('mac-native-select');
        queueSelect.tabIndex = 0;
        removeAttributeIfPresent(queueSelect, 'aria-hidden');
        if (sourceLabel) setAttributeIfChanged(sourceLabel, 'for', queueSelect.id);
      }
    }

    function syncRange(range) {
      if (!range || !range.style || typeof range.style.setProperty !== 'function') return;
      range.style.setProperty('--mac-range-fill', rangeFillPercentage(range.value, range.min, range.max) + '%');
    }

    function syncDailyControls() {
      enhanceQueueSelect();
      syncQueueCombobox();
      syncRange(dailyNewRange);
      syncRange(dailyReviewRange);
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
      syncDailyControls();
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
      if (closeQueueCombobox({ returnFocus: true })) {
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
      if (queueCombobox && queueCombobox.open && target && !queueCombobox.shell.contains(target)) closeQueueCombobox();
    }

    function dismissLibraryFocus(event) {
      var target = event && event.target;
      if (!openLibraryMenu || !target) return;
      if (!openLibraryMenu.details.contains(target) && !openLibraryMenu.menu.contains(target)) closeActiveLibraryMenu({ preserveFocus: true });
    }

    function dismissLibraryScroll() {
      if (openLibraryMenu) closeActiveLibraryMenu({ returnFocus: true });
    }

    function dismissAfterAction(event) {
      var target = event && event.target;
      var action = target && typeof target.closest === 'function' ? target.closest('[data-library-action]') : null;
      if (action) closeActiveLibraryMenu({ returnFocus: true });
    }

    function controlsSync() {
      syncDailyControls();
    }

    function resize() {
      var nextViewportMode = viewportMode();
      ensureToggle();
      if (nextViewportMode !== lastViewportMode || currentView() !== 'study') setInspector(false, { immediate: true });
      else syncPanelExposure(Boolean(body.classList && body.classList.contains('mac-inspector-open')));
      lastViewportMode = nextViewportMode;
      positionActiveLibraryMenu();
      queueUpdate();
    }

    if (typeof documentRef.addEventListener === 'function') {
      documentRef.addEventListener('keydown', keydown);
      documentRef.addEventListener('pointerdown', dismissPointer, true);
      documentRef.addEventListener('focusin', dismissLibraryFocus, true);
      documentRef.addEventListener('scroll', dismissLibraryScroll, true);
      documentRef.addEventListener('pointerdown', press, { passive: true });
      documentRef.addEventListener('click', dismissAfterAction);
      documentRef.addEventListener('macos:controls-sync', controlsSync);
      documentRef.addEventListener('pointerup', clearPress, { passive: true });
      documentRef.addEventListener('pointercancel', clearPress, { passive: true });
      documentRef.addEventListener('pointerleave', clearPress, { passive: true });
      documentRef.addEventListener('lostpointercapture', clearPress, { passive: true });
    }
    if (booksView && typeof booksView.addEventListener === 'function') booksView.addEventListener('scroll', dismissLibraryScroll, { capture: true, passive: true });
    if (typeof windowRef.addEventListener === 'function') windowRef.addEventListener('resize', resize, { passive: true });
    if (windowRef.visualViewport && typeof windowRef.visualViewport.addEventListener === 'function') {
      windowRef.visualViewport.addEventListener('scroll', dismissLibraryScroll, { passive: true });
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
        controller.observer = observer;
      } catch (error) {
        controller.observer = null;
      }
    }

    controller.setInspector = setInspector;
    controller.closeLibraryMenu = closeActiveLibraryMenu;
    controller.closeQueueCombobox = closeQueueCombobox;
    syncContext();
    renderInspector();
    return controller;
  }

  return Object.freeze({
    classifyContext: classifyContext,
    paletteFor: paletteFor,
    springStep: springStep,
    popoverPlacement: popoverPlacement,
    nextComboboxIndex: nextComboboxIndex,
    rangeFillPercentage: rangeFillPercentage,
    boot: boot
  });
});
