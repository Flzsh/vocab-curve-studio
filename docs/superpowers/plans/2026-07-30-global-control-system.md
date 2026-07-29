# Global Control System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Planner-only dropdown and slider enhancements with one accessible, animated control system for every application dropdown, range input, determinate progress track, and real disclosure.

**Architecture:** Refactor the singular Queue Style combobox into a registry-backed adapter that keeps every native select as its source of truth and mirrors dynamic option mutations. Generalize range/progress/disclosure CSS through verified semantic families, reuse the existing global range-fill calculation, and preserve library ellipsis controls as popover menus.

**Tech Stack:** Static HTML/CSS, browser JavaScript, UMD/CommonJS module exports, Node.js `node:test`, existing `v19-ui.js` range-fill behavior, Playwright CLI for real-browser interaction and computed-style verification.

## Global Constraints

- Every current single-select application control is enhanced unless explicitly marked native.
- Native selects remain the source of truth and remain usable when enhancement fails.
- Only one application listbox or library popover menu may remain open.
- Dropdowns support Arrow keys, Home, End, Enter, Space, Escape, Tab, typeahead, outside dismissal, and focus return.
- A changed selection dispatches exactly one bubbling `change`; reselecting the current option dispatches none.
- Dynamic book, batch, section, and modal options resynchronize without stale nodes or leaked observers.
- All three current ranges use a 44 px interaction target, 6 px rail, and 20 px thumb.
- Range styling is global and reuses `--v19-range-fill`.
- Determinate progress uses a verified selector union; `.section-progress` remains excluded.
- Accordions and library ellipsis popovers remain separate semantic families.
- Chapter cards show one disclosure indicator, not two.
- Reduced motion, reduced transparency, increased contrast, dark mode, and Low Power mode preserve state feedback.
- Product name remains `Vocab Curve Studio Beta v43`; technical version remains `43.0.0-beta`.

---

## File Structure

- Create `tests/studio-workspace-controls.test.mjs`: pure combobox navigation, option-state, typeahead, placement, and range-percentage tests.
- Modify `studio-workspace.js`: generic select models, registry-backed DOM adapter, dynamic option synchronization, one-open-surface coordination, and global control synchronization.
- Modify `studio-workspace.css`: shared dropdown, range, progress, disclosure, accessibility, and compact-sheet styles; remove Queue Style and Planner ID specificity.
- Modify `index.html`: add semantic Studio progress classes where new Import markup is touched and remove duplicate disclosure markup only when necessary.
- Modify `BUILD_INFO.json`, `manifest.webmanifest`, `index.html`, `studio-workspace.js`, `studio-workspace.css`, `sw.js`, and `tests/release-branding-contract.test.mjs`: advance the complete workspace from revision 13 to revision 14 after both feature plans pass.

### Task 1: Pure select navigation and state helpers

**Files:**
- Create: `tests/studio-workspace-controls.test.mjs`
- Modify: `studio-workspace.js:116-135`
- Modify: `studio-workspace.js:948-958`

**Interfaces:**
- Produces: `snapshotSelectOptions(selectLike) -> Array<{ index, value, label, disabled }>`
- Produces: `selectedOptionIndex(records, value) -> number`
- Produces: `nextEnabledOptionIndex(records, current, key) -> number`
- Produces: `typeaheadOptionIndex(records, current, query) -> number`
- Retains: `popoverPlacement(anchorRect, menuRect, viewport)`
- Retains: `rangeFillPercentage(value, minimum, maximum)`

- [ ] **Step 1: Write failing option-state and keyboard tests**

Create:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import Workspace from '../studio-workspace.js';

const records = [
  { value: 'reviewFirst', label: 'Reviews before new', disabled: false },
  { value: 'mixed', label: 'Mixed reviews + new', disabled: true },
  { value: 'newFirst', label: 'New first until cap', disabled: false },
];

test('select snapshot keeps labels values and disabled options', () => {
  const result = Workspace.snapshotSelectOptions({
    options: [
      { value: 'a', textContent: 'Alpha', disabled: false },
      { value: 'b', textContent: 'Beta', disabled: true },
    ],
  });
  assert.deepEqual(result, [
    { index: 0, value: 'a', label: 'Alpha', disabled: false },
    { index: 1, value: 'b', label: 'Beta', disabled: true },
  ]);
});

