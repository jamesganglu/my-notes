# Note Taker

A local web app for managing personal notes, backed by SQLite.

Note types:

- **Plain text**
- **Markdown** — live preview while editing
- **Code snippets** — syntax highlighting and a copy button
- **Passwords** — username/URL fields, hidden until revealed, password generator; encrypted at rest (AES-256-GCM); revealing or copying needs a PIN (server-checked, scrypt-hashed, with lockout after repeated wrong PINs)
- **Change logs** — versions with Added/Changed/Fixed/… entries in [Keep a Changelog](https://keepachangelog.com) format; copy as Markdown
- **To-do lists** — tick items off from the view, optional due dates with overdue highlighting, progress bar

Every note has a title, a category and tags. Notes can be filtered by type, category and tag, and searched.

See the **[User Manual](docs/USER_MANUAL.md)** for a full guide to using the app.

## Getting started

Requires **Node.js 10.12 – 18**. The app uses Express 4 and `better-sqlite3` 7.6.2, whose ready-made builds cover Node 10 to 18 on Windows, Linux (x64, ARM, Alpine) and macOS. Node.js 20 and newer are not supported, because `better-sqlite3` 7.6.2 has no builds for them.

`npm install` warns that `marked` and `@highlightjs/cdn-assets` want a newer Node. Those packages are only served to the browser and never run in Node, so the warnings can be ignored.

```sh
npm install
npm start        # http://127.0.0.1:3000
npm run dev      # auto-restart on changes (nodemon)
npm run reset-pin  # forgot the PIN? removes it (passwords are unaffected)
```

## Configuration

| Variable         | Default            | Purpose                                                    |
| ---------------- | ------------------ | ---------------------------------------------------------- |
| `PORT`           | `3000`             | HTTP port                                                  |
| `HOST`           | `127.0.0.1`        | Bind address (there is no login — keep it local)           |
| `NOTES_DATA_DIR` | `./data`           | Where `notes.db` and `secret.key` are stored               |
| `NOTES_SECRET`   | _(key file)_       | Passphrase for password encryption instead of `secret.key` |

Data lives in `data/notes.db`. Password notes are encrypted with a key from `data/secret.key`, which is generated on first run (or derived from `NOTES_SECRET`). If the key is lost, saved passwords can't be recovered, so back up the whole `data/` folder.

## API

| Method | Path                       | Description                                            |
| ------ | -------------------------- | ------------------------------------------------------ |
| GET    | `/api/notes`               | List notes; query params `q`, `type`, `category`, `tag` |
| GET    | `/api/notes/:id`           | Get a note (password content is always `null`)          |
| POST   | `/api/notes/:id/reveal`    | Body `{ pin }` → `{ content }`: the decrypted password. 401 wrong PIN, 409 no PIN set, 429 locked out (with `Retry-After`) |
| GET    | `/api/pin`                 | `{ set }`: whether a PIN exists                        |
| POST   | `/api/pin`                 | Body `{ pin }` to create the PIN, or `{ pin, currentPin }` to change it |
| POST   | `/api/notes`               | Create a note                                          |
| PUT    | `/api/notes/:id`           | Update a note                                          |
| DELETE | `/api/notes/:id`           | Delete a note                                          |
| GET    | `/api/categories`          | Categories with note counts                            |
| GET    | `/api/tags`                | Tags with note counts                                  |
| GET    | `/api/export/postgres/schema` | PostgreSQL schema (`CREATE TABLE …`) as a `.sql` download |
| GET    | `/api/export/postgres/dump`   | PostgreSQL schema + all data as a `.sql` download    |
