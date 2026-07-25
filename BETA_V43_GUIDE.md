# Vocab Curve Studio Beta v43

Beta v43 is the platform-neutral runtime release. It preserves existing saved progress by retaining the established storage, database, and channel identifiers.

## Run

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/index.html?v=43.0.0-beta
```

Use a local web server rather than opening `index.html` through `file://` so storage and offline caching behave consistently.

## Before testing

Export a **Full backup** from Settings before changing browser profile, device, folder, or web origin. When another tab has a newer save, a stale tab is blocked from overwriting it and must be reloaded.

## Release notes

- Public workspace assets use neutral Studio naming.
- Review cards retain visible queue counts and no-immediate-repeat protections.
- Skipped unseen words are deferred until the next day.
- Wrong, Correct, and Know results persist across reloads.
- Coordinated saves, rolling backups, invalid-due repair, and chronological history migration protect progress.
- Low Power mode reduces continuous motion and expensive visual effects without changing study, saving, import, Planner, Stats, or Pro Tutor behavior.

## Low Power mode

Low Power mode stops continuous liquid motion, world orbits, ambient blobs, expensive blur, and nonessential transitions. Flashcards, scheduling, saving, Books, imports, Planner, Stats, and Pro Tutor continue to work.

## OpenRouter

OpenRouter is optional. **Test tutor** performs a real generation and validation check. Standard Study and local coaching remain available without it.
