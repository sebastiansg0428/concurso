const { correoCanonico } = require('../src/correo');

const INDICE = 'uq_votantes_correo_canonico';

// Agrega votantes.correo_canonico sin borrar datos. Repetible: completa estados parciales.
async function migrarCorreoCanonico(pool) {
  const [votantes] = await pool.query('SELECT id, correo FROM votantes ORDER BY id');
  const porClave = new Map();
  for (const votante of votantes) {
    const clave = correoCanonico(votante.correo);
    porClave.set(clave, [...(porClave.get(clave) || []), votante.id]);
  }
  const duplicados = [...porClave.values()].filter((ids) => ids.length > 1);
  if (duplicados.length) {
    throw new Error(`Hay ${duplicados.length} buzones con más de un voto (ID de votantes: ` +
      `${duplicados.map((ids) => ids.join('/')).join(', ')}). Revísalos manualmente; no se modificó nada.`);
  }

  const cambios = [];
  const [columnas] = await pool.query("SHOW COLUMNS FROM votantes LIKE 'correo_canonico'");
  if (!columnas.length) {
    await pool.query('ALTER TABLE votantes ADD COLUMN correo_canonico VARCHAR(160) NULL AFTER correo');
    cambios.push('columna agregada');
  } else if (columnas[0].Type.toLowerCase() !== 'varchar(160)') {
    throw new Error('La columna correo_canonico existe con estructura incompatible; revisa el esquema.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [filas] = await conn.query('SELECT id, correo, correo_canonico FROM votantes FOR UPDATE');
    let completadas = 0;
    for (const fila of filas) {
      const clave = correoCanonico(fila.correo);
      if (fila.correo_canonico === clave) continue;
      await conn.query('UPDATE votantes SET correo_canonico = ? WHERE id = ?', [clave, fila.id]);
      completadas++;
    }
    await conn.commit();
    if (completadas) cambios.push(`${completadas} votantes completados`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [[columna]] = await pool.query("SHOW COLUMNS FROM votantes LIKE 'correo_canonico'");
  if (columna.Null !== 'NO') {
    await pool.query('ALTER TABLE votantes MODIFY correo_canonico VARCHAR(160) NOT NULL');
    cambios.push('columna obligatoria');
  }
  const [indices] = await pool.query('SHOW INDEX FROM votantes WHERE Key_name = ?', [INDICE]);
  if (!indices.length) {
    await pool.query(`ALTER TABLE votantes ADD UNIQUE KEY ${INDICE} (correo_canonico)`);
    cambios.push('índice único creado');
  } else if (indices[0].Non_unique !== 0 || indices.length !== 1 || indices[0].Column_name !== 'correo_canonico') {
    throw new Error(`El índice ${INDICE} existe con estructura incompatible; revisa el esquema.`);
  }
  return cambios;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  let pool;
  Promise.resolve().then(async () => {
    if (!process.argv.includes('--confirmar-respaldo')) {
      throw new Error('Verifica una copia de seguridad y prueba en una base temporal; confirma con --confirmar-respaldo.');
    }
    pool = require('../src/db');
    const cambios = await migrarCorreoCanonico(pool);
    console.log(cambios.length
      ? `Correo canónico aplicado sin borrar datos: ${cambios.join(', ')}.`
      : 'El correo canónico ya estaba aplicado; no se modificaron datos.');
  }).catch((err) => {
    console.error('Error de migración de correo canónico:', err.code || err.message);
    process.exitCode = 1;
  }).finally(async () => { if (pool) await pool.end(); });
}

module.exports = migrarCorreoCanonico;
