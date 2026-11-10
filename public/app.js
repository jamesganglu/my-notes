const $ = (sel, root = document) => root.querySelector(sel);
const TYPE_LABELS = { text: 'Text', markdown: 'Markdown', code: 'Code', password: 'Password', changelog: 'Change log', todo: 'To-do list' };
// Keep a Changelog sections, in display order (must match CHANGE_KINDS in src/db.js).
const CHANGE_KINDS = { added: 'Added', changed: 'Changed', deprecated: 'Deprecated', removed: 'Removed', fixed: 'Fixed', security: 'Security' };

const state = { filters: { q: '', type: '', category: '', tag: '' }, notes: [], selectedId: null };

const api = {
  async request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },
  list: (f) => api.request('GET', '/api/notes?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v))),
  get: (id, reveal) => api.request('GET', `/api/notes/${id}${reveal ? '?reveal=1' : ''}`),
  create: (n) => api.request('POST', '/api/notes', n),
  update: (id, n) => api.request('PUT', `/api/notes/${id}`, n),
  remove: (id) => api.request('DELETE', `/api/notes/${id}`),
  categories: () => api.request('GET', '/api/categories'),
  tags: () => api.request('GET', '/api/tags'),
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function renderMarkdown(src) {
  const html = DOMPurify.sanitize(marked.parse(src || ''));
  const wrap = el('div', { className: 'markdown-body', innerHTML: html });
  wrap.querySelectorAll('pre code').forEach((c) => hljs.highlightElement(c));
  wrap.querySelectorAll('pre').forEach((pre) => pre.append(copyButton(() => pre.innerText)));
  return wrap;
}

function copyButton(getText, label = 'Copy') {
  const btn = el('button', { type: 'button', className: 'copy-btn', textContent: label });
  btn.onclick = async () => {
    await navigator.clipboard.writeText(typeof getText === 'function' ? getText() : getText);
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = label), 1200);
  };
  return btn;
}

function formatDate(s) {
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString();
}

// ---------- sidebar ----------

async function refreshSidebar() {
  const [categories, tags] = await Promise.all([api.categories(), api.tags()]);

  const catList = $('#category-filter');
  catList.replaceChildren(
    ...[{ name: '', label: 'All' }, ...categories].map((c) => {
      const li = el('li', {}, el('span', { textContent: c.label || c.name }),
        c.count != null ? el('span', { className: 'count', textContent: c.count }) : null);
      li.classList.toggle('active', state.filters.category === c.name);
      li.onclick = () => setFilter('category', c.name);
      return li;
    }),
  );

  $('#tag-filter').replaceChildren(
    ...tags.map((t) => {
      const span = el('span', { className: 'tag', textContent: `#${t.name}` });
      span.classList.toggle('active', state.filters.tag === t.name);
      span.onclick = () => setFilter('tag', state.filters.tag === t.name ? '' : t.name);
      return span;
    }),
  );

  document.querySelectorAll('#type-filter li').forEach((li) =>
    li.classList.toggle('active', li.dataset.value === state.filters.type));

  state.categories = categories.map((c) => c.name);
  state.allTags = tags;
}

// Choosing a filter means browsing, so it ends any search (search ignores filters).
function setFilter(key, value) {
  state.filters[key] = value;
  state.filters.q = '';
  $('#search').value = '';
  refresh();
}

// ---------- list ----------

async function refreshList() {
  // A search always covers every note; type/category/tag filters are paused while searching.
  const { q } = state.filters;
  document.body.classList.toggle('searching', Boolean(q));
  state.notes = await api.list(q ? { q } : state.filters);
  const list = $('#note-list');
  if (!state.notes.length) {
    list.replaceChildren(el('li', { className: 'none', textContent: 'No notes found.' }));
  } else {
    list.replaceChildren(...state.notes.map((n) => {
      const sub = n.type === 'password' ? n.username || n.url || '••••••••'
        : n.type === 'changelog' ? changelogSummary(parseChangelog(n.content))
        : n.type === 'todo' ? todoSummary(parseTodo(n.content))
        : (n.content || '').slice(0, 120);
      const li = el('li', {},
        el('div', { className: 'n-title' },
          el('span', { className: `badge ${n.type}`, textContent: TYPE_LABELS[n.type] }),
          el('span', { textContent: n.title })),
        el('div', { className: 'n-sub', textContent: [n.category, sub].filter(Boolean).join(' · ') }));
      li.classList.toggle('selected', n.id === state.selectedId);
      li.onclick = () => showNote(n.id);
      return li;
    }));
  }

  const f = state.filters;
  const active = [f.type && TYPE_LABELS[f.type], f.category && `in "${f.category}"`, f.tag && `#${f.tag}`].filter(Boolean);
  $('#active-filters').textContent = q
    ? `${state.notes.length} result(s) for "${q}" in all notes`
    : active.length ? `${state.notes.length} note(s) · ${active.join(' · ')}` : '';
}

