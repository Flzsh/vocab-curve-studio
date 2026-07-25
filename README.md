# Vocab Curve Studio Beta v43

Runtime-only tester build of the adaptive vocabulary trainer.

## Run

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/index.html?v=43.0.0-beta`.

Export a Full backup before changing browser profile, device, folder, or origin. OpenRouter is optional.

## Beta v43 checks

- Review cards always produce a visible queue count, including a deliberately pulled-forward review.
- The same card cannot repeat immediately. When necessary, the queue inserts the nearest two eligible review cards before returning to it.
- Skipping an unseen word holds it until the next day instead of selecting it again immediately.
- Wrong, Correct, and Know results are persisted and survive reload.
- Coordinated saves and rolling backups protect progress from stale tabs and malformed primary data.
- Low Power mode preserves core study behavior while disabling nonessential continuous motion and expensive visual effects.
