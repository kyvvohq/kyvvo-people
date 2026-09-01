const path = require('path');
const { Pool } = require('pg');
const { migrar: migrarBase } = require('@kyvvohq/db-migrate');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// O runner virou @kyvvohq/db-migrate. Assinatura local sem args mantida pros
// call sites (index.js: `await migrar()`); comportamento idêntico ao de antes
// (mesma tabela `_migrations`, mesmas mensagens `[db] migration aplicada: X`).
function migrar() {
  return migrarBase({ pool, dir: path.join(__dirname, '..', 'db') });
}

module.exports = { pool, migrar };
