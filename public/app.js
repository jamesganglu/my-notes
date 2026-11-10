const $ = (sel, root = document) => root.querySelector(sel);
const TYPE_LABELS = { text: 'Text', markdown: 'Markdown', code: 'Code', password: 'Password' };

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

function setFilter(key, value) {
  state.filters[key] = value;
  refresh();
}

// ---------- list ----------

async function refreshList() {
  state.notes = await api.list(state.filters);
  const list = $('#note-list');
  if (!state.notes.length) {
    list.replaceChildren(el('li', { className: 'none', textContent: 'No notes found.' }));
  } else {
    list.replaceChildren(...state.notes.map((n) => {
      const sub = n.type === 'password'
        ? n.username || n.url || '••••••••'
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
  const active = [f.type && TYPE_LABELS[f.type], f.category && `in "${f.category}"`, f.tag && `#${f.tag}`, f.q && `matching "${f.q}"`]
    .filter(Boolean);
  $('#active-filters').textContent = active.length ? `${state.notes.length} note(s) · ${active.join(' · ')}` : '';
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
  $('.v-edit', view).onclick = () => editNote(note.id);
  $('.v-delete', view).onclick = () => deleteNote(note);
  $('.v-body', view).append(renderBody(note));

  $('#detail').replaceChildren(view);
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
  else f.content.value = note.content || '';

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
      content: f.type.value === 'password' ? f.password.value : f.content.value,
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

// ---------- init ----------

document.querySelectorAll('#type-filter li').forEach((li) => (li.onclick = () => setFilter('type', li.dataset.value)));
$('#new-note').onclick = () => editNote(null);
let searchTimer;
$('#search').oninput = (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.filters.q = e.target.value.trim(); refreshList(); }, 200);
};

refresh();
