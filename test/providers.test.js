const test = require('node:test');
const assert = require('node:assert/strict');
const { searchAll } = require('../providers');

test('поиск возвращает картинки минимум из четырёх источников', { timeout: 90000 }, async () => {
  const result = await searchAll('mimi typh', Object.keys(require('../providers').PROVIDERS), 1);
  assert.ok(result.items.length > 10, `получено ${result.items.length} картинок`);
  const bySource = new Set(result.items.map(i => i.source));
  assert.ok(bySource.size >= 4, `источники: ${[...bySource].join(',')}`);
  assert.ok(result.items.every(i => i.url && i.title !== undefined));
});
