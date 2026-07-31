import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_NAME = 'Vocab Curve Studio Beta v43';
const EXPECTED_VERSION = '43.0.0-beta';
const EXPECTED_CACHE = 'vocab-curve-beta-v43-studio-workspace-v16';
const EXPECTED_ASSET_SUFFIX = '43.0.0-beta-studio.16';
const EXPECTED_CSS = './studio-workspace.css';
const EXPECTED_JS = './studio-workspace.js';

const normalizeNewlines = (text) => text.replace(/\r\n?|\n/g, '\n');
const extractLocalAssetUrls = (source) => [
  ...source.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["'](\.\/[^"']+)["'][^>]*>/g),
  ...source.matchAll(/<script\b[^>]*\bsrc=["'](\.\/[^"']+)["'][^>]*>/g),
].map(([, assetUrl]) => assetUrl);

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(testDirectory, '..');
const buildInfo = JSON.parse(readFileSync(path.join(runtime, 'BUILD_INFO.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(runtime, 'manifest.webmanifest'), 'utf8'));
const html = normalizeNewlines(readFileSync(path.join(runtime, 'index.html'), 'utf8'));
const worker = normalizeNewlines(readFileSync(path.join(runtime, 'sw.js'), 'utf8'));
const adapter = normalizeNewlines(readFileSync(path.join(runtime, EXPECTED_JS.slice(2)), 'utf8'));
const stylesheet = normalizeNewlines(readFileSync(path.join(runtime, EXPECTED_CSS.slice(2)), 'utf8'));

test('newline normalizer converts CRLF and CR to LF while preserving content', () => {
  assert.equal(normalizeNewlines('first\r\nsecond\rthird\nfourth'), 'first\nsecond\nthird\nfourth');
});

test('local asset URL extractor preserves unversioned local stylesheets and scripts', () => {
  const fixture = '<link rel="stylesheet" href="./versioned.css?v=43.0.0-beta-studio.16">\n'
    + '<link rel="stylesheet" href="./unversioned.css">\n'
    + '<script src="./versioned.js?v=43.0.0-beta-studio.16"></script>\n'
    + '<script src="./unversioned.js"></script>';
  assert.deepEqual(extractLocalAssetUrls(fixture), [
    './versioned.css?v=43.0.0-beta-studio.16',
    './unversioned.css',
    './versioned.js?v=43.0.0-beta-studio.16',
    './unversioned.js',
  ]);
});

test('release runtime uses the neutral Beta v43 branding contract', () => {
  assert.equal(buildInfo.name, EXPECTED_NAME);
  assert.equal(buildInfo.version, EXPECTED_VERSION);
  assert.equal(buildInfo.workspaceRevision, 16);
  assert.equal(manifest.name, EXPECTED_NAME);
  assert.equal(manifest.start_url, `./index.html?v=${EXPECTED_ASSET_SUFFIX}`);
  assert.match(html, /<title>Vocab Curve Studio Beta v43<\/title>/);
  assert.match(html, /BETA V43/);
  assert.match(html, /studio-workspace\.css/);
  assert.match(html, /studio-workspace\.js/);
  assert.match(html, /v20-import-assistant\.js/);
  const localAssetUrls = extractLocalAssetUrls(html);
  assert.ok(localAssetUrls.length > 0);
  assert.ok(localAssetUrls.includes(`${EXPECTED_CSS}?v=${EXPECTED_ASSET_SUFFIX}`));
  assert.ok(localAssetUrls.includes(`${EXPECTED_JS}?v=${EXPECTED_ASSET_SUFFIX}`));
  for (const assetUrl of localAssetUrls) {
    assert.match(assetUrl, new RegExp(`^\\./[^?]+\\?v=${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')}$`));
  }
  assert.doesNotMatch(html, /macos-workspace/i);
  assert.match(worker, new RegExp(EXPECTED_CACHE));
  assert.match(worker, /studio-workspace\.css/);
  assert.match(worker, /studio-workspace\.js/);
  assert.match(worker, /v20-import-assistant\.js/);
  assert.match(worker, /43\.0\.0-beta-studio\.16/);
  assert.doesNotMatch(worker, /macos-workspace/i);
  assert.match(adapter, /VocabCurveStudioWorkspace/);
  assert.match(adapter, /studio-workspace/);
  assert.match(adapter, /studio:controls-sync/);
  assert.match(stylesheet, new RegExp(`^/\\* Studio Workspace v${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')} \\*/$`, 'm'));
  assert.match(adapter, new RegExp(`^// Studio Workspace v${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')}$`, 'm'));
  assert.doesNotMatch(`${html}\n${worker}\n${adapter}\n${stylesheet}`, /20\.0\.0-alpha\.22|macos\.13|MacOSWorkspace|macos:controls-sync|alpha22|macOS/i);
  assert.equal(existsSync(path.join(runtime, 'macos-workspace.css')), false);
  assert.equal(existsSync(path.join(runtime, 'macos-workspace.js')), false);
});

test('phone Import lens owns the middle navigation slot', () => {
  const middleSlot = 'translate3d(calc(100% + 4px), 0, 0) !important';
  assert.ok(
    stylesheet.includes(`.header-nav.v20-header-nav .tabs:has(> .tab[data-view="import"].active) > .tab-indicator {\n    transform: ${middleSlot};`),
  );
  assert.ok(
    stylesheet.includes(`.header-nav.v20-header-nav .tabs[data-mac-destination="import"] > .tab-indicator {\n    transform: ${middleSlot};`),
  );
  assert.equal(
    stylesheet.includes(`.header-nav.v20-header-nav .tabs:has(> .tab[data-view="books"].active) > .tab-indicator {\n    transform: ${middleSlot};`),
    false,
  );
  assert.equal(
    stylesheet.includes(`.header-nav.v20-header-nav .tabs[data-mac-destination="books"] > .tab-indicator {\n    transform: ${middleSlot};`),
    false,
  );
});
