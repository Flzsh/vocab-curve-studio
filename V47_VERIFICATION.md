# Vocab Curve Studio V47 Verification

## Release scope

V47 adds a persistent display-theme selector, a complete dark theme, an integrated Reveal/rating layout, and Ultra Battery mode. The existing Study scheduler, Books/import workspace, Stats, saving, Word Smart content, Pro Tutor, and responsive navigation remain active.

## Automated checks

Fresh source verification completed with:

- Static V47 regression suite: 11 passed, 0 failed
- Display-preferences module suite: passed
- Chromium interface verification: passed
- Functional Study/save/view regression: passed
- Release audit: passed

Release audit counts:

- Runtime files: 54 before this report was added
- Standalone JavaScript files parsed: 28
- Inline scripts parsed: 3
- Duplicate static HTML IDs: 0
- Local HTML references checked: 40
- Service-worker assets checked: 50
- Missing required runtime assets: 0

## Theme coverage

The browser verifier checked System, Light, and Dark selections, persistence after full application reinitialization, and live response to the operating-system color preference in System mode.

Dark-mode checks covered the application shell, Study, Books, Stats, Settings, forms, tables, dialogs, sheets, expandable sections, Pro Tutor, side panes, answer cards, status elements, memory controls, and scrollbars. Hard-coded light surfaces were audited separately; remaining light-colored values are intentional accents or ambient decoration rather than uncovered interface panels.

## Reveal and rating layout

Wrong, Correct, and Know are inside the revealed answer panel with the meaning, memory bridge, context, and hints. The flashcard shell and face remained full-width before and after Reveal, with a measured width difference no greater than 1 px.

## Power modes

Low Power retains essential Study behavior while reducing continuous decorative work.

Ultra Battery mode was verified to:

- Stop active document animations
- Stop liquid-motion and memory-world controllers
- Disable transitions and smooth scrolling
- Remove ripple creation
- Disable nonessential blur, filter, shadow, ambient, bubble, orbit, and corona effects
- Preserve Reveal, rating, scheduling, saving, Books, Stats, Settings, and navigation

The browser verifier measured zero running document animations in Ultra mode, confirmed that liquid phase remained unchanged during observation, and completed a normal Study rating successfully.

## Responsive checks

Study and primary navigation were checked at:

- 1280 × 720
- 1366 × 768
- 1536 × 864
- 1920 × 1080
- 768 × 1024
- 430 × 932
- 390 × 844
- 360 × 640
- 320 × 568
- 844 × 390 landscape

The tested layouts had no horizontal overflow. Mobile navigation exposes Study, Books, and More as three reachable destinations, and the selection lens aligns with the active visible button.

## Functional regression

The functional browser test verified:

- Three or more bundled books load
- Wrong creates and saves a learning/relearning history event
- Undo restores the previous card state
- Correct persists through full application reinitialization
- Know retires a card from routine scheduling with due time 0
- Dark theme persists through Study changes and reinitialization
- Study, Books, Stats, Settings, and other primary views remain operable after ratings

## Provider limitation

No paid live OpenRouter request was made during release verification. Existing provider request construction, validation, repair, and fallback code remains in the runtime, but live model availability, latency, and billing depend on the connected OpenRouter account.
