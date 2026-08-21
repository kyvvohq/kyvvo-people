const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Migration runner simples: aplica em ordem os arquivos de db/*.sql ainda não
// registrados em `_migrations`. Suficiente pro volume de migrations deste
// serviço (não precisa de uma lib de migration dedicada).
async function migrar() {
  await pool.query(`
    create table if not exists _migrations (
      nome text primary key,
      aplicada_em timestamptz not null default now()
    )
  `);

  const dir = path.join(__dirname, '..', 'db');
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const arquivo of arquivos) {
    const { rows } = await pool.query('select 1 from _migrations where nome = $1', [arquivo]);
    if (rows.length) continue;

    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (nome) values ($1)', [arquivo]);
      await client.query('commit');
      console.log(`[db] migration aplicada: ${arquivo}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`[db] falha na migration ${arquivo}: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { pool, migrar };
