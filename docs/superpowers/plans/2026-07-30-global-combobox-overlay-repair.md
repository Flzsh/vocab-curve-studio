# Global Combobox Overlay Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every enhanced single-select menu so it opens adjacent to its trigger inside the viewport, including Planner Queue Style and Stats Deck State.

**Architecture:** Promote the existing shared listbox to a manual Popover API surface before measuring it, preserving the native select and current placement helper. Replace page-level active-option scrolling with listbox-local scrolling, ignore scroll dismissal originating inside the open listbox, and retain the native select when the top-layer capability is unavailable.

**Tech Stack:** Static HTML/CSS, browser JavaScript, UMD/CommonJS module exports, Node.js `node:test`, Popover API, existing Playwright/browser automation, GitHub Pages.

## Global Constraints

- The repair applies to every eligible enhanced single select; it contains no Queue Style or Deck State offsets.
- The native select remains the source of truth and remains visible and usable if manual popovers are unsupported.
- Wide-layout menus use an 8 px trigger gap, flip above when required, remain within a 12 px viewport margin, and never overlap the trigger.
- Compact layouts preserve the existing safe-area bottom sheet.
- Only one Studio listbox or library popover remains open.
- Listbox-internal scrolling stays open; workspace, page, and visual-viewport scrolling dismisses it.
- Escape, outside pointer, focus departure, view change, and resize retain current dismissal and focus behavior.
- Selection dispatches exactly one bubbling `change` event only when the value changes.
- Library ellipsis menus, queue scheduling, daily limits, deck filtering, storage, and imported data are not redesigned.
- Reduced motion, reduced transparency, increased contrast, dark mode, and Low Power behavior remain intact.
- Product name remains `Vocab Curve Studio Beta v43`; technical version remains `43.0.0-beta`.

---

## File Structure

- Modify `tests/studio-workspace-controls.test.mjs`: lifecycle, capability fallback, local scrolling, dismissal-source, source-order, and CSS-contract regressions.
- Modify `studio-workspace.js`: reusable manual-popover lifecycle helpers, enhanced-select capability gate, corrected open/close ordering, listbox-local option scrolling, and source-aware scroll dismissal.
- Modify `studio-workspace.css`: reset top-layer popover insets and margins while preserving anchored and compact-sheet styles.
- Modify `tests/release-branding-contract.test.mjs`: require workspace revision 15 and its cache/asset suffix.
- Modify `BUILD_INFO.json`: advance `workspaceRevision` from 14 to 15.
- Modify `manifest.webmanifest`: advance the install start URL suffix to `43.0.0-beta-studio.15`.
- Modify `index.html`: advance runtime asset suffixes to `43.0.0-beta-studio.15`.
- Modify `sw.js`: advance the worker comment and cache name to workspace revision 15.

### Task 1: Put every enhanced listbox in the browser top layer

**Files:**
- Modify: `tests/studio-workspace-controls.test.mjs`
- Modify: `studio-workspace.js:778-792`
- Modify: `studio-workspace.js:907-922`
- Modify: `studio-workspace.js:993-1084`
- Modify: `studio-workspace.js:1331-1352`
- Modify: `studio-workspace.css:464-504`

**Interfaces:**
- Produces: `supportsSelectPopover(element) -> boolean`
- Produces: `showSelectPopover(element) -> boolean`
- Produces: `hideSelectPopover(element) -> boolean`
- Consumes: existing `popoverPlacement(anchorRect, menuRect, viewport)`
- Preserves: `enhanceSelect(select) -> record | null`
- Preserves: `closeActiveSelect(options) -> boolean`

- [ ] **Step 1: Write failing manual-popover lifecycle and contract tests**

Add these tests to `tests/studio-workspace-controls.test.mjs`:

