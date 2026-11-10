const path = require('path');
const express = require('express');
const { openStore, ValidationError } = require('./src/db');

const store = openStore(process.env.NOTES_DATA_DIR);
const app = express();
app.use(express.json({ limit: '2mb' }));

const vendor = (pkgPath) => express.static(path.join(__dirname, 'node_modules', pkgPath));
app.use('/vendor/marked', vendor('marked/lib'));
app.use('/vendor/dompurify', vendor('dompurify/dist'));
app.use('/vendor/hljs', vendor('@highlightjs/cdn-assets'));
app.use(express.static(path.join(__dirname, 'public')));

const api = express.Router();

api.get('/notes', (req, res) => {
  const { q, type, category, tag } = req.query;
  res.json(store.list({ q, type, category, tag }));
});

api.get('/notes/:id', (req, res) => {
  const note = store.get(Number(req.params.id), { reveal: req.query.reveal === '1' });
  note ? res.json(note) : res.status(404).json({ error: 'Note not found' });
});

api.post('/notes', (req, res) => {
  res.status(201).json(store.create(req.body));
});

api.put('/notes/:id', (req, res) => {
  const note = store.update(Number(req.params.id), req.body);
  note ? res.json(note) : res.status(404).json({ error: 'Note not found' });
});

api.delete('/notes/:id', (req, res) => {
  store.remove(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'Note not found' });
});

api.get('/categories', (req, res) => res.json(store.categories()));
api.get('/tags', (req, res) => res.json(store.tags()));

app.use('/api', api);

app.use((err, req, res, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Notes app running at http://${HOST}:${PORT}`));
