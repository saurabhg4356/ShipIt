const crypto = require('crypto');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHABET_LENGTH = ALPHABET.length; // 62
const SHORT_CODE_REGEX = /^[a-zA-Z0-9]{4,16}$/;

/**
 * Generate a cryptographically secure, collision-resistant, URL-safe base62 string.
 * Uses rejection sampling to eliminate modulo bias.
 * 
 * @param {number} length - Desired code length (default 6)
 * @returns {string} - Generated short code
 */
function generateShortCode(length = 6) {
  let result = '';
  // Each base62 character needs a random value in [0, 61].
  // 256 - (256 % 62) = 248. Values >= 248 are discarded to prevent modulo bias.
  const maxValidByte = 256 - (256 % ALPHABET_LENGTH);

  while (result.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      const byte = bytes[i];
      if (byte < maxValidByte) {
        result += ALPHABET[byte % ALPHABET_LENGTH];
      }
    }
  }

  return result;
}

/**
 * Validates whether a short code matches expected format (alphanumeric, 4-16 chars)
 * 
 * @param {string} code
 * @returns {boolean}
 */
function isValidShortCode(code) {
  if (typeof code !== 'string') return false;
  return SHORT_CODE_REGEX.test(code);
}

module.exports = {
  generateShortCode,
  isValidShortCode,
  ALPHABET,
};