```js
test('manual select popover reveals before show and hides after close', () => {
  const calls = [];
  let hidden = true;
  const listbox = {
    get hidden() { return hidden; },
    set hidden(value) { hidden = Boolean(value); calls.push(`hidden:${hidden}`); },
    showPopover() { calls.push(`show:${hidden}`); },
    hidePopover() { calls.push(`hide:${hidden}`); },
  };

  assert.equal(Workspace.supportsSelectPopover(listbox), true);
  assert.equal(Workspace.showSelectPopover(listbox), true);
  assert.deepEqual(calls, ['hidden:false', 'show:false']);

  assert.equal(Workspace.hideSelectPopover(listbox), true);
  assert.deepEqual(calls, ['hidden:false', 'show:false', 'hide:false', 'hidden:true']);
});

test('failed or unsupported top-layer enhancement retains a hidden listbox', () => {
  const unsupported = { hidden: true };
  const failed = {
    hidden: true,
    showPopover() { throw new Error('not allowed'); },
    hidePopover() {},
  };

  assert.equal(Workspace.supportsSelectPopover(unsupported), false);
  assert.equal(Workspace.showSelectPopover(unsupported), false);
  assert.equal(unsupported.hidden, true);
  assert.equal(Workspace.showSelectPopover(failed), false);
  assert.equal(failed.hidden, true);
});

test('global combobox uses a manual top-layer listbox before positioning', () => {
  assert.match(workspaceSource, /setAttributeIfChanged\(listbox, 'popover', 'manual'\)/);
  assert.match(workspaceSource, /if \(!supportsSelectPopover\(listbox\)\) return null/);
  const openSource = workspaceSource.slice(
    workspaceSource.indexOf('function openSelect(record)'),
    workspaceSource.indexOf('function commitSelectOption(record, index)'),
  );
  assert.ok(openSource.indexOf('showSelectPopover(record.listbox)') < openSource.indexOf('positionSelect(record)'));
  assert.match(workspaceCss, /inset:\s*auto/);
  assert.match(workspaceCss, /margin:\s*0/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test tests/studio-workspace-controls.test.mjs
```

Expected: FAIL because the three exported Popover API helpers and manual-popover adapter contract do not exist.

- [ ] **Step 3: Add minimal top-layer lifecycle helpers**

Add before `boot(documentRef)` in `studio-workspace.js`:

```js
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
```

Export all three helpers from the frozen API object.

- [ ] **Step 4: Gate enhancement and correct open/close ordering**

In `enhanceSelect(select)`, immediately after creating `listbox`, retain the native fallback when the Popover API is unavailable, then configure the supported listbox:

```js
var listbox = documentRef.createElement('div');
if (!supportsSelectPopover(listbox)) return null;
setAttributeIfChanged(listbox, 'popover', 'manual');
```

Replace the direct hidden toggles in `openSelect` and `closeActiveSelect`:

```js
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
```

In `closeActiveSelect`, set `record.open = false`, call `hideSelectPopover(record.listbox)`, then clear ARIA and active registry state. Repeated close remains a no-op.

- [ ] **Step 5: Reset top-layer user-agent placement defaults**

Add these declarations to `.studio-combobox-listbox` in `studio-workspace.css`:

```css
  inset: auto;
  right: auto;
  bottom: auto;
  margin: 0;
```

Keep `position: fixed`, the existing `--studio-menu-left`, `--studio-menu-top`, `--studio-menu-width`, above-side transform origin, bottom-sheet selector, motion, contrast, and transparency rules unchanged.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```powershell
node --test tests/studio-workspace-controls.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the top-layer repair**

```powershell
git add -- tests/studio-workspace-controls.test.mjs studio-workspace.js studio-workspace.css
git commit -m "fix: anchor global combobox menus in top layer"
```

### Task 2: Keep option scrolling local and preserve external dismissal

**Files:**
- Modify: `tests/studio-workspace-controls.test.mjs`
- Modify: `studio-workspace.js:866-875`
- Modify: `studio-workspace.js:1225-1241`
- Modify: `studio-workspace.js:1331-1352`

**Interfaces:**
- Produces: `selectOptionScrollTop(listboxRect, optionRect, currentScrollTop, maximumScrollTop) -> number`
- Produces: `scrollOriginatesInSelectListbox(record, event) -> boolean`
- Consumes: `record.listbox`, `record.options[index].button`, and the existing active-select record
- Preserves: external `dismissSurfaceScroll(event)` registration

- [ ] **Step 1: Write failing local-scroll and dismissal-source tests**

Add:

```js
test('active option scrolling is local, bounded, and stable when already visible', () => {
  const listbox = { top: 100, bottom: 300 };
  assert.equal(Workspace.selectOptionScrollTop(listbox, { top: 80, bottom: 120 }, 50, 400), 30);
  assert.equal(Workspace.selectOptionScrollTop(listbox, { top: 280, bottom: 330 }, 50, 400), 80);
  assert.equal(Workspace.selectOptionScrollTop(listbox, { top: 140, bottom: 180 }, 50, 400), 50);
  assert.equal(Workspace.selectOptionScrollTop(listbox, { top: 0, bottom: 20 }, 10, 15), 0);
});

