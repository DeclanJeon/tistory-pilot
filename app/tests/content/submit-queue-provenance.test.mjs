import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qaQueuePost } from '../../scripts/schedule/submit-queue.mjs';

const BODY = `<div style="font-size:16px;line-height:1.82;color:#1f2937;">
<h1>구조화 출처 게이트 테스트</h1>
${'<p>충분한 테스트 본문입니다. '.repeat(30)}
<h2>📌 확인</h2><p>자동 생성 글은 출처 URL이 필요합니다.</p>
<div style="background:#fefce8">인사이트</div>
<div style="background:#eff6ff;border-left:4px solid #3b82f6">정보</div>
</div>`;

test('queue QA blocks posts without structured source URLs', async () => {
  const report = await qaQueuePost({
    id: '',
    bodyHtml: BODY,
    imageRequired: false
  });
  assert.equal(report.ok, false);
  assert.ok(report.failures.includes('provenance-source-missing: queue posts require at least one structured source URL'));
});
