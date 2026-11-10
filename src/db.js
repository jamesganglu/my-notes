const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { loadKey, createCipher } = require('./crypto');

const NOTE_TYPES = ['text', 'code', 'password', 'markdown'];

function openStore(dataDir = path.join(__dirname, '..', 'data')) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'notes.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const cipher = createCipher(loadKey(dataDir));

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('text','code','password','markdown')),
      content    TEXT NOT NULL DEFAULT '',
      category   TEXT NOT NULL DEFAULT '',
      language   TEXT,            -- code notes
      username   TEXT,            -- password notes
      url        TEXT,            -- password notes
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
    CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
  `);

  const stmts = {
    insert: db.prepare(`INSERT INTO notes (title, type, content, category, language, username, url)
                        VALUES (@title, @type, @content, @category, @language, @username, @url)`),
    update: db.prepare(`UPDATE notes SET title=@title, type=@type, content=@content, category=@category,
                        language=@language, username=@username, url=@url, updated_at=datetime('now')
                        WHERE id=@id`),
    remove: db.prepare('DELETE FROM notes WHERE id = ?'),
    get: db.prepare('SELECT * FROM notes WHERE id = ?'),
    tagsFor: db.prepare(`SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
                         WHERE nt.note_id = ? ORDER BY t.name`),
    upsertTag: db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING'),
    tagId: db.prepare('SELECT id FROM tags WHERE name = ?'),
    linkTag: db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)'),
    clearTags: db.prepare('DELETE FROM note_tags WHERE note_id = ?'),
    pruneTags: db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)'),
    categories: db.prepare(`SELECT category AS name, COUNT(*) AS count FROM notes
                            WHERE category <> '' GROUP BY category ORDER BY category COLLATE NOCASE`),
    tags: db.prepare(`SELECT t.name, COUNT(nt.note_id) AS count FROM tags t
                      JOIN note_tags nt ON nt.tag_id = t.id GROUP BY t.id ORDER BY t.name`),
  };

  function normalize(input) {
    const type = NOTE_TYPES.includes(input.type) ? input.type : null;
    if (!type) throw new ValidationError(`type must be one of: ${NOTE_TYPES.join(', ')}`);
    const title = String(input.title ?? '').trim();
    if (!title) throw new ValidationError('title is required');
    const content = String(input.content ?? '');
    return {
      title,
      type,
      content: type === 'password' ? cipher.encrypt(content) : content,
      category: String(input.category ?? '').trim(),
      language: type === 'code' ? (String(input.language ?? '').trim() || null) : null,
      username: type === 'password' ? (String(input.username ?? '').trim() || null) : null,
      url: type === 'password' ? (String(input.url ?? '').trim() || null) : null,
    };
  }

  function parseTags(tags) {
    const list = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
    return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
  }

  function setTags(noteId, tags) {
    stmts.clearTags.run(noteId);
    for (const name of parseTags(tags)) {
      stmts.upsertTag.run(name);
      stmts.linkTag.run(noteId, stmts.tagId.get(name).id);
    }
    stmts.pruneTags.run();
  }

  function hydrate(row, { reveal = false } = {}) {
    if (!row) return null;
    const note = { ...row, tags: stmts.tagsFor.all(row.id).map((t) => t.name) };
    if (note.type === 'password') note.content = reveal ? cipher.decrypt(note.content) : null;
    return note;
  }

  return {
    list({ q, type, category, tag } = {}) {
      const where = [];
      const params = {};
      if (type) { where.push('n.type = @type'); params.type = type; }
      if (category) { where.push('n.category = @category'); params.category = category; }
      if (tag) {
        where.push(`EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                    WHERE nt.note_id = n.id AND t.name = @tag)`);
        params.tag = String(tag).toLowerCase();
      }
      if (q) {
        // Password content is encrypted, so only its title/username/url/tags are searchable.
        where.push(`(n.title LIKE @q OR n.category LIKE @q OR n.username LIKE @q OR n.url LIKE @q
                     OR (n.type <> 'password' AND n.content LIKE @q)
                     OR EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                                WHERE nt.note_id = n.id AND t.name LIKE @q))`);
        params.q = `%${q}%`;
      }
      const sql = `SELECT n.* FROM notes n ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY n.updated_at DESC, n.id DESC`;
      return db.prepare(sql).all(params).map((r) => hydrate(r));
    },
    get(id, opts) {
      return hydrate(stmts.get.get(id), opts);
    },
    create: db.transaction((input) => {
      const { lastInsertRowid } = stmts.insert.run(normalize(input));
      setTags(lastInsertRowid, input.tags);
      return hydrate(stmts.get.get(lastInsertRowid));
    }),
    update: db.transaction((id, input) => {
      const existing = stmts.get.get(id);
      if (!existing) return null;
      // Allow editing a password note without resending the secret.
      if (input.type === 'password' && existing.type === 'password' && input.content == null) {
        input = { ...input, content: cipher.decrypt(existing.content) };
      }
      stmts.update.run({ ...normalize(input), id });
      setTags(id, input.tags);
      return hydrate(stmts.get.get(id));
    }),
    remove: db.transaction((id) => {
      const { changes } = stmts.remove.run(id);
      stmts.pruneTags.run();
      return changes > 0;
    }),
    categories: () => stmts.categories.all(),
    tags: () => stmts.tags.all(),
    close: () => db.close(),
  };
}

class ValidationError extends Error {}

module.exports = { openStore, ValidationError, NOTE_TYPES };
