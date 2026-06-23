import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedQrRecipient, canSendQrEmail } from '../../src/core/qr/email-service.mjs';

test('QR email recipient must be allowlisted', async () => {
  const config = {
    enabled: true,
    from: 'ops@ponslink.com',
    smtpHost: 'smtp.ponslink.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'user',
    smtpPass: 'pass',
    allowedRecipients: ['ops@ponslink.com']
  };

  assert.equal(canSendQrEmail(config), true);
  assert.equal(assertAllowedQrRecipient(config, 'ops@ponslink.com'), 'ops@ponslink.com');
  assert.throws(() => assertAllowedQrRecipient(config, 'other@ponslink.com'), /allowlisted/);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-qr-email-'));
  await fs.writeFile(path.join(tempRoot, 'qr.png'), 'fake');
});
