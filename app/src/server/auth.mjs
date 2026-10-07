import crypto from 'node:crypto';

function sign(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

export function parseCookies(header) {
  return String(header || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

export function isAuthenticated(request, config) {
  if (!config.sessionSecret) return true;
  const cookies = parseCookies(request.headers.cookie || '');
  return cookies.publish_workbench_session === sign(config.sessionSecret);
}

export function createSessionCookie(config) {
  return `publish_workbench_session=${sign(config.sessionSecret)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
