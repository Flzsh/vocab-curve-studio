# Beta v43 Alpha 22 Product Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the published Beta v43 runtime with the audited Alpha 22 package, create a polished product-focused GitHub landing page, refresh GitHub metadata, and verify the updated Pages deployment.

**Architecture:** Treat the ZIP as the authoritative 40-file runtime, verify it before overlay, and translate only public platform/version identifiers after staging. Keep application behavior and persistence identifiers unchanged. Build the repository landing page from a real locally verified screenshot, then publish the reviewed commit directly to the already-established `main` Pages branch.

**Tech Stack:** Static HTML/CSS/JavaScript PWA, Node.js test runner, PowerShell archive tooling, local HTTP server, Playwright/browser smoke testing, Git, GitHub Pages.

## Global Constraints

- Public product name: `Vocab Curve Studio Beta v43`.
- Technical version: `43.0.0-beta`.
- Workspace asset suffix: `43.0.0-beta-studio.13`.
- Service-worker cache: `vocab-curve-beta-v43-studio-workspace-v13`.
- Source archive SHA-256: `1FCEC8964538F534725A79C0BE9D5F90D222B566EE2C56315843554D2A2DAEF3`.
- Preserve all IndexedDB names, local-storage keys, backup keys, broadcast channels, saved-state schemas, card identifiers, and audited Alpha 22 behavior.
- Retain private `.mac-*`, `--mac-*`, and `data-mac-*` compatibility tokens.
- Do not expose public `macOS Workspace`, `macos-workspace`, `MacOSWorkspace`, `macos:controls-sync`, `20.0.0-alpha.22`, or `macos.13` release identity.
- Do not redesign the audited application interface.
- Publish directly to `main`, as explicitly requested, after all checks and reviews pass.

---

### Task 1: Stage and translate the audited runtime

**Files:**
- Modify: `tests/release-branding-contract.test.mjs`
- Replace from archive: `index.html`, `sw.js`, `v16*.css`, `v16*.js`, `v17*.css`, `v17*.js`, `v18*.css`, `v18*.js`, `v19*.css`, `v19*.js`, `v20*.css`, `v20*.js`, `assets/*.png`, `icons/*.png`
- Replace and translate: `BUILD_INFO.json`, `manifest.webmanifest`
- Replace/rename and translate: `studio-workspace.css`, `studio-workspace.js`
- Preserve: `package.json`, `package-lock.json`, `tests/`, `docs/`, `.superpowers/`

**Interfaces:**
- Consumes: the 40-file ZIP runtime and the Beta v43 release identity constants.
- Produces: a complete neutral revision 13 runtime at the repository root.

- [ ] **Step 1: Verify the source archive and inventory before extraction**

Run:

```powershell
$zip = 'C:\Users\Flzsh\Downloads\Vocab_Curve_Studio_macOS_Workspace_Alpha_22_Audited.zip'
(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
```

Expected: `1FCEC8964538F534725A79C0BE9D5F90D222B566EE2C56315843554D2A2DAEF3`.

Open the ZIP read-only with `System.IO.Compression.ZipFile`, assert exactly 40 file entries, one wrapper root named `Vocab_Curve_Studio_macOS_Workspace`, valid `BUILD_INFO.json`/manifest JSON, 26 resolving `index.html` references, two resolving manifest icons, and 37 resolving service-worker references.

- [ ] **Step 2: Update the release contract first**

Change `tests/release-branding-contract.test.mjs` so it requires:

```js
const EXPECTED_CACHE = 'vocab-curve-beta-v43-studio-workspace-v13';
const EXPECTED_ASSET_SUFFIX = '43.0.0-beta-studio.13';
```

Add these assertions:

