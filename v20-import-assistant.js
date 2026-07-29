(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V20ImportAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const FIELD_LIMITS = Object.freeze({ word: 160, meaning: 500, bridge: 500, example: 700 });
  const GENERATED_DELIMITER = /[\t\r\n\uFF5C|]/;

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function splitFields(rest) {
    const value = String(rest || '');
    const bridgeMatch = value.match(/(?:\uFF5C|\|)?\s*Bridge\s*[:\uFF1A]\s*([\s\S]*?)(?=(?:\uFF5C|\|)?\s*Example\s*[:\uFF1A]|$)/i);
    const exampleMatch = value.match(/(?:\uFF5C|\|)?\s*Example\s*[:\uFF1A]\s*([\s\S]*)$/i);
    const meaning = value
      .replace(/(?:\uFF5C|\|)?\s*Bridge\s*[:\uFF1A][\s\S]*$/i, '')
      .replace(/(?:\uFF5C|\|)?\s*Example\s*[:\uFF1A][\s\S]*$/i, '')
      .trim();
    return {
      meaning,
      bridge: bridgeMatch ? bridgeMatch[1].trim().replace(/[\uFF5C|]\s*$/, '') : '',
      example: exampleMatch ? exampleMatch[1].trim() : '',
    };
  }

  function normalizeWord(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\u2019']/g, "'")
      .replace(/\s+/g, ' ');
  }

  function parseSourceText(input) {
    const rows = [];
    const errors = [];
    String(input || '').split(/\r?\n/).forEach(function(raw, zeroIndex) {
      if (!raw.trim()) return;
      const tabIndex = raw.indexOf('\t');
      const word = clean(tabIndex >= 0 ? raw.slice(0, tabIndex) : raw);
      const fields = splitFields(tabIndex >= 0 ? raw.slice(tabIndex + 1) : '');
      if (!word) {
        errors.push(`Line ${zeroIndex + 1}: vocabulary is empty`);
        return;
      }
      if (word.length > FIELD_LIMITS.word) {
        errors.push(`Line ${zeroIndex + 1}: vocabulary exceeds ${FIELD_LIMITS.word} characters`);
        return;
      }
      for (const fieldName of ['meaning', 'bridge', 'example']) {
        if (fields[fieldName].length > FIELD_LIMITS[fieldName]) {
          errors.push(`Line ${zeroIndex + 1}: ${fieldName} exceeds ${FIELD_LIMITS[fieldName]} characters`);
          return;
        }
      }
      rows.push({
        sourceIndex: rows.length,
        lineNumber: zeroIndex + 1,
        word,
        meaning: clean(fields.meaning),
        bridge: clean(fields.bridge),
        example: clean(fields.example),
        needsMeaning: !fields.meaning.trim(),
        needsBridge: !fields.bridge.trim(),
      });
    });
    if (!rows.length && !errors.length) errors.push('Paste at least one vocabulary line');
    return { rows, errors };
  }

  function parseCompletedText(input) {
    const source = parseSourceText(input);
    const items = [];
    const errors = source.errors[0] === 'Paste at least one vocabulary line' ? [] : source.errors.slice();
    source.rows.forEach(function(row) {
      if (!row.meaning) {
        errors.push(`Line ${row.lineNumber}: cannot find word + meaning`);
        return;
      }
      items.push({
        word: row.word,
        meaning: row.meaning,
        fullMeaning: row.meaning,
        bridge: row.bridge,
        example: row.example,
        raw: String(input || '').split(/\r?\n/)[row.lineNumber - 1].trim(),
        norm: normalizeWord(row.word),
      });
    });
    return { items, errors };
  }

  function assertGeneratedField(value, name, required) {
    const result = clean(value);
    if (required && !result) throw new RangeError(`${name} is required`);
    if (result.length > FIELD_LIMITS[name]) throw new RangeError(`${name} exceeds ${FIELD_LIMITS[name]} characters`);
    if (result && GENERATED_DELIMITER.test(result)) throw new RangeError(`${name} contains an import delimiter`);
    return result;
  }

  function collectGeneratedRows(sourceRows, generatedRows) {
    const source = Array.isArray(sourceRows) ? sourceRows : [];
    const generated = Array.isArray(generatedRows) ? generatedRows : [];
    const sourceByIndex = new Map(source.map(function(row) {
      return [row.sourceIndex, row];
    }));
    const byIndex = new Map();
    generated.forEach(function(entry) {
      const sourceIndex = entry && entry.sourceIndex;
      const sourceRow = sourceByIndex.get(sourceIndex);
      if (!Number.isInteger(sourceIndex) || !sourceRow) {
        throw new RangeError('Generated source index is outside the source batch');
      }
      if (byIndex.has(sourceIndex)) throw new RangeError('Generated response contains a duplicate source index');
      if (String(entry.word || '').trim() !== sourceRow.word) {
        throw new RangeError(`Generated word did not match source index ${sourceIndex}`);
      }
      for (const fieldName of ['meaning', 'bridge']) {
        if (Object.prototype.hasOwnProperty.call(entry, fieldName)) {
          assertGeneratedField(entry[fieldName], fieldName, false);
        }
      }
      byIndex.set(sourceIndex, entry);
    });
    return byIndex;
  }

  function mergeGeneratedRows(sourceRows, generatedRows) {
    const source = Array.isArray(sourceRows) ? sourceRows : [];
    const byIndex = collectGeneratedRows(source, generatedRows);
    return source.map(function(row) {
      if (!row.needsMeaning && !row.needsBridge) return { ...row };
      const entry = byIndex.get(row.sourceIndex);
      if (!entry) throw new RangeError(`Generated response is missing source index ${row.sourceIndex}`);
      return {
        ...row,
        meaning: row.meaning || assertGeneratedField(entry.meaning, 'meaning', true),
        bridge: row.bridge || assertGeneratedField(entry.bridge, 'bridge', true),
      };
    });
  }

  function formatImportRows(rows) {
    return rows.map(function(row) {
      let line = `${row.word}\t${row.meaning}`;
      if (row.bridge) line += `\uFF5CBridge: ${row.bridge}`;
      if (row.example) line += `\uFF5CExample: ${row.example}`;
      return line;
    }).join('\n');
  }

  function sourceFingerprint(text, language) {
    const value = `${String(language || 'Auto')}\u0000${String(text || '').replace(/\r\n/g, '\n')}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function resolveOutputLanguage(rows, selectedLanguage, browserLanguage) {
    if (selectedLanguage === 'English' || selectedLanguage === 'Simplified Chinese') return selectedLanguage;
    const supplied = (Array.isArray(rows) ? rows : []).map(function(row) {
      return String(row.meaning || '');
    }).join(' ');
    if (/[\u3400-\u9fff]/.test(supplied)) return 'Simplified Chinese';
    if (/[A-Za-z]/.test(supplied)) return 'English';
    return /^zh(?:-|$)/i.test(String(browserLanguage || '')) ? 'Simplified Chinese' : 'English';
  }

  function classifyEditorText(text) {
    if (!String(text || '').trim()) return 'empty';
    const source = parseSourceText(text);
    if (source.errors.length || !source.rows.length) return 'source';
    return source.rows.every(function(row) {
      return !row.needsMeaning && !row.needsBridge;
    }) ? 'completed' : 'source';
  }

  function createCompletionSession(text, selectedLanguage, options) {
    const source = parseSourceText(text);
    if (source.errors.length) throw new RangeError(source.errors.join('\n'));
    const settings = options || {};
    const requestedChunkSize = Number(settings.chunkSize);
    const chunkSize = Number.isInteger(requestedChunkSize) && requestedChunkSize > 0 ? requestedChunkSize : 20;
    const language = resolveOutputLanguage(source.rows, selectedLanguage, settings.browserLanguage);
    return {
      sourceRows: source.rows,
      requiredIndexes: source.rows.filter(function(row) {
        return row.needsMeaning || row.needsBridge;
      }).map(function(row) {
        return row.sourceIndex;
      }),
      results: new Map(),
      chunkSize,
      selectedLanguage: selectedLanguage || 'Auto',
      language,
      fingerprint: sourceFingerprint(text, language),
    };
  }

  function nextCompletionChunk(session) {
    return session.requiredIndexes.filter(function(sourceIndex) {
      return !session.results.has(sourceIndex);
    }).slice(0, session.chunkSize).map(function(sourceIndex) {
      return session.sourceRows[sourceIndex];
    });
  }

  function mergeCompletionChunk(chunkRows, generatedRows) {
    const byIndex = collectGeneratedRows(chunkRows, generatedRows);
    return chunkRows.map(function(row) {
      const entry = byIndex.get(row.sourceIndex);
      if (!entry) throw new RangeError(`Generated response is missing source index ${row.sourceIndex}`);
      return {
        sourceIndex: row.sourceIndex,
        word: row.word,
        meaning: row.meaning || assertGeneratedField(entry.meaning, 'meaning', true),
        bridge: row.bridge || assertGeneratedField(entry.bridge, 'bridge', true),
      };
    });
  }

  function acceptCompletionChunk(session, generatedRows) {
    const chunk = nextCompletionChunk(session);
    if (!chunk.length) throw new RangeError('Completion session has no pending chunk');
    mergeCompletionChunk(chunk, generatedRows).forEach(function(row) {
      session.results.set(row.sourceIndex, row);
    });
    return session;
  }

  function completionProgress(session) {
    const total = session.requiredIndexes.length;
    const completed = session.requiredIndexes.filter(function(sourceIndex) {
      return session.results.has(sourceIndex);
    }).length;
    const pending = total - completed;
    return { total, completed, pending, percent: total ? Math.round((completed / total) * 100) : 100 };
  }

  function completedSessionText(session) {
    const progress = completionProgress(session);
    if (progress.pending) throw new RangeError('Completion session is not complete');
    return formatImportRows(mergeGeneratedRows(session.sourceRows, Array.from(session.results.values())));
  }

  return {
    FIELD_LIMITS,
    parseSourceText,
    parseCompletedText,
    mergeGeneratedRows,
    formatImportRows,
    classifyEditorText,
    resolveOutputLanguage,
    sourceFingerprint,
    createCompletionSession,
    nextCompletionChunk,
    acceptCompletionChunk,
    completionProgress,
    completedSessionText,
  };
});
