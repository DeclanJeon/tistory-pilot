import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFallbackImageQuery,
  buildFallbackImageUrl,
  collectRelativeBodyAssetPaths,
  inlineBodyAssetDataUrls,
  normalizeAssetPath
} from '../../src/server/static/body-asset-utils.js';


test('collectRelativeBodyAssetPaths finds html and markdown relative assets', () => {
  const body = `\n<img src="assets/hero.png" alt="hero">\n![alt](./images/chart.jpg)\n<img src="https://example.com/live.png">\n`;
  assert.deepEqual(collectRelativeBodyAssetPaths(body), ['assets/hero.png', 'images/chart.jpg']);
});

test('inlineBodyAssetDataUrls replaces relative html and markdown assets', () => {
  const body = `\n<p><img src="assets/hero.png" alt="hero"></p>\n![chart](images/chart.jpg)\n`;
  const inlined = inlineBodyAssetDataUrls(body, {
    'assets/hero.png': 'data:image/png;base64,AAA',
    'folder/images/chart.jpg': 'data:image/jpeg;base64,BBB'
  });
  assert.match(inlined, /src="data:image\/png;base64,AAA"/);
  assert.match(inlined, /!\[chart\]\(data:image\/jpeg;base64,BBB\)/);
});

test('normalizeAssetPath strips dot prefixes and backslashes', () => {
  assert.equal(normalizeAssetPath('.\\assets\\hero.png'), 'assets/hero.png');
});

test('buildFallbackImageUrl creates deterministic free-image fallback', () => {
  const query = buildFallbackImageQuery({
    assetPath: 'assets/02_concert_crowd.jpg',
    title: 'K팝 챌린지와 해시태그 사례 모음',
    description: '팬덤과 SNS 확산 사례를 정리한 글',
    text: '공연장과 팬덤 참여 장면을 설명한다.',
    category: '사회·이슈'
  });
  assert.match(query, /concert/);
  const url = buildFallbackImageUrl({
    assetPath: 'assets/02_concert_crowd.jpg',
    title: 'K팝 챌린지와 해시태그 사례 모음',
    description: '팬덤과 SNS 확산 사례를 정리한 글',
    text: '공연장과 팬덤 참여 장면을 설명한다.',
    category: '사회·이슈'
  });
  assert.match(url, /^https:\/\/loremflickr\.com\/1600\/900\//);
  assert.match(url, /lock=/);
});
