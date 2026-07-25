# Vocab Curve Studio Beta v43 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the supplied Alpha 21 runtime as the platform-neutral Vocab Curve Studio Beta v43 release and refresh GitHub Pages without changing user data identifiers.

**Architecture:** Overlay the complete reviewed runtime onto the existing static Pages repository while preserving repository-only artwork. Add a release contract test, rename only the public workspace layer and identifiers, retain private `.mac-*` design tokens for compatibility, then validate with the complete external regression suite and a real-browser smoke test before pushing `main`.

**Tech Stack:** Static HTML/CSS/JavaScript PWA, Node.js built-in test runner, PowerShell, Git, GitHub Pages.

## Global Constraints

- The exact visible release name is `Vocab Curve Studio Beta v43`.
- The exact technical version is `43.0.0-beta`.
- Public enhancement assets are `studio-workspace.css` and `studio-workspace.js`.
- Public runtime identifiers are `VocabCurveStudioWorkspace`, `studio-workspace`, and `studio:controls-sync`.
- Private `.mac-*`, `--mac-*`, and `data-mac-*` styling tokens remain unchanged.
- Existing storage keys, IndexedDB names, broadcast channels, backup formats, and card-state schemas remain unchanged.
- Existing repository-only artwork is preserved.
- GitHub Pages continues to deploy from the root of `main`.

---

### Task 1: Stage the Reviewed Runtime and Add the Release Contract