test('keyboard navigation skips disabled options and wraps', () => {
  assert.equal(Workspace.nextEnabledOptionIndex(records, 0, 'ArrowDown'), 2);
  assert.equal(Workspace.nextEnabledOptionIndex(records, 2, 'ArrowDown'), 0);
  assert.equal(Workspace.nextEnabledOptionIndex(records, 0, 'ArrowUp'), 2);
  assert.equal(Workspace.nextEnabledOptionIndex(records, 2, 'Home'), 0);
  assert.equal(Workspace.nextEnabledOptionIndex(records, 0, 'End'), 2);
});

test('typeahead finds the next enabled prefix match', () => {
  assert.equal(Workspace.typeaheadOptionIndex(records, 0, 'new'), 2);
  assert.equal(Workspace.typeaheadOptionIndex(records, 2, 'reviews'), 0);
  assert.equal(Workspace.typeaheadOptionIndex(records, 0, 'mixed'), -1);
});

test('selected option index returns minus one for an unknown value', () => {
  assert.equal(Workspace.selectedOptionIndex(records, 'newFirst'), 2);
  assert.equal(Workspace.selectedOptionIndex(records, 'missing'), -1);
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

```powershell
node --test tests/studio-workspace-controls.test.mjs
```

Expected: FAIL because the four new helper functions are not exported.

- [ ] **Step 3: Implement minimal pure helpers**

Add:

```js
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
```

Export these helpers. Keep `nextComboboxIndex()` temporarily for compatibility until the DOM refactor is green.

- [ ] **Step 4: Run targeted and full tests**

```powershell
node --test tests/studio-workspace-controls.test.mjs
npm.cmd test
```

Expected: all new helper tests and existing tests pass.

- [ ] **Step 5: Commit the pure control model**

```powershell
git add -- studio-workspace.js tests/studio-workspace-controls.test.mjs
git commit -m "refactor: add shared select control model"
```

### Task 2: Registry-backed global dropdown adapter

**Files:**
- Modify: `studio-workspace.js:145-175`
- Modify: `studio-workspace.js:578-745`
- Modify: `studio-workspace.js:800-945`
- Modify: `studio-workspace.css:231-322`
- Modify: `studio-workspace.css:2887-2959`

**Interfaces:**
- Consumes: Task 1 option helper exports
- Produces: `enhanceSelect(select) -> record|null`
- Produces: `enhanceSelects(root) -> number`
- Produces: `syncSelect(record)`
- Produces: `closeActiveSelect({ returnFocus, preserveFocus }) -> boolean`
- Produces: `controller.closeActiveSelect`

- [ ] **Step 1: Record a real-browser RED baseline**

Start a local server:

```powershell
python -m http.server 4173
```

Open with Playwright CLI, navigate to Import, and verify that `importMode` remains a native select while `queueStyle` has a `.mac-queue-combobox` sibling:

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli open http://127.0.0.1:4173
npx.cmd --yes --package @playwright/cli playwright-cli snapshot
```

Expected RED behavior: opening Import behavior uses the browser/OS native menu and has no Studio listbox animation.

- [ ] **Step 2: Replace singular Queue Style variables with registry state**

Remove `queueSelect`, `queueCombobox`, and Queue-specific close/sync/open/commit functions. Add:

```js
var selectRecords = new WeakMap();
var enhancedSelects = [];
var activeSelectRecord = null;
var typeaheadBuffer = '';
var typeaheadTimer = 0;
```

Keep the native select visually hidden only after its visible adapter has been built successfully.

- [ ] **Step 3: Implement a generic record builder**

`enhanceSelect(select)` must:

- skip missing parents, `multiple`, `size > 1`, and `[data-studio-native-select]`;
- snapshot all options;
- create `.studio-combobox`, `.studio-combobox-trigger`, `.studio-combobox-label`, `.studio-combobox-disclosure`, and `.studio-combobox-listbox`;
- assign stable generated IDs;
- read the source label from `select.labels[0]` first and otherwise from a wrapping `.field label`;
- preserve a source label through `aria-labelledby`, or copy the native select's `aria-label` to the visible trigger when no label element exists;
- mirror disabled state;
- add `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls`;
- render each non-native option as a `.studio-combobox-option[role="option"]` with a check mark;
- add the record to `selectRecords` and `enhancedSelects`;
- add `.studio-native-select` to the source only after construction succeeds.

Use this record shape:

```js
{
  select: select,
  shell: shell,
  trigger: trigger,
  label: visibleLabel,
  disclosure: disclosure,
  listbox: listbox,
  options: optionRecords,
  activeIndex: selectedIndex,
  open: false,
  sourceLabel: sourceLabel,
  signature: optionSignature,
}
```

- [ ] **Step 4: Implement global open, close, sync, commit, and keyboard behavior**

Required logic:

```js
function closeActiveSelect(options) {
  if (!activeSelectRecord || !activeSelectRecord.open) return false;
  var settings = options && typeof options === 'object' ? options : {};
  var record = activeSelectRecord;
  record.open = false;
  record.listbox.hidden = true;
  setAttributeIfChanged(record.trigger, 'aria-expanded', 'false');
  removeAttributeIfPresent(record.trigger, 'aria-activedescendant');
  activeSelectRecord = null;
  if (settings.returnFocus && typeof record.trigger.focus === 'function') record.trigger.focus();
  return true;
}

function commitSelectOption(record, index) {
  var option = record.options[index];
  if (!option || option.disabled) return;
  var changed = String(record.select.value) !== String(option.value);
  record.select.value = option.value;
  syncSelect(record);
  closeActiveSelect({ returnFocus: true });
  if (changed) {
    record.select.dispatchEvent(new windowRef.Event('change', { bubbles: true }));
  }
}
```

On open: close the active library menu and any other select, resync options, position above/below using `popoverPlacement`, then set `aria-expanded`.

Keyboard behavior:

- Escape closes and returns focus.
- Tab closes without preventing focus movement.
- Enter/Space opens or commits.
- ArrowDown/ArrowUp/Home/End call `nextEnabledOptionIndex`.
- Printable keys append to a 500 ms typeahead buffer and call `typeaheadOptionIndex`.

- [ ] **Step 5: Resynchronize dynamic options**

At each `syncContext()` and `studio:controls-sync`:

```js
function enhanceSelects(rootNode) {
  var scope = rootNode && typeof rootNode.querySelectorAll === 'function' ? rootNode : documentRef;
  var selects = Array.prototype.slice.call(scope.querySelectorAll('select'));
  selects.forEach(enhanceSelect);
  enhancedSelects = enhancedSelects.filter(function(record) {
    return record.select && record.select.isConnected !== false;
  });
  enhancedSelects.forEach(syncSelect);
  return enhancedSelects.length;
}
```

`syncSelect(record)` compares a deterministic option signature containing values, labels, disabled flags, selected value, and select disabled state. If option structure changed, rebuild only that record's option nodes and handlers. Do not append a second shell.

Extend the existing `MutationObserver` to observe select child-list and relevant attribute changes without observing style changes.

- [ ] **Step 6: Coordinate dismissal with library popovers**

Update:

- Escape: close active select first, then library menu, then inspector.
- Outside pointer: close whichever open surface does not contain the event target.
- Focus departure: close active select unless focus remains in its shell/listbox.
- View change, document scroll, and compact-layout resize: close active select.
- Opening a library menu: call `closeActiveSelect()`.

Expose `controller.closeActiveSelect` and retain `controller.closeQueueCombobox` as an alias for one release to avoid breaking external diagnostics.

- [ ] **Step 7: Replace Queue-specific CSS with semantic Studio classes**

Rename the complete `.mac-queue-*` block to `.studio-combobox-*` and remove view-specific Queue selectors. Use:

```css
.studio-combobox { position: relative; width: 100%; }

.studio-combobox-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 46px;
  padding: 9px 12px;
  color: var(--mac-text);
  text-align: left;
  background: var(--mac-surface);
  border: 1px solid var(--mac-separator);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
  transform-origin: var(--studio-menu-origin-x, 50%) var(--studio-menu-origin-y, 0%);
}

.studio-combobox-trigger[aria-expanded="true"] {
  border-color: var(--mac-focus);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mac-focus) 18%, transparent);
}

