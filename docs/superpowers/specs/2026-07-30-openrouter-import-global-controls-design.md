# OpenRouter Import Completion and Global Controls Design

## Status

Approved direction: inline import completion.

The generated result becomes the application's normal editable import text. It is never a separate AI-only object and is never imported automatically.

## Goal

Add an optional OpenRouter-assisted path that turns either vocabulary-only input or vocabulary-plus-meaning input into valid Vocab Curve Studio import text containing a meaning and memory bridge. Let the user review, edit, copy, download, and finally import that text through the existing import workflow.

At the same time, replace the Planner-only dropdown and slider polish with shared control behavior across the application. The result should preserve all current features while making equivalent controls look and behave consistently.

## Design Principles

- Stability: AI output must pass local validation before it can replace editor text. Existing import, storage, scheduling, and study behavior remain unchanged.
- Simplicity: one editor accepts source text and finished import text. The common path is Paste, Complete, Preview, Import.
- Usability: supplied meanings remain under user control, generation reports real progress, and output can be exported without importing.
- Aesthetic: controls reuse the application's contextual color flow, quiet glass surfaces, typography, and spacing rather than introducing a separate AI theme.
- Dynamic behavior: movement represents state change. Menus originate from their triggers; progress moves only while work is occurring; reduced-motion users receive equivalent non-spatial feedback.

## Import Workspace

### Accepted source forms

The inline assistant accepts a mixture of these line forms:

1. `word`
2. `multiword term`
3. `word<TAB>meaning`
4. `word<TAB>meaning｜Bridge: ...`
5. `word<TAB>meaning｜Bridge: ...｜Example: ...`

A tab is the explicit boundary between vocabulary and meaning. A line with no tab is treated as the complete vocabulary term, including spaces. This avoids splitting phrases such as `teem with` into a false word and meaning.

Blank lines are ignored. Source order is preserved.

### Completion rules

- A row with only vocabulary receives an AI-generated meaning and bridge.
- A row with a supplied meaning keeps that meaning exactly and receives a generated bridge.
- A row that already has a meaning and bridge is accepted unchanged and does not consume an AI generation slot.
- An existing example is preserved exactly.
- The assistant does not generate examples in this release.
- The vocabulary text itself always comes from the local source row. Model-returned spelling cannot replace it.

### Output language

The Import panel adds a compact `Meaning language` control:

- Auto
- English
- Simplified Chinese

Auto follows the dominant language of supplied meanings. When no supplied meaning provides a signal, Auto follows the browser language, falling back to English. The last selection is remembered locally.

### Inline layout

The existing Import panel remains the main surface. Below the format hint and above the editor, it gains a `Complete with OpenRouter` group containing:

- the meaning-language dropdown;
- a `Complete missing fields` primary action;
- a compact connection/model label;
- a real progress and status strip.

The existing textarea remains the source of truth. Its label changes from `Words` to `Words or import format`, and its supporting copy states the three accepted source forms.

The action row contains:

- `Import batch`
- `Preview`
- `Complete missing fields`
- `Copy format`
- `Download .txt`
- `Load sample`
- `Clear`

On compact layouts, the primary import and completion actions remain first; secondary export/sample actions wrap below without horizontal scrolling.

### Generation state

The completion strip has these states:

- Ready: shows how many rows are complete and how many need AI.
- Working: shows `Completing X of Y` and a determinate bar based on validated rows, not elapsed time.
- Paused by budget: explains that the OpenRouter daily cap was reached and preserves all staged results.
- Failed: names the failed chunk and offers retry without repeating validated chunks.
- Complete: reports the number of meanings and bridges added.

The strip uses the active contextual palette but no continuous decorative loop. On completion, it settles into a quiet success state. With reduced motion, state changes cross-fade without translation or scale.

## User Agency and Export

AI completion never calls `applyImport()`.

The editor changes only after every required row has a validated result. The user can then edit any line, run Preview, copy the exact editor text, download it, or import it normally.

