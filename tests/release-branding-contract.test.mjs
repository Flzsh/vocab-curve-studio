import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_NAME = 'Vocab Curve Studio Beta v43';
const EXPECTED_VERSION = '43.0.0-beta';
const EXPECTED_CACHE = 'vocab-curve-beta-v43-studio-workspace-v13';
const EXPECTED_ASSET_SUFFIX = '43.0.0-beta-studio.13';
const EXPECTED_CSS = './studio-workspace.css';
const EXPECTED_JS = './studio-workspace.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(testDirectory, '..');
const buildInfo = JSON.parse(readFileSync(path.join(runtime, 'BUILD_INFO.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(runtime, 'manifest.webmanifest'), 'utf8'));
const html = readFileSync(path.join(runtime, 'index.html'), 'utf8');
const worker = readFileSync(path.join(runtime, 'sw.js'), 'utf8');
const adapter = readFileSync(path.join(runtime, EXPECTED_JS.slice(2)), 'utf8');
const stylesheet = readFileSync(path.join(runtime, EXPECTED_CSS.slice(2)), 'utf8');

test('release runtime uses the neutral Beta v43 branding contract', () => {
  assert.equal(buildInfo.name, EXPECTED_NAME);
  assert.equal(buildInfo.version, EXPECTED_VERSION);
  assert.equal(buildInfo.workspaceRevision, 13);
  assert.equal(manifest.name, EXPECTED_NAME);
  assert.match(manifest.start_url, /43\.0\.0-beta/);
  assert.match(html, /<title>Vocab Curve Studio Beta v43<\/title>/);
  assert.match(html, /BETA V43/);
  assert.match(html, /studio-workspace\.css/);
  assert.match(html, /studio-workspace\.js/);
  assert.match(html, new RegExp(`studio-workspace\\.css\\?v=${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`studio-workspace\\.js\\?v=${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')}`));
  assert.doesNotMatch(html, /macos-workspace/i);
  assert.match(worker, new RegExp(EXPECTED_CACHE));
  assert.match(worker, /studio-workspace\.css/);
  assert.match(worker, /studio-workspace\.js/);
  assert.match(worker, /43\.0\.0-beta-studio\.13/);
  assert.doesNotMatch(worker, /macos-workspace/i);
  assert.match(adapter, /VocabCurveStudioWorkspace/);
  assert.match(adapter, /studio-workspace/);
  assert.match(adapter, /studio:controls-sync/);
  assert.doesNotMatch(`${html}\n${worker}\n${adapter}\n${stylesheet}`, /20\.0\.0-alpha\.22|macos\.13|MacOSWorkspace|macos:controls-sync|alpha22|macOS/i);
  assert.equal(existsSync(path.join(runtime, 'macos-workspace.css')), false);
  assert.equal(existsSync(path.join(runtime, 'macos-workspace.js')), false);
});
