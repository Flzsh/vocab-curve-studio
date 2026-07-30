import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Workspace from '../studio-workspace.js';

const workspaceSource = await readFile(new URL('../studio-workspace.js', import.meta.url), 'utf8');
const workspaceCss = await readFile(new URL('../studio-workspace.css', import.meta.url), 'utf8');

function fakeNode(tagName) {
  const attributes = new Map();
  const node = {
    tagName: String(tagName || '').toUpperCase(),
    children: [],
    parentNode: null,
    parentElement: null,
    tabIndex: 0,
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
    },
    appendChild(child) {
      return this.insertBefore(child, null);
    },
    insertBefore(child, reference) {
      if (child.parentElement) {
        const oldIndex = child.parentElement.children.indexOf(child);
        if (oldIndex >= 0) child.parentElement.children.splice(oldIndex, 1);
      }
      const index = reference ? this.children.indexOf(reference) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
      child.parentNode = this;
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
      child.parentElement = null;
      return child;
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
    querySelector(selector) {
      if (selector !== 'select') return null;
      return this.children.find((child) => child.tagName === 'SELECT' || child.querySelector?.('select')) || null;
    },
  };
  Object.defineProperty(node, 'nextSibling', {
    get() {
      if (!node.parentElement) return null;
      const index = node.parentElement.children.indexOf(node);
      return node.parentElement.children[index + 1] || null;
    },
  });
  return node;
}

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

test('select mutation policy ignores adapter mutations and accepts native option changes', () => {
  const select = fakeNode('select');
  const option = fakeNode('option');
  const text = fakeNode('');
  select.appendChild(option);
  option.appendChild(text);
  const trigger = fakeNode('button');

  assert.equal(Workspace.selectMutationIsRelevant({ type: 'attributes', target: trigger }), false);
  assert.equal(Workspace.selectMutationIsRelevant({ type: 'attributes', target: select }), true);
  assert.equal(Workspace.selectMutationIsRelevant({ type: 'characterData', target: text }), true);
});

test('disabled reflection writes only when the state actually changes', () => {
  let disabled = false;
  let writes = 0;
  const trigger = {};
  Object.defineProperty(trigger, 'disabled', {
    get() { return disabled; },
    set(value) { disabled = Boolean(value); writes += 1; },
  });

  assert.equal(Workspace.reflectDisabledState(trigger, false), false);
  assert.equal(writes, 0);
  assert.equal(Workspace.reflectDisabledState(trigger, true), true);
  assert.equal(writes, 1);
  assert.equal(Workspace.reflectDisabledState(trigger, true), false);
  assert.equal(writes, 1);
});

test('shell lifecycle removes orphans and restores reconnect adjacency', () => {
  const oldParent = fakeNode('div');
  const newParent = fakeNode('div');
  const select = fakeNode('select');
  const spacer = fakeNode('span');
  const shell = fakeNode('div');
  oldParent.appendChild(shell);
  newParent.appendChild(select);
  newParent.appendChild(spacer);

  Workspace.ensureSelectShellAdjacency(select, shell);
  assert.deepEqual(newParent.children, [select, shell, spacer]);
  assert.equal(select.nextSibling, shell);
  assert.equal(shell.parentElement, newParent);

  assert.equal(Workspace.removeSelectShell({ shell }), true);
  assert.equal(shell.parentElement, null);
  assert.deepEqual(newParent.children, [select, spacer]);
});

test('option policy keeps listbox options out of sequential focus navigation', () => {
  const option = fakeNode('button');
  Workspace.configureSelectOptionFocus(option);
  assert.equal(option.tabIndex, -1);
});

test('native select state snapshot fully rolls back a late enhancement failure', () => {
  const select = fakeNode('select');
  const label = fakeNode('label');
  select.tabIndex = 3;
  select.setAttribute('aria-hidden', 'false');
  label.setAttribute('for', 'native-select');
  const snapshot = Workspace.snapshotNativeSelectState(select, label);

  select.classList.add('studio-native-select');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  label.setAttribute('for', 'generated-trigger');
  Workspace.restoreNativeSelectState(select, label, snapshot);

  assert.equal(select.classList.contains('studio-native-select'), false);
  assert.equal(select.tabIndex, 3);
  assert.equal(select.getAttribute('aria-hidden'), 'false');
  assert.equal(label.getAttribute('for'), 'native-select');
});

test('transaction rollback removes partial registry, list, and shell state', () => {
  const parent = fakeNode('div');
  const select = fakeNode('select');
  const shell = fakeNode('div');
  const label = fakeNode('label');
  parent.appendChild(select);
  parent.appendChild(shell);
  const snapshot = Workspace.snapshotNativeSelectState(select, label);
  const record = { select, shell, sourceLabel: label, nativeState: snapshot };
  const registry = new WeakMap([[select, record]]);

  select.classList.add('studio-native-select');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const remaining = Workspace.rollbackSelectEnhancement(select, record, label, snapshot, registry, [record]);

  assert.equal(registry.has(select), false);
  assert.deepEqual(remaining, []);
  assert.equal(shell.parentElement, null);
  assert.equal(select.classList.contains('studio-native-select'), false);
  assert.equal(select.tabIndex, 0);
  assert.equal(select.hasAttribute('aria-hidden'), false);
});

test('range percentage handles minimum midpoint maximum and invalid spans', () => {
  assert.equal(Workspace.rangeFillPercentage(20, 20, 600), 0);
  assert.equal(Workspace.rangeFillPercentage(310, 20, 600), 50);
  assert.equal(Workspace.rangeFillPercentage(600, 20, 600), 100);
  assert.equal(Workspace.rangeFillPercentage(10, 10, 10), 0);
});
