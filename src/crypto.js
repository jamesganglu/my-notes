const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';

// Key comes from NOTES_SECRET (any string, hashed to 32 bytes) or a generated key file.
function loadKey(dataDir) {
  if (process.env.NOTES_SECRET) {
    return crypto.createHash('sha256').update(process.env.NOTES_SECRET).digest();
  }
  const keyFile = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
}

function createCipher(key) {
  return {
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(ALGO, key, iv);
      const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      return ['enc', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
    },
    decrypt(payload) {
      if (typeof payload !== 'string' || !payload.startsWith('enc:')) return payload;
      const [, iv, tag, data] = payload.split(':');
      const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}

module.exports = { loadKey, createCipher };
