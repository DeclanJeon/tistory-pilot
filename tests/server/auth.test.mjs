import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie, isAuthenticated, parseCookies } from '../../src/server/auth.mjs';

test('auth cookie is derived from the configured session secret', () => {
  const config = { sessionSecret: 'secret' };
  const cookie = createSessionCookie(config);
  const request = { headers: { cookie } };
  assert.equal(isAuthenticated(request, config), true);
  assert.equal(parseCookies(cookie).publish_workbench_session.length > 10, true);
  assert.match(cookie, /Secure/);
});
