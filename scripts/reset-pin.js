// Removes the PIN so a new one can be created the next time a password is revealed.
// Passwords are unaffected: they're encrypted with the key file, not the PIN.
// Usage: npm run reset-pin   (honours NOTES_DATA_DIR like the server)
const { openStore } = require('../src/db');

const store = openStore(process.env.NOTES_DATA_DIR);
const removed = store.clearPin();
store.close();
console.log(removed
  ? 'PIN removed. You will be asked to create a new PIN the next time you reveal or copy a password.'
  : 'No PIN was set.');
