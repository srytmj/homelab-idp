import crypto from 'crypto';

/**
 * Derives or validates a 32-byte (256-bit) Buffer from the secret key.
 * Supports 64-char hex, 44-char base64, or any UTF-8 string (hashed via SHA-256 to guarantee 32 bytes).
 */
export function deriveKey(secretKey: string | Buffer): Buffer {
  if (Buffer.isBuffer(secretKey)) {
    if (secretKey.length === 32) return secretKey;
    return crypto.createHash('sha256').update(secretKey).digest();
  }

  const trimmed = secretKey.trim();
  // Check if 64-character hex string (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // Check if 44-character base64 string that decodes to 32 bytes
  try {
    const b64 = Buffer.from(trimmed, 'base64');
    if (b64.length === 32 && b64.toString('base64') === trimmed) {
      return b64;
    }
  } catch {
    // fallback to hash
  }

  // If already exactly 32 bytes ASCII/UTF-8
  const utf8Buf = Buffer.from(trimmed, 'utf8');
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }

  // Guarantee exactly 32 bytes via SHA-256
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Format: iv:authTag:ciphertext (all in hex format)
 */
export function encryptAesGcm(text: string, secretKey: string | Buffer): string {
  if (text === undefined || text === null) {
    return '';
  }

  const key = deriveKey(secretKey);
  // 12-byte Initialization Vector (IV) recommended for GCM
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string formatted as iv:authTag:ciphertext.
 */
export function decryptAesGcm(encryptedStr: string, secretKey: string | Buffer): string {
  if (!encryptedStr) {
    return '';
  }

  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = deriveKey(secretKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
