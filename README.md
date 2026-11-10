# Note Taker

A local web app for managing personal notes, backed by SQLite.

Note types:

- **Plain text**
- **Markdown** — live preview while editing
- **Code snippets** — syntax highlighting and a copy button
- **Passwords** — username/URL fields, hidden until revealed, password generator; encrypted at rest (AES-256-GCM)

Every note has a title, a category and tags. Notes can be filtered by type, category and tag, and searched.

## Getting started

Requires Node.js 20+.

```sh
npm install
npm start        # http://127.0.0.1:3000
npm run dev      # auto-restart on changes
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
| GET    | `/api/notes/:id`           | Get a note; add `?reveal=1` to decrypt a password       |
| POST   | `/api/notes`               | Create a note                                          |
| PUT    | `/api/notes/:id`           | Update a note                                          |
| DELETE | `/api/notes/:id`           | Delete a note                                          |
| GET    | `/api/categories`          | Categories with note counts                            |
| GET    | `/api/tags`                | Tags with note counts                                  |
