require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/db');

async function main() {
  if (!process.argv.includes('--confirm-delete-test-data')) {
    throw new Error(
      'Este comando elimina TODOS los votos, votantes y participantes actuales. ' +
      'Para confirmar: npm run replace-participants -- --confirm-delete-test-data'
    );
  }
  if (!process.argv.includes('--confirmar-respaldo')) {
    throw new Error('Realiza y verifica una copia de seguridad; confirma con --confirmar-respaldo.');
  }

  const conn = await pool.getConnection();
  try {
    const [columns] = await conn.query("SHOW COLUMNS FROM cafes LIKE 'establecimiento'");
    if (!columns.length) {
      throw new Error('Falta establecimiento. Ejecuta primero npm run migrate-participants -- --confirmar-respaldo.');
    }

    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    const seedStart = schema.indexOf('INSERT INTO cafes');
    if (seedStart < 0) throw new Error('No se encontraron los participantes en schema.sql.');

    await conn.beginTransaction();
    try {
      await conn.query('DELETE FROM votos');
      await conn.query('DELETE FROM votantes');
      await conn.query('DELETE FROM cafes');
      await conn.query(schema.slice(seedStart, schema.indexOf(';', seedStart) + 1));
      const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM cafes');
      if (total !== 4) throw new Error('Se esperaban exactamente cuatro participantes.');
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    console.log('Participantes reemplazados. Votos y votantes de prueba eliminados; administradores conservados.');
  } finally {
    conn.release();
  }
}

main()
  .catch((err) => {
    console.error('Error reemplazando participantes:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
