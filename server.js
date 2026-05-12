// LA FEFA — server (Postgres / Supabase + JWT cookie auth)
// Runs locally with `npm start` and as a Vercel serverless function via api/index.js.

// Load .env locally (Vercel injects env vars natively, so no-op there).
try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lafefa-dev-secret-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'lafefa';
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminlafe';
const COOKIE_NAME = 'lafefa_token';
const SEVEN_DAYS = 1000 * 60 * 60 * 24 * 7;

if (!process.env.DATABASE_URL) {
  console.warn('[WARN] DATABASE_URL not set — set it in .env or Vercel environment.');
}

// pg Pool — created once per process (reused on warm Vercel invocations)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
});

// Helper: simple query wrappers (Postgres uses $1,$2 placeholders)
const q = (text, params = []) => pool.query(text, params);
const qOne = async (text, params = []) => {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
};
const qAll = async (text, params = []) => {
  const r = await pool.query(text, params);
  return r.rows;
};

// ---------- Middleware ----------
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Block direct access to dashboard.html (must go through auth)
app.use((req, res, next) => {
  if (req.path === '/dashboard.html' || req.path === '/dashboard') {
    return res.redirect('/');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function checkAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return next();
    } catch (_) {}
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login');
}

// Async error wrapper so we don't repeat try/catch
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'server error' });
  });
};

// ---------- Auth routes ----------
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ u: username }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SEVEN_DAYS,
    });
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

app.get('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login');
});

