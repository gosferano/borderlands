/*
  MIT License

  Copyright (c) 2025 Miles Miller

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

/**
 * Borderlands 4 Save File Cryptography Utilities
 * Implements AES-ECB encryption with user-specific key derivation, PKCS7 padding, and zlib compression
 */

// Base encryption key used for derivation
const BASE_KEY = new Uint8Array([
  0x35, 0xec, 0x33, 0x77, 0xf3, 0x5d, 0xb0, 0xea, 0xbe, 0x6b, 0x83, 0x11, 0x54, 0x03, 0xeb, 0xfb,
  0x27, 0x25, 0x64, 0x2e, 0xd5, 0x49, 0x06, 0x29, 0x05, 0x78, 0xbd, 0x60, 0xba, 0x4a, 0xa7, 0x87,
]);

/**
 * Converts a string to UTF-16 little-endian byte array
 */
function utf16leBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push(code & 0xff, (code >> 8) & 0xff);
  }
  return bytes;
}

/**
 * Derives an encryption key from the user's platform ID
 * Supports both Steam IDs (64-bit numbers) and Epic IDs (strings)
 */
export function deriveKey(userID: string): Uint8Array {
  const k = new Uint8Array(BASE_KEY);
  let uid_bytes: number[];

  if (/^\d{17,}$/.test(userID)) {
    // Steam ID: treat as 8-byte little-endian
    let sid = BigInt(userID);
    uid_bytes = [];
    for (let i = 0; i < 8; i++) {
      uid_bytes.push(Number(sid & 0xffn));
      sid >>= 8n;
    }
  } else {
    // Epic ID: UTF-16LE bytes
    uid_bytes = utf16leBytes(userID);
  }

  for (let i = 0; i < Math.min(k.length, uid_bytes.length); i++) {
    k[i] ^= uid_bytes[i];
  }
  return k;
}

/**
 * Removes PKCS7 padding from a buffer
 */
export function pkcs7Unpad(buf: Uint8Array): Uint8Array<ArrayBuffer> {
  const pad = buf[buf.length - 1];
  // Check that all pad bytes are the same
  for (let i = 1; i <= pad; i++) {
    if (buf[buf.length - i] !== pad) {
      console.warn('PKCS7 unpad failed, returning padded data');
      return new Uint8Array(buf);
    }
  }
  // Create a new Uint8Array with the correct length
  const unpadded = new Uint8Array(buf.length - pad);
  unpadded.set(buf.subarray(0, buf.length - pad));
  return unpadded;
}

/**
 * Adds PKCS7 padding to a buffer
 */
export function pkcs7Pad(buf: Uint8Array, blockSize = 16): Uint8Array {
  const pad = blockSize - (buf.length % blockSize);
  const out = new Uint8Array(buf.length + pad);
  out.set(buf);
  out.fill(pad, buf.length);
  return out;
}

/**
 * Converts Uint8Array to CryptoJS WordArray (matching original implementation)
 */
function uint8ArrayToWordArray(u8arr: Uint8Array) {
  const words = [];
  const len = u8arr.length;
  for (let i = 0; i < len; i += 4) {
    words.push((u8arr[i] << 24) | (u8arr[i + 1] << 16) | (u8arr[i + 2] << 8) | u8arr[i + 3]);
  }
  return (window as any).CryptoJS.lib.WordArray.create(words, len);
}

/**
 * Decrypts a .sav file and returns the YAML content
 * Process: AES decrypt -> PKCS7 unpad -> zlib decompress -> YAML
 */
