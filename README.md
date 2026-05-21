# home

A launcher for whatever Solid apps you've got installed.

Reads `/public/apps/` as an LDP container on the pod it's served from,
renders every app it finds in a macOS-style magnification dock, with
a clock, search, and a subtle living gradient background.

**Live**: served from your pod at `/public/apps/home/` once installed.

## What it does

- Lists every app under `/public/apps/<name>/` — no hardcoded list. Install a bundle and home picks up the changes on refresh.
- Stable colour + glyph per app: known suite apps (plaza, chat, vellum, plume, taskify, explorer, hub, chrome, …) get a designed icon; everything else gets a hash-derived colour and the first letter.
- Time-of-day greeting, live clock, search filter.
- macOS dock magnification on hover.

## Install

```bash
jspod install home
# → http://localhost:5444/public/apps/home/
```

Or as part of a bundle (it's slated for the next `teams` revision).

## Data shape

No bespoke storage. Pure read of the existing LDP container at
`/public/apps/`. Anything `endsWith('/')` in the `ldp:contains` array
becomes an app card.

## Inspired by

The Solid OS dashboard shipped with JSS — same visual vocabulary,
adapted to be content-driven instead of hardcoded.

## License

[AGPL-3.0-only](./LICENSE)
