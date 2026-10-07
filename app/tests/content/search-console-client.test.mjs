import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSearchConsole } from '../../scripts/content/search-console-client.mjs';

test('search analytics requests ungrouped totals with conjunctive exact filters', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    assert.deepEqual(body.dimensions, []);
    assert.equal(body.rowLimit, 1);
    assert.equal(body.dimensionFilterGroups.length, 1);
    assert.equal(body.dimensionFilterGroups[0].filters.length, 2);
    assert.ok(body.dimensionFilterGroups[0].filters.every(f => f.operator === 'equals'));
    return { ok: true, status: 200, json: async () => ({ rows: [{ clicks: 12, impressions: 300, ctr: 0.04, position: 7.5 }] }) };
  });
  const result = await fetchSearchConsole({ query: 'test', page: 'https://example.com/a', env: { GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: 'test-only' } });
  assert.equal(result.impressions, 300);
  assert.equal(result.clicks, 12);
  assert.equal(result.position, 7.5);
});

test('missing credentials remain unavailable rather than zero performance', async () => {
  const result = await fetchSearchConsole({ env: {} });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.impressions, undefined);
});

test('default Search Console property uses the canonical HTTPS URL', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(String(url), /sites\/https%3A%2F%2Facstory\.tistory\.com%2F\/searchAnalytics\/query/);
    assert.equal(init.headers.authorization, 'Bearer test-only');
    return { ok: true, status: 200, json: async () => ({ rows: [] }) };
  });
  const result = await fetchSearchConsole({ env: { GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: 'test-only' } });
  assert.equal(result.status, 'ok');
  assert.equal(result.siteUrl, 'https://acstory.tistory.com/');
});

test('empty authenticated response is measured zero', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const result = await fetchSearchConsole({ env: { GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: 'test-only' } });
  assert.equal(result.impressions, 0);
  assert.equal(result.position, null);
  assert.equal(result.sampleSize, 0);
});
