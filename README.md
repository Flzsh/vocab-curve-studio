# Vocab Curve Studio v9

Mobile/desktop SAT vocabulary trainer with ranked AI bot battles.

## Deploy
Upload the contents of this folder to GitHub Pages with `index.html` at the repository root.

## Backup scopes
The app can export/import: words only, study save, account rank status, or all 3. Use All 3 when moving between desktop and iPhone.

## Ranked S tiers
Silver S: 0–9 stars, Gold S: 10–24, Diamond S: 25–49, Platinum S: 50–99, Demon S: 100+.


## v10 fixes

- Cleaned generated tab, rank, and rarity assets so checkerboard backgrounds do not show in the UI.
- Kept the sliding tab indicator.
- Compact ranked ladder is collapsed by default.
- Top rank pill now shows only the rank image.
- New cards keep import order by default; shuffle only happens when you press Shuffle.
- Achievements are grouped by rarity in Common → Mythic order.
- Stats cards no longer stretch into blank space.


## v10.1 fix

- Removed Knew It from Ranked rating controls. Ranked now uses 1 Again, 2 Hard, 3 Good, and 4 Instant only.


## v11 ranked fix

Ranked mode now reveals the answer after the first rating choice and waits for confirmation. You can change the rating before moving to the next question.


## v11 bug fixes

- Ranked Start match switches into a compact battle view so the question is visible on desktop and phone.
- The answer-confirm ranked flow is preserved: rate, view answer, change rating if needed, then confirm.
- S-tier order changed to Silver S, Gold S, Platinum S, Diamond S, Demon S.
- Cache/version bumped to v11. Deploy with `?v=11` to bypass old PWA cache.
