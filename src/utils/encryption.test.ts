import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptPII, decryptPII } from './encryption';

describe('PII Encryption — T3 Verification', () => {
  const TEST_KEY = 'a'.repeat(64); // 64-char hex = 32-byte key

  beforeEach(() => {
    vi.stubEnv('PII_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encrypt → decrypt round-trip returns original plaintext', () => {
    const original = '9876543210';
    const encrypted = encryptPII(original);
    const decrypted = decryptPII(encrypted);

    expect(decrypted).toBe(original);
    expect(encrypted).not.toBe(original);
  });

  it('returns empty/falsy values unchanged', () => {
    expect(encryptPII('')).toBe('');
    expect(decryptPII('')).toBe('');
  });

  it('deterministic encryption produces same ciphertext for same input', () => {
    const value = 'test@example.com';
    const enc1 = encryptPII(value, { deterministic: true });
    const enc2 = encryptPII(value, { deterministic: true });

    expect(enc1).toBe(enc2);
  });

  it('non-deterministic encryption produces different ciphertext for same input', () => {
    const value = 'test@example.com';
    const enc1 = encryptPII(value);
    const enc2 = encryptPII(value);

    // Random IVs should produce different ciphertexts
    expect(enc1).not.toBe(enc2);

    // But both should decrypt to the same value
    expect(decryptPII(enc1)).toBe(value);
    expect(decryptPII(enc2)).toBe(value);
  });

  it('plaintext passthrough: decryptPII returns short strings as-is', () => {
    // Short strings that don't look like base64 pass through unchanged
    const plaintext = '+91-9876543210';
    expect(decryptPII(plaintext)).toBe(plaintext);
  });

  it('plaintext passthrough: decryptPII returns non-base64 strings as-is', () => {
    const email = 'user@example.com';
    expect(decryptPII(email)).toBe(email);
  });

  it('throws when PII_ENCRYPTION_KEY is missing', () => {
    vi.stubEnv('PII_ENCRYPTION_KEY', '');

    expect(() => encryptPII('test')).toThrow('PII_ENCRYPTION_KEY');
  });

  it('throws when PII_ENCRYPTION_KEY has wrong length', () => {
    vi.stubEnv('PII_ENCRYPTION_KEY', 'tooshort');

    expect(() => encryptPII('test')).toThrow('PII_ENCRYPTION_KEY');
  });
});
