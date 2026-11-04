# Changelog

## 0.2.1

- Limit vision-model output to 1024 tokens so OpenAI-compatible gateways do
  not default to the model's full context window and reject image requests.
- Make the default vision prompt require Simplified Chinese descriptions.
- Deliver noteworthy scheduled observations immediately and explicitly ask the
  main agent to call `pet_say` once so the message reaches the pet bubble.

## 0.2.0

- Replaced per-capture PowerShell with a persistent isolated native Windows child process.
- Added DPI-aware display enumeration, layout fingerprints and richer visible-window metadata.
- Window capture now fails closed for missing, minimized, failed or blank targets and never falls back to a display.
- Added focused tests for multi-display ordering, layout changes and target metadata.

## 0.1.0

- Initial local development release.
- Inspect a configured Windows display, desktop, or visible window with an OpenAI-compatible vision endpoint.
- Optional noteworthy-change checks with a minimum one-minute interval.