async function refresh() {
  await Promise.all([refreshSidebar(), refreshList()]);
}

// ---------- detail view ----------

async function showNote(id) {
  state.selectedId = id;
  document.querySelectorAll('#note-list li').forEach((li, i) =>
    li.classList.toggle('selected', state.notes[i]?.id === id));

  const note = await api.get(id);
  const view = $('#view-tpl').content.cloneNode(true);
  $('.v-title', view).textContent = note.title;
  const badge = $('.v-type', view);
  badge.textContent = TYPE_LABELS[note.type] + (note.language ? ` · ${note.language}` : '');
  badge.classList.add(note.type);
  $('.v-category', view).textContent = note.category ? `📁 ${note.category}` : '';
  $('.v-dates', view).textContent = `Updated ${formatDate(note.updated_at)}`;
  $('.v-tags', view).append(...note.tags.map((t) => {
    const s = el('span', { className: 'tag', textContent: `#${t}` });
    s.onclick = () => setFilter('tag', t);
    return s;
  }));
  $('.v-print', view).onclick = () => printNote(note);
  $('.v-edit', view).onclick = () => editNote(note.id);
  $('.v-delete', view).onclick = () => deleteNote(note);
  $('.v-body', view).append(renderBody(note));

  $('#detail').replaceChildren(view);
}

// Print styles (see @media print in styles.css) show only the open note.
// The page title is swapped so the browser's print header / PDF file name is the note title.
function printNote(note) {
  const original = document.title;
  document.title = note.title;
  window.addEventListener('afterprint', () => (document.title = original), { once: true });
  window.print();
}

function renderBody(note) {
  switch (note.type) {
    case 'markdown':
      return renderMarkdown(note.content);
    case 'code': {
      const code = el('code', { textContent: note.content });
      if (note.language && hljs.getLanguage(note.language)) code.className = `language-${note.language}`;
      hljs.highlightElement(code);
      return el('pre', {}, code, copyButton(note.content));
    }
    case 'password':
      return renderSecret(note);
    case 'changelog':
      return renderChangelog(note);
    case 'todo':
      return renderTodo(note);
    default:
      return el('div', { className: 'plain', textContent: note.content });
  }
}

function renderSecret(note) {
  const wrap = el('div', { className: 'secret' });
  const row = (label, value, ...extra) =>
    wrap.append(el('span', { className: 'label', textContent: label }), value, el('div', { className: 'actions' }, ...extra));

  if (note.username) row('Username', el('code', { textContent: note.username }), copyButton(note.username));
  if (note.url) {
    const href = /^https?:\/\//i.test(note.url) ? note.url : `https://${note.url}`;
    row('URL', el('a', { href, textContent: note.url, target: '_blank', rel: 'noopener noreferrer' }));
  }

  const pw = el('code', { textContent: '••••••••••••' });
  let revealed = null;
  const fetchSecret = async () => (revealed ??= (await api.get(note.id, true)).content);
  const toggle = el('button', { type: 'button', textContent: 'Reveal' });
  toggle.onclick = async () => {
    const showing = toggle.textContent === 'Hide';
    pw.textContent = showing ? '••••••••••••' : await fetchSecret();
    toggle.textContent = showing ? 'Reveal' : 'Hide';
  };
  const copy = el('button', { type: 'button', textContent: 'Copy' });
  copy.onclick = async () => {
    await navigator.clipboard.writeText(await fetchSecret());
    copy.textContent = 'Copied!';
    setTimeout(() => (copy.textContent = 'Copy'), 1200);
  };
  row('Password', pw, toggle, copy);
  return wrap;
}

// ---------- change logs ----------

