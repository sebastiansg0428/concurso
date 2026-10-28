function configuracionDb(env = process.env) {
  if (env.NODE_ENV === 'production') {
    for (const nombre of ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME']) {
      if (typeof env[nombre] !== 'string' || !env[nombre].trim()) {
        throw new Error(`Configura ${nombre} antes de iniciar en producción.`);
      }
    }
    if (env.DB_USER.trim().toLowerCase() === 'root') {
      throw new Error('En producción usa un usuario MySQL propio de la aplicación, no root.');
    }
  }
  const puerto = env.DB_PORT === undefined || env.DB_PORT === '' ? 3306 : Number(env.DB_PORT);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('DB_PORT debe ser un puerto válido entre 1 y 65535.');
  }
  const base = env.DB_NAME || 'concurso_cafes';
  if (!/^[a-zA-Z0-9_]+$/.test(base)) {
    throw new Error('DB_NAME solo admite letras, números y guiones bajos.');
  }
  return {
    host: env.DB_HOST || 'localhost',
    port: puerto,
    user: env.DB_USER || 'root',
    password: env.DB_PASS || '',
    database: base,
    charset: 'utf8mb4',
  };
}

module.exports = configuracionDb;
