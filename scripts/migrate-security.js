require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/db');

(async () => {
  const statements = fs.readFileSync(path.join(__dirname, '..', 'database', 'security.sql'), 'utf8')
    .split(';').map((sql) => sql.trim()).filter(Boolean);
  for (const sql of statements) await pool.query(sql);
  console.log('Tablas de verificación y sesiones listas. Datos existentes conservados.');
})().catch((err) => {
  console.error('Error de migración:', err.message);
  process.exitCode = 1;
}).finally(() => pool.end());
