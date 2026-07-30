# Global Combobox Overlay Repair Design

## Status

Approved direction: one global top-layer repair for every enhanced single-select control.

The repair covers the Planner Queue Style control, the Stats Deck State filter, and every other control that uses the shared Studio combobox adapter. It does not introduce per-view offsets or one-off CSS fixes.

## Problem

The enhanced menu is created inside its combobox shell and styled with `position: fixed`. The placement code calculates viewport coordinates from the trigger's `getBoundingClientRect()`.

Every application section also has a transform for rendering isolation. A transformed ancestor becomes the containing block for a fixed descendant, so the viewport coordinates are applied again relative to the section. This produces two visible failures:

- the Deck State menu opens far below its trigger and covers table rows;
- the Queue Style menu opens beyond the right edge or overlaps its trigger, making it appear unable to expand.

The click and selection logic is intact. The defect is a shared mismatch between the coordinate system used by placement code and the coordinate system used by the rendered listbox.

A second lifecycle risk exists: active-option visibility currently uses `scrollIntoView()`, while a capture-phase scroll listener closes open menus. Opening or navigating a menu can therefore trigger its own dismissal.

## Goals

- Fix placement once in the shared Studio combobox adapter.
- Keep every enhanced menu adjacent to its trigger and inside the viewport.
- Preserve the native select as the state and event source.
- Preserve desktop anchored menus and compact bottom-sheet behavior.
- Prevent internal option scrolling from dismissing the menu.
- Retain keyboard, focus, outside-click, view-change, and external-scroll dismissal.
- Add browser-level regression coverage capable of detecting real rendered-coordinate errors.

## Non-Goals

- No per-control or per-page positioning exceptions.
- No changes to queue scheduling, daily limits, deck filtering, import behavior, or stored data.
- No redesign of the separate library ellipsis popover system.
- No removal of the section transforms or glass rendering effects.
- No new dropdown library or framework.

## Shared Architecture

### Native select

The existing native select remains the source of truth for:

- current value;
- options and disabled state;
- accessible name;
- application `change` events;
- dynamic option replacement.

The enhanced trigger and listbox continue to mirror it. Selecting a new enhanced option updates the native select and dispatches exactly one bubbling `change` event.

### Top-layer listbox

Each enhanced listbox receives `popover="manual"` and is shown through the Popover API before it is measured and positioned. A shown popover enters the browser top layer, so transformed or filtered ancestors cannot change its fixed-position coordinate system or clip it.

The listbox remains associated with its trigger through existing ARIA IDs and remains in the same logical DOM ownership structure. This preserves current event delegation and compact-layout selectors.

The top-layer CSS explicitly resets browser popover defaults:

- `inset: auto`;
- `right: auto`;
- `bottom: auto`;
- `margin: 0`.

If manual popovers are unsupported, the adapter does not hide or replace the native select. The native select remains the usable fallback rather than applying a known-broken enhanced position.

### Placement

On wide layouts:

- the preferred position is 8 px below the trigger;
- when there is insufficient room below and more room above, the menu opens 8 px above the trigger;
- the transform origin follows the chosen edge;
- horizontal placement is clamped to a 12 px viewport margin;
- menu width is at least the trigger width and never exceeds the available viewport width;
- the menu never covers its trigger.

The listbox is shown before measurement so its actual dimensions inform above/below placement.

On compact layouts, the existing safe-area bottom sheet remains. Sheet state is applied to the listbox itself so top-layer rendering does not alter the responsive contract.

## Interaction and Lifecycle

Opening a combobox performs these operations in order:

1. close any other Studio listbox or library menu;
2. make the listbox available to the Popover API;
3. show it in the top layer;
4. mark the trigger expanded;
5. position the listbox;
6. set the active option and adjust only the listbox's own scroll position.

Closing reverses the visible state safely:

1. clear open and expanded state;
2. hide the top-layer popover when present;
3. mark the listbox hidden;
4. return focus to the trigger only for interactions that require focus return, such as Escape.

Calling close repeatedly remains harmless.

The adapter no longer calls page-level `scrollIntoView()` for active options. It adjusts `listbox.scrollTop` only when the active option is above or below the listbox's visible range.

Scroll dismissal follows the source:

- scrolling within the active listbox keeps it open;
- scrolling the page, workspace, or another ancestor closes it;
- resizing, changing views, opening another menu, outside pointer-down, and focus departure close it;
- Escape closes it and returns focus to the trigger;
- Tab follows normal focus movement and does not trap focus.

## Motion and Visual Behavior

The repair retains the shared Apple-inspired control language:

- the menu visually originates from the trigger edge selected by placement;
- opening and closing use the existing short, symmetric scale-and-opacity transition;
- motion is interruptible and does not delay input;
- reduced motion uses a non-spatial opacity change;
- reduced transparency and increased contrast retain their solid-surface and stronger-border alternatives;
- no continuous decorative animation is added.

The change corrects location and lifecycle without altering control typography, contextual color, option spacing, or touch-target sizes.

## Error Handling and Recovery

- Failure to enhance a select leaves its native control intact.
- A `showPopover()` failure aborts the enhanced opening without changing the native value.
- Closing an already-closed or detached listbox is a no-op.
- Disposal hides an open popover, disconnects observers, removes the enhanced shell, and restores native usability.
- Dynamic option synchronization cannot leave a removed active option referenced by `aria-activedescendant`.

## Accessibility

- The trigger retains `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls`, and accurate `aria-expanded`.
- The listbox retains `role="listbox"` and options retain `role="option"` with accurate `aria-selected`.
- Keyboard support remains Arrow Up/Down, Home, End, Enter, Space, Escape, Tab, and typeahead.
- Escape returns focus to the trigger.
- The native fallback remains labeled and keyboard-operable when enhancement is unavailable.
- Placement, focus, and selection are not communicated by color alone.

## Verification

### Automated contract tests

- Every eligible single select receives a manual-popover listbox only when the Popover API is supported.
- Opening shows the popover before geometry is measured.
- Closing and disposal hide the popover safely.
- Active-option visibility uses listbox-local scrolling and does not call page-level `scrollIntoView()`.
- Scroll events originating inside the active listbox do not dismiss it.
- Scroll events from the workspace or document do dismiss it.
- Existing single-change, dynamic-option, keyboard, focus, and compact-sheet tests remain green.

### Browser regression tests

On a wide layout:

- open Planner Queue Style inside its transformed Daily Limits section;
- assert the listbox is visible, inside the viewport, horizontally aligned with the trigger, and within 2 px of the intended 8 px below-or-above gap without overlap;
- select each Queue Style option and confirm the native value and Planner behavior update once;
- open Stats Deck State after scrolling the view;
- assert the same adjacency, viewport, and non-overlap rules;
- confirm the listbox does not cover deck rows unexpectedly;
- scroll the open listbox and confirm it remains open;
- scroll the containing view and confirm it closes;
- verify outside click, Escape, focus return, and one-open-surface behavior.

On compact portrait and landscape layouts:

- verify both controls use the existing bottom sheet;
- verify safe-area spacing, option scrolling, selection, dismissal, and focus behavior.

Regression checks also cover reduced motion and a representative modal or header select so the fix is confirmed as global rather than view-specific.

## Release

After automated and browser verification pass:

1. commit only the repair, tests, and any required documentation;
2. push the verified commit to the existing GitHub repository;
3. allow the existing GitHub Pages workflow to deploy;
4. verify the deployed URL with a cache-busting revision query;
5. recheck Queue Style and Deck State on the deployed build.