.studio-combobox-listbox {
  position: fixed;
  z-index: 1200;
  display: grid;
  max-height: min(360px, calc(100dvh - 24px));
  overflow: auto;
  padding: 5px;
  background: color-mix(in srgb, var(--mac-elevated) 94%, var(--mac-surface));
  border: 1px solid color-mix(in srgb, white 58%, var(--mac-separator));
  border-radius: 13px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .16);
  backdrop-filter: blur(24px) saturate(165%);
}
```

Use a symmetric 150 ms materialize/dematerialize transition based on opacity, scale, and blur. It must be interruptible: reopening before the exit finishes starts from current computed presentation, not a hidden fixed target. In reduced motion, use a 120 ms opacity cross-fade only.

On compact layouts, apply a fixed safe-area sheet only when the adapter sets `data-studio-sheet="true"`.

- [ ] **Step 8: Run automated tests**

```powershell
node --test tests/studio-workspace-controls.test.mjs
npm.cmd test
git diff --check
```

Expected: all tests pass; no whitespace errors.

- [ ] **Step 9: Verify every select in a real browser**

Use current snapshots and resnapshot after each view change. Exercise:

- `bookSelect`
- `batchPicker`
- `sectionPicker`
- `importMode`
- `importAiLanguage`
- `curveProfile`
- `queueStyle`
- `equalChapterMode`
- `deckStateFilter`
- `proTutorMode`
- `transferScope`
- `modalBatchPicker`
- `modalSectionPicker`

For each: open, change, reopen, Escape, outside click. For book/batch/section/modal pickers, trigger an option rebuild and confirm the visible list updates once without duplicate shells.

Verify keyboard typeahead, disabled options, focus return, and one-open-menu behavior. Save `output/playwright/global-dropdowns.png`.

- [ ] **Step 10: Commit the global dropdown adapter**

```powershell
git add -- studio-workspace.js studio-workspace.css tests/studio-workspace-controls.test.mjs
git commit -m "feat: apply dropdown design globally"
```

### Task 3: Global ranges, determinate progress, and disclosure semantics

**Files:**
- Modify: `tests/studio-workspace-controls.test.mjs`
- Modify: `studio-workspace.js:125-129`
- Modify: `studio-workspace.js:747-756`
- Modify: `studio-workspace.css:126-169`
- Modify: `studio-workspace.css:2964-3008`
- Modify: `studio-workspace.css:3479-3542`
- Modify if needed: `index.html:463,764,3189-3206`

**Interfaces:**
- Consumes: existing `v19-ui.js` `--v19-range-fill`
- Produces: global `input[type="range"]` styling
- Produces: complete verified determinate-track selector union
- Produces: one explicit disclosure indicator per real disclosure

- [ ] **Step 1: Add failing range math tests**

Append:

```js
test('range percentage handles minimum midpoint maximum and invalid spans', () => {
  assert.equal(Workspace.rangeFillPercentage(20, 20, 600), 0);
  assert.equal(Workspace.rangeFillPercentage(310, 20, 600), 50);
  assert.equal(Workspace.rangeFillPercentage(600, 20, 600), 100);
  assert.equal(Workspace.rangeFillPercentage(10, 10, 10), 0);
});
```

Temporarily mutate `rangeFillPercentage()` locally to return `0` for every valid span and run the test to confirm it fails on the midpoint and maximum. Restore the function, then run:

```powershell
node --test tests/studio-workspace-controls.test.mjs
```

Expected after restoration: all tests pass.

- [ ] **Step 2: Record a browser RED baseline for the third slider**

Navigate to Settings and compare `#proTutorThreshold` with `#dailyNewRange` using computed styles and screenshots.

