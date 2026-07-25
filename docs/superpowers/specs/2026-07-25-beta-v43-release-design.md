# Vocab Curve Studio Beta v43 Release Design

## Goal

Publish the reviewed Alpha 21 runtime as the next GitHub Pages release under the platform-neutral name **Vocab Curve Studio Beta v43**. Preserve the Apple-inspired interface and all existing application behavior without implying that the web app is limited to macOS.

## Naming Contract

- Use `Vocab Curve Studio Beta v43` for the browser title, installable-app name, build documentation, and visible release labels.
- Use a consistent technical version of `43.0.0-beta` in build metadata, manifest URLs, and public cache-busting identifiers.
- Rename the public enhancement assets from `macos-workspace.css` and `macos-workspace.js` to `studio-workspace.css` and `studio-workspace.js`.
- Rename public runtime identifiers to neutral equivalents:
  - `MacOSWorkspace` becomes `VocabCurveStudioWorkspace`.
  - `macos-workspace` becomes `studio-workspace`.
  - `macos:controls-sync` becomes `studio:controls-sync`.
  - The console fallback message becomes platform-neutral.
- Rename the service-worker cache namespace and its precache entries to neutral Beta v43 identifiers.
- Keep private `.mac-*`, `--mac-*`, and `data-mac-*` styling tokens unchanged as compatibility implementation details. They are not displayed as product branding.

## Release Integration

- Treat the supplied Alpha 21 ZIP as a complete runtime bundle and overlay its 40 runtime files onto the existing Pages repository.
- Preserve existing legacy artwork and repository-only assets that are not included in the runtime ZIP.
- Remove the obsolete public `macos-workspace.css` and `macos-workspace.js` files after all references move to the neutral filenames.
- Keep GitHub Pages served from the repository root on `main`.

## Compatibility and Data Safety

- Do not rename IndexedDB databases, local-storage keys, broadcast channels, backup formats, or card-state schemas.
- Do not change queue, review, scheduling, save, import, or restore behavior except for changes already present in the supplied Alpha 21 runtime.
- Ensure the service worker activates the new cache and removes older `vocab-curve-*` caches.
- Preserve accessible labels, keyboard behavior, reduced-motion support, and Low Power mode.

## Validation

- Run the complete existing automated test suite against the renamed runtime.
- Scan deployable text files to confirm that public `macOS Workspace` branding and obsolete public filenames are gone.
- Verify that every local stylesheet, script, icon, and service-worker precache reference resolves.
- Serve the release locally and smoke-test initial load, navigation, settings controls, study queue, storage boot, and service-worker registration.
- Push only after validation passes, wait for the GitHub Pages deployment, then verify the production title, versioned assets, and console state.

## Out of Scope

- Reworking the approved visual design.
- Renaming private compatibility styling tokens.
- Migrating or resetting user study data.
- Removing legacy artwork that the current runtime may still reference.