```js
assert.equal(buildInfo.workspaceRevision, 13);
assert.match(html, new RegExp(`studio-workspace\\.css\\?v=${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')}`));
assert.match(html, new RegExp(`studio-workspace\\.js\\?v=${EXPECTED_ASSET_SUFFIX.replaceAll('.', '\\.')}`));
assert.match(worker, /43\.0\.0-beta-studio\.13/);
assert.doesNotMatch(`${html}\n${worker}\n${adapter}`, /20\.0\.0-alpha\.22|macos\.13|MacOSWorkspace|macos:controls-sync/i);
```

- [ ] **Step 3: Run the contract and observe the expected RED state**

Run:

```powershell
npm.cmd test
```

Expected: FAIL because the current runtime still declares workspace/cache revision 12.

- [ ] **Step 4: Extract and hash-check the raw runtime in the ignored SDD workspace**

Extract the wrapper contents to:

```text
.superpowers/sdd/2026-07-28-beta-v43-alpha22-product-release/staged-runtime/
```

Compare every staged file byte-for-byte with its ZIP entry before modifying it. Record the archive hash, 40/40 file match, parsed metadata, and resolved-reference counts in:

```text
.superpowers/sdd/2026-07-28-beta-v43-alpha22-product-release/task-1-report.md
```

- [ ] **Step 5: Overlay the complete runtime**

Copy all 40 staged files to the repository root, preserving `assets/` and `icons/`. Map:

```text
macos-workspace.css -> studio-workspace.css
macos-workspace.js  -> studio-workspace.js
```

Do not copy the wrapper directory itself. Ensure the two obsolete public filenames are absent after overlay.

- [ ] **Step 6: Apply the neutral Beta v43 translation**

Apply this replacement matrix only to deployable text files:

```text
20.0.0-alpha.22-macos.13                  -> 43.0.0-beta-studio.13
20.0.0-alpha.22                           -> 43.0.0-beta
vocab-curve-v20-alpha22-macos-workspace-v13 -> vocab-curve-beta-v43-studio-workspace-v13
macos-workspace.css                       -> studio-workspace.css
macos-workspace.js                        -> studio-workspace.js
MacOSWorkspace                            -> VocabCurveStudioWorkspace
body class macos-workspace                -> studio-workspace
macos:controls-sync                       -> studio:controls-sync
```

Replace public headings, titles, manifest name, `BUILD_INFO.json` name, source headers, and fallback messages with platform-neutral Beta v43 wording. Keep `workspaceRevision: 13` and the source audit scope. Do not globally replace `mac`, because private compatibility tokens must survive.

- [ ] **Step 7: Run the release contract and observe GREEN**

Run:

```powershell
npm.cmd test
```

Expected: 1 test passes, 0 failures.

- [ ] **Step 8: Verify the translated runtime statically**

Check:

- Every local HTML, manifest, icon, script, stylesheet, and service-worker reference resolves.
- The root contains `studio-workspace.css` and `studio-workspace.js`.
- The root does not contain `macos-workspace.css` or `macos-workspace.js`.
- Public deployable text has zero forbidden release-identity hits.
- Private `.mac-*`, `--mac-*`, and `data-mac-*` tokens remain present.
- `BUILD_INFO.json` and `manifest.webmanifest` parse successfully.
- `git diff --check` produces no output.

- [ ] **Step 9: Commit the runtime**

Stage only the runtime and contract files, then commit:

```powershell
git commit -m "release: update Beta v43 to audited Alpha 22"
```

---

### Task 2: Build the product-focused GitHub landing page

**Files:**
- Modify: `README.md`
- Create: `assets/readme-preview.png`

**Interfaces:**
- Consumes: the locally runnable revision 13 Beta v43 application.
- Produces: a concise GitHub product page and a real product preview image.

- [ ] **Step 1: Serve the translated runtime locally**

Start a static server rooted at the repository on `127.0.0.1:4173`. Use a fresh browser context so the screenshot contains no personal stored progress.

- [ ] **Step 2: Smoke-test before capturing the preview**

Verify at desktop width:

- title is exactly `Vocab Curve Studio Beta v43`;
- Study view renders a word card, queue controls, learning sections, and memory indicators;
- Study → Settings → Study navigation works;
- `studio-workspace` is applied;
- application-origin console errors are zero.

Verify at phone width:

- the application uses one scroller;
- Study, Import, and More navigation is reachable;
- the contained Details sheet opens and closes;
- no horizontal page overflow appears.

- [ ] **Step 3: Capture and inspect the real preview**

Capture the clean desktop Study view at a `1600 × 1000` viewport, save it as `assets/readme-preview.png`, and inspect it with the local image viewer. Reject and recapture if it contains clipped controls, empty loading states, personal data, browser chrome, or excessive whitespace.

- [ ] **Step 4: Replace the README with the approved product structure**

Use this structure:

```markdown
# Vocab Curve Studio Beta v43

Local-first adaptive vocabulary practice that spaces reviews, protects progress, and works offline.

![Release](https://img.shields.io/badge/release-Beta%20v43-6d5dfc)
![Storage](https://img.shields.io/badge/storage-local--first-168257)
![PWA](https://img.shields.io/badge/PWA-offline--ready-2457d6)

[Open the live app](https://flzsh.github.io/vocab-curve-studio/)

![Vocab Curve Studio Study view](assets/readme-preview.png)

## Why Vocab Curve Studio

- Adaptive review...
- Deliberate spacing...
- Durable progress...
- Offline-ready...
- Responsive...
- Optional AI tutor...

## Run locally

1. Download or clone...
2. Run `python3 -m http.server 4173`.
3. Open `http://localhost:4173/`.

## Your data

Progress stays in this browser profile and origin...
```

Keep the final README under 500 words. Explain Full backup exports and that OpenRouter is optional. Do not include audit history or macOS-only positioning.

- [ ] **Step 5: Validate README links and image**

Confirm the screenshot exists, is a valid PNG, renders at a practical GitHub width, and every local/remote README link has the intended target. Run `git diff --check`.

- [ ] **Step 6: Commit the product page**

```powershell
git commit -m "docs: create product-focused GitHub landing page"
```

---

### Task 3: Run complete release verification

**Files:**
- Temporary only: `.superpowers/sdd/2026-07-28-beta-v43-alpha22-product-release/`
- Create temporarily: `.superpowers/sdd/2026-07-28-beta-v43-alpha22-product-release/external-harness/alpha22-release-contracts.test.mjs`
- Test target: repository runtime root

**Interfaces:**
- Consumes: the translated runtime and product README commits.
- Produces: reproducible release evidence and a clean final review package.

- [ ] **Step 1: Run repository tests fresh**

Run:

```powershell
npm.cmd test
```

Expected: all repository tests pass.

- [ ] **Step 2: Run the external regression suite against the release root**

Copy the existing external harness to the ignored SDD workspace, set:

```powershell
$env:VOCAB_RUNTIME_ROOT = (Get-Location).Path
```

Update only release-identity expectations from workspace/cache revision 12 to 13. Preserve all scheduling, storage, responsive, animation, accessibility, and queue behavior assertions. Create `alpha22-release-contracts.test.mjs` with this complete temporary harness:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const runtime = path.resolve(process.env.VOCAB_RUNTIME_ROOT || '');
const policy = require(path.join(runtime, 'v20-queue-policy.js'));
const library = require(path.join(runtime, 'v20-library.js'));
const NOW = 1_700_000_000_000;
const card = (id, dueAt) => ({
  id,
  dueAt,
  introducedAt: NOW - 10_000,
  state: 'review',
});

test('Alpha 22 empty-normal spacing runs one bounded bridge cycle', () => {
  const A = card('A', NOW - 3);
  const B = card('B', NOW - 2);
  const C = card('C', NOW - 1);
  const cycle = policy.interleaveRecentReviews([], [A, B, C], {
    recentCardIds: ['A'],
    now: NOW,
    gap: 2,
    allowEmptyNormalBridge: true,
  });
  assert.deepEqual(cycle.map(entry => entry.card.id), ['B', 'C', 'A']);
  assert.ok(cycle.every(entry => entry.spacingCycle === true));
  assert.deepEqual(policy.interleaveRecentReviews([], [A, B, C], {
    recentCardIds: ['A', 'B', 'C', 'A'],
    now: NOW,
    gap: 2,
    allowEmptyNormalBridge: false,
  }), []);
});

test('inclusive selection ranges accept all supported dash separators', () => {
  assert.deepEqual(
    library.parseSelectionExpression('1-2 3–4 5—6 7−8', 8),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});
```

Run:

```powershell
node --test
```

Expected: all external tests pass, with zero skipped or cancelled tests.

- [ ] **Step 3: Repeat static and browser verification**

Repeat the reference-resolution, forbidden-public-name, JSON, desktop, phone, service-worker, and application-origin console checks against the final files after the README commit.

- [ ] **Step 4: Review the complete release diff**

Generate a review package from `e49f64e` through final `HEAD`. Dispatch an independent read-only reviewer to check:

- audited-source fidelity;
- neutral public branding versus retained private tokens;
- cache/PWA upgrade behavior;
- persistence identifier stability;
- Alpha 22 queue and range behavior;
- README claims and screenshot accuracy;
- validation coverage.

Fix all Critical and Important findings, rerun affected checks, and obtain a clean final verdict.

- [ ] **Step 5: Confirm publication readiness**

Require:

- clean tracked working tree;
- `git diff --check` clean;
- repository and external tests green;
- local desktop and phone smoke green;
- no untracked deployable files;
- no unresolved reviewer findings.

---

### Task 4: Publish and refresh GitHub

**Files / external state:**
- Push: repository `main`
- Update: GitHub repository description, homepage, and topics
- Verify: GitHub repository page and GitHub Pages production deployment

**Interfaces:**
- Consumes: the reviewed final release commit.
- Produces: refreshed GitHub repository/product page and live Beta v43 Pages application.

- [ ] **Step 1: Push the reviewed release**

Push the established `main` branch to `origin` without force:

```powershell
git push origin main
```

Verify `refs/heads/main` equals local `HEAD`.

- [ ] **Step 2: Update GitHub repository metadata**

Set:

```text
Description: Local-first adaptive vocabulary trainer with spaced review, offline support, durable progress, and optional AI tutoring.
Homepage: https://flzsh.github.io/vocab-curve-studio/
Topics: vocabulary, spaced-repetition, pwa, offline-first, education, javascript
```

Use the connected GitHub surface when available; otherwise use the authenticated GitHub web interface. The user explicitly authorized these repository-page changes.

- [ ] **Step 3: Wait for and verify GitHub Pages**

Open:

```text
https://flzsh.github.io/vocab-curve-studio/?deploy=beta-v43-alpha22
```

Verify:

- page title `Vocab Curve Studio Beta v43`;
- `studio-workspace.css?v=43.0.0-beta-studio.13`;
- `studio-workspace.js?v=43.0.0-beta-studio.13`;
- initial Study interface renders;
- desktop and phone navigation contracts remain intact;
- application-origin console errors are zero.

- [ ] **Step 4: Verify the GitHub product page**

Confirm the repository landing page shows:

- the concise description;
- the Pages homepage link;
- all six topics;
- the product-focused README;
- the real `assets/readme-preview.png` preview.

- [ ] **Step 5: Report the release**

Return the live app URL, repository URL, final commit SHA, test totals, browser verification summary, and any non-release local scratch artifacts that remain.
