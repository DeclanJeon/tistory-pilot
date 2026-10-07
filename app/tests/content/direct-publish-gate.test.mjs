import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicSiteReady } from '../../scripts/content/public-site-qa.mjs';

test('direct publish gate rejects a blocked public surface', async () => {
  await assert.rejects(
    () => assertPublicSiteReady({
      blogUrl: 'https://example.com',
      run: async () => ({
        surface: {
          ok: false,
          blockers: [{ code: 'auto-refresh' }, { code: 'auto-refresh' }, { code: 'mixed-script' }]
        }
      })
    }),
    (error) => error.code === 'public-site-qa-blocked'
      && error.message.includes('auto-refresh')
      && error.message.includes('mixed-script')
  );
});

test('direct publish gate returns a passing report unchanged', async () => {
  const expected = { surface: { ok: true, blockers: [] }, articles: [] };
  const actual = await assertPublicSiteReady({
    blogUrl: 'https://example.com',
    run: async ({ blogUrl, limit }) => ({ ...expected, blogUrl, limit })
  });
  assert.equal(actual.surface.ok, true);
  assert.equal(actual.blogUrl, 'https://example.com');
  assert.equal(actual.limit, 10);
});
