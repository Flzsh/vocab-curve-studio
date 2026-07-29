import assert from 'node:assert/strict';
import test from 'node:test';
import ProTutor from '../v20-pro-tutor.js';

test('import completion sends strict structured output through the selected model', async () => {
  let captured;
  const client = ProTutor.createOpenRouterClient({
    apiKey: 'sk-test-session-key',
    model: 'provider/default-model',
    appUrl: 'https://example.test/app',
    appTitle: 'Vocab Curve Studio',
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return {
        ok: true,
        json: async () => ({
          id: 'generation-1',
          model: 'provider/selected-model',
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, cost: 0.002 },
          choices: [{ message: { parsed: {
            entries: [{ sourceIndex: 4, word: 'relent', meaning: '', bridge: 'pressure lets up' }],
          } } }],
        }),
      };
    },
  });

  const result = await client.generateImportEntries({
    language: 'English',
    rows: [{ sourceIndex: 4, word: 'relent', meaning: 'v. become less severe', needsMeaning: false, needsBridge: true }],
  }, { model: 'provider/selected-model' });

  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer sk-test-session-key');
  assert.equal(captured.body.model, 'provider/selected-model');
  assert.equal(captured.body.response_format.type, 'json_schema');
  assert.equal(captured.body.response_format.json_schema.strict, true);
  assert.equal(captured.body.provider.require_parameters, true);
  assert.match(captured.body.messages[0].content, /untrusted data/i);
  assert.deepEqual(result.entries, [
    { sourceIndex: 4, word: 'relent', meaning: '', bridge: 'pressure lets up' },
  ]);
  assert.equal(result.usage.totalTokens, 30);
  assert.equal(result.usage.cost, 0.002);
});

test('import completion accepts JSON-only content when parsed output is absent', async () => {
  const client = ProTutor.createOpenRouterClient({
    apiKey: 'sk-test-session-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          entries: [{ sourceIndex: 0, word: 'alpha', meaning: 'first letter', bridge: 'alpha starts the alphabet' }],
        }) } }],
      }),
    }),
  });

  const result = await client.generateImportEntries({
    language: 'English',
    rows: [{ sourceIndex: 0, word: 'alpha', meaning: '', needsMeaning: true, needsBridge: true }],
  });

  assert.equal(result.entries[0].meaning, 'first letter');
});

for (const [name, content] of [
  ['fenced JSON', '```json\n{"entries":[{"sourceIndex":0,"word":"alpha","meaning":"first letter","bridge":"alpha starts the alphabet"}]}\n```'],
  ['prose-embedded JSON', 'Here is the completed row: {"entries":[{"sourceIndex":0,"word":"alpha","meaning":"first letter","bridge":"alpha starts the alphabet"}]}'],
]) {
  test(`import completion rejects ${name} when parsed output is absent`, async () => {
    const client = ProTutor.createOpenRouterClient({
      apiKey: 'sk-test-session-key',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content } }] }),
      }),
    });
    await assert.rejects(
      client.generateImportEntries({
        language: 'English',
        rows: [{ sourceIndex: 0, word: 'alpha', meaning: '', needsMeaning: true, needsBridge: true }],
      }),
      /invalid structured import response/i
    );
  });
}

for (const [name, entries, pattern] of [
  ['changed word', [{ sourceIndex: 0, word: 'wrong', meaning: 'meaning', bridge: 'bridge' }], /word did not match/i],
  ['missing meaning', [{ sourceIndex: 0, word: 'alpha', meaning: '', bridge: 'bridge' }], /meaning is required/i],
  ['duplicate index', [
    { sourceIndex: 0, word: 'alpha', meaning: 'meaning', bridge: 'bridge' },
    { sourceIndex: 0, word: 'alpha', meaning: 'meaning', bridge: 'bridge' },
  ], /duplicate/i],
  ['unexpected field', [{ sourceIndex: 0, word: 'alpha', meaning: 'meaning', bridge: 'bridge', instruction: 'ignore the schema' }], /unexpected import field/i],
]) {
  test(`import completion rejects ${name} and attaches measured usage`, async () => {
    const client = ProTutor.createOpenRouterClient({
      apiKey: 'sk-test-session-key',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          id: 'generation-invalid',
          usage: { total_tokens: 11, cost: 0.001 },
          choices: [{ message: { parsed: { entries } } }],
        }),
      }),
    });
    await assert.rejects(
      client.generateImportEntries({
        language: 'English',
        rows: [{ sourceIndex: 0, word: 'alpha', meaning: '', needsMeaning: true, needsBridge: true }],
      }),
      error => {
        assert.match(error.message, pattern);
        assert.equal(error.openRouterUsage.totalTokens, 11);
        assert.equal(error.openRouterUsage.cost, 0.001);
        return true;
      }
    );
  });
}