export async function decryptSave(fileArrayBuffer: ArrayBuffer, userID: string): Promise<string> {
  if (!userID) {
    throw new Error('Please enter platform user ID (Steam or Epic)');
  }

  // These will be loaded from CDN in the component
  const CryptoJS = (window as any).CryptoJS;
  const pako = (window as any).pako;

  if (!CryptoJS || !pako) {
    throw new Error('Required libraries not loaded');
  }

  const ciph = new Uint8Array(fileArrayBuffer);
  const keyBytes = deriveKey(userID);

  // Convert to CryptoJS format using the proper method
  const keyWordArray = uint8ArrayToWordArray(keyBytes);
  const ciphWordArray = uint8ArrayToWordArray(ciph);

  // Decrypt with AES-ECB
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: ciphWordArray }, keyWordArray, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  });

  // Convert back to Uint8Array
  let pt = new Uint8Array(decrypted.words.length * 4);
  for (let i = 0; i < decrypted.words.length; i++) {
    pt.set(
      [
        (decrypted.words[i] >> 24) & 0xff,
        (decrypted.words[i] >> 16) & 0xff,
        (decrypted.words[i] >> 8) & 0xff,
        decrypted.words[i] & 0xff,
      ],
      i * 4
    );
  }
  // Remove possible extra bytes
  const trimmed = new Uint8Array(ciph.length);
  trimmed.set(pt.subarray(0, ciph.length));
  pt = trimmed;

  // Unpad PKCS7
  pt = pkcs7Unpad(pt);

  // After unpadding, try zlib inflate with different trims
  // Files may have 4 or 8 extra bytes at the end after padding
  let trimOptions = [4, 8];
  let inflated: Uint8Array | null = null;
  let trimUsed = null;

  for (let trim of trimOptions) {
    try {
      const candidateLen = pt.length - trim;
      const candidate = new Uint8Array(candidateLen);
      candidate.set(pt.subarray(0, candidateLen));

      // Check for zlib header
      if (candidate[0] !== 0x78) continue;

      inflated = pako.inflate(candidate) as Uint8Array;
      trimUsed = trim;
      break;
    } catch (e) {
      // Try next trim value
    }
  }

  if (!inflated) {
    throw new Error('Zlib decompress failed. Wrong user ID or file format?');
  }

  console.log(`Successfully decompressed with trim=${trimUsed}`);

  // Convert to string
  return new TextDecoder().decode(inflated);
}

/**
 * Encrypts YAML content to .sav file format
 * Process: zlib compress -> append checksum -> PKCS7 pad -> AES encrypt
 */
export async function encryptSave(yamlContent: string, userID: string): Promise<Blob> {
  if (!userID) {
    throw new Error('Please enter platform user ID (Steam or Epic)');
  }

  const CryptoJS = (window as any).CryptoJS;
  const pako = (window as any).pako;

  if (!CryptoJS || !pako) {
    throw new Error('Required libraries not loaded');
  }

  const yamlBytes = new TextEncoder().encode(yamlContent);

  // Compress with zlib
  const comp = pako.deflate(yamlBytes, { level: 9 }) as Uint8Array;

  // Compute adler32 checksum
  function adler32(buf: Uint8Array): number {
    let a = 1,
      b = 0;
    for (let i = 0; i < buf.length; i++) {
      a = (a + buf[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  const adler = adler32(yamlBytes);
  const uncompressedLen = yamlBytes.length;

  // Append adler32 and uncompressed length (both little-endian, 4 bytes each)
  const packed = new Uint8Array(comp.length + 8);
  packed.set(comp, 0);

  // Write adler32
  packed[comp.length + 0] = adler & 0xff;
  packed[comp.length + 1] = (adler >> 8) & 0xff;
  packed[comp.length + 2] = (adler >> 16) & 0xff;
  packed[comp.length + 3] = (adler >> 24) & 0xff;

  // Write uncompressed length
  packed[comp.length + 4] = uncompressedLen & 0xff;
  packed[comp.length + 5] = (uncompressedLen >> 8) & 0xff;
  packed[comp.length + 6] = (uncompressedLen >> 16) & 0xff;
  packed[comp.length + 7] = (uncompressedLen >> 24) & 0xff;

  // Add PKCS7 padding
  const pt_padded = pkcs7Pad(packed);

  // Derive encryption key
  const keyBytes = deriveKey(userID);
  const keyWordArray = uint8ArrayToWordArray(keyBytes);

  // Encrypt with AES-ECB
  const ptWordArray = uint8ArrayToWordArray(pt_padded);
  const encrypted = CryptoJS.AES.encrypt(ptWordArray, keyWordArray, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  });

  // Convert to Uint8Array
  const encBytes = new Uint8Array(encrypted.ciphertext.words.length * 4);
  for (let i = 0; i < encrypted.ciphertext.words.length; i++) {
    encBytes.set(
      [
        (encrypted.ciphertext.words[i] >> 24) & 0xff,
        (encrypted.ciphertext.words[i] >> 16) & 0xff,
        (encrypted.ciphertext.words[i] >> 8) & 0xff,
        encrypted.ciphertext.words[i] & 0xff,
      ],
      i * 4
    );
  }

  return new Blob([encBytes], { type: 'application/octet-stream' });
}

/**
 * Download a file to the user's computer
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
