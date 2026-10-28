require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const configuracionDb = require('../src/configuracion-db');

const PERMISOS = 'SELECT, INSERT, UPDATE, DELETE';

function validarUsuarioApp(env = process.env) {
  const usuario = (env.USUARIO_APP || '').trim();
  const clave = env.CLAVE_USUARIO_APP || '';
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(usuario)) {
    throw new Error('USUARIO_APP debe tener de 1 a 32 letras, números o guiones bajos.');
  }
  if (usuario.toLowerCase() === 'root') {
    throw new Error('USUARIO_APP no puede ser root.');
  }
  if (usuario.toLowerCase() === (env.DB_USER || 'root').trim().toLowerCase()) {
    throw new Error('USUARIO_APP debe ser distinto del usuario administrador indicado en DB_USER.');
  }
  if (clave.length < 16) {
    throw new Error('CLAVE_USUARIO_APP debe tener al menos 16 caracteres.');
  }
  return { usuario, clave };
}

// Crea o actualiza el usuario que usará la app en producción, solo con permisos sobre los datos.
async function crearUsuarioApp(conn, { usuario, clave, base }) {
  await conn.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [usuario, clave]);
  await conn.query("ALTER USER ?@'%' IDENTIFIED BY ?", [usuario, clave]);
  await conn.query(`GRANT ${PERMISOS} ON \`${base}\`.* TO ?@'%'`, [usuario]);
}

if (require.main === module) {
  (async () => {
    const datos = validarUsuarioApp();
    const configuracion = configuracionDb();
    const conn = await mysql.createConnection(configuracion);
    try {
      await crearUsuarioApp(conn, { ...datos, base: configuracion.database });
    } finally {
      await conn.end();
    }
    console.log(`Usuario "${datos.usuario}" listo con ${PERMISOS} sobre "${configuracion.database}".`);
  })().catch((err) => {
    console.error('Error creando el usuario de la aplicación:', err.message);
    process.exit(1);
  });
}

module.exports = { validarUsuarioApp, crearUsuarioApp, PERMISOS };
