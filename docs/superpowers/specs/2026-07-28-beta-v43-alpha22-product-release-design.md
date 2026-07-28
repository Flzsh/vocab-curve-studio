# Beta v43 Alpha 22 Product Release Design

## Goal

Publish the audited Alpha 22 runtime as the next `Vocab Curve Studio Beta v43` build, refresh GitHub Pages, and turn the GitHub repository landing page into a concise product introduction.

## Source Package

- Archive: `Vocab_Curve_Studio_macOS_Workspace_Alpha_22_Audited.zip`
- SHA-256: `1FCEC8964538F534725A79C0BE9D5F90D222B566EE2C56315843554D2A2DAEF3`
- Package root: `Vocab_Curve_Studio_macOS_Workspace/`
- Contents: 40 deployable files
- Source version: `20.0.0-alpha.22`
- Source workspace revision: `13`
- Source audit scope: scheduling, queue, responsive layout, persistence, assets, and package verification

The wrapper directory is removed during staging so its contents remain at the GitHub Pages repository root.

## Release Identity

The public product and technical release identity remains:

- Product name: `Vocab Curve Studio Beta v43`
- Technical version: `43.0.0-beta`
- Workspace asset suffix: `43.0.0-beta-studio.13`
- Service-worker cache: `vocab-curve-beta-v43-studio-workspace-v13`

No visible or public package identity will call the release macOS-only or Alpha 22. The source archive name and SHA remain documented here for provenance.

## Runtime Translation

The audited archive is overlaid as a complete runtime rather than copied as a partial patch. The following public identifiers are translated:

- `macos-workspace.css` becomes `studio-workspace.css`.
- `macos-workspace.js` becomes `studio-workspace.js`.
- `MacOSWorkspace` becomes `VocabCurveStudioWorkspace`.
- Body class `macos-workspace` becomes `studio-workspace`.
- Event `macos:controls-sync` becomes `studio:controls-sync`.
- Public source headers and fallback messages become platform-neutral.
- Alpha 22 version strings and `macos.13` cache-busters become the Beta v43 and `studio.13` identifiers above.

Private `.mac-*`, `--mac-*`, and `data-mac-*` presentation tokens remain unchanged. They are implementation compatibility details, not visible product branding.

## Compatibility and Data Safety

The release must preserve all existing user data and behavior boundaries:

- Do not rename IndexedDB databases, local-storage keys, backup keys, broadcast channels, card identifiers, or saved-state schemas.
- Do not alter the audited Alpha 22 scheduling, queue, persistence, import, restore, responsive, or accessibility behavior.
- Preserve the two-card spacing rule and Alpha 22 temporary-cycle termination behavior.
- Preserve reduced-motion and Low Power behavior.
- Preserve optional OpenRouter integration; the core application remains usable without it.
- Activate the revision 13 cache and remove stale `vocab-curve-*` caches without touching unrelated application caches.

## GitHub Repository Landing Page

The README becomes a product landing page with this order:

1. Product name and one-sentence value proposition.
2. Compact badges for Beta v43, local-first storage, and PWA support.
3. A prominent link to the live GitHub Pages application.
4. A real desktop screenshot captured from the staged Beta v43 application and stored as `assets/readme-preview.png`.
5. A short “Why Vocab Curve Studio” section covering adaptive review, deliberate anti-repeat spacing, durable progress, offline/PWA use, responsive layouts, and optional AI tutoring.
6. A three-step local launch section.
7. A concise data and privacy note explaining browser-local progress, Full backup exports, origin/profile sensitivity, and optional OpenRouter use.

The README will not contain internal audit history, long tester checklists, or macOS-only positioning.

## GitHub Metadata

- Description: `Local-first adaptive vocabulary trainer with spaced review, offline support, durable progress, and optional AI tutoring.`
- Homepage: `https://flzsh.github.io/vocab-curve-studio/`
- Topics:
  - `vocabulary`
  - `spaced-repetition`
  - `pwa`
  - `offline-first`
  - `education`
  - `javascript`

## Verification

Before publication:

- Verify the archive SHA-256 and all 40 staged file hashes.
- Confirm all local HTML, manifest, icon, script, stylesheet, and service-worker precache references resolve.
- Add or update the repository release contract before translating the runtime, observe the expected failure, then make it pass.
- Run the repository test suite.
- Run the complete external regression suite against the staged repository.
- Serve the application locally and smoke-test desktop and phone layouts, navigation, study state, settings, storage boot, and service-worker registration.
- Capture the README preview only after the staged application passes local smoke testing.
- Scan deployable text for obsolete public Alpha 22 and macOS-workspace branding while allowing the private compatibility tokens listed above.
- Review the complete release diff before publication.

After publication:

- Confirm remote `main` matches the release commit.
- Wait for GitHub Pages to refresh.
- Verify the production title, Beta v43 asset versions, workspace revision 13 assets, initial Study view, responsive navigation, and application-origin console health.
- Confirm the repository description, homepage, topics, README layout, and preview image are visible on GitHub.

## Out of Scope

- Redesigning the audited application interface.
- Changing scheduling, queue, persistence, import, restore, or backup behavior.
- Renaming private compatibility tokens.
- Introducing a build system, framework migration, backend, account system, or mandatory AI dependency.
