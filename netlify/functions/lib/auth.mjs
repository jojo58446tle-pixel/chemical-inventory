import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'iqc_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

function secret(env = process.env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is missing');
  return env.SESSION_SECRET;
}

function sign(value, env) {
  return createHmac('sha256', secret(env)).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyPassword(password, env = process.env) {
  return Boolean(env.ADMIN_PASSWORD) && safeEqual(password, env.ADMIN_PASSWORD);
}

export function createSession(env = process.env) {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload, env)}`;
}

export function verifySession(token, env = process.env) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!safeEqual(signature, sign(payload, env))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

export function sessionFromRequest(request, env = process.env) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
  return verifySession(match?.slice(COOKIE_NAME.length + 1), env);
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