test('only scrolling inside the open listbox bypasses select dismissal', () => {
  const child = {};
  const listbox = {
    contains(target) { return target === child; },
  };
  const record = { open: true, listbox };

  assert.equal(Workspace.scrollOriginatesInSelectListbox(record, { target: listbox }), true);
  assert.equal(Workspace.scrollOriginatesInSelectListbox(record, { target: child }), true);
  assert.equal(Workspace.scrollOriginatesInSelectListbox(record, { target: {} }), false);
  assert.equal(Workspace.scrollOriginatesInSelectListbox({ open: false, listbox }, { target: child }), false);
});

test('combobox active option visibility never scrolls the page', () => {
  assert.doesNotMatch(workspaceSource, /\.scrollIntoView\(/);
  assert.match(workspaceSource, /scrollOriginatesInSelectListbox\(activeSelectRecord, event\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test tests/studio-workspace-controls.test.mjs
```

Expected: FAIL because the local-scroll helpers are missing and `scrollIntoView()` is still used.

- [ ] **Step 3: Implement bounded listbox-local scrolling**

Add and export:

```js
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
```

Replace `active.button.scrollIntoView({ block: 'nearest' })` in `setSelectActive` with:

```js
if (typeof record.listbox.getBoundingClientRect === 'function' &&
    typeof active.button.getBoundingClientRect === 'function') {
  record.listbox.scrollTop = selectOptionScrollTop(
    record.listbox.getBoundingClientRect(),
    active.button.getBoundingClientRect(),
    record.listbox.scrollTop,
    Math.max(0, finiteNumber(record.listbox.scrollHeight, 0) - finiteNumber(record.listbox.clientHeight, 0)),
  );
}
```

- [ ] **Step 4: Ignore only listbox-internal scroll events**

Add and export:

```js
function scrollOriginatesInSelectListbox(record, event) {
  var target = event && event.target;
  return Boolean(record && record.open && record.listbox && target &&
    (target === record.listbox ||
      (typeof record.listbox.contains === 'function' && record.listbox.contains(target))));
}
```

Change the existing listener target without changing its registrations:

```js
function dismissSurfaceScroll(event) {
  if (scrollOriginatesInSelectListbox(activeSelectRecord, event)) return;
  if (openLibraryMenu) closeActiveLibraryMenu({ returnFocus: true });
  closeActiveSelect();
}
```

- [ ] **Step 5: Run focused and complete tests**

Run:

```powershell
node --test tests/studio-workspace-controls.test.mjs
npm.cmd test
```

Expected: all focused tests and the complete suite PASS.

- [ ] **Step 6: Commit scroll lifecycle hardening**

```powershell
git add -- tests/studio-workspace-controls.test.mjs studio-workspace.js
git commit -m "fix: keep combobox option scrolling local"
```

### Task 3: Advance the cache revision and verify real rendered geometry

**Files:**
- Modify: `tests/release-branding-contract.test.mjs`
- Modify: `BUILD_INFO.json`
- Modify: `manifest.webmanifest`
- Modify: `index.html`
- Modify: `studio-workspace.js`
- Modify: `studio-workspace.css`
- Modify: `sw.js`

**Interfaces:**
- Produces: workspace revision `15`
- Produces: asset suffix `43.0.0-beta-studio.15`
- Produces: worker cache `vocab-curve-beta-v43-studio-workspace-v15`
- Consumes: the completed shared combobox behavior from Tasks 1 and 2

- [ ] **Step 1: Make the release contract require revision 15**

Change the release constants and assertion in `tests/release-branding-contract.test.mjs`:

```js
const EXPECTED_CACHE = 'vocab-curve-beta-v43-studio-workspace-v15';
const EXPECTED_ASSET_SUFFIX = '43.0.0-beta-studio.15';
// ...
assert.equal(buildInfo.workspaceRevision, 15);
// ...
assert.match(worker, /43\.0\.0-beta-studio\.15/);
```

- [ ] **Step 2: Run the release contract and verify RED**

Run:

```powershell
node --test tests/release-branding-contract.test.mjs
```

Expected: FAIL because runtime metadata and cache suffixes still identify revision 14.

- [ ] **Step 3: Advance the runtime revision without changing the product version**

Apply these exact metadata changes:

```text
BUILD_INFO.json:       "workspaceRevision": 15
manifest.webmanifest:  "./index.html?v=43.0.0-beta-studio.15"
index.html:            every "43.0.0-beta-studio.14" asset suffix -> ".15"
studio-workspace.js:   header "v43.0.0-beta-studio.15"
studio-workspace.css:  header "v43.0.0-beta-studio.15"
sw.js:                 header "43.0.0-beta-studio.15"
sw.js:                 cache "vocab-curve-beta-v43-studio-workspace-v15"
```

Do not change `43.0.0-beta`, `Vocab Curve Studio Beta v43`, storage keys, or schema versions.

- [ ] **Step 4: Run the complete automated suite**

Run:

```powershell
npm.cmd test
git diff --check
```

Expected: the complete suite PASS and `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Verify Planner Queue Style in a wide real browser**

Serve the repository:

```powershell
py -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/?deploy=studio-15`, navigate to Planner, and evaluate:

```js
const native = document.querySelector('#queueStyle');
const shell = native.nextElementSibling;
const trigger = shell.querySelector('.studio-combobox-trigger');
const listbox = shell.querySelector('.studio-combobox-listbox');
trigger.click();
const triggerRect = trigger.getBoundingClientRect();
const listboxRect = listbox.getBoundingClientRect();
({
  expanded: trigger.getAttribute('aria-expanded'),
  topLayer: listbox.matches(':popover-open'),
  visible: !listbox.hidden,
  insideViewport:
    listboxRect.left >= 12 &&
    listboxRect.right <= innerWidth - 12 &&
    listboxRect.top >= 12 &&
    listboxRect.bottom <= innerHeight - 12,
  gapBelow: Math.abs(listboxRect.top - triggerRect.bottom),
  gapAbove: Math.abs(triggerRect.top - listboxRect.bottom),
  overlaps:
    listboxRect.bottom > triggerRect.top &&
    listboxRect.top < triggerRect.bottom,
});
```

Expected:

```js
{
  expanded: 'true',
  topLayer: true,
  visible: true,
  insideViewport: true,
  overlaps: false,
  // Exactly one of gapBelow or gapAbove is between 6 and 10.
}
```

Select each option once and confirm the native `queueStyle.value` changes exactly once per changed selection.

- [ ] **Step 6: Verify Stats Deck State after scrolling**

Navigate to Stats, scroll the Deck table into view, open `#deckStateFilter`, and run the same geometry calculation using its native select, shell, trigger, and listbox.

Expected: the listbox is in `:popover-open`, remains within viewport margins, does not overlap the trigger, and has a 6–10 px gap above or below. Scroll the listbox and confirm `aria-expanded="true"` remains. Scroll the Stats view and confirm it becomes `"false"`.

- [ ] **Step 7: Verify compact and accessibility behavior**

At `390 × 844` px and `844 × 390` px:

- open Queue Style and Deck State;
- confirm the existing bottom sheet uses safe-area left, right, and bottom spacing;
- select an option, dismiss outside, and press Escape;
- confirm focus returns to the trigger on Escape;
- emulate reduced motion and confirm no spatial listbox transition is required to understand state.

Also smoke-test one modal select and one header select so the shared repair is not limited to Planner and Stats.

- [ ] **Step 8: Commit the verified revision**

```powershell
git add -- tests/release-branding-contract.test.mjs BUILD_INFO.json manifest.webmanifest index.html studio-workspace.js studio-workspace.css sw.js
git commit -m "release: advance Beta v43 workspace revision 15"
```

- [ ] **Step 9: Publish and verify GitHub Pages**

```powershell
git push origin main
gh run list --workflow pages-build-deployment --limit 1
```

Wait for the Pages deployment to complete successfully, then open:

```text
https://flzsh.github.io/vocab-curve-studio/?deploy=studio-15
```

Repeat the Queue Style and Deck State geometry, selection, outside-dismissal, internal-scroll, and external-scroll checks against the deployed build. Confirm the deployed worker cache reports `vocab-curve-beta-v43-studio-workspace-v15`.