Expected RED behavior:

- Pro Tutor threshold uses the older 10 px rail and colorful 23 px thumb system.
- Daily Limits uses the newer 6 px rail and neutral 20 px thumb system.

Capture `output/playwright/range-baseline.png`.

- [ ] **Step 3: Remove Planner-only range JavaScript**

Remove `dailyNewRange`, `dailyReviewRange`, `syncRange()`, and the two calls inside `syncDailyControls()` from `studio-workspace.js`. Rename `syncDailyControls()` to `syncSharedControls()` and leave it responsible for enhancing selects and clearing invalid switch ARIA only.

Do not add a second fill calculator. `v19-ui.js` already initializes all ranges, updates on delegated input, and handles dynamically inserted ranges.

- [ ] **Step 4: Replace ID selectors with one global range family**

Remove both duplicate `#dailyNewRange, #dailyReviewRange` style blocks and add:

```css
body.studio-workspace input[type="range"]:not([data-studio-native-range]) {
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  color: var(--mac-context-a);
  background: transparent !important;
  border: 0 !important;
  cursor: pointer;
}

body.studio-workspace input[type="range"]::-webkit-slider-runnable-track {
  height: 6px;
  border: 0;
  border-radius: 999px;
  background:
    linear-gradient(90deg, var(--mac-context-a), var(--mac-context-b))
      0 / var(--v19-range-fill, 0%) 100% no-repeat,
    color-mix(in srgb, var(--mac-secondary) 18%, transparent);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, .12);
}

body.studio-workspace input[type="range"]::-moz-range-track {
  height: 6px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mac-secondary) 18%, transparent);
}

body.studio-workspace input[type="range"]::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--mac-context-a), var(--mac-context-b));
}

body.studio-workspace input[type="range"]::-webkit-slider-thumb {
  width: 20px;
  height: 20px;
  margin-top: -7px;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid rgba(0, 0, 0, .12);
  border-radius: 50%;
  background: var(--mac-surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .22), inset 0 1px rgba(255, 255, 255, .8);
}
```

