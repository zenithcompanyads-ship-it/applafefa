// One-shot: copy data from local SQLite (lafefa.db) into Supabase/Postgres.
// Usage: npm run migrate
//
// Handles legacy data quirks:
//   - orphan FK refs (holder/aniversariante/convidado IDs that no longer exist) → NULL
//   - legacy tipo values ('convidados' → 'convidado', 'aniversarios' → 'aniversariante')
//   - listas that become invalid after normalization → skipped (with their convidados)

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

async function copyRows(name, columns, rows) {
  if (rows.length === 0) {
    console.log(`  ${name}: 0 rows`);
    return;
  }
  for (const row of rows) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((c) => row[c] === undefined ? null : row[c]);
    await pg.query(
      `INSERT INTO ${name} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values
    );
  }
  console.log(`  ${name}: ${rows.length} rows`);
  await pg.query(`
    SELECT setval(pg_get_serial_sequence('${name}', 'id'),
                  COALESCE((SELECT MAX(id) FROM ${name}), 1), true)
  `);
}

function normalizeTipo(t) {
  if (t === 'convidados') return 'convidado';
  if (t === 'aniversarios') return 'aniversariante';
  return t;
}

(async () => {
  try {
    console.log('→ Reading from SQLite...');
    const holders = await sqliteAll('SELECT id, name, instagram, telefone, created_at FROM holders');
    const anis = await sqliteAll('SELECT id, nome, instagram, telefone, data_evento, created_at FROM aniversariantes');
    const restritas = await sqliteAll('SELECT id, nome, motivo, criado_em FROM pessoas_restritas');
    const convFreq = await sqliteAll('SELECT id, nome, instagram, telefone, created_at FROM convidados_frequentes');
    const listasRaw = await sqliteAll('SELECT id, holder_id, aniversariante_id, convidado_id, data, tipo, dia_semana, created_at FROM listas');
    const convidadosRaw = await sqliteAll('SELECT id, lista_id, nome, instagram, telefone, quem_convida, chegou, added_at FROM convidados');

    const validHolderIds = new Set(holders.map((h) => h.id));
    const validAniIds = new Set(anis.map((a) => a.id));
    const validCfIds = new Set(convFreq.map((c) => c.id));

    let skippedListas = 0;
    const listas = listasRaw
      .map((l) => {
        const tipo = normalizeTipo(l.tipo);
        const holder_id = validHolderIds.has(l.holder_id) ? l.holder_id : null;
        const aniversariante_id = validAniIds.has(l.aniversariante_id) ? l.aniversariante_id : null;
        const convidado_id = validCfIds.has(l.convidado_id) ? l.convidado_id : null;
        return { ...l, tipo, holder_id, aniversariante_id, convidado_id };
      })
      .filter((l) => {
        const ok =
          (l.tipo === 'holder' && l.holder_id) ||
          (l.tipo === 'aniversariante' && l.aniversariante_id) ||
          (l.tipo === 'convidado');
        if (!ok) skippedListas++;
        return ok;
      });

    const validListaIds = new Set(listas.map((l) => l.id));
    let skippedConvidados = 0;
    const convidados = convidadosRaw
      .filter((c) => {
        const ok = validListaIds.has(c.lista_id);
        if (!ok) skippedConvidados++;
        return ok;
      })
      .map((c) => ({ ...c, chegou: !!c.chegou }));

    console.log(`→ Skipping ${skippedListas} orphan listas and ${skippedConvidados} of their convidados.`);

    console.log('→ Writing to Postgres (Supabase)...');
    await copyRows('holders', ['id', 'name', 'instagram', 'telefone', 'created_at'], holders);
    await copyRows('aniversariantes', ['id', 'nome', 'instagram', 'telefone', 'data_evento', 'created_at'], anis);
    await copyRows('pessoas_restritas', ['id', 'nome', 'motivo', 'criado_em'], restritas);
    await copyRows('convidados_frequentes', ['id', 'nome', 'instagram', 'telefone', 'created_at'], convFreq);
    await copyRows('listas', ['id', 'holder_id', 'aniversariante_id', 'convidado_id', 'data', 'tipo', 'dia_semana', 'created_at'], listas);
    await copyRows('convidados', ['id', 'lista_id', 'nome', 'instagram', 'telefone', 'quem_convida', 'chegou', 'added_at'], convidados);

    console.log('\n✅ Migration complete.');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    sdb.close();
    await pg.end();
  }
})();
