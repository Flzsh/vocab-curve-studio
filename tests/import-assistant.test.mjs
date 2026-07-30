import assert from 'node:assert/strict';
import test from 'node:test';
import ImportAssistant from '../v20-import-assistant.js';

test('source parser keeps a no-tab multiword term as one vocabulary row', () => {
  const result = ImportAssistant.parseSourceText('teem with\nrelent\tv. become less severe');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map(row => ({
    sourceIndex: row.sourceIndex,
    lineNumber: row.lineNumber,
    word: row.word,
    meaning: row.meaning,
    needsMeaning: row.needsMeaning,
    needsBridge: row.needsBridge,
  })), [
    { sourceIndex: 0, lineNumber: 1, word: 'teem with', meaning: '', needsMeaning: true, needsBridge: true },
    { sourceIndex: 1, lineNumber: 2, word: 'relent', meaning: 'v. become less severe', needsMeaning: false, needsBridge: true },
  ]);
});

test('source parser preserves a completed meaning bridge and example', () => {
  const text = 'relent\tv. become less severe\uFF5CBridge: pressure lets up\uFF5CExample: The rain relented.';
  const result = ImportAssistant.parseSourceText(text);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].meaning, 'v. become less severe');
  assert.equal(result.rows[0].bridge, ' pressure lets up');
  assert.equal(result.rows[0].example, ' The rain relented.');
  assert.equal(result.rows[0].needsMeaning, false);
  assert.equal(result.rows[0].needsBridge, false);
});

test('completed parser rejects word-only text but accepts formatted output', () => {
  assert.deepEqual(ImportAssistant.parseCompletedText('teem with').items, []);
  const result = ImportAssistant.parseCompletedText('teem with\tv. be full of\uFF5CBridge: a room teems with people');
  assert.equal(result.errors.length, 0);
  assert.equal(result.items[0].word, 'teem with');
  assert.equal(result.items[0].meaning, 'v. be full of');
  assert.equal(result.items[0].bridge, ' a room teems with people');
});

test('source parser reports an overlong supplied meaning instead of truncating it', () => {
  const result = ImportAssistant.parseSourceText(`alpha\t${'x'.repeat(501)}`);
  assert.deepEqual(result.rows, []);
  assert.match(result.errors[0], /meaning exceeds 500 characters/i);
});

test('merge preserves supplied meaning and example while accepting a generated bridge', () => {
  const source = ImportAssistant.parseSourceText(
    'relent\tv. become less severe\uFF5CExample: The rain relented.\nteem with'
  ).rows;
  const merged = ImportAssistant.mergeGeneratedRows(source, [
    { sourceIndex: 0, word: 'relent', meaning: 'AI rewrite must be ignored', bridge: 'pressure lets up' },
    { sourceIndex: 1, word: 'teem with', meaning: 'v. be full of', bridge: 'a room teems with people' },
  ]);
  assert.equal(merged[0].meaning, 'v. become less severe');
  assert.equal(merged[0].example, ' The rain relented.');
  assert.equal(merged[0].bridge, 'pressure lets up');
  assert.equal(merged[1].meaning, 'v. be full of');
});

for (const [name, generated, pattern] of [
  ['duplicate index', [
    { sourceIndex: 0, word: 'relent', meaning: '', bridge: 'one' },
    { sourceIndex: 0, word: 'relent', meaning: '', bridge: 'two' },
  ], /duplicate source index/i],
  ['changed word', [
    { sourceIndex: 0, word: 'different', meaning: '', bridge: 'one' },
  ], /word did not match/i],
  ['delimiter injection', [
    { sourceIndex: 0, word: 'relent', meaning: '', bridge: 'one\uFF5CExample: injected' },
  ], /delimiter/i],
]) {
  test(`merge rejects ${name}`, () => {
    const source = ImportAssistant.parseSourceText('relent\tv. become less severe').rows;
    assert.throws(() => ImportAssistant.mergeGeneratedRows(source, generated), pattern);
  });
}