function parseChangelog(content) {
  try {
    const data = JSON.parse(content || '{}');
    return { entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch {
    return { entries: [] };
  }
}

const versionLabel = (entry) => entry.version || 'Unreleased';

function changelogSummary({ entries }) {
  if (!entries.length) return 'No versions yet';
  const latest = entries[0];
  const count = latest.changes.length;
  return `${versionLabel(latest)}${latest.date ? ` (${latest.date})` : ''} · ${count} change${count === 1 ? '' : 's'}`;
}

function groupChanges(changes) {
  return Object.keys(CHANGE_KINDS)
    .map((kind) => [kind, changes.filter((c) => c.kind === kind)])
    .filter(([, items]) => items.length);
}

// Keep a Changelog (https://keepachangelog.com) formatted Markdown.
function changelogToMarkdown(title, { entries }) {
  const lines = [`# ${title}`, ''];
  for (const entry of entries) {
    const heading = entry.version ? `[${entry.version}]` : '[Unreleased]';
    lines.push(`## ${heading}${entry.date ? ` - ${entry.date}` : ''}`, '');
    for (const [kind, items] of groupChanges(entry.changes)) {
      lines.push(`### ${CHANGE_KINDS[kind]}`, '', ...items.map((c) => `- ${c.text}`), '');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

function renderChangelog(note) {
  const data = parseChangelog(note.content);
  const copy = copyButton(() => changelogToMarkdown(note.title, data), 'Copy as Markdown');
  copy.classList.remove('copy-btn');
  const wrap = el('div', { className: 'changelog' }, el('div', { className: 'changelog-toolbar' }, copy));

  if (!data.entries.length) {
    wrap.append(el('p', { className: 'cl-empty', textContent: 'No versions yet. Click Edit to add one.' }));
    return wrap;
  }
  for (const entry of data.entries) {
    const section = el('section', { className: `cl-version${entry.version ? '' : ' unreleased'}` },
      el('h2', {}, versionLabel(entry), entry.date ? el('span', { className: 'cl-date', textContent: entry.date }) : null));
    const groups = groupChanges(entry.changes);
    if (!groups.length) section.append(el('p', { className: 'cl-empty', textContent: 'No changes recorded.' }));
    for (const [kind, items] of groups) {
      section.append(el('div', { className: 'cl-group' },
        el('span', { className: `kind kind-${kind}`, textContent: CHANGE_KINDS[kind] }),
        el('ul', {}, ...items.map((c) => el('li', { textContent: c.text })))));
    }
    wrap.append(section);
  }
  return wrap;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Suggest the next patch version: 1.4.2 -> 1.4.3, v2.0 -> v2.1. Otherwise blank.
function nextVersion(version) {
  const m = /^(v?)((?:\d+\.)*)(\d+)$/.exec(version || '');
  return m ? `${m[1]}${m[2]}${Number(m[3]) + 1}` : '';
}

// Editor for a list of versions, each with a list of { kind, text } changes.
function createChangelogEditor(root, data) {
  const entries = structuredClone(data.entries);

  function changeRow(entry, change) {
    const kind = el('select', {},
      ...Object.entries(CHANGE_KINDS).map(([value, label]) => el('option', { value, textContent: label })));
    kind.value = change.kind;
    kind.onchange = () => (change.kind = kind.value);

    const text = el('input', { value: change.text, placeholder: 'Describe the change…' });
    text.oninput = () => (change.text = text.value);
    text.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); // don't submit the form; add another change instead
      const next = { kind: change.kind, text: '' };
      entry.changes.splice(entry.changes.indexOf(change) + 1, 0, next);
      render(next);
    };

    const remove = el('button', { type: 'button', className: 'icon-btn', textContent: '×', title: 'Remove change' });
    remove.onclick = () => {
      entry.changes.splice(entry.changes.indexOf(change), 1);
      render();
    };
    return Object.assign(el('div', { className: 'cl-edit-change' }, kind, text, remove), { focusTarget: text });
  }

  // Re-renders the whole editor; `focus` is a change or entry object whose input gets focus.
  function render(focus) {
    let focusEl = null;
    const addVersion = el('button', { type: 'button', textContent: '+ Add version' });
    addVersion.onclick = () => {
      const entry = { version: nextVersion(entries[0]?.version), date: today(), changes: [{ kind: 'added', text: '' }] };
      entries.unshift(entry);
      render(entry);
    };

    const blocks = entries.map((entry) => {
      const version = el('input', { type: 'text', value: entry.version, placeholder: 'Version, e.g. 1.2.0 (blank = Unreleased)' });
      version.oninput = () => (entry.version = version.value);
      const date = el('input', { type: 'date', value: entry.date });
      date.oninput = () => (entry.date = date.value);
      const remove = el('button', { type: 'button', className: 'icon-btn danger', textContent: 'Remove version' });
      remove.onclick = () => {
        const hasText = entry.changes.some((c) => c.text.trim());
        if (hasText && !confirm(`Remove ${versionLabel(entry)} and its changes?`)) return;
        entries.splice(entries.indexOf(entry), 1);
        render();
      };
      if (focus === entry) focusEl = version;

      const rows = entry.changes.map((change) => {
        const row = changeRow(entry, change);
        if (focus === change) focusEl = row.focusTarget;
        return row;
      });
      const addChange = el('button', { type: 'button', className: 'add-change', textContent: '+ Add change' });
      addChange.onclick = () => {
        const change = { kind: entry.changes.at(-1)?.kind || 'added', text: '' };
        entry.changes.push(change);
        render(change);
      };
      return el('div', { className: 'cl-edit-entry' },
        el('div', { className: 'cl-edit-head' }, version, date, remove), ...rows, addChange);
    });

    root.replaceChildren(el('div', {}, addVersion), ...blocks);
    focusEl?.focus();
  }

  render();
  return { value: () => ({ entries }) };
}

// ---------- to-do lists ----------

function parseTodo(content) {
  try {
    const data = JSON.parse(content || '{}');
    return { items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { items: [] };
  }
}

const isOverdue = (item) => !item.done && item.due && item.due < today();

function todoSummary({ items }) {
  if (!items.length) return 'No items';
  const done = items.filter((i) => i.done).length;
  const overdue = items.filter(isOverdue).length;
  return `${done} of ${items.length} done${overdue ? ` · ${overdue} overdue` : ''}`;
}

function todoToMarkdown(title, { items }) {
  const lines = items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}${i.due ? ` (due ${i.due})` : ''}`);
  return `# ${title}\n\n${lines.join('\n')}\n`;
}

// "Due 12 Nov" / "Due today" / "Overdue · 3 Nov", from a YYYY-MM-DD string.
function dueBadge(item) {
  if (!item.due) return null;
  const [y, m, d] = item.due.split('-').map(Number);
  const nice = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() && { year: 'numeric' }),
  });
  let text = `Due ${nice}`;
  let cls = 'todo-due';
  if (!item.done && item.due === today()) { text = 'Due today'; cls += ' today'; }
  else if (isOverdue(item)) { text = `Overdue · ${nice}`; cls += ' overdue'; }
  return el('span', { className: cls, textContent: text, title: item.due });
}

// "Hide completed" is a per-browser preference, so localStorage is fine (and optional).
const HIDE_DONE_KEY = 'notes.todo.hideDone';
function loadHideDone() {
  try { return localStorage.getItem(HIDE_DONE_KEY) === '1'; } catch { return false; }
}
function saveHideDone(value) {
  try { localStorage.setItem(HIDE_DONE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
}

// Items can be ticked directly in the view; each change is saved straight away.
function renderTodo(note) {
  const data = parseTodo(note.content);
  const wrap = el('div', { className: 'todo' });
  if (!data.items.length) {
    wrap.append(el('p', { className: 'todo-empty', textContent: 'No items yet. Click Edit to add some.' }));
    return wrap;
  }

  const bar = el('progress', { max: data.items.length });
  const label = el('span');
  const list = el('ul', { className: 'todo-list' });
  const updateProgress = () => {
    const done = data.items.filter((i) => i.done).length;
    bar.value = done;
    label.textContent = `${done} of ${data.items.length} done`;
  };

  let hideDone = loadHideDone();
  list.classList.toggle('hide-done', hideDone);
  const hideBtn = el('button', { type: 'button', textContent: hideDone ? 'Show completed' : 'Hide completed' });
  hideBtn.onclick = () => {
    hideDone = !hideDone;
    saveHideDone(hideDone);
    list.classList.toggle('hide-done', hideDone);
    hideBtn.textContent = hideDone ? 'Show completed' : 'Hide completed';
  };
  const copy = copyButton(() => todoToMarkdown(note.title, data), 'Copy as Markdown');
  copy.classList.remove('copy-btn');

  // Saves are chained so rapid clicks are written in order.
  let saving = Promise.resolve();
  const save = () => {
    saving = saving
      .then(() => api.update(note.id, {
        title: note.title, type: note.type, category: note.category, tags: note.tags,
        content: JSON.stringify(data),
      }))
      .then(refreshList)
      .catch((err) => {
        alert(`Couldn't save: ${err.message}`);
        showNote(note.id); // reload the saved state
      });
  };

  for (const item of data.items) {
    const li = el('li', { className: item.done ? 'done' : '' });
    const box = el('input', { type: 'checkbox', checked: item.done });
    let due = dueBadge(item);
    box.onchange = () => {
      item.done = box.checked;
      li.classList.toggle('done', item.done);
      const fresh = dueBadge(item); // overdue styling depends on done
      due?.replaceWith(fresh);
      due = fresh;
      updateProgress();
      save();
    };
    li.append(el('label', {}, box, el('span', { className: 'todo-text', textContent: item.text })), due ?? '');
    list.append(li);
  }

  updateProgress();
  wrap.append(
    el('div', { className: 'todo-progress' }, bar, label, el('div', { className: 'todo-toolbar' }, hideBtn, copy)),
    list,
  );
  return wrap;
}

// Turns pasted lines (plain or a Markdown checklist like "- [x] item") into to-do items.
function parsePastedItems(text) {
  return text.split(/\r?\n/)
    .map((line) => /^\s*(?:[-*+]|\d+[.)])?\s*(?:\[([ xX])\])?\s*(.*)$/.exec(line))
    .filter((m) => m[2].trim())
    .map((m) => ({ text: m[2].trim(), done: /x/i.test(m[1] || ''), due: '' }));
}

// Editor for a list of { text, done, due } items.
function createTodoEditor(root, data) {
  const blank = () => ({ text: '', done: false, due: '' });
  const items = structuredClone(data.items);
  if (!items.length) items.push(blank());

  // Re-renders the list; `focus` is the item whose text input gets focus.
  function render(focus) {
    let focusEl = null;
    const rows = items.map((item) => {
      const row = el('div', { className: `todo-edit-row${item.done ? ' done' : ''}` });
      const box = el('input', { type: 'checkbox', checked: item.done, title: 'Done' });
      box.onchange = () => {
        item.done = box.checked;
        row.classList.toggle('done', item.done);
      };

      const text = el('input', { className: 'todo-edit-text', value: item.text, placeholder: 'To-do item…' });
      text.oninput = () => (item.text = text.value);
      text.onkeydown = (e) => {
        const idx = items.indexOf(item);
        if (e.key === 'Enter') {
          e.preventDefault(); // don't submit the form; add an item instead
          const next = blank();
          items.splice(idx + 1, 0, next);
          render(next);
        } else if (e.key === 'Backspace' && !text.value && items.length > 1) {
          e.preventDefault();
          items.splice(idx, 1);
          render(items[Math.max(0, idx - 1)]);
        }
      };
      text.onpaste = (e) => {
        const pasted = e.clipboardData?.getData('text') || '';
        if (!pasted.includes('\n')) return; // single line: normal paste
        const parsed = parsePastedItems(pasted);
        if (!parsed.length) return;
        e.preventDefault();
        // Replace the current item if it's empty, otherwise insert after it.
        const idx = items.indexOf(item);
        if (item.text.trim()) items.splice(idx + 1, 0, ...parsed);
        else items.splice(idx, 1, ...parsed);
        render(parsed.at(-1));
      };

      const due = el('input', { type: 'date', value: item.due, title: 'Due date (optional)' });
      due.oninput = () => (item.due = due.value);
      const remove = el('button', { type: 'button', className: 'icon-btn', textContent: '×', title: 'Remove item' });
      remove.onclick = () => {
        items.splice(items.indexOf(item), 1);
        if (!items.length) items.push(blank());
        render();
      };

      if (item === focus) focusEl = text;
      row.append(box, text, due, remove);
      return row;
    });

    const add = el('button', { type: 'button', className: 'add-item', textContent: '+ Add item' });
    add.onclick = () => {
      const item = blank();
      items.push(item);
      render(item);
    };
    root.replaceChildren(...rows, add);
    focusEl?.focus();
  }

  render();
  return { value: () => ({ items }) };
}

// ---------- editor ----------

async function editNote(id) {
  const note = id ? await api.get(id, true) : { type: state.filters.type || 'text', category: state.filters.category, tags: [] };
  const frag = $('#edit-tpl').content.cloneNode(true);
  const form = $('form', frag);
  const f = form.elements;

  f.title.value = note.title || '';
  f.type.value = note.type;
  const categoryPicker = createCategoryPicker($('.cat-picker', form), note.category || '');
  f.language.value = note.language || '';
  const tagPicker = createTagPicker($('.tag-picker', form), note.tags || []);
  f.username.value = note.username || '';
  f.url.value = note.url || '';
  if (note.type === 'password') f.password.value = note.content || '';
  else if (note.type !== 'changelog' && note.type !== 'todo') f.content.value = note.content || '';
  const changelogEditor = createChangelogEditor($('.changelog-editor', form),
    parseChangelog(note.type === 'changelog' ? note.content : ''));
  const todoEditor = createTodoEditor($('.todo-editor', form), parseTodo(note.type === 'todo' ? note.content : ''));

  const preview = $('.md-preview', form);
  const syncType = () => {
    form.dataset.type = f.type.value;
    if (f.type.value === 'markdown') preview.replaceChildren(renderMarkdown(f.content.value));
  };
  f.type.onchange = syncType;
  f.content.oninput = () => f.type.value === 'markdown' && preview.replaceChildren(renderMarkdown(f.content.value));
  f.content.onkeydown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      f.content.setRangeText('  ', f.content.selectionStart, f.content.selectionEnd, 'end');
    }
  };
  syncType();

  $('.pw-toggle', form).onclick = (e) => {
    const hidden = f.password.type === 'password';
    f.password.type = hidden ? 'text' : 'password';
    e.target.textContent = hidden ? 'Hide' : 'Show';
  };
  $('.pw-generate', form).onclick = () => {
    f.password.value = generatePassword(20);
    f.password.type = 'text';
    $('.pw-toggle', form).textContent = 'Hide';
  };
  $('.cancel', form).onclick = () => (id ? showNote(id) : $('#detail').replaceChildren(el('div', { className: 'empty', textContent: 'Select a note or create a new one.' })));

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      title: f.title.value,
      type: f.type.value,
      category: categoryPicker.value(),
      tags: tagPicker.values(),
      language: f.language.value,
      username: f.username.value,
      url: f.url.value,
      content: f.type.value === 'password' ? f.password.value
        : f.type.value === 'changelog' ? JSON.stringify(changelogEditor.value())
        : f.type.value === 'todo' ? JSON.stringify(todoEditor.value())
        : f.content.value,
    };
    try {
      const saved = id ? await api.update(id, payload) : await api.create(payload);
      state.selectedId = saved.id;
      await refresh();
      showNote(saved.id);
    } catch (err) {
      alert(err.message);
    }
  };

  $('#detail').replaceChildren(frag);
  f.title.focus();
}

