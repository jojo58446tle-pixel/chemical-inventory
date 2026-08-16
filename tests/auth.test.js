import { describe, expect, it } from 'vitest';
import { createSession, verifyPassword, verifySession } from '../netlify/functions/lib/auth.mjs';
import { loginSchema } from '../netlify/functions/lib/validation.mjs';

const env = { ADMIN_PASSWORD: 'strong-test-password', SESSION_SECRET: 'test-session-secret-at-least-32-bytes' };

describe('password-only admin authentication', () => {
  it('accepts the configured password and rejects other values', () => {
    expect(verifyPassword('strong-test-password', env)).toBe(true);
    expect(verifyPassword('wrong-password', env)).toBe(false);
    expect(verifyPassword('', { SESSION_SECRET: env.SESSION_SECRET })).toBe(false);
  });

  it('accepts only a password in the login payload', () => {
    expect(loginSchema.parse({ password: 'strong-test-password' })).toEqual({ password: 'strong-test-password' });
    expect(() => loginSchema.parse({ username: 'admin', password: 'strong-test-password' })).toThrow();
  });

  it('creates a valid admin session without a username input', () => {
    expect(verifySession(createSession(env), env)).toMatchObject({ sub: 'admin' });
  });
});