test('completion session resumes at the first unaccepted chunk and formats only when complete', () => {
  const session = ImportAssistant.createCompletionSession('alpha\nbeta\ngamma', 'English', { chunkSize: 2 });
  assert.deepEqual(ImportAssistant.nextCompletionChunk(session).map(row => row.word), ['alpha', 'beta']);
  ImportAssistant.acceptCompletionChunk(session, [
    { sourceIndex: 0, word: 'alpha', meaning: 'first letter', bridge: 'alpha starts the alphabet' },
    { sourceIndex: 1, word: 'beta', meaning: 'second letter', bridge: 'beta follows alpha' },
  ]);
  assert.deepEqual(ImportAssistant.nextCompletionChunk(session).map(row => row.word), ['gamma']);
  assert.throws(() => ImportAssistant.completedSessionText(session), /not complete/i);
  ImportAssistant.acceptCompletionChunk(session, [
    { sourceIndex: 2, word: 'gamma', meaning: 'third letter', bridge: 'gamma comes third' },
  ]);
  assert.equal(ImportAssistant.completionProgress(session).percent, 100);
  assert.equal(
    ImportAssistant.completedSessionText(session),
    'alpha\tfirst letter\uFF5CBridge: alpha starts the alphabet\n' +
    'beta\tsecond letter\uFF5CBridge: beta follows alpha\n' +
    'gamma\tthird letter\uFF5CBridge: gamma comes third'
  );
});

test('source fingerprint changes with text or selected language', () => {
  const base = ImportAssistant.sourceFingerprint('alpha', 'English');
  assert.notEqual(base, ImportAssistant.sourceFingerprint('beta', 'English'));
  assert.notEqual(base, ImportAssistant.sourceFingerprint('alpha', 'Simplified Chinese'));
});

test('Auto language follows supplied meanings before browser language', () => {
  const chinese = ImportAssistant.parseSourceText('relent\tv. \u53d8\u6e29\u548c\uff0c\u53d8\u5bbd\u5bb9').rows;
  const empty = ImportAssistant.parseSourceText('relent').rows;
  assert.equal(ImportAssistant.resolveOutputLanguage(chinese, 'Auto', 'en-US'), 'Simplified Chinese');
  assert.equal(ImportAssistant.resolveOutputLanguage(empty, 'Auto', 'zh-CN'), 'Simplified Chinese');
  assert.equal(ImportAssistant.resolveOutputLanguage(empty, 'Auto', 'en-US'), 'English');
  assert.equal(ImportAssistant.resolveOutputLanguage(chinese, 'English', 'zh-CN'), 'English');
});

test('editor text classification distinguishes raw source from completed format', () => {
  assert.equal(ImportAssistant.classifyEditorText(''), 'empty');
  assert.equal(ImportAssistant.classifyEditorText('relent'), 'source');
  assert.equal(ImportAssistant.classifyEditorText('relent\tv. become less severe'), 'source');
  assert.equal(
    ImportAssistant.classifyEditorText('relent\tv. become less severe\uFF5CBridge: pressure lets up'),
    'completed'
  );
});

test('merge validates generated fields even when a source field is already supplied', () => {
  const source = ImportAssistant.parseSourceText('relent\tv. become less severe').rows;
  assert.throws(() => ImportAssistant.mergeGeneratedRows(source, [
    { sourceIndex: 0, word: 'relent', meaning: 'injected\uFF5CExample: value', bridge: 'pressure lets up' },
  ]), /delimiter/i);
});

test('merge rejects a non-integer generated source index', () => {
  const source = ImportAssistant.parseSourceText('relent').rows;
  assert.throws(() => ImportAssistant.mergeGeneratedRows(source, [
    { sourceIndex: null, word: 'relent', meaning: 'v. become less severe', bridge: 'pressure lets up' },
  ]), /outside the source batch/i);
});

test('source parser preserves supplied meaning and example whitespace', () => {
  const source = ImportAssistant.parseSourceText(
    'relent\t  v. become less severe  \uFF5CExample:  The rain relented.  '
  ).rows;
  assert.equal(source[0].meaning, '  v. become less severe  ');
  assert.equal(source[0].example, '  The rain relented.  ');
});

