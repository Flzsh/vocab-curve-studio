# Vocab Curve Studio V20 Alpha 20

Alpha 20 is the final V20 alpha audit build. It keeps existing Alpha 10+ progress in the protected V20 save channel.

## Run

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/index.html?v=20.0.0-alpha.20
```

Use a local web server rather than opening `index.html` through `file://` so storage and offline caching behave consistently.

## Before testing

Export a **Full backup** from Settings before changing browser profile, device, folder, or web origin. When another tab has a newer save, a stale tab is blocked from overwriting it and must be reloaded.

## Main changes

- Real Vocab Curve Studio app icon in the header.
- Optional **Low Power mode** in Settings → Power.
- Pro Review returns directly to Study after its final useful step; there is no empty Done page.
- Stronger save revision checks, full rolling backups, invalid-due repair, and chronological history migration.
- Calendar-day review forecasting.
- Less background rendering while studying.
- Responsive Study, Reveal, Books, Stats, Planner, Import, and Settings layouts for compact laptops, tablets, and phones.
- Complete meaning, memory bridge, and context visibility on short laptop screens.

## Low Power mode

Low Power mode stops continuous liquid motion, world orbits, ambient blobs, expensive blur, and nonessential transitions. Flashcards, scheduling, saving, Books, imports, Planner, Stats, and Pro Tutor continue to work.

## OpenRouter

OpenRouter is optional. **Test tutor** performs a real generation and validation check. Standard Study and local coaching remain available without it.
