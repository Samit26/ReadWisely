// Client-side encryption helpers using the Web Crypto API.
// All sync data is encrypted before leaving the browser — the passphrase
// is never stored. Uses PBKDF2 for key derivation and AES-GCM for encryption.

const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH = 16   // bytes
const IV_LENGTH = 12     // bytes (AES-GCM recommended)

// ---- Helpers --------------------------------------------------------------

export function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
export const base64ToBuffer = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)).buffer

function getRandomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n))
}

// ---- Key Derivation -------------------------------------------------------

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// ---- Encrypt / Decrypt ----------------------------------------------------

/**
 * Encrypt a plaintext string. Returns an object with base64-encoded
 * iv, salt, and ciphertext — safe to JSON-stringify and upload.
 */
export async function encrypt(passphrase, plaintext) {
  const enc = new TextEncoder()
  const salt = getRandomBytes(SALT_LENGTH)
  const iv = getRandomBytes(IV_LENGTH)
  const key = await deriveKey(passphrase, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )

  return {
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    ciphertext: bufferToBase64(ciphertext)
  }
}

/**
 * Decrypt a payload produced by `encrypt()`. Returns the original plaintext string.
 * Throws on wrong passphrase or corrupted data.
 */
export async function decrypt(passphrase, { iv, salt, ciphertext }) {
  const dec = new TextDecoder()
  const key = await deriveKey(passphrase, base64ToBuffer(salt))

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(iv)) },
    key,
    base64ToBuffer(ciphertext)
  )

  return dec.decode(plain)
}
