import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════
//  PII Encryption Utilities (AES-256-GCM)
//  
//  Provides application-level encryption for sensitive fields
//  stored in PostgreSQL. Uses AES-256-GCM for authenticated
//  encryption, preventing both eavesdropping and tampering.
//
//  Requires env: PII_ENCRYPTION_KEY (64-char hex = 32-byte key)
// ═══════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.PII_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      '[PII Encryption] PII_ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a single base64 string containing: IV + AuthTag + Ciphertext
 * 
 * Format: base64(IV[16] || AuthTag[16] || Ciphertext[...])
 */
export function encryptPII(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Pack as: IV + AuthTag + Ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypts a base64-encoded ciphertext produced by encryptPII.
 * Returns the original plaintext string.
 */
export function decryptPII(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  // If it doesn't look like base64, assume it's already plaintext (migration safety)
  if (ciphertext.length < 44 || !/^[A-Za-z0-9+/=]+$/.test(ciphertext)) {
    return ciphertext;
  }

  try {
    const key = getEncryptionKey();
    const packed = Buffer.from(ciphertext, 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      // Too short to be encrypted — return as-is (migration safety)
      return ciphertext;
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch {
    // Decryption failed — return raw value (handles unencrypted legacy data)
    return ciphertext;
  }
}

/**
 * Checks if PII encryption is configured (key exists in environment).
 * Use this to conditionally enable encryption without crashing on startup.
 */
export function isPIIEncryptionConfigured(): boolean {
  const keyHex = process.env.PII_ENCRYPTION_KEY;
  return !!keyHex && keyHex.length === 64;
}
