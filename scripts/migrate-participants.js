async function migrarParticipantes(pool) {
  const [columnas] = await pool.query("SHOW COLUMNS FROM cafes LIKE 'establecimiento'");
  if (columnas.length) {
    if (columnas[0].Type.toLowerCase() !== 'varchar(120)' || columnas[0].Null !== 'NO') {
      throw new Error('La columna establecimiento existe con estructura incompatible; revisa el esquema antes de continuar.');
    }
    return false;
  }
  await pool.query("ALTER TABLE cafes ADD COLUMN establecimiento VARCHAR(120) NOT NULL DEFAULT '' AFTER nombre");
  return true;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  let pool;
  Promise.resolve().then(async () => {
    if (!process.argv.includes('--confirmar-respaldo')) {
      throw new Error('Verifica una copia de seguridad y prueba en una base temporal; confirma con --confirmar-respaldo.');
    }
    pool = require('../src/db');
    const aplicada = await migrarParticipantes(pool);
    console.log(aplicada
      ? 'Columna establecimiento agregada sin borrar datos. Completa los establecimientos desde el panel.'
      : 'La columna establecimiento ya existe; no se modificaron datos.');
  }).catch((err) => {
    console.error('Error de migración de participantes:', err.code || err.message);
    process.exitCode = 1;
  }).finally(async () => { if (pool) await pool.end(); });
}

module.exports = migrarParticipantes;