app.get('/', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// =================== HOLDERS ===================
app.get('/api/holders', checkAuth, wrap(async (req, res) => {
  const rows = await qAll('SELECT * FROM holders ORDER BY name');
  res.json(rows);
}));

app.post('/api/holders', checkAuth, wrap(async (req, res) => {
  const { name, instagram, telefone } = req.body;
  const row = await qOne(
    'INSERT INTO holders (name, instagram, telefone) VALUES ($1, $2, $3) RETURNING *',
    [name, instagram || '', telefone || '']
  );
  res.json(row);
}));

app.put('/api/holders/:id', checkAuth, wrap(async (req, res) => {
  const { name, instagram, telefone } = req.body;
  await q(
    'UPDATE holders SET name = $1, instagram = $2, telefone = $3 WHERE id = $4',
    [name, instagram || '', telefone || '', req.params.id]
  );
  res.json({ success: true });
}));

app.delete('/api/holders/:id', checkAuth, wrap(async (req, res) => {
  await q('DELETE FROM holders WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// =================== ANIVERSARIANTES ===================
app.get('/api/aniversariantes', checkAuth, wrap(async (req, res) => {
  const rows = await qAll(`
    SELECT a.*, l.id AS lista_id
    FROM aniversariantes a
    LEFT JOIN listas l ON l.aniversariante_id = a.id AND l.tipo = 'aniversariante'
    ORDER BY COALESCE(a.data_evento, a.created_at::date) DESC
  `);
  res.json(rows);
}));

app.post('/api/aniversariantes', checkAuth, wrap(async (req, res) => {
  const { nome, instagram, telefone, data_evento } = req.body;
  const ani = await qOne(
    'INSERT INTO aniversariantes (nome, instagram, telefone, data_evento) VALUES ($1, $2, $3, $4) RETURNING *',
    [nome, instagram || '', telefone || '', data_evento || null]
  );
  const dataLista = data_evento || new Date().toISOString().slice(0, 10);
  const lista = await qOne(
    'INSERT INTO listas (aniversariante_id, data, tipo) VALUES ($1, $2, $3) RETURNING id',
    [ani.id, dataLista, 'aniversariante']
  );
  res.json({ ...ani, lista_id: lista.id });
}));

app.put('/api/aniversariantes/:id', checkAuth, wrap(async (req, res) => {
  const { nome, instagram, telefone, data_evento } = req.body;
  await q(
    'UPDATE aniversariantes SET nome = $1, instagram = $2, telefone = $3, data_evento = $4 WHERE id = $5',
    [nome, instagram || '', telefone || '', data_evento || null, req.params.id]
  );
  if (data_evento) {
    await q(
      `UPDATE listas SET data = $1 WHERE aniversariante_id = $2 AND tipo = 'aniversariante'`,
      [data_evento, req.params.id]
    );
  }
  res.json({ success: true });
}));

app.delete('/api/aniversariantes/:id', checkAuth, wrap(async (req, res) => {
  await q('DELETE FROM aniversariantes WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// =================== PESSOAS RESTRITAS ===================
app.get('/api/pessoas-restritas', checkAuth, wrap(async (req, res) => {
  res.json(await qAll('SELECT * FROM pessoas_restritas ORDER BY nome'));
}));
app.post('/api/pessoas-restritas', checkAuth, wrap(async (req, res) => {
  const { nome, motivo } = req.body;
  const row = await qOne(
    'INSERT INTO pessoas_restritas (nome, motivo) VALUES ($1, $2) RETURNING *',
    [nome, motivo || '']
  );
  res.json(row);
}));
app.put('/api/pessoas-restritas/:id', checkAuth, wrap(async (req, res) => {
  const { nome, motivo } = req.body;
  await q(
    'UPDATE pessoas_restritas SET nome = $1, motivo = $2 WHERE id = $3',
    [nome, motivo || '', req.params.id]
  );
  res.json({ success: true });
}));
app.delete('/api/pessoas-restritas/:id', checkAuth, wrap(async (req, res) => {
  await q('DELETE FROM pessoas_restritas WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// =================== CONVIDADOS FREQUENTES ===================
app.get('/api/convidados-frequentes', checkAuth, wrap(async (req, res) => {
  res.json(await qAll('SELECT * FROM convidados_frequentes ORDER BY nome'));
}));
app.post('/api/convidados-frequentes', checkAuth, wrap(async (req, res) => {
  const { nome, instagram, telefone } = req.body;
  const row = await qOne(
    'INSERT INTO convidados_frequentes (nome, instagram, telefone) VALUES ($1, $2, $3) RETURNING *',
    [nome, instagram || '', telefone || '']
  );
  res.json(row);
}));
app.put('/api/convidados-frequentes/:id', checkAuth, wrap(async (req, res) => {
  const { nome, instagram, telefone } = req.body;
  await q(
    'UPDATE convidados_frequentes SET nome = $1, instagram = $2, telefone = $3 WHERE id = $4',
    [nome, instagram || '', telefone || '', req.params.id]
  );
  res.json({ success: true });
}));
app.delete('/api/convidados-frequentes/:id', checkAuth, wrap(async (req, res) => {
  await q('DELETE FROM convidados_frequentes WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// =================== LISTAS ===================
app.get('/api/listas', checkAuth, wrap(async (req, res) => {
  const { tipo, year, month } = req.query;
  const where = [];
  const params = [];
  let i = 1;
  if (tipo) { where.push(`l.tipo = $${i++}`); params.push(tipo); }
  if (year && month) {
    where.push(`to_char(l.data, 'YYYY-MM') = $${i++}`);
    params.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = await qAll(`
    SELECT
      l.*,
      h.name AS holder_nome,
      a.nome AS aniversariante_nome,
      cf.nome AS convidado_nome,
      COUNT(c.id)::int AS guest_count,
      COALESCE(SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END), 0)::int AS guests_attended
    FROM listas l
    LEFT JOIN holders h ON l.holder_id = h.id
    LEFT JOIN aniversariantes a ON l.aniversariante_id = a.id
    LEFT JOIN convidados_frequentes cf ON l.convidado_id = cf.id
    LEFT JOIN convidados c ON c.lista_id = l.id
    ${whereSql}
    GROUP BY l.id, h.name, a.nome, cf.nome
    ORDER BY l.data DESC
  `, params);
  res.json(rows);
}));

app.post('/api/listas', checkAuth, wrap(async (req, res) => {
  const { holder_id, aniversariante_id, convidado_id, convidado_nome, data, tipo, dia_semana } = req.body;
  let cid = convidado_id || null;

  if (tipo === 'convidado' && !cid && convidado_nome) {
    const nome = String(convidado_nome).trim();
    const existing = await qOne(
      'SELECT id FROM convidados_frequentes WHERE LOWER(nome) = LOWER($1)',
      [nome]
    );
    if (existing) cid = existing.id;
    else {
      const created = await qOne(
        'INSERT INTO convidados_frequentes (nome) VALUES ($1) RETURNING id',
        [nome]
      );
      cid = created.id;
    }
  }

  const row = await qOne(
    `INSERT INTO listas (holder_id, aniversariante_id, convidado_id, data, tipo, dia_semana)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [holder_id || null, aniversariante_id || null, cid, data, tipo, dia_semana || null]
  );
  res.json(row);
}));

app.put('/api/listas/:id', checkAuth, wrap(async (req, res) => {
  const { data, dia_semana, status, capacidade, hora_limite } = req.body;
  const sets = ['data = $1', 'dia_semana = $2'];
  const params = [data, dia_semana || null];
  let i = 3;
  if (status !== undefined)      { sets.push(`status = $${i++}`);      params.push(status); }
  if (capacidade !== undefined)  { sets.push(`capacidade = $${i++}`);  params.push(Number(capacidade)); }
  if (hora_limite !== undefined) { sets.push(`hora_limite = $${i++}`); params.push(hora_limite); }
  params.push(req.params.id);
  await q(`UPDATE listas SET ${sets.join(', ')} WHERE id = $${i}`, params);
  res.json({ success: true });
}));

app.delete('/api/listas/:id', checkAuth, wrap(async (req, res) => {
  await q('DELETE FROM listas WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// Generate / revoke shareable token
app.post('/api/listas/:id/token', checkAuth, wrap(async (req, res) => {
  const { revoke } = req.body || {};
  if (revoke) {
    await q('UPDATE listas SET token = NULL WHERE id = $1', [req.params.id]);
    return res.json({ token: null });
  }
  const token = crypto.randomBytes(12).toString('hex');
  await q('UPDATE listas SET token = $1 WHERE id = $2', [token, req.params.id]);
  res.json({ token });
}));

// =================== BUSCA GLOBAL ===================
app.get('/api/busca', checkAuth, wrap(async (req, res) => {
  const query = (req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  const term = `%${query.toLowerCase()}%`;
  const rows = await qAll(`
    SELECT
      c.id, c.nome, c.instagram, c.telefone, c.chegou,
      l.id AS lista_id, l.data, l.tipo, l.status, l.capacidade,
      h.name AS holder_nome,
      a.nome AS aniversariante_nome,
      cf.nome AS convidado_nome
    FROM convidados c
    JOIN listas l ON c.lista_id = l.id
    LEFT JOIN holders h ON l.holder_id = h.id
    LEFT JOIN aniversariantes a ON l.aniversariante_id = a.id
    LEFT JOIN convidados_frequentes cf ON l.convidado_id = cf.id
    WHERE LOWER(c.nome) LIKE $1
    ORDER BY l.data DESC, c.nome
    LIMIT 60
  `, [term]);
  res.json(rows);
}));

// =================== CONVITE (público, sem auth) ===================
app.get('/convite/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/convite.html'));
});

app.get('/api/convite/:token', wrap(async (req, res) => {
  const lista = await qOne(`
    SELECT l.*, a.nome AS aniversariante_nome, a.data_evento,
           COUNT(c.id)::int AS guest_count
    FROM listas l
    LEFT JOIN aniversariantes a ON l.aniversariante_id = a.id
    LEFT JOIN convidados c ON c.lista_id = l.id
    WHERE l.token = $1
    GROUP BY l.id, a.nome, a.data_evento
  `, [req.params.token]);
  if (!lista) return res.status(404).json({ error: 'Lista não encontrada' });
  res.json(lista);
}));

app.post('/api/convite/:token/convidados', wrap(async (req, res) => {
  const lista = await qOne(
    'SELECT * FROM listas WHERE token = $1', [req.params.token]
  );
  if (!lista) return res.status(404).json({ error: 'Lista não encontrada' });

  if (lista.status === 'encerrada') {
    return res.status(403).json({ error: 'Esta lista está encerrada pelo administrador.' });
  }

  // Enforce 17h00 Brasília (UTC-3 = 20h00 UTC) deadline on the event day
  const eventDate = lista.data;
  if (eventDate) {
    const deadline = new Date(`${String(eventDate).slice(0, 10)}T20:00:00Z`);
    if (new Date() > deadline) {
      return res.status(403).json({ error: 'Prazo encerrado. Convidados só podem ser adicionados até as 17h00 do dia do evento.' });
    }
  }

  // Enforce capacity
  const countRow = await qOne(
    'SELECT COUNT(*)::int AS n FROM convidados WHERE lista_id = $1', [lista.id]
  );
  const cap = Number(lista.capacidade || 25);
  if (countRow.n >= cap) {
    return res.status(403).json({ error: `Lista lotada! Capacidade máxima de ${cap} pessoas atingida.` });
  }

  const { nome, instagram, telefone } = req.body;
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }

  const row = await qOne(
    `INSERT INTO convidados (lista_id, nome, instagram, telefone)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [lista.id, String(nome).trim(), instagram || '', telefone || '']
  );

  // Auto-mark as lotada when full
  if (countRow.n + 1 >= cap) {
    await q("UPDATE listas SET status = 'lotada' WHERE id = $1 AND status = 'aberta'", [lista.id]);
  }

  res.json(row);
}));

app.get('/api/convite/:token/convidados', wrap(async (req, res) => {
  const lista = await qOne('SELECT id FROM listas WHERE token = $1', [req.params.token]);
  if (!lista) return res.status(404).json({ error: 'Lista não encontrada' });
  const rows = await qAll(
    'SELECT id, nome, instagram FROM convidados WHERE lista_id = $1 ORDER BY nome',
    [lista.id]
  );
  res.json(rows);
}));

// Convidados de uma lista
app.get('/api/listas/:id/convidados', checkAuth, wrap(async (req, res) => {
  const rows = await qAll(
    'SELECT * FROM convidados WHERE lista_id = $1 ORDER BY chegou DESC, nome',
    [req.params.id]
  );
  res.json(rows);
}));

app.post('/api/listas/:id/convidados', checkAuth, wrap(async (req, res) => {
  const { nome, instagram, telefone, quem_convida, cpf } = req.body;
  const row = await qOne(
    `INSERT INTO convidados (lista_id, nome, instagram, telefone, quem_convida, cpf)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.params.id, nome, instagram || '', telefone || '', quem_convida || '', cpf || '']
  );
  res.json(row);
}));

// Bulk insert (lista colada do WhatsApp)
app.post('/api/listas/:id/convidados/bulk', checkAuth, wrap(async (req, res) => {
  const listaId = Number(req.params.id);
  const { items, quem_convida } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items vazio' });
  }
  let inserted = 0;
  // single multi-row insert for efficiency
  const values = [];
  const placeholders = [];
  let i = 1;
  for (const it of items) {
    const nome = (it.nome || '').trim();
    if (!nome) continue;
    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    values.push(listaId, nome, it.instagram || '', it.telefone || '', it.quem_convida || quem_convida || '');
    inserted++;
  }
  if (inserted === 0) return res.json({ inserted: 0 });
  await q(
    `INSERT INTO convidados (lista_id, nome, instagram, telefone, quem_convida) VALUES ${placeholders.join(', ')}`,
    values
  );
  res.json({ inserted });
}));

app.put('/api/convidados/:id/presenca', checkAuth, wrap(async (req, res) => {
  const { chegou } = req.body;
  await q('UPDATE convidados SET chegou = $1 WHERE id = $2', [!!chegou, req.params.id]);
  res.json({ success: true });
}));

app.put('/api/convidados/:id', checkAuth, wrap(async (req, res) => {
  const { nome, instagram, telefone, quem_convida, cpf } = req.body;
  await q(
    'UPDATE convidados SET nome = $1, instagram = $2, telefone = $3, quem_convida = $4, cpf = $5 WHERE id = $6',
    [nome, instagram || '', telefone || '', quem_convida || '', cpf || '', req.params.id]
  );
  res.json({ success: true });
}));

app.delete('/api/convidados/:id', checkAuth, wrap(async (req, res) => {
  await q('DELETE FROM convidados WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// =================== ANÁLISE ===================
function buildPeriodFilter(query, alias = 'l', startIndex = 1) {
  const { year, month, start, end } = query;
  if (start && end) {
    return {
      sql: `${alias}.data BETWEEN $${startIndex} AND $${startIndex + 1}`,
      params: [start, end],
      next: startIndex + 2,
    };
  }
  if (year && month) {
    return {
      sql: `to_char(${alias}.data, 'YYYY-MM') = $${startIndex}`,
      params: [`${year}-${String(month).padStart(2, '0')}`],
      next: startIndex + 1,
    };
  }
  return { sql: '', params: [], next: startIndex };
}

app.get('/api/analise/holders-performance', checkAuth, wrap(async (req, res) => {
  const f = buildPeriodFilter(req.query, 'l', 1);
  const dataFilter = f.sql ? 'AND ' + f.sql : '';
  const rows = await qAll(`
    SELECT
      h.id,
      h.name,
      h.instagram,
      COUNT(DISTINCT l.id)::int AS total_listas,
      COUNT(c.id)::int AS total_convites,
      COALESCE(SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END), 0)::int AS total_idas,
      ROUND(
        SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(c.id), 0)
      , 0)::int AS taxa_ativacao
    FROM holders h
    LEFT JOIN listas l ON l.holder_id = h.id ${dataFilter}
    LEFT JOIN convidados c ON c.lista_id = l.id
    GROUP BY h.id
    ORDER BY total_idas DESC, total_convites DESC
  `, f.params);
  res.json(rows);
}));

app.get('/api/analise/alertas-pessoas', checkAuth, wrap(async (req, res) => {
  const f = buildPeriodFilter(req.query, 'l', 1);
  const dataFilter = f.sql ? 'WHERE ' + f.sql : '';
  const min = Number(req.query.min || 2);
  const minPlaceholder = `$${f.next}`;
  const rows = await qAll(`
    SELECT
      LOWER(TRIM(c.nome)) AS nome_key,
      MIN(c.nome) AS nome,
      COUNT(*)::int AS total_vezes,
      SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END)::int AS total_idas,
      SUM(CASE WHEN NOT c.chegou THEN 1 ELSE 0 END)::int AS total_faltas,
      STRING_AGG(DISTINCT h.name, ', ') AS convidada_por
    FROM convidados c
    JOIN listas l ON c.lista_id = l.id
    LEFT JOIN holders h ON l.holder_id = h.id
    ${dataFilter}
    GROUP BY nome_key
    HAVING COUNT(*) >= ${minPlaceholder}
    ORDER BY total_faltas DESC, total_vezes DESC
  `, [...f.params, min]);
  res.json(rows);
}));

app.get('/api/analise/resumo', checkAuth, wrap(async (req, res) => {
  const f = buildPeriodFilter(req.query, 'l', 1);
  const dataFilter = f.sql ? 'WHERE ' + f.sql : '';
  const row = await qOne(`
    SELECT
      COUNT(DISTINCT l.id)::int AS total_listas,
      COUNT(c.id)::int AS total_convites,
      COALESCE(SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END), 0)::int AS total_idas,
      ROUND(
        SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(c.id), 0)
      , 0)::int AS taxa_global
    FROM listas l
    LEFT JOIN convidados c ON c.lista_id = l.id
    ${dataFilter}
  `, f.params);
  res.json(row || {});
}));

app.get('/api/analise/comparativo-mensal', checkAuth, wrap(async (req, res) => {
  const meses = Math.max(1, Math.min(24, Number(req.query.meses || 6)));
  const rows = await qAll(`
    SELECT
      to_char(l.data, 'YYYY-MM') AS ym,
      COUNT(DISTINCT l.id)::int AS total_listas,
      COUNT(c.id)::int AS total_convites,
      COALESCE(SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END), 0)::int AS total_idas,
      ROUND(
        SUM(CASE WHEN c.chegou THEN 1 ELSE 0 END)::numeric * 100
        / NULLIF(COUNT(c.id), 0)
      , 0)::int AS taxa
    FROM listas l
    LEFT JOIN convidados c ON c.lista_id = l.id
    WHERE l.data >= (CURRENT_DATE - ($1 || ' months')::interval)
    GROUP BY ym
    ORDER BY ym DESC
  `, [String(meses)]);
  res.json(rows);
}));

// Local dev: only listen when invoked directly (not in Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
