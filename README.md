# Vocab Curve Studio v16

V16 is an offline-capable vocabulary review studio with adaptive memory scheduling, section-based learning, and an Elo Ranked mode.

## Highlights

- New vocabulary is learned in permanent 20-word sections. The next section unlocks only after every word in the current section reaches the mastery target.
- The section selector supports focused review and makes it easy to stop and resume at a clear boundary.
- The calibrated memory model accounts for recall quality, response time, hints, lapses, and individual card difficulty without double-counting reviews.
- Glory Road uses eight cosmic-fire tiers: Spark, Flame, Blaze, Inferno, Sun, White Dwarf, Pulsar, and Black Hole.
- Ranked opponents scale from novice tool usage at low Elo to stronger tactical timing, combos, and resource management at high Elo.
- Ranked clocks run only while a question is active. Answer confirmation and next-question screens are untimed.
- Early forfeits do not change Elo; forfeiting after meaningful match progress is rated normally.
- Study gives the word and meaning equal visual priority, with supporting bridge and example text below.
- The Settings Transfer Center replaces scattered export buttons with compact Full backup, Current book, and Ranked profile transfers.
- Transfers can be saved as a file, copied directly, or pasted for import. V15 JSON backups and plain word lists remain accepted.
- The phone layout is tuned for the iPhone 14 Pro class viewport, safe areas, 44-pixel touch targets, keyboard visibility, and 16-pixel form controls.

## Run or deploy

Serve this folder with any static web server, or upload its contents to a static host. Keep `index.html`, all five `v16-*` runtime files, `sw.js`, `manifest.webmanifest`, `assets/`, and `icons/` together at the site root. Open `index.html?v=16` once after an update so the new offline cache can activate.

Opening `index.html` directly is useful for a quick desktop check, but a static server is recommended because browsers restrict service workers on local files.

## Transfer and migration

Open Settings, then use Transfer Center. A Full backup includes books, Study memory, section unlocks, Glory Road, Ranked progress, achievements, and settings. Save a full transfer before moving devices or replacing an older deployment. Existing progress stored under the stable local save key is migrated in place.

## Verification

Run `npm test` with Node.js to execute the deterministic memory, sections, Ranked policy, transfer, UI structure, offline-cache, and release-integrity checks.
