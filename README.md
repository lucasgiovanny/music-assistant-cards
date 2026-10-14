# Music Assistant Cards

Four Lovelace cards for [Music Assistant](https://www.music-assistant.io/) in Home Assistant,
drawn to sit beside the [Daylight Calendar Card](https://github.com/lucasgiovanny/daylight-calendar-card)
and the [Shopping List Card](https://github.com/lucasgiovanny/shopping-list-card): no card chrome,
dark tiles, one accent colour.

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=lucasgiovanny&repository=music-assistant-cards&category=dashboard)

## Installation

HACS → ⋮ → *Custom repositories* → `https://github.com/lucasgiovanny/music-assistant-cards`, type
*Dashboard*. Install *Music Assistant Cards* and reload the browser. One file registers all four cards.

## `ma-playlist-grid`

```yaml
type: custom:ma-playlist-grid
entity: media_player.living_room_2
include:
  - Bossa Nova Classics
  - Coleção Samba
extra:
  - name: Some Spotify playlist
    uri: spotify://playlist/37i9dQZF1DX9Mifz3ChtcR
mood_entity: input_select.mood_atual
mood_reset_option: Nenhum
```

| Option | Default | Description |
|---|---|---|
| `entity` | — | **Required.** A Music Assistant `media_player` |
| `include` | all | Playlist names or URIs to show (accents and case ignored) |
| `extra` | — | Extra `{name, uri, image}` entries not in the library |
| `title` | *Playlists* | Header. `""` hides it |
| `columns` | auto | Fixed number of columns; otherwise covers are at least 130px wide |
| `shuffle` | `true` | Turn shuffle on after *Play now* |
| `color` | `var(--primary-color)` | Outline of the playing cover |
| `mood_entity`, `mood_reset_option` | — | Set this `input_select` to this option when a playlist starts |
| `config_entry_id` | from the entity | Music Assistant config entry, if it cannot be read from the entity registry |

Tap a cover to play it now; hold it for *Play next* or *Add to queue*.

## `ma-now-playing`

```yaml
type: custom:ma-now-playing
entity: media_player.living_room_2
compact: false
```

Options: `entity` (required), `compact`, `color`, `name` (shown when nothing plays). Tap the
cover for the more-info dialog.

## `ma-queue`

Needs the [Music Assistant Queue Actions](https://github.com/droans/mass_queue) integration
(`mass_queue`), which exposes the full queue to Home Assistant.

```yaml
type: custom:ma-queue
entity: media_player.living_room_2
limit: 25
max_height: 640px
```

| Option | Default | Description |
|---|---|---|
| `entity` | — | **Required.** A Music Assistant `media_player` |
| `limit` | `25` | Items shown after the current one |
| `max_height` | none | Scroll inside the card past this height |
| `title` | *Up next* | Header. `""` hides it |
| `color` | `var(--primary-color)` | Accent of the current item |

The list starts at the current track and refreshes when the track changes. Tap an item to
jump to it; hold it for *Play now*, *Play next* or *Remove from queue*. Covers use the copy
`mass_queue` encodes when its *download local* option is on, so they show over HTTPS too.

## `mood-buttons`

```yaml
type: custom:mood-buttons
mood_entity: input_select.mood_atual
moods:
  - name: Relaxar
    icon: mdi:sofa
    color: "#26A69A"
    script: script.relaxar_sala
```

Each mood runs its `script`; the one whose `mood` (or `name`) equals the state of
`mood_entity` is lit up. Options: `moods` (required), `mood_entity`, `title`, `columns`.

## Development

One file, `dist/music-assistant-cards.js`, no build step.

```bash
node --check dist/music-assistant-cards.js
npm test
```

## License

[MIT](LICENSE)