// Single-choice dropdown of existing categories, with an option to add a new one.
function createCategoryPicker(root, initial) {
  const select = $('select', root);
  const box = $('.cat-new', root);
  const input = $('.cat-input', root);
  const categories = new Set(state.categories || []);
  if (initial) categories.add(initial);
  let current = initial;
  // Identified by reference, so no option value is reserved and any category name is allowed.
  const newOption = el('option', { textContent: '+ New category…' });

  function render() {
    const sorted = [...categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    select.replaceChildren(
      el('option', { value: '', textContent: 'No category' }),
      ...sorted.map((c) => el('option', { value: c, textContent: c })),
      newOption,
    );
    select.value = current;
  }

  const closeBox = () => {
    box.hidden = true;
    input.value = '';
    select.value = current;
  };

  const add = () => {
    const name = input.value.trim();
    if (!name) return input.focus();
    // Reuse an existing category if only the letter case differs.
    current = [...categories].find((c) => c.toLowerCase() === name.toLowerCase()) ?? name;
    categories.add(current);
    render();
    closeBox();
  };

  select.onchange = () => {
    if (select.selectedOptions[0] === newOption) {
      box.hidden = false;
      input.focus();
    } else {
      current = select.value;
      closeBox();
    }
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
    if (e.key === 'Escape') { e.preventDefault(); closeBox(); }
  };
  $('.cat-add', root).onclick = add;
  $('.cat-cancel', root).onclick = closeBox;

  render();
  // If the user typed a name but didn't click Add, save it anyway.
  return { value: () => (!box.hidden && input.value.trim() ? (add(), current) : current) };
}

// List box of existing tags (click to toggle) plus an input that filters the list or adds new tags.
function createTagPicker(root, initial) {
  const normalize = (t) => t.trim().toLowerCase();
  const selected = new Set(initial.map(normalize));
  const known = new Map((state.allTags || []).map((t) => [t.name, t.count]));
  const input = $('.tp-input', root);
  const list = $('.tp-list', root);
  const chips = $('.tp-selected', root);
  let focusIndex = -1;

  const toggle = (name) => {
    selected.has(name) ? selected.delete(name) : selected.add(name);
    render();
  };

  const add = (raw) => {
    const names = raw.split(',').map(normalize).filter(Boolean);
    names.forEach((n) => {
      selected.add(n);
      if (!known.has(n)) known.set(n, 0);
    });
    input.value = '';
    render();
  };

  function render() {
    chips.replaceChildren(...[...selected].sort().map((name) => {
      const remove = el('button', { type: 'button', textContent: '×', title: `Remove ${name}` });
      remove.onclick = () => toggle(name);
      return el('span', { className: 'tag' }, `#${name}`, remove);
    }));

    const filter = normalize(input.value);
    const names = [...new Set([...known.keys(), ...selected])]
      .filter((n) => n.includes(filter))
      .sort();
    const items = names.map((name) => {
      const count = known.get(name);
      const li = el('li', { role: 'option' }, el('span', { textContent: name }),
        count ? el('span', { className: 'count', textContent: count }) : null);
      li.setAttribute('aria-selected', selected.has(name));
      li.onclick = () => toggle(name);
      li.dataset.name = name;
      return li;
    });
    if (filter && !names.includes(filter)) {
      const li = el('li', { className: 'tp-new', textContent: `Create tag "${filter}"` });
      li.onclick = () => add(filter);
      li.dataset.create = filter;
      items.push(li);
    }
    if (!items.length) items.push(el('li', { className: 'tp-empty', textContent: 'No tags yet — type one above to add it.' }));
    list.replaceChildren(...items);
    focusIndex = Math.min(focusIndex, items.length - 1);
    highlight();
  }

  function highlight() {
    [...list.children].forEach((li, i) => li.classList.toggle('focused', i === focusIndex));
    list.children[focusIndex]?.scrollIntoView({ block: 'nearest' });
  }

  input.oninput = () => { focusIndex = -1; render(); };
  input.onkeydown = (e) => {
    const items = [...list.querySelectorAll('li[data-name], li[data-create]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      focusIndex = Math.max(-1, Math.min(items.length - 1, focusIndex + step));
      highlight();
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault(); // don't submit the form
      const focused = items[focusIndex];
      if (focused?.dataset.name) toggle(focused.dataset.name);
      else if (input.value.trim()) add(input.value);
    } else if (e.key === 'Backspace' && !input.value && selected.size) {
      toggle([...selected].sort().pop());
    }
  };
  $('.tp-add-btn', root).onclick = () => { if (input.value.trim()) add(input.value); input.focus(); };

  render();
  return { values: () => [...selected] };
}

async function deleteNote(note) {
  if (!confirm(`Delete "${note.title}"?`)) return;
  await api.remove(note.id);
  state.selectedId = null;
  $('#detail').replaceChildren(el('div', { className: 'empty', textContent: 'Note deleted.' }));
  refresh();
}

function generatePassword(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';
  const limit = 256 - (256 % chars.length); // rejection sampling avoids modulo bias
  let out = '';
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += chars[b % chars.length];
    }
  }
  return out;
}

// ---------- theme ----------

// The saved theme is applied before first paint by the inline script in index.html.
const THEME_KEY = 'notes.theme';
const HLJS_THEMES = { light: '/vendor/hljs/styles/github.min.css', dark: '/vendor/hljs/styles/github-dark.min.css' };

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#hljs-theme').href = HLJS_THEMES[theme];
  document.querySelectorAll('[data-theme-choice]').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.themeChoice === theme));
}

document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
  btn.onclick = () => {
    const theme = btn.dataset.themeChoice;
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable: theme lasts this visit */ }
  };
});
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// ---------- init ----------

document.querySelectorAll('#type-filter li').forEach((li) => (li.onclick = () => setFilter('type', li.dataset.value)));
$('#new-note').onclick = () => editNote(null);
let searchTimer;
$('#search').oninput = (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.filters.q = e.target.value.trim(); refreshList(); }, 200);
};
$('#search').onkeydown = (e) => {
  if (e.key === 'Escape' && e.target.value) {
    clearTimeout(searchTimer);
    e.target.value = '';
    state.filters.q = '';
    refreshList();
  }
};

refresh();