for (const fixture of [
  {
    name: 'ASCII delimiter with mixed-language literal labels and reserved punctuation',
    text: 'literal\t  释义 Bridge: 原样；Example: (also literal) / [x] {y}?!  |Bridge:  联想 Example: 仍是联想；#1  |Example:  Final example: 保留。  ',
    meaning: '  释义 Bridge: 原样；Example: (also literal) / [x] {y}?!  ',
    bridge: '  联想 Example: 仍是联想；#1  ',
    example: '  Final example: 保留。  ',
  },
  {
    name: 'fullwidth delimiter with literal markers and reserved punctuation',
    text: 'literal\t  Meaning Bridge: literal; Example: literal <>&"\'  ｜Bridge:  桥接 Bridge: literal / ? *  ｜Example:  例句 Example: literal。  ',
    meaning: '  Meaning Bridge: literal; Example: literal <>&"\'  ',
    bridge: '  桥接 Bridge: literal / ? *  ',
    example: '  例句 Example: literal。  ',
  },
]) {
  test(`parser and formatter round-trip ${fixture.name}`, () => {
    const parsed = ImportAssistant.parseSourceText(fixture.text);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.rows[0].meaning, fixture.meaning);
    assert.equal(parsed.rows[0].bridge, fixture.bridge);
    assert.equal(parsed.rows[0].example, fixture.example);
    assert.equal(ImportAssistant.formatImportRows(parsed.rows), fixture.text.replaceAll('|', '\uFF5C'));
  });
}

for (const generatedBridge of [
  'Remember Bridge: as literal text; Example: never metadata.',
  '混合联想 Example: 只是文字；Bridge: 也只是文字。?! #1',
]) {
  test(`generated bridge with literal metadata labels round-trips without creating an example: ${generatedBridge}`, () => {
    const source = ImportAssistant.parseSourceText('literal\t  supplied meaning  ').rows;
    const merged = ImportAssistant.mergeGeneratedRows(source, [
      { sourceIndex: 0, word: 'literal', bridge: generatedBridge },
    ]);
    const formatted = ImportAssistant.formatImportRows(merged);
    const reparsed = ImportAssistant.parseSourceText(formatted);
    assert.equal(reparsed.rows[0].meaning, '  supplied meaning  ');
    assert.equal(reparsed.rows[0].bridge, ` ${generatedBridge}`);
    assert.equal(reparsed.rows[0].example, '');
  });
}

test('completion formatting preserves supplied meaning and example whitespace', () => {
  const source = ImportAssistant.parseSourceText(
    'relent\t  v. become less severe  \uFF5CExample:  The rain relented.  '
  ).rows;
  const merged = ImportAssistant.mergeGeneratedRows(source, [
    { sourceIndex: 0, word: 'relent', bridge: 'pressure lets up' },
  ]);
  assert.equal(
    ImportAssistant.formatImportRows(merged),
    'relent\t  v. become less severe  \uFF5CBridge: pressure lets up\uFF5CExample:  The rain relented.  '
  );
});

test('OpenRouter interaction policy allows only Import Clear during import activity', () => {
  assert.equal(
    ImportAssistant.shouldBlockOpenRouterInteraction([{ operation: 'import', state: 'requesting' }], 'clearImportBtn'),
    false
  );
  assert.equal(
    ImportAssistant.shouldBlockOpenRouterInteraction([{ operation: 'import', state: 'reserving' }], 'importText'),
    true
  );
  assert.equal(
    ImportAssistant.shouldBlockOpenRouterInteraction([{ operation: 'tutor', state: 'requesting' }], 'clearImportBtn'),
    true
  );
});

test('completion session reuse rejects a different active book', () => {
  const session = ImportAssistant.createCompletionSession('alpha', 'English');
  session.bookId = 'book-a';
  assert.equal(ImportAssistant.completionSessionMatches(session, {
    selectedLanguage: 'English',
    fingerprint: session.fingerprint,
    bookId: 'book-a',
  }), true);
  assert.equal(ImportAssistant.completionSessionMatches(session, {
    selectedLanguage: 'English',
    fingerprint: session.fingerprint,
    bookId: 'book-b',
  }), false);
});

test('completion result disposition rejects a changed editor fingerprint as stale input', () => {
  const session = ImportAssistant.createCompletionSession('alpha', 'English');
  session.bookId = 'book-a';
  assert.deepEqual(ImportAssistant.completionResultDisposition?.(session, {
    activeSession: session,
    selectedLanguage: 'English',
    fingerprint: 'edited-source-fingerprint',
    bookId: 'book-a',
  }), {
    apply: false,
    reason: 'stale-input',
  });
});

