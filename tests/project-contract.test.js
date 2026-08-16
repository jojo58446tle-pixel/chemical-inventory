import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production project contract', () => {
  const apiSource = readFileSync(new URL('../netlify/functions/api.mjs', import.meta.url), 'utf8');
  const loginSource = readFileSync(new URL('../src/pages/LoginPage.jsx', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

  it('keeps secrets server-side and documents required variables', () => {
    expect(envExample).toContain('AI_API_KEY=');
    expect(envExample).toContain('DINGTALK_WEBHOOK_URL=');
    expect(envExample).not.toMatch(/AI_API_KEY=\S+/);
    expect(envExample).not.toContain('ADMIN_USERNAME');
  });

  it('uses password-only admin login', () => {
    expect(loginSource).not.toContain('Username');
    expect(loginSource).toContain('Password');
    expect(apiSource).toContain('verifyPassword(input.password, env)');
    expect(apiSource).not.toContain('input.username');
  });

  it('provides protected Excel export and image support', () => {
    expect(apiSource).toContain("path === '/export.xlsx'");
    expect(apiSource.indexOf('requireAdmin')).toBeLessThan(apiSource.indexOf("path === '/export.xlsx'"));
    expect(apiSource).toContain("path === '/images'");
  });

  it('contains a mobile layout breakpoint', () => {
    expect(cssSource).toContain('@media (max-width: 760px)');
  });
});
