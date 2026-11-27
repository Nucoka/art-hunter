const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../search-utils');

test('умный поиск расширяет синонимы и исключения', () => {
  const q = U.parseQuery('кошка арт -gif "mimi typh"');
  assert.deepEqual(q.exclude, ['gif']);
  assert.deepEqual(q.phrases, ['mimi typh']);
  assert.ok(q.expanded.includes('cat'));
  assert.ok(q.expanded.includes('artwork'));
  assert.ok(q.remoteQuery.includes('"mimi typh"') === false);
  assert.ok(q.remoteQuery.includes('mimi typh'));
});

test('фильтры по тегам, размеру и формату', () => {
  const items = [
    { title: 'Mimi by Typh', url: 'https://x/a.jpg', width: 1500, height: 900, tags: ['furry'], source: 'ddg' },
    { title: 'cat art', url: 'https://x/b.gif', width: 300, height: 300, tags: [], source: 'bing' }
  ];
  const parsed = U.parseQuery('mimi');
  const opts = { parsed, tags: [], minWidth: 1000, orientation: 'landscape', format: 'any' };
  assert.equal(U.filterItems(items, opts).length, 1);
  assert.equal(U.filterItems(items, { ...opts, tags: ['furry'] }).length, 1);
  assert.equal(U.filterItems(items, { ...opts, tags: ['missing'] }).length, 0);
  assert.equal(U.filterItems(items, { parsed: U.parseQuery('-cat'), minWidth: 0 }).length, 1);
});

test('дедупликация по URL', () => {
  const items = [{ url: 'a' }, { url: 'a' }, { url: 'b' }];
  assert.deepEqual(U.dedupeItems(items).map(i => i.url), ['a', 'b']);
});

test('нечёткое совпадение и дедупликация по названию', () => {
  const parsed = U.parseQuery('mimy typh');
  assert.ok(U.matchesQuery({ title: 'Mimi typh art' }, parsed));
  assert.equal(U.dedupeItems([
    { url: 'a', title: 'Mimi typh art' },
    { url: 'b', title: 'Mimi Typh Art!' }
  ]).length, 1);
});

test('скрытие и умная отсевка мусора', () => {
  const items = [
    { url: '1', title: 'Mimi typh fanart', tags: ['mimi'] },
    { url: '2', title: 'Mimi by Typh art', tags: ['typh'] },
    { url: '3', title: 'Случайный чёрно-белый фото', tags: [] }
  ];
  const parsed = U.parseQuery('mimi typh');
  assert.equal(U.smartFilter(items, parsed, []).length, 2);
  const hidden = [{ url: '2', title: U.titleKey(items[1]) }];
  assert.deepEqual(U.filterHidden(items, hidden).map(i => i.url), ['1', '3']);
  assert.equal(U.filterHidden([{ url: '4', title: 'Mimi Typh Fanart!' }], [{ title: U.titleKey(items[0]) }]).length, 0);
  const withJunk = [...items, { url: 'https://www.tiktok.com/@x/video/123', title: 'Mimi typh tiktok' }];
  assert.equal(U.filterHidden(withJunk, []).length, 3);
  assert.equal(U.filterHidden([{ url: 'https://cdn.example.com/a.jpg', title: 'x' }], [{ domain: 'example.com' }]).length, 0);
});
