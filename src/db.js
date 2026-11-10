const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { loadKey, createCipher } = require('./crypto');
const { postgresSchema, postgresDump } = require('./postgres');

const NOTE_TYPES = ['text', 'code', 'password', 'markdown', 'changelog', 'todo'];
// Keep a Changelog sections, in display order.
const CHANGE_KINDS = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];

// String value of v, or '' for null/undefined.
const str = (v) => (v == null ? '' : String(v));
const isObject = (v) => v != null && typeof v === 'object';

const typeList = NOTE_TYPES.map((t) => `'${t}'`).join(',');
const notesTableSql = (name) => `
  CREATE TABLE ${name} (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN (${typeList})),
    content    TEXT NOT NULL DEFAULT '',  -- JSON for changelog and todo notes
    category   TEXT NOT NULL DEFAULT '',
    language   TEXT,            -- code notes
    username   TEXT,            -- password notes
    url        TEXT,            -- password notes
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

// SQLite can't alter a CHECK constraint, so when NOTE_TYPES changes the notes table
// is rebuilt (https://www.sqlite.org/lang_altertable.html#otheralter). A backup is
// written next to the database first.
function migrateNoteTypes(db, dbFile) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes'").get();
  if (!row) return;
  const match = /CHECK\s*\(\s*type\s+IN\s*\(([^)]*)\)\s*\)/i.exec(row.sql);
  const current = match && match[1].replace(/\s/g, '');
  if (current === typeList) return;

  const backup = dbFile.replace(/\.db$/, '') + `.backup-${Date.now()}.db`;
  db.prepare('VACUUM INTO ?').run(backup);
  console.log(`Upgrading notes table for new note types (backup saved to ${backup})`);

  db.pragma('foreign_keys = OFF'); // otherwise dropping notes would cascade-delete note_tags
  try {
    db.transaction(() => {
      // Preserve the AUTOINCREMENT high-water mark so ids of deleted notes aren't reused.
      const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'notes'").pluck().get();
      db.exec(`${notesTableSql('notes_new')};
        INSERT INTO notes_new (id, title, type, content, category, language, username, url, created_at, updated_at)
          SELECT id, title, type, content, category, language, username, url, created_at, updated_at FROM notes;
        DROP TABLE notes;
        ALTER TABLE notes_new RENAME TO notes;`);
      if (seq != null) db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'notes'").run(seq);
      if (db.pragma('foreign_key_check').length) throw new Error('Foreign key check failed after migration');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function openStore(dataDir = path.join(__dirname, '..', 'data')) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, 'notes.db');
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const cipher = createCipher(loadKey(dataDir));

  migrateNoteTypes(db, dbFile);
  db.exec(`
    ${notesTableSql('IF NOT EXISTS notes')};
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
    const title = str(input.title).trim();
    if (!title) throw new ValidationError('title is required');
    let content = str(input.content);
    if (type === 'password') content = cipher.encrypt(content);
    if (type === 'changelog') content = JSON.stringify(normalizeChangelog(input.content));
    if (type === 'todo') content = JSON.stringify(normalizeTodo(input.content));
    return {
      title,
      type,
      content,
      category: str(input.category).trim(),
      language: type === 'code' ? (str(input.language).trim() || null) : null,
      username: type === 'password' ? (str(input.username).trim() || null) : null,
      url: type === 'password' ? (str(input.url).trim() || null) : null,
    };
  }

  function parseTags(tags) {
    const list = Array.isArray(tags) ? tags : str(tags).split(',');
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
        // Changelog and todo content is JSON, so only its text fields are searched (not keys).
        const like = (expr) => `${expr} LIKE @q ESCAPE '\\'`;
        where.push(`(${like('n.title')} OR ${like('n.category')} OR ${like('n.username')} OR ${like('n.url')}
          OR (n.type IN ('text', 'markdown', 'code') AND ${like('n.content')})
          OR (n.type = 'todo' AND json_valid(n.content) AND EXISTS (
                SELECT 1 FROM json_each(n.content, '$.items') i
                WHERE ${like("json_extract(i.value, '$.text')")} OR ${like("json_extract(i.value, '$.due')")}))
          OR (n.type = 'changelog' AND json_valid(n.content) AND EXISTS (
                SELECT 1 FROM json_each(n.content, '$.entries') e
                WHERE ${like("json_extract(e.value, '$.version')")} OR ${like("json_extract(e.value, '$.date')")}
                   OR EXISTS (SELECT 1 FROM json_each(e.value, '$.changes') c WHERE ${like("json_extract(c.value, '$.text')")})))
          OR EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                     WHERE nt.note_id = n.id AND ${like('t.name')}))`);
        // Match % and _ literally rather than as LIKE wildcards.
        params.q = `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;
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
    postgresSchema: () => postgresSchema(NOTE_TYPES),
    // Read inside one transaction so the dump is a consistent snapshot.
    postgresDump: db.transaction(() => postgresDump(db, NOTE_TYPES)),
    close: () => db.close(),
  };
}

// Structured note content may arrive as an object or a JSON string.
function parseJsonContent(content, type) {
  if (typeof content !== 'string' && content != null) return content;
  try {
    return content ? JSON.parse(content) : {};
  } catch {
    throw new ValidationError(`${type} content must be valid JSON`);
  }
}

// Changelog content is { entries: [{ version, date, changes: [{ kind, text }] }] }, newest
// version first. A blank version means "Unreleased".
function normalizeChangelog(content) {
  const data = parseJsonContent(content, 'changelog');
  const entries = isObject(data) && Array.isArray(data.entries) ? data.entries : [];
  return {
    entries: entries
      .filter(isObject)
      .map((e) => ({
        version: str(e.version).trim(),
        date: str(e.date).trim(),
        changes: (Array.isArray(e.changes) ? e.changes : [])
          .filter(isObject)
          .map((c) => ({
            kind: CHANGE_KINDS.includes(c.kind) ? c.kind : 'changed',
            text: str(c.text).trim(),
          }))
          .filter((c) => c.text),
      }))
      .filter((e) => e.version || e.date || e.changes.length),
  };
}

// Todo content is { items: [{ text, done, due }] }; due is YYYY-MM-DD or blank.
function normalizeTodo(content) {
  const data = parseJsonContent(content, 'todo');
  const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
  return {
    items: items
      .filter(isObject)
      .map((i) => ({
        text: str(i.text).trim(),
        done: i.done === true,
        due: /^\d{4}-\d{2}-\d{2}$/.test(i.due) ? i.due : '',
      }))
      .filter((i) => i.text),
  };
}

class ValidationError extends Error {}

module.exports = { openStore, ValidationError, NOTE_TYPES, CHANGE_KINDS };