Add the equivalent 20 px Firefox thumb. Focus-visible adds a contextual halo; pointer-down scales to 1.06; disabled opacity is .45. Dark, increased contrast, reduced transparency, Low Power, and reduced motion must use these generic selectors.

- [ ] **Step 5: Normalize determinate progress selectors**

Replace the partial final block with:

```css
:is(
  .studio-progress-track,
  .mini-progress,
  .statbar,
  .v15-progress-track,
  .v15-glory-progress,
  .v20-library-progress,
  .match-timer-track,
  .timer-track,
  .health-track,
  .v19-liquid-track
) {
  position: relative;
  display: block;
  height: var(--studio-progress-height) !important;
  min-height: var(--studio-progress-height) !important;
  max-height: var(--studio-progress-height) !important;
  overflow: hidden !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: var(--studio-progress-track) !important;
  box-shadow: none !important;
  filter: none !important;
}
```

Add the equivalent verified fill union for direct `span`, `i`, `.fill`, `.health-fill`, and `.timer-fill` children. Preserve health/timer semantic fill colors and danger states through more specific fill-color declarations.

Do not include `.section-progress`.

- [ ] **Step 6: Remove the duplicate chapter chevron**

Change the disclosure block so generated `summary::after` applies only to `.save-details` and `.mobile-answer-extra`:

```css
:is(.save-details, .mobile-answer-extra) > summary::after {
  content: "⌄";
  flex: 0 0 auto;
  font-size: 16px;
  line-height: 1;
  transition: transform 180ms cubic-bezier(.2, .8, .2, 1);
}

:is(.save-details, .mobile-answer-extra)[open] > summary::after {
  transform: rotate(180deg);
}
```

Keep `.v20-chapter-disclosure` as the sole chapter indicator. Preserve `.v20-library-more` popover styling and JavaScript.

- [ ] **Step 7: Run automated tests and diff checks**

```powershell
node --test tests/studio-workspace-controls.test.mjs
npm.cmd test
git diff --check
```

Expected: all tests pass and the diff check is clean.

- [ ] **Step 8: Verify ranges, progress, and disclosures in a real browser**

At 1440 x 1000 px and 390 x 844 px:

- set each of the three sliders to minimum, midpoint, and maximum;
- verify the fill starts and ends under the thumb;
- verify every slider has the same 6 px rail and 20 px thumb;
- verify visible focus, hover, pressed, and disabled states;
- verify daily, statistics, library, health, timer, glory, and match-timer tracks share geometry without losing semantic colors;
- verify section-status cards are not flattened into bars;
- open/close chapter, save details, and mobile answer details and confirm one chevron;
- open library ellipsis menus and confirm outside-click, Escape, and focus-return still work.

