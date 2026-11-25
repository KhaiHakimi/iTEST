import {describe, expect, it} from 'vitest';
import {UrlAllowlistService} from '../src/shared/url-allowlist.service.js';

describe('UrlAllowlistService', () => {
  const allowlist = new UrlAllowlistService('http://127.0.0.1:4173/app', [
    'https://auth.test.local',
  ]);

  it('allows the app origin on any path', () => {
    expect(allowlist.isAllowed('http://127.0.0.1:4173/other?x=1')).toBe(true);
  });

  it('allows extra origins from settings', () => {
    expect(allowlist.isAllowed('https://auth.test.local/login')).toBe(true);
  });

  it('refuses other origins, ports and schemes', () => {
    expect(allowlist.isAllowed('https://example.com/')).toBe(false);
    expect(allowlist.isAllowed('http://127.0.0.1:9999/')).toBe(false);
    expect(allowlist.isAllowed('https://127.0.0.1:4173/')).toBe(false);
    expect(allowlist.isAllowed('file:///C:/Windows/win.ini')).toBe(false);
  });

  it('refuses look-alike hosts', () => {
    expect(allowlist.isAllowed('http://127.0.0.1:4173.evil.test/')).toBe(false);
    expect(
      allowlist.isAllowed('http://evil.test/?u=http://127.0.0.1:4173'),
    ).toBe(false);
  });

  it('allows in-browser data and blob URLs', () => {
    expect(allowlist.isAllowed('data:image/png;base64,AAAA')).toBe(true);
    expect(allowlist.isAllowed('about:blank')).toBe(true);
  });

  it('refuses unparseable URLs', () => {
    expect(allowlist.isAllowed('not a url')).toBe(false);
  });
});
