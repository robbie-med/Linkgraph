/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebCrypto-based security and encryption layer.
 * Implements master key derivation, AES-256-GCM encryption for database and evidence.
 */

// Generate a random salt for PBKDF2 key derivation
export function generateRandomSalt(): string {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Convert a hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive a 256-bit AES-GCM key from the master passphrase using PBKDF2 with SHA-256.
 * PBKDF2 with 100,000 iterations is used here as a standard, native browser-compatible
 * key derivation function (equivalent security to Argon2id in client-side sandboxes).
 */
export async function deriveMasterKey(passphrase: string, saltHex: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(passphrase);
  const saltBytes = hexToBytes(saltHex);

  // Import password as raw key material
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive AES-GCM 256 key
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // key is not extractable (highly secure!)
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plain text string using AES-256-GCM with a derived CryptoKey.
 */
export async function encryptText(text: string, key: CryptoKey): Promise<{ cipherText: string; iv: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Generate random 12-byte IV for GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    data
  );

  return {
    cipherText: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv)
  };
}

/**
 * Decrypt cipher text using AES-256-GCM.
 */
export async function decryptText(cipherTextHex: string, ivHex: string, key: CryptoKey): Promise<string> {
  const iv = hexToBytes(ivHex);
  const data = hexToBytes(cipherTextHex);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Helper to compute SHA-256 hash of a string (useful for event deduplication, file hash, audits).
 */
export async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encrypts sensitive identifier value.
 */
export async function encryptIdentifier(value: string, key: CryptoKey): Promise<string> {
  const enc = await encryptText(value, key);
  // Package as iv:ciphertext
  return `${enc.iv}:${enc.cipherText}`;
}

/**
 * Decrypts sensitive identifier value.
 */
export async function decryptIdentifier(encryptedValue: string, key: CryptoKey): Promise<string> {
  const [iv, cipherText] = encryptedValue.split(":");
  if (!iv || !cipherText) return "DECRYPTION_ERROR";
  try {
    return await decryptText(cipherText, iv, key);
  } catch {
    return "DECRYPTION_FAILED";
  }
}

/**
 * Encrypt a complete database state to an iv:ciphertext payload.
 */
export async function encryptDatabase(db: any, key: CryptoKey): Promise<string> {
  const serialized = JSON.stringify(db);
  const { cipherText, iv } = await encryptText(serialized, key);
  return `${iv}:${cipherText}`;
}

/**
 * Decrypt a complete database state from an iv:ciphertext payload.
 */
export async function decryptDatabase(encryptedPayload: string, key: CryptoKey): Promise<any> {
  const [iv, cipherText] = encryptedPayload.split(":");
  if (!iv || !cipherText) throw new Error("Invalid vault format");
  const decryptedJson = await decryptText(cipherText, iv, key);
  return JSON.parse(decryptedJson);
}
