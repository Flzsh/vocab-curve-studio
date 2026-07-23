# Vocab Curve Studio V20 Alpha 20 - macOS Workspace 10

Runtime-only tester build with the Apple-inspired workspace redesign and the
original vocabulary, scheduling, import, Books, Planner, Stats, Settings, and
Pro Tutor features preserved.

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/index.html?v=20.0.0-alpha.20`.

Export a Full backup before changing browser profile, device, folder, or origin. OpenRouter is optional.

## Tester notes

- Existing Alpha 20 saves migrate automatically to the coordinated save channel.
- If another tab commits newer progress, the older tab becomes read-only instead of overwriting it; reload that tab to continue.
- Test the Library `...` menus, Daily Limits switches/ranges/queue menu, Study ratings and Undo, import/reset confirmations, responsive top navigation, Low Power mode, and light/dark appearance.
- Verify that Mars terrain rotates horizontally, celestial orbits match their active stage color, Saturn/Jupiter retain smooth recognizable geometry, and Sun flares remain visible.
- Use a current browser through the local HTTP server. Do not open `index.html` directly with `file://`.
