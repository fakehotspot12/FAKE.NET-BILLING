'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BoundedJsonCache } = require('../src/bounded-json-cache');

test('bounded JSON cache expires entries and releases their byte budget', () => {
  let now = 1_000;
  const cache = new BoundedJsonCache({
    maxEntries: 4,
    maxBytes: 1024,
    maxEntryBytes: 512,
    now: () => now
  });

  assert.equal(cache.set('one', { value: 'cached' }, 100), true);
  assert.deepEqual(cache.get('one'), { value: 'cached' });
  assert.ok(cache.stats().bytes > 0);

  now = 1_101;
  assert.equal(cache.get('one'), undefined);
  assert.deepEqual(cache.stats(), {
    entries: 0,
    bytes: 0,
    maxEntries: 4,
    maxBytes: 1024,
    maxEntryBytes: 512
  });
});

test('bounded JSON cache skips oversized values', () => {
  const cache = new BoundedJsonCache({
    maxEntries: 4,
    maxBytes: 256,
    maxEntryBytes: 64
  });

  assert.equal(cache.set('large', { value: 'x'.repeat(100) }, 1000), false);
  assert.equal(cache.get('large'), undefined);
  assert.equal(cache.stats().bytes, 0);
});

test('bounded JSON cache evicts least recently used entries', () => {
  const cache = new BoundedJsonCache({
    maxEntries: 2,
    maxBytes: 1024,
    maxEntryBytes: 512
  });

  cache.set('one', { value: 1 }, 1000);
  cache.set('two', { value: 2 }, 1000);
  assert.deepEqual(cache.get('one'), { value: 1 });
  cache.set('three', { value: 3 }, 1000);

  assert.equal(cache.get('two'), undefined);
  assert.deepEqual(cache.get('one'), { value: 1 });
  assert.deepEqual(cache.get('three'), { value: 3 });
});

test('cached values are isolated from caller mutation', () => {
  const cache = new BoundedJsonCache();
  const source = { nested: { value: 1 } };
  cache.set('value', source, 1000);
  source.nested.value = 2;

  const first = cache.get('value');
  first.nested.value = 3;
  assert.deepEqual(cache.get('value'), { nested: { value: 1 } });
});
