# Vocab Curve Studio Beta v43 — Studio Workspace 13

Slim tester build of the adaptive vocabulary trainer.

## Run

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/index.html?v=43.0.0-beta-studio.13`.

Export a Full backup before changing browser profile, device, folder, or origin. OpenRouter is optional.

## Beta v43

- **Due** counts only reviews whose scheduled time has arrived; **Queue** includes due, early-spacing, and reinforcement work.
- When a card would repeat immediately, the nearest eligible review cards are inserted first. A temporary spacing cycle ends after the deferred card instead of looping forever.
- Phone navigation uses Study, Import, and More with one application scroller and a contained Details sheet.
- Daily Limit is the shared visual pattern for progress bars, and expandable sections use one consistent disclosure pattern.

- Inclusive range input accepts hyphen, en dash, em dash, and minus-sign separators.