**Files:**
- Overlay: all 40 files from `C:\Users\Flzsh\Downloads\Vocab_Curve_Studio_macOS_Workspace_Alpha_21.zip`
- Create: `tests/release-branding-contract.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the ZIP root `Vocab_Curve_Studio_macOS_Workspace/`
- Produces: a complete Alpha 21 runtime in the repository root plus an executable neutral-branding contract

- [ ] **Step 1: Extract the runtime into a new, explicit staging directory**

```powershell
$zip = 'C:\Users\Flzsh\Downloads\Vocab_Curve_Studio_macOS_Workspace_Alpha_21.zip'
$stage = 'C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\alpha21-beta-v43-staging'
Expand-Archive -LiteralPath $zip -DestinationPath $stage
```

- [ ] **Step 2: Overlay the staged runtime without deleting repository-only assets**

```powershell
$source = Join-Path $stage 'Vocab_Curve_Studio_macOS_Workspace'
$repo = 'C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\vocab-curve-studio-pages-publish'
Get-ChildItem -LiteralPath $source | Copy-Item -Destination $repo -Recurse -Force
```

- [ ] **Step 3: Write a failing release-contract test**

Create `tests/release-branding-contract.test.mjs` with Node assertions that require:

```js
const EXPECTED_NAME = 'Vocab Curve Studio Beta v43';
const EXPECTED_VERSION = '43.0.0-beta';
const EXPECTED_CACHE = 'vocab-curve-beta-v43-studio-workspace-v12';
const EXPECTED_CSS = './studio-workspace.css';
const EXPECTED_JS = './studio-workspace.js';
```

The test must assert that:

```js
assert.equal(buildInfo.name, EXPECTED_NAME);
assert.equal(buildInfo.version, EXPECTED_VERSION);
assert.equal(manifest.name, EXPECTED_NAME);
assert.match(manifest.start_url, /43\.0\.0-beta/);
assert.match(html, /<title>Vocab Curve Studio Beta v43<\/title>/);
assert.match(html, /BETA V43/);
assert.match(html, /studio-workspace\.css/);
assert.match(html, /studio-workspace\.js/);
assert.doesNotMatch(html, /macos-workspace/i);
assert.match(worker, new RegExp(EXPECTED_CACHE));
assert.match(worker, /studio-workspace\.css/);
assert.match(worker, /studio-workspace\.js/);
assert.doesNotMatch(worker, /macos-workspace/i);
assert.match(adapter, /VocabCurveStudioWorkspace/);
assert.match(adapter, /studio-workspace/);
assert.match(adapter, /studio:controls-sync/);
assert.equal(existsSync(path.join(runtime, 'macos-workspace.css')), false);
assert.equal(existsSync(path.join(runtime, 'macos-workspace.js')), false);
```

- [ ] **Step 4: Run the contract test and verify the pre-rename failure**

Run:

```powershell
node --test .\tests\release-branding-contract.test.mjs
```

Expected: FAIL because `studio-workspace.css` and `studio-workspace.js` do not yet exist and Alpha 21/macOS identifiers remain.

- [ ] **Step 5: Make the repository test command executable**

Set `package.json` to use:

```json
{
  "name": "vocab-curve-studio-beta-v43",
  "version": "43.0.0-beta",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

Update the root package record in `package-lock.json` to the same package name and version.

### Task 2: Apply the Platform-Neutral Beta v43 Naming

**Files:**
- Rename: `macos-workspace.css` to `studio-workspace.css`
- Rename: `macos-workspace.js` to `studio-workspace.js`
- Modify: `README.md`
- Modify: `BUILD_INFO.json`
- Modify: `manifest.webmanifest`
- Modify: `index.html`
- Modify: `sw.js`
- Modify: all deployable `.js` and `.css` files containing the Alpha 21 technical version
- Rename and rewrite: `V20_ALPHA_20_GUIDE.md` to `BETA_V43_GUIDE.md`

**Interfaces:**
- Consumes: the staged Alpha 21 runtime and Task 1 release contract
- Produces: a deployable Beta v43 runtime with neutral public names and unchanged private design tokens

- [ ] **Step 1: Rename the two public enhancement assets**

```powershell
git mv -- macos-workspace.css studio-workspace.css
git mv -- macos-workspace.js studio-workspace.js
```

- [ ] **Step 2: Apply the exact release-name and version mapping**

Apply these exact replacements:

```text
Vocab Curve Studio v20 Alpha 21 -> Vocab Curve Studio Beta v43
Vocab Curve Studio V20 Alpha 21 — macOS Workspace 11 -> Vocab Curve Studio Beta v43
20.0.0-alpha.21-macos.11 -> 43.0.0-beta-studio.12
20.0.0-alpha.21 -> 43.0.0-beta
ALPHA 21 -> BETA V43
vocab-curve-v20-alpha21-macos-workspace-v11 -> vocab-curve-beta-v43-studio-workspace-v12
./macos-workspace.css -> ./studio-workspace.css
./macos-workspace.js -> ./studio-workspace.js
MacOSWorkspace -> VocabCurveStudioWorkspace
macOS workspace enhancement unavailable -> Vocab Curve Studio workspace enhancement unavailable
macos-workspace -> studio-workspace
macos:controls-sync -> studio:controls-sync
```

Apply the technical-version replacement across deployable runtime text files so module `VERSION` exports, browser assets, build metadata, and diagnostics agree. Historical comments describing when a visual rule was introduced may retain their Alpha labels.

Set `BUILD_INFO.json` to:

```json
{
  "name": "Vocab Curve Studio Beta v43",
  "version": "43.0.0-beta",
  "packageType": "tester-runtime",
  "excluded": [
    "tests",
    "docs/verification",
    "docs/superpowers",
    "scripts",
    ".git",
    "legacy",
    "node_modules"
  ]
}
```

- [ ] **Step 3: Run the release contract until it passes**

Run:

```powershell
node --test .\tests\release-branding-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Verify the intended diff before broader testing**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: the 40-file Alpha 21 overlay, the two public asset renames, release metadata, the contract test, and documentation only.

### Task 3: Run Complete Regression and Static Validation

**Files:**
- Read: `C:\Users\Flzsh\Documents\Codex\2026-07-22\con\work\vocab-curve-apple\tests\*.test.mjs`
- Temporary: `C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\beta-v43-test-harness`
- Test: repository root runtime

**Interfaces:**
- Consumes: the renamed Beta v43 runtime
- Produces: fresh automated evidence for behavior, storage, queueing, motion, visual contracts, and PWA isolation

- [ ] **Step 1: Copy the external regression suite into a temporary harness**

```powershell
$sourceTests = 'C:\Users\Flzsh\Documents\Codex\2026-07-22\con\work\vocab-curve-apple\tests'
$harness = 'C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\beta-v43-test-harness'
Copy-Item -LiteralPath $sourceTests -Destination $harness -Recurse
```

- [ ] **Step 2: Mechanically adapt only public-name expectations in the temporary harness**

Replace in the temporary test files:

```text
macos-workspace.css -> studio-workspace.css
macos-workspace.js -> studio-workspace.js
MacOSWorkspace -> VocabCurveStudioWorkspace
macos-workspace -> studio-workspace
macos:controls-sync -> studio:controls-sync
20.0.0-alpha.20-macos.10 -> 43.0.0-beta-studio.12
vocab-curve-v20-alpha20-macos-workspace-v10 -> vocab-curve-beta-v43-studio-workspace-v12
```

Do not alter behavioral expectations, scheduling assertions, storage identifiers, animation geometry, accessibility rules, or queue-policy assertions.

- [ ] **Step 3: Run all external regression tests against the release root**

Run:

```powershell
$env:VOCAB_RUNTIME_ROOT = 'C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\vocab-curve-studio-pages-publish'
node --test 'C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\beta-v43-test-harness\*.test.mjs'
```

Expected: all tests pass with zero failures.

- [ ] **Step 4: Run deployable-file and reference validation**

Verify:

```text
No deployable file contains "macOS Workspace" or "macos-workspace".
index.html references every local stylesheet and script that exists.
sw.js precaches every listed local asset and includes the neutral workspace files.
BUILD_INFO.json and manifest.webmanifest parse as JSON.
The old public workspace files do not exist.
```

- [ ] **Step 5: Run the repository test command**

Run:

```powershell
npm.cmd test
```

Expected: PASS with zero failures.

### Task 4: Browser Smoke Test, Commit, Publish, and Refresh Pages

**Files:**
- Test: the repository root served over HTTP
- Commit: all intended Beta v43 release files
- Deploy: `origin/main`

**Interfaces:**
- Consumes: a fully validated local release
- Produces: a verified production GitHub Pages deployment

- [ ] **Step 1: Serve the repository locally**

```powershell
python -m http.server 4173 --directory 'C:\Users\Flzsh\OneDrive - Western Reserve Academy\Documents\Playground\vocab-curve-studio-pages-publish'
```

- [ ] **Step 2: Smoke-test in a real browser**

Verify:

```text
Document title is "Vocab Curve Studio Beta v43".
The Study view renders and navigation changes views.
Settings controls and the neutral workspace adapter initialize.
No application-origin console errors are emitted.
All local scripts and styles return HTTP 200.
The service worker registers and reports the Beta v43 cache namespace.
```

- [ ] **Step 3: Commit only the intended release**

Run:

```powershell
git status --short --branch
git diff --check
git add -A
git diff --cached --check
git commit -m "release: Vocab Curve Studio Beta v43"
```

- [ ] **Step 4: Push `main` and confirm the remote hash**

Run:

```powershell
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Expected: local and remote hashes match.

- [ ] **Step 5: Wait for GitHub Pages and verify production**

Open:

```text
https://flzsh.github.io/vocab-curve-studio/?deploy=beta-v43
```

Verify the production title, Beta v43 assets, active Study view, service-worker state, and zero application-origin console errors. Keep the verified live page open for the user.
