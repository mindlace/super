import { describe, expect, it } from 'vitest';
import { isAllowedHost } from './host';

describe('isAllowedHost', () => {
  it.each([
    '127.0.0.1:4510',
    'localhost:4510',
    'LOCALHOST:4510',
    '127.0.0.1',
    'localhost',
    '127.0.0.1:4511'
  ])('accepts %s', (h) => expect(isAllowedHost(h)).toBe(true));

  it.each([
    null,
    '',
    'evil.example:4510',
    '127.0.0.1.evil.example',
    '127.0.0.1:4510.evil.example',
    'localhost.evil.example:4510',
    '[::1]:4510',
    '127.0.0.1:abc',
    'localhost:'
  ])('rejects %s', (h) => expect(isAllowedHost(h)).toBe(false));
});
