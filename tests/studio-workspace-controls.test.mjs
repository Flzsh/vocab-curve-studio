import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Workspace from '../studio-workspace.js';

const workspaceSource = await readFile(new URL('../studio-workspace.js', import.meta.url), 'utf8');
const workspaceCss = await readFile(new URL('../studio-workspace.css', import.meta.url), 'utf8');

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

test('workspace owns every eligible select through one generic registry', () => {
  assert.match(workspaceSource, /var selectRecords = new WeakMap\(\)/);
  assert.match(workspaceSource, /function enhanceSelect\(select\)/);
  assert.match(workspaceSource, /function enhanceSelects\(rootNode\)/);
  assert.match(workspaceSource, /function syncSelect\(record\)/);
  assert.match(workspaceSource, /controller\.closeActiveSelect = closeActiveSelect/);
  assert.doesNotMatch(workspaceSource, /function enhanceQueueSelect|var queueCombobox/);
});

test('global combobox styling replaces queue-specific styling', () => {
  assert.match(workspaceCss, /\.studio-combobox-trigger/);
  assert.match(workspaceCss, /\.studio-combobox-listbox/);
  assert.match(workspaceCss, /data-studio-sheet="true"/);
  assert.doesNotMatch(workspaceCss, /\.mac-queue-/);
});