`Copy format` copies the editor contents as UTF-8 text. `Download .txt` downloads the same bytes using a sanitized batch name and a `.txt` extension. Export actions never alter application state or require a valid import, but their status message distinguishes raw source text from fully completed import text.

Clear remains immediate and local. If a generation session is active, Clear first cancels future chunks and then clears the editor.

## OpenRouter Architecture

### Reuse

The assistant uses the existing session-only OpenRouter key, selected OpenRouter model, request timeout, headers, structured-output parser, and daily token/cost ledger.

The core application remains fully usable without OpenRouter. If no key is connected, the completion action directs the user to the existing OpenRouter connection area in Settings without changing or deleting the editor text.

### Pure import helpers

A focused import-assistant module exposes testable pure operations:

- parse source rows;
- identify missing fields;
- validate generated rows against the source;
- sanitize generated fields;
- format rows into the existing import syntax;
- calculate an input fingerprint for stale-result protection.

The existing final import parser remains the authority for whether completed text can be imported. The formatter's output must round-trip through it.

### Client method

The existing OpenRouter client gains a dedicated import-completion method. The raw request helper remains private.

Requests use strict JSON Schema structured output, response healing, and parameter-support enforcement. Each response row contains a stable local source index, a bounded meaning field, and a bounded bridge field. Local validation rejects:

- missing, extra, or duplicate source indexes;
- changed or unrecognized vocabulary;
- missing required meanings or bridges;
- tabs, newlines, or import delimiters inside generated fields;
- malformed structured output;
- output that exceeds field limits.

Pasted vocabulary and meanings are explicitly treated as untrusted data, not model instructions. Bridges may be mnemonic associations but must not present invented etymology, roots, quotations, or word relationships as facts.

### Chunking and concurrency

Rows needing completion are processed in small serial chunks so common OpenRouter models can return reliable structured output. A generation session stores:

- the source fingerprint;
- source rows;
- validated results by source index;
- pending chunk indexes;
- accumulated usage;
- model and language.

Validated chunks remain staged in memory if a later chunk fails. Retry continues from the failed chunk. Editing the source, changing the selected language, changing the active book, or starting another generation invalidates the old session and prevents stale results from replacing the editor.

Only one OpenRouter operation may mutate this generation session at a time. Tutor and import requests share the same pending-operation guard and daily budget ledger, but import completion uses its own estimates and status label rather than incrementing tutor success/failure counts.

Paid failures reconcile reported usage. A model that cannot provide strict structured output produces a clear compatibility error; the application does not fall back to unvalidated free-form text.

## Shared Dropdown System

### Scope

All current single-select application controls use one reusable adapter, including book, batch, section, import behavior, curve profile, queue style, chapter split mode, deck state, tutor mode, transfer scope, and modal pickers.

A native select remains the source of truth. The visible control mirrors its value, options, disabled state, and accessible name. If enhancement fails, the native select remains usable.

Controls can explicitly opt out in the future with a native-select marker. Multi-select and size-based list boxes are not transformed.

### Behavior

- Immediate pressed feedback begins on pointer-down.
- The menu opens from the trigger with an anchored transform origin.
- Desktop menus remain anchored to the field and choose above or below placement based on available room.
- Compact layouts may use a safe-area sheet when an anchored list would be clipped.
- Only one application listbox or library popover may be open.
- Outside pointer, focus departure, view change, and Escape dismiss the menu.
- Escape returns focus to the trigger.
- Arrow keys, Home, End, Enter, Space, Tab, and typeahead follow standard single-select behavior.
- Committing a new option updates the native select and dispatches exactly one bubbling `change` event.
- Re-selecting the current option does not emit a duplicate change.
- Dynamic option replacement resynchronizes the visible menu without leaking observers or stale option nodes.

The menu material uses the existing elevated surface tokens, contextual focus color, and restrained blur. Opening and closing are symmetric and interruptible. Reduced transparency produces a solid elevated surface; increased contrast produces a stronger border.

## Shared Range and Progress System

All three current range inputs use the same visual and interaction rules. The shared rule is based on `input[type="range"]`, not Planner IDs.

