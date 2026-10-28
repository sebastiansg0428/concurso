async function main() {
  if (!process.argv.includes('--confirmar-eliminacion')) {
    throw new Error(
      'Este comando elimina TODOS los votos y votantes actuales. ' +
      'Para confirmar: npm.cmd run reiniciar-votos -- --confirmar-eliminacion'
    );
  }
  if (!process.argv.includes('--confirmar-respaldo')) {
    throw new Error('Realiza y verifica una copia de seguridad; confirma con --confirmar-respaldo.');
  }

  require('dotenv').config({ quiet: true });
  const pool = require('../src/db');
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      try {
        await conn.query('DELETE FROM votos');
        await conn.query('DELETE FROM votantes');
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }

      await conn.query('ALTER TABLE votos AUTO_INCREMENT = 1');
      await conn.query('ALTER TABLE votantes AUTO_INCREMENT = 1');
    } finally {
      conn.release();
    }
    console.log('Votos y votantes eliminados; sus IDs volverán a empezar en 1. Cafés y administradores conservados.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error reiniciando votos y votantes:', err.message);
  process.exitCode = 1;
});