test('delayed completion success after Clear is cancelled without stale-input feedback', () => {
  const cleared = ImportAssistant.createCompletionSession('alpha', 'English');
  cleared.bookId = 'book-a';
  assert.deepEqual(ImportAssistant.completionResultDisposition(cleared, {
    activeSession: null,
    selectedLanguage: 'English',
    fingerprint: ImportAssistant.sourceFingerprint('', 'English'),
    bookId: 'book-a',
  }), {
    apply: false,
    reason: 'superseded',
  });
});

test('completion result disposition suppresses a request superseded by a newer active session', () => {
  const older = ImportAssistant.createCompletionSession('alpha', 'English');
  const newer = ImportAssistant.createCompletionSession('beta', 'English');
  older.bookId = 'book-a';
  newer.bookId = 'book-a';
  assert.deepEqual(ImportAssistant.completionResultDisposition(older, {
    activeSession: newer,
    selectedLanguage: 'English',
    fingerprint: newer.fingerprint,
    bookId: 'book-a',
  }), {
    apply: false,
    reason: 'superseded',
  });
});

test('text download activation removes its temporary anchor and revokes its URL after success', () => {
  const actions = [];
  const body = {
    appendChild(anchor) {
      actions.push('append');
      anchor.parentNode = body;
    },
    removeChild(anchor) {
      actions.push('remove');
      anchor.parentNode = null;
    },
  };
  const document = {
    body,
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        parentNode: null,
        click() { actions.push('click'); },
      };
    },
  };
  const URLApi = {
    createObjectURL(blob) {
      assert.equal(blob.parts[0], 'alpha');
      actions.push('create');
      return 'blob:test';
    },
    revokeObjectURL(url) {
      assert.equal(url, 'blob:test');
      actions.push('revoke');
    },
  };
  function BlobFake(parts, options) {
    this.parts = parts;
    this.options = options;
  }

  const filename = ImportAssistant.activateTextDownload('alpha', 'vocab.txt', { document, URL: URLApi, Blob: BlobFake });
  assert.equal(filename, 'vocab.txt');
  assert.deepEqual(actions, ['create', 'append', 'click', 'remove', 'revoke']);
});

test('text download activation cleans up before rethrowing an activation failure', () => {
  const actions = [];
  const body = {
    appendChild(anchor) {
      actions.push('append');
      anchor.parentNode = body;
    },
    removeChild(anchor) {
      actions.push('remove');
      anchor.parentNode = null;
    },
  };
  const document = {
    body,
    createElement() {
      return {
        parentNode: null,
        click() {
          actions.push('click');
          throw new Error('downloads blocked');
        },
      };
    },
  };
  const URLApi = {
    createObjectURL() {
      actions.push('create');
      return 'blob:test';
    },
    revokeObjectURL() {
      actions.push('revoke');
    },
  };

  assert.throws(
    () => ImportAssistant.activateTextDownload('alpha', 'vocab.txt', {
      document,
      URL: URLApi,
      Blob: function BlobFake() {},
    }),
    /downloads blocked/
  );
  assert.deepEqual(actions, ['create', 'append', 'click', 'remove', 'revoke']);
});

test('text download activation still revokes its URL when anchor removal fails', () => {
  const actions = [];
  const body = {
    appendChild(anchor) {
      anchor.parentNode = body;
    },
    removeChild() {
      actions.push('remove');
      throw new Error('anchor removal blocked');
    },
  };
  const document = {
    body,
    createElement() {
      return { parentNode: null, click() { actions.push('click'); } };
    },
  };
  const URLApi = {
    createObjectURL() { return 'blob:test'; },
    revokeObjectURL() { actions.push('revoke'); },
  };

  assert.throws(
    () => ImportAssistant.activateTextDownload('alpha', 'vocab.txt', {
      document,
      URL: URLApi,
      Blob: function BlobFake() {},
    }),
    /anchor removal blocked/
  );
  assert.deepEqual(actions, ['click', 'remove', 'revoke']);
});

test('pending OpenRouter label distinguishes Import completion from Pro Tutor review', () => {
  assert.equal(
    ImportAssistant.openRouterPendingLabel([{ operation: 'import', state: 'requesting' }]),
    'Import completing'
  );
  assert.equal(
    ImportAssistant.openRouterPendingLabel([{ operation: 'tutor', state: 'requesting' }]),
    'Pro reviewing'
  );
});
