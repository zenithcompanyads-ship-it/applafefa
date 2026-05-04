// One-shot: copy data from local SQLite (lafefa.db) into Supabase/Postgres.
// Usage: npm run migrate
//
// Requires:
//   - lafefa.db existing in project root
//   - DATABASE_URL set in .env (Supabase pooler URI, port 6543)
//   - supabase/schema.sql already executed in Supabase

try { require('dotenv').config(); } catch (_) {}

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Create .env first.');
  process.exit(1);
}

const sqlitePath = path.join(__dirname, '..', 'lafefa.db');
const sdb = new sqlite3.Database(sqlitePath);
const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sqliteAll = (sql) => new Promise((resolve, reject) => {
  sdb.all(sql, (err, rows) => err ? reject(err) : resolve(rows || []));
});

async function copyTable(name, columns, rows, conflictKey = 'id') {
  if (rows.length === 0) {
    console.log(`  ${name}: 0 rows (skipped)`);
    return;
  }
  const cols = columns.join(', ');
  let inserted = 0;
  for (const row of rows) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((c) => row[c] === undefined ? null : row[c]);
    await pg.query(
      `INSERT INTO ${name} (${cols}) VALUES (${placeholders}) ON CONFLICT (${conflictKey}) DO NOTHING`,
      values
    );
    inserted++;
  }
  console.log(`  ${name}: ${inserted} rows`);

  // Bump the sequence so future inserts don't collide with copied IDs
  await pg.query(`
    SELECT setval(
      pg_get_serial_sequence('${name}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${name}), 1),
      true
    )
  `);
}

(async () => {
  try {
    console.log('→ Reading from SQLite...');
    const holders = await sqliteAll('SELECT id, name, instagram, telefone, created_at FROM holders');
    const aniversariantes = await sqliteAll('SELECT id, nome, instagram, telefone, data_evento, created_at FROM aniversariantes');
    const restritas = await sqliteAll('SELECT id, nome, motivo, criado_em FROM pessoas_restritas');
    const convFreq = await sqliteAll('SELECT id, nome, instagram, telefone, created_at FROM convidados_frequentes');
    const listas = await sqliteAll('SELECT id, holder_id, aniversariante_id, convidado_id, data, tipo, dia_semana, created_at FROM listas');
    const convidados = await sqliteAll('SELECT id, lista_id, nome, instagram, telefone, quem_convida, chegou, added_at FROM convidados');

    console.log('→ Writing to Postgres (Supabase)...');
    await copyTable('holders', ['id', 'name', 'instagram', 'telefone', 'created_at'], holders);
    await copyTable('aniversariantes', ['id', 'nome', 'instagram', 'telefone', 'data_evento', 'created_at'], aniversariantes);
    await copyTable('pessoas_restritas', ['id', 'nome', 'motivo', 'criado_em'], restritas);
    await copyTable('convidados_frequentes', ['id', 'nome', 'instagram', 'telefone', 'created_at'], convFreq);
    await copyTable('listas', ['id', 'holder_id', 'aniversariante_id', 'convidado_id', 'data', 'tipo', 'dia_semana', 'created_at'], listas);
    // SQLite stores chegou as 0/1 — Postgres expects boolean
    const convidadosNorm = convidados.map(c => ({ ...c, chegou: !!c.chegou }));
    await copyTable('convidados', ['id', 'lista_id', 'nome', 'instagram', 'telefone', 'quem_convida', 'chegou', 'added_at'], convidadosNorm);

    console.log('\n✅ Migration complete.');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    sdb.close();
    await pg.end();
  }
})();
