# Changelog

## 0.4.0 - 2026-10-14

- `ma-party`: switches the Music Assistant Party plugin's guest access and shows the join QR
  code, through `mass_queue`. Bundles qrcode-generator 1.4.4 (MIT)

## 0.3.0 - 2026-10-14

- `ma-queue` `search: true`: a search box over every Music Assistant provider. A tapped result
  goes next in the queue; holding offers *Play now*, *Play next*, *Add to queue* and *Radio*
- `ma-queue`: *Move up* and *Move down* in the item menu
- `ma-playlist-grid` `tabs`: *Recent* and *Favourites* songs beside the playlists; a tapped song
  goes next in the queue, and the menu gains *Radio*
- `ma-now-playing` `radio: true`: a *More like this* button
- Typing in the search box no longer triggers Home Assistant's keyboard shortcuts

## 0.2.0 - 2026-10-14

- `ma-queue`: the play queue from the current track on, through the `mass_queue`
  integration. Tap jumps to an item; hold offers *Play now*, *Play next* and *Remove from queue*

## 0.1.1 - 2026-10-14

- `ma-now-playing` shows the cover through Home Assistant's media proxy, so it appears on an
  HTTPS connection (the companion app, remote access) instead of being blocked as plain HTTP

## 0.1.0 - 2026-10-14

- First release, three cards in one file, drawn to sit beside the Daylight Calendar Card and
  the Shopping List Card
- `ma-playlist-grid`: Music Assistant playlists as a grid of covers. Tap plays now (replacing
  the queue, shuffled); hold offers *Play next* and *Add to queue*. `include` keeps only the
  playlists you name, `extra` adds ones by URI, the one you started is outlined while it plays
- `ma-now-playing`: cover, title, artist, progress, previous/play/next, shuffle, repeat and
  volume; `compact: true` for a slim version
- `mood-buttons`: big buttons that run a script, the one matching `mood_entity` lit up
- English and Portuguese, following the Home Assistant language
