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
