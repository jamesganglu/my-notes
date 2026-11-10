// PIN that guards revealing/copying passwords. Stored as a salted scrypt hash, with a
// limiter that locks out guessing after repeated wrong PINs.
const crypto = require('crypto');

const PIN_PATTERN = /^\d{4,8}$/;

class PinError extends Error {
  constructor(message, status, extra) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

function pinMatches(pin, stored) {
  const parts = String(stored).split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'base64');
  const actual = crypto.scryptSync(String(pin), Buffer.from(parts[1], 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// After maxAttempts consecutive failures, each further failure locks for baseLockMs,
// doubling every time (capped at maxLockMs). A correct PIN resets everything.
function createLimiter({ maxAttempts = 5, baseLockMs = 30 * 1000, maxLockMs = 15 * 60 * 1000, now = Date.now } = {}) {
  let failures = 0;
  let lockedUntil = 0;
  return {
    check() {
      const wait = lockedUntil - now();
      if (wait > 0) {
        const seconds = Math.ceil(wait / 1000);
        throw new PinError(`Too many wrong PINs. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`, 429, { retryAfter: seconds });
      }
    },
    fail() {
      failures += 1;
      if (failures >= maxAttempts) {
        lockedUntil = now() + Math.min(baseLockMs * 2 ** (failures - maxAttempts), maxLockMs);
      }
      return Math.max(0, maxAttempts - failures);
    },
    succeed() {
      failures = 0;
      lockedUntil = 0;
    },
  };
}

module.exports = { PIN_PATTERN, PinError, hashPin, pinMatches, createLimiter };