Repeat with reduced motion and dark mode. Save `output/playwright/global-ranges-progress.png`.

- [ ] **Step 9: Commit the global visual system**

```powershell
git add -- studio-workspace.js studio-workspace.css index.html tests/studio-workspace-controls.test.mjs
git commit -m "fix: apply shared range and progress design"
```

### Task 4: Combined Beta v43 workspace revision and verification

**Files:**
- Modify: `tests/release-branding-contract.test.mjs`
- Modify: `BUILD_INFO.json`
- Modify: `manifest.webmanifest`
- Modify: `index.html`
- Modify: `studio-workspace.js`
- Modify: `studio-workspace.css`
- Modify: `sw.js`

**Interfaces:**
- Consumes: completed OpenRouter Import and Global Controls plans
- Produces: `43.0.0-beta-studio.14`
- Produces: `vocab-curve-beta-v43-studio-workspace-v14`
- Produces: `workspaceRevision: 14`

- [ ] **Step 1: Change release expectations first**

Update:

```js
const EXPECTED_CACHE = 'vocab-curve-beta-v43-studio-workspace-v14';
const EXPECTED_ASSET_SUFFIX = '43.0.0-beta-studio.14';
```

Change the workspace revision assertion to:

```js
assert.equal(buildInfo.workspaceRevision, 14);
```

Add:

```js
assert.match(worker, /v20-import-assistant\.js/);
assert.match(html, /v20-import-assistant\.js/);
```

- [ ] **Step 2: Run release test and verify RED**

```powershell
node --test tests/release-branding-contract.test.mjs
```

Expected: FAIL because runtime identity still uses revision 13.

- [ ] **Step 3: Advance the workspace revision consistently**

Make these exact replacements:

- every runtime asset query `43.0.0-beta-studio.13` -> `43.0.0-beta-studio.14`;
- `workspaceRevision: 13` -> `workspaceRevision: 14`;
- `vocab-curve-beta-v43-studio-workspace-v13` -> `vocab-curve-beta-v43-studio-workspace-v14`;
- Studio CSS/JS/service-worker headers `.13` -> `.14`;
- manifest `start_url` suffix `.13` -> `.14`.

Keep product version `43.0.0-beta`.

- [ ] **Step 4: Verify release contract GREEN**

```powershell
node --test tests/release-branding-contract.test.mjs
```

Expected: all release tests pass.

- [ ] **Step 5: Run the complete automated suite**

```powershell
npm.cmd test
git diff --check
```

Expected: all tests pass; no whitespace errors.

- [ ] **Step 6: Verify the service worker in a clean browser context**

Use Playwright CLI against the local server:

- unregister prior service workers;
- clear caches whose name begins `vocab-curve-`;
- load the application;
- wait for the revision 14 worker to activate;
- verify Cache Storage contains `vocab-curve-beta-v43-studio-workspace-v14`;
- verify `v20-import-assistant.js`, `studio-workspace.css`, and `studio-workspace.js` are present;
- reload offline and confirm the initial Study view renders.

- [ ] **Step 7: Run the combined desktop and compact smoke path**

Verify in one fresh profile:

1. Open Import.
2. Paste a mixed raw list.
3. Exercise disconnected OpenRouter behavior without losing text.
4. Copy and download the current format.
5. Open every Import dropdown and adjust any slider exposed in Settings/Planner.
6. Open Books and exercise a library ellipsis menu.
7. Return to Study and confirm rating controls still respond.
8. Resize to 390 x 844 px and 844 x 390 px; repeat Import and navigation checks.

Capture `output/playwright/beta-v43-revision-14-desktop.png` and `output/playwright/beta-v43-revision-14-phone.png`.

- [ ] **Step 8: Review the complete diff**

```powershell
git status --short
git diff --stat c34b14d..HEAD
git diff --check c34b14d..HEAD
```

Confirm only the approved import assistant, global controls, tests, design/plan documents, and revision-14 runtime metadata changed.

- [ ] **Step 9: Commit the combined workspace revision**

```powershell
git add -- BUILD_INFO.json manifest.webmanifest index.html studio-workspace.js studio-workspace.css sw.js tests/release-branding-contract.test.mjs
git commit -m "release: advance Beta v43 workspace revision 14"
```
