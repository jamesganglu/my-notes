# Note Taker — User Manual

Note Taker is a personal notes app that runs on your own computer and opens in your web browser. It keeps six kinds of notes — plain text, Markdown, code snippets, passwords, change logs and to-do lists — and lets you organise them with categories and tags.

## Contents

1. [Installing and starting](#1-installing-and-starting)
2. [The screen at a glance](#2-the-screen-at-a-glance)
3. [Creating a note](#3-creating-a-note)
4. [Note types](#4-note-types)
5. [Categories and tags](#5-categories-and-tags)
6. [Finding notes](#6-finding-notes)
7. [Editing and deleting](#7-editing-and-deleting)
8. [Your data and backups](#8-your-data-and-backups)
9. [Security notes](#9-security-notes)
10. [Settings](#10-settings)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Installing and starting

You need [Node.js](https://nodejs.org) version 20 or newer.

**First time only** — open a terminal in the project folder and install the dependencies:

```sh
npm install
```

**Every time you want to use it:**

```sh
npm start
```

Then open **http://127.0.0.1:3000** in your browser. Leave the terminal window open while you use the app; closing it (or pressing `Ctrl+C`) stops the app. Your notes are saved as you go, so stopping the app never loses anything.

---

## 2. The screen at a glance

The window has three columns:

| Column | What it holds |
| --- | --- |
| **Sidebar** (left) | The **+ New note** button, the search box, and filters for **Type**, **Categories** and **Tags**. |
| **Note list** (middle) | The notes that match your current search and filters, newest-edited first. Each entry shows its type badge, title, category and a preview of the content. When a filter is active, a summary line at the top shows how many notes match. |
| **Detail pane** (right) | The selected note, or the editor when you are creating or changing a note. |

On a narrow window (such as a phone) the columns stack on top of each other.

---

## 3. Creating a note

1. Click **+ New note**.
2. Enter a **Title** — this is the only required field.
3. Choose the note **type**: Plain text, Markdown, Code snippet, Password, Change log or To-do list. The form changes to show the fields for that type.
4. Optionally choose a **Category** from the dropdown, or pick **+ New category…** to add one (see [Categories and tags](#5-categories-and-tags)).
5. Optionally choose **tags** (see [Categories and tags](#5-categories-and-tags)).
6. Fill in the content and click **Save**. Click **Cancel** to discard.

> **Tip:** If a type or category filter is active when you click **+ New note**, the new note starts with that type and category already filled in.

In the content box, pressing **Tab** inserts two spaces instead of moving to the next field, which is handy for indenting code.

---

## 4. Note types

### Plain text

Shown exactly as typed, including line breaks and spacing.

### Markdown

Write using [Markdown](https://www.markdownguide.org/basic-syntax/) — `# headings`, `**bold**`, `- lists`, `[links](https://example.com)`, tables, and fenced code blocks. While editing, a live **preview** appears below the text box. When viewing, the note is shown formatted; code blocks are syntax-highlighted and each has a **Copy** button.

### Code snippet

Enter the code and, optionally, the **Language** (for example `javascript`, `python`, `sql`, `bash`, `json`). When viewing, the code is syntax-highlighted and a **Copy** button copies the whole snippet. If the language is left blank or isn't recognised, the app guesses it.

### Password

A password note has these fields instead of a content box:

| Field | Notes |
| --- | --- |
| **Username / email** | Optional. |
| **URL** | Optional. Shown as a clickable link that opens in a new tab. |
| **Password** | Hidden as you type. Click **Show** to see it, or **Generate** to create a strong random 20-character password. |

When viewing a password note, the password is masked (`••••••••`). Click **Reveal** to show it, **Hide** to mask it again, or **Copy** to copy it to the clipboard without displaying it. The username also has a **Copy** button.

Passwords are stored **encrypted** in the database. See [Security notes](#9-security-notes).

### Change log

A change log records the versions of a project and what changed in each one, following the [Keep a Changelog](https://keepachangelog.com) format. Use one change log note per project.

Each version has:

| Field | Notes |
| --- | --- |
| **Version** | e.g. `1.2.0`. Leave blank for changes that aren't released yet — shown as **Unreleased**. |
| **Date** | Filled in with today's date when you add a version; change it with the date picker. |
| **Changes** | A list of changes, each with a label and a description. |

The labels are **Added** (new features), **Changed** (changes to existing features), **Deprecated** (features that will be removed), **Removed**, **Fixed** (bug fixes) and **Security** (vulnerability fixes).

**In the editor:**

- Click **+ Add version** to add a new version at the top. The version number is suggested from the previous one — after `1.0.0` it suggests `1.0.1` — and you can change it.
- Choose a label from the dropdown and type the description. Press **Enter** to start another change with the same label, or click **+ Add change**.
- Click **×** to remove a change, or **Remove version** to remove a version with all its changes (you'll be asked to confirm if it has any).
- Empty change rows are ignored when you save.

**When viewing**, versions are shown newest first as a timeline, with each version's changes grouped under their labels. Click **Copy as Markdown** to copy the whole change log in Keep a Changelog format, ready to paste into a project's `CHANGELOG.md`.

The note list shows the latest version, its date and how many changes it has.

### To-do list

A checklist of items. Each item has a description, a **done** checkbox, and an optional **due date**.

**In the editor:**

- Type an item and press **Enter** to start the next one, or click **+ Add item**.
- Press **Backspace** in an empty item to remove it, or click **×** on any item.
- Pick a due date with the date picker if the item has a deadline.
- Paste several lines at once to create one item per line. Markdown checklists work too — `- [x] Bread` becomes a ticked item called *Bread*.
- Empty items are ignored when you save.

**When viewing**, you can tick items off directly — no need to click **Edit**. Each tick is saved straight away. The view also shows:

- A progress bar and a count, e.g. *3 of 5 done*.
- Due dates — **Due today** in yellow, and **Overdue** in red for unfinished items past their due date.
- **Hide completed** to show only what's left (click **Show completed** to bring them back). The app remembers this choice in your browser.
- **Copy as Markdown** to copy the list as a Markdown checklist.

The note list shows how many items are done and how many are overdue.

---

## 5. Categories and tags

Each note can have **one category** and **any number of tags**.

- **Categories** are broad groups, such as *Work*, *Personal* or *Accounts*.
- **Tags** are labels that cut across categories, such as *urgent*, *linux* or *finance*.

### Choosing a category

The category dropdown in the editor lists **No category**, every category you have used before, and **+ New category…** at the bottom. Only one category can be selected.

To add a category, choose **+ New category…**, type the name in the box that appears, and press **Enter** or click **Add**. The new category is selected straight away. Press **Esc** or click **Cancel** to go back without adding. If you type a name that already exists with different capitalisation (e.g. `work` when `Work` exists), the existing category is used.

### Choosing tags

The tag picker in the editor has three parts:

- **Selected tags** — shown as blue chips at the top. Click the **×** on a chip to remove it.
- **List box** — every tag you have used before, with the number of notes that use it. Click a tag to tick or untick it.
- **Filter / add box** — type to narrow the list. To add a new tag, type it and press **Enter**, type a comma, or click **Add tag**. If nothing in the list matches, the list also offers **Create tag "…"**. You can add several at once by typing them separated by commas, e.g. `work, ideas`.

Keyboard shortcuts in the filter box:

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move through the list |
| `Enter` | Tick/untick the highlighted tag, or add what you typed |
| `,` | Add what you typed |
| `Backspace` (box empty) | Remove the last selected tag |

### Good to know

- Tags are always stored in **lowercase**, so `Work` and `work` are the same tag.
- Categories and tags don't need to be set up in advance — they appear as soon as a note uses them, and disappear when no note uses them any more.
- There is no separate rename feature. To rename a category or tag, edit each note that uses it.

---

## 6. Finding notes

### Search

Type in the **Search** box in the sidebar. Results update as you type. Search looks in each note's title, content, category, tags, and — for password notes — the username and URL. For change logs it searches the versions, dates and change descriptions; for to-do lists, the item descriptions and due dates.

The password itself is never searched, because it is encrypted.

### Filters

- **Type** — click *Plain text*, *Markdown*, *Code*, *Passwords*, *Change logs* or *To-do lists*, or *All* to clear.
- **Categories** — click a category to show only its notes, or *All* to clear. The number beside each is how many notes it has.
- **Tags** — click a tag to show only notes with that tag; click it again to clear. You can also click any tag shown on an open note.

Search and filters combine. For example, choosing **Code**, the category **Work** and searching `docker` shows only code notes in *Work* that mention docker. One category and one tag can be active at a time.

---

## 7. Editing and deleting

Open a note, then:

- Click **Edit** to change it, then **Save**. The note moves to the top of the list because the list is sorted by last edit.
- Click **Delete** and confirm. **Deleting can't be undone.**
- Click **Print** to print the note, or choose **Save as PDF** in the print dialog to make a PDF. Only the note is printed — the sidebar, list and buttons are left out — in black on white, and the note title is used as the page heading and suggested file name. For password notes, the password prints masked unless you click **Reveal** before printing. To-do lists always print every item, even if completed items are hidden.

### Changing a note's type

You can change the type of an existing note in the editor. Be aware that:

- Changing a **password** note to another type replaces the password with whatever is in the content box (empty by default), and its username and URL are removed. Copy anything you need first.
- Changing a **code** note to another type removes its language setting.
- Changing a **change log** or **to-do list** to another type removes all of its versions or items, and changing another type to one of these removes the existing text. Copy anything you need first.

---

## 8. Your data and backups

Everything is stored in the `data` folder inside the project:

| File | Purpose |
| --- | --- |
| `notes.db` | The SQLite database holding all your notes. |
| `notes.db-wal`, `notes.db-shm` | Temporary database files that exist while the app is running. |
| `notes.backup-<number>.db` | A backup made automatically when an app update changes the database layout. You can delete these once you're happy everything works. |
| `secret.key` | The key used to encrypt your passwords. Created automatically the first time the app runs. |

### Backing up

1. Stop the app (`Ctrl+C` in its terminal).
2. Copy the **whole `data` folder** somewhere safe.

To restore, stop the app, put the copied `data` folder back, and start the app.

> **Important:** `notes.db` and `secret.key` belong together. Without the matching `secret.key`, saved passwords **can't be recovered** — the rest of your notes will still be readable.

The `data` folder is excluded from Git, so your notes are never uploaded to GitHub.

### Exporting to PostgreSQL

The **Export** section at the bottom of the sidebar has two buttons, each of which downloads a `.sql` file:

| Button | File | What it contains |
| --- | --- | --- |
| **Postgres schema** | `notes-schema.postgres.sql` | The table definitions only (`CREATE TABLE` and indexes), for setting up an empty PostgreSQL database with the same structure. |
| **Postgres dump** | `notes-dump-<date>-<time>.postgres.sql` | The table definitions **plus all your notes, tags and tag links**, ready to restore into an empty PostgreSQL database. |

To load either file, create an empty database and run the file against it, for example:

```sh
createdb notes
psql -d notes -f notes-dump-20261110-182053.postgres.sql
```

You can also open the file in a tool such as pgAdmin or DBeaver and run it there. The dump runs as a single transaction, so if anything goes wrong nothing is half-loaded.

Things to know:

- **Run it on an empty database.** The files create the tables, so they fail if tables called `notes`, `tags` or `note_tags` already exist.
- **Note IDs are kept**, and new notes added in PostgreSQL carry on numbering from where the app left off.
- **Dates and times** are converted to PostgreSQL `timestamptz` values in UTC.
- **Tag names stay unique regardless of capitalisation**, as in the app.
- **Change log and to-do list content is JSON** stored in a text column. In PostgreSQL you can query it with `content::jsonb`.
- **Passwords stay encrypted** in the dump, exactly as stored in the app. They can only be decrypted with your `secret.key` (or `NOTES_SECRET`), so a dump file doesn't expose your passwords on its own. Everything else in the dump is readable text — store it as carefully as your notes.

---

## 9. Security notes

- **Passwords are encrypted** (AES-256-GCM). Someone who gets hold of `notes.db` alone can't read them. Someone who gets the whole `data` folder, including `secret.key`, can — so protect that folder and your backups. To keep the key out of the folder entirely, use `NOTES_SECRET` (see [Settings](#10-settings)).
- **Other note types are not encrypted.** Don't put secrets in plain-text, Markdown or code notes.
- **There is no login.** The app only accepts connections from your own computer, but anyone who can use your computer account can open it while it's running.
- **Don't expose it to your network.** Leave the `HOST` setting at its default unless you add your own protection.
- **Copied passwords stay on the clipboard** until you copy something else.

---

## 10. Settings

Settings are environment variables set before starting the app. All are optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | The port in the address, e.g. `3001` gives `http://127.0.0.1:3001`. |
| `HOST` | `127.0.0.1` | Which network address to listen on. Keep the default (see [Security notes](#9-security-notes)). |
| `NOTES_DATA_DIR` | `./data` | Folder for the database and key file. |
| `NOTES_SECRET` | *(not set)* | A passphrase used as the encryption key instead of `secret.key`. |

Examples:

```powershell
# Windows PowerShell
$env:PORT = "3001"; npm start
```

```sh
# macOS / Linux / Git Bash
PORT=3001 npm start
```

> **Warning about `NOTES_SECRET`:** passwords saved with one key can only be read with that same key. If you start using `NOTES_SECRET` after saving passwords with `secret.key` (or change the passphrase), the existing passwords will no longer open. Decide on one approach before saving passwords, and use the same passphrase every time.

---

## 11. Troubleshooting

| Problem | Solution |
| --- | --- |
| The browser says it can't connect | The app isn't running. Run `npm start` and keep the terminal open. |
| `EADDRINUSE` when starting | Something else is using port 3000 — often another copy of this app. Close it, or start on another port (see [Settings](#10-settings)). |
| `npm install` fails while building `better-sqlite3` | Check you have Node.js 20 or newer (`node --version`). The project uses a version of `better-sqlite3` with ready-made builds for Node 20. |
| **Reveal**, **Copy** or **Edit** does nothing on a password note | The encryption key doesn't match the one the password was saved with — usually a missing or replaced `secret.key`, or a different `NOTES_SECRET`. Restore the original key. |
| **Copy** buttons do nothing | The browser blocked clipboard access. Open the app at `http://127.0.0.1:3000` or `http://localhost:3000`, and allow clipboard access if asked. |
| A code snippet isn't coloured correctly | Set the **Language** field to a standard name such as `javascript`, `python` or `csharp`. |
