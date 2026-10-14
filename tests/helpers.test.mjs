import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPlaylists, formatDuration, isActiveMood, resolveLanguage, t, upcomingItems, queueImage, safeImage, searchGroups, mediaRow, toastFor } from '../dist/music-assistant-cards.js';

const library = [
  { name: 'Infinite Mix (library)', uri: 'library://playlist/7', image: 'a.jpg' },
  { name: 'Coleção Samba', uri: 'library://playlist/11', image: 'b.jpg' },
  { name: 'bossa Nova Classics', uri: 'library://playlist/12' },
  { name: 'Blues Classics', uri: 'library://playlist/13' }
];

test('playlists are filtered by name or URI, extras appended, sorted and de-duplicated', () => {
  const picked = selectPlaylists(library, {
    include: ['colecao samba', 'library://playlist/12', 'Blues Classics'],
    extra: [{ name: 'Relaxing Music for Dogs', uri: 'library://playlist/16' }, { name: 'Dup', uri: 'library://playlist/11' }]
  });
  assert.deepEqual(picked.map((p) => p.uri), ['library://playlist/13', 'library://playlist/12', 'library://playlist/11', 'library://playlist/16']);
  assert.equal(selectPlaylists(library).length, 4);
  assert.equal(picked.find((p) => p.uri.endsWith('/12')).image, null);
});

test('durations read as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65.9), '1:05');
  assert.equal(formatDuration(-3), '0:00');
});

test('the active mood matches the helper state by mood or name, ignoring accents and case', () => {
  assert.equal(isActiveMood({ name: 'Relaxar' }, 'relaxar'), true);
  assert.equal(isActiveMood({ name: 'Dog', mood: 'Dog mode' }, 'Dog mode'), true);
  assert.equal(isActiveMood({ name: 'Animado' }, 'Nenhum'), false);
  assert.equal(isActiveMood({ name: 'Jantar' }, null), false);
});

test('language follows Home Assistant', () => {
  assert.equal(resolveLanguage({ locale: { language: 'pt-BR' } }), 'pt');
  assert.equal(t('pt', 'play_next'), 'Tocar a seguir');
  assert.equal(t('en', 'play_next'), 'Play next');
});

test('the queue starts at the current item and keeps the limit', () => {
  const items = [{ queue_item_id: 'a' }, { queue_item_id: 'b' }, { queue_item_id: 'c' }, { queue_item_id: 'd' }];
  const up = upcomingItems(items, 'b', 2);
  assert.deepEqual(up.map((i) => i.queue_item_id), ['b', 'c']);
  assert.equal(up[0].current, true);
  assert.equal(up[1].current, false);
  assert.deepEqual(upcomingItems(items, 'zz', 2).map((i) => i.queue_item_id), ['a', 'b']);
  assert.deepEqual(upcomingItems(null, 'a', 3), []);
});

test('queue images prefer the encoded copy and skip plain HTTP on HTTPS pages', () => {
  assert.equal(queueImage({ local_image_encoded: 'data:image;base64,AAA', media_image: 'http://x/a.jpg' }, true), 'data:image;base64,AAA');
  assert.equal(queueImage({ local_image_encoded: 'AAA' }, true), 'data:image;base64,AAA');
  assert.equal(queueImage({ media_image: 'http://x/a.jpg' }, true), null);
  assert.equal(queueImage({ media_image: 'http://x/a.jpg' }, false), 'http://x/a.jpg');
  assert.equal(queueImage({ media_image: 'https://i.scdn.co/a.jpg' }, true), 'https://i.scdn.co/a.jpg');
  assert.equal(queueImage({}, false), null);
});

test('search results become rows grouped by type, empty groups dropped', () => {
  const groups = searchGroups({
    tracks: [{ media_type: 'track', uri: 'spotify://track/1', name: 'Preciso Me Encontrar', image: 'https://i/a.jpg', artists: [{ name: 'Cartola' }] }],
    albums: [{ media_type: 'album', uri: 'spotify://album/1', name: 'Cartola (1976)', image: null, artists: [{ name: 'Cartola' }] }],
    artists: [],
    playlists: [{ uri: 'spotify://playlist/1', name: 'Samba', owner: 'Spotify' }, { name: 'no uri' }],
    radio: [{ uri: 'x' }]
  });
  assert.deepEqual(Object.keys(groups), ['tracks', 'albums', 'playlists']);
  assert.deepEqual(groups.tracks[0], { name: 'Preciso Me Encontrar', uri: 'spotify://track/1', media_type: 'track', image: 'https://i/a.jpg', subtitle: 'Cartola' });
  assert.equal(groups.playlists[0].media_type, 'playlist');
  assert.equal(groups.playlists[0].subtitle, 'Spotify');
  assert.deepEqual(searchGroups(null), {});
  assert.equal(searchGroups({ tracks: Array.from({ length: 12 }, (_, i) => ({ uri: `u${i}`, name: 'n' })) }, 5).tracks.length, 5);
});

test('images accept a path object and skip plain HTTP on HTTPS', () => {
  assert.equal(safeImage({ path: 'https://x/a.jpg' }, true), 'https://x/a.jpg');
  assert.equal(safeImage('http://mass.local/a.jpg', true), null);
  assert.equal(safeImage(null, false), null);
  assert.equal(mediaRow({ uri: 'u', name: 'n', album: { image: 'https://x/b.jpg' } }, 'track').image, 'https://x/b.jpg');
});

test('the toast says where the song went', () => {
  assert.equal(toastFor('pt', { name: 'Alvorada' }, 'next'), 'A seguir: Alvorada');
  assert.equal(toastFor('pt', { name: 'Alvorada' }, 'add'), 'No fim da fila: Alvorada');
  assert.equal(toastFor('pt', { name: 'Alvorada' }, 'replace', true), 'Rádio a partir de Alvorada');
  assert.equal(toastFor('en', { name: 'Alvorada' }, 'play'), 'Playing Alvorada');
});