- The interactive target is at least 44 px high.
- The visible rail is 6 px high.
- The thumb is a 20 px neutral surface with a clear edge and contextual focus halo.
- Fill color uses the active contextual palette.
- Hover, pointer-down, focus-visible, disabled, dark, increased-contrast, reduced-transparency, Low Power, and reduced-motion states are defined globally.
- Fill synchronization uses the existing global range percentage source rather than maintaining a second Planner-only calculation.

Determinate progress tracks use one shared track/fill language across current mini, statistics, library, health, timer, glory, match-timer, and liquid-enhanced tracks. A verified selector union provides compatibility for legacy markup, while new markup uses semantic Studio progress classes.

`section-progress` is not a progress bar; it is a collection of section-status cards and remains excluded.

## Disclosures and Popover Menus

Accordions and popover menus remain separate semantic families.

- Real disclosures use one chevron and one open/close animation.
- Chapter cards keep their existing explicit disclosure icon; no generated second chevron is added.
- Save details and mobile answer details receive the same disclosure surface and motion.
- Library ellipsis controls remain popover menus with their existing outside-click, focus-return, scroll-dismissal, and Popover API behavior.

Global styling must never treat every `details` element as an accordion.

## Error and Recovery Behavior

- Missing connection: keep input unchanged and link the user to Settings.
- Empty or fully complete input: avoid an API request and explain why.
- Invalid source line: identify its line before generation.
- Timeout or provider error: preserve source and validated staged chunks; allow retry.
- Budget exhaustion: stop before the next chunk and show the remaining work.
- Stale result: discard it silently from the editor and show a concise status message.
- Copy failure: leave text untouched and suggest manual selection.
- Download failure: leave text untouched and report that no file was created.

Messages use direct action language and never imply that an import occurred before the user presses `Import batch`.

## Accessibility

- All visible dropdown triggers retain their source labels.
- Generation status uses a polite live region; errors use an assertive status only when immediate action is required.
- Progress includes text and is not communicated by color alone.
- Keyboard users can complete every dropdown, generation, preview, copy, download, and import action.
- Touch targets meet the 44 px minimum.
- Focus remains visible over glass and contextual color.
- Reduced motion, reduced transparency, increased contrast, and Low Power modes preserve state feedback.

## Verification

### Automated

- Source parsing covers word-only, multiword terms, tab meanings, full import rows, mixed rows, blank lines, and invalid input.
- Supplied meanings and examples remain byte-for-byte unchanged.
- Generated output round-trips through the existing import parser.
- Validation rejects missing/extra/duplicate rows, changed words, missing fields, delimiter injection, and malformed JSON.
- OpenRouter request tests verify selected model, session key, strict schema, language, timeout, untrusted-input instruction, and usage propagation.
- Failures and stale sessions cannot overwrite editor text.
- Copy and download export the exact current text.
- Every eligible select is enhanced and dynamic options resynchronize.
- Dropdown keyboard, dismissal, disabled, focus-return, and single-change behavior is covered.
- All current ranges receive global fill and visual rules.
- CSS contracts exclude Planner-only range selectors and cover the verified determinate progress classes.
- Reduced-motion behavior preserves state feedback without spatial animation.

### Browser smoke tests

- Complete a mixed English and Chinese import on desktop.
- Retry a deliberately failed chunk without repeating completed chunks.
- Edit input during a delayed request and confirm stale output is discarded.
- Copy, download, preview, and import the generated format.
- Exercise every dropdown, including dynamic book/batch/section options and modal pickers.
- Exercise all three sliders at minimum, midpoint, and maximum.
- Check outside-click and Escape dismissal for both dropdowns and library ellipsis menus.
- Verify compact portrait and landscape layouts.
- Verify keyboard-only navigation, reduced motion, dark mode, and Low Power mode.

## Out of Scope

- Automatic importing after generation.
- AI-generated examples.
- Rewriting supplied meanings.
- Persisting API keys outside the existing session-only mechanism.
- A backend, account service, or mandatory AI dependency.
- Changing scheduling, queue selection, study ratings, storage schema, or transfer-file semantics.
- Replacing library popover menus with accordions.
