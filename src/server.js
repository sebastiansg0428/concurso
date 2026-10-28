const path = require('path');
const express = require('express');
const session = require('express-session');
const configureSecurity = require('./security');
const MysqlSessionStore = require('./session-store');
const createMailer = require('./mailer');

const publicRoutes = require('./routes/public');

function crearAplicacion({ pool, rutasAdmin, enviarCodigo, env = process.env, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  // Railway consulta este endpoint por HTTP interno, sin sesión ni datos personales.
  app.get('/health', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (app.locals.cerrando) return res.status(503).json({ ok: false });
    try {
      await pool.query({ sql: 'SELECT 1', timeout: 3000 });
      res.status(app.locals.cerrando ? 503 : 200).json({ ok: !app.locals.cerrando });
    } catch (err) {
      logger.error('Error de disponibilidad MySQL:', err.code || err.name);
      res.status(503).json({ ok: false });
    }
  });
  const sessionOptions = configureSecurity(app, env);
  const verificationSecret = env.VERIFICATION_SECRET;
  if (!verificationSecret || verificationSecret.length < 32 || verificationSecret === env.SESSION_SECRET ||
      /cambia/i.test(verificationSecret)) {
    throw new Error('Configura VERIFICATION_SECRET: secreto aleatorio independiente, mínimo 32 caracteres.');
  }
  app.use(express.json({ limit: '20kb' }));
  app.use(session({ ...sessionOptions, store: new MysqlSessionStore(pool) }));

  const textoLimite = (env.LIMITE_CORREOS_POR_DIA || '').trim();
  if (textoLimite && !/^[1-9]\d{0,4}$/.test(textoLimite)) {
    throw new Error('LIMITE_CORREOS_POR_DIA debe ser un número entero positivo.');
  }
  app.use('/api', publicRoutes({
    pool,
    secret: verificationSecret,
    sendCode: enviarCodigo || ((correo, code) => createMailer(env)(correo, code)),
    logger,
    limiteCorreosPorDia: textoLimite ? Number(textoLimite) : 400,
  }));
  app.use('/admin/api', rutasAdmin);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    logger.error('Error de servidor:', err.code || err.name);
    const estado = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    const mensajes = { 400: 'Solicitud JSON no válida', 413: 'La solicitud supera el tamaño permitido' };
    res.status(estado).json({ error: mensajes[estado] || (estado === 500 ? 'Error interno del servidor' : 'Solicitud no válida') });
  });
  return app;
}

async function iniciar({ pool, rutasAdmin, env = process.env, logger = console }) {
  const puerto = env.PORT === undefined || env.PORT === '' ? 3000 : Number(env.PORT);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) throw new Error('PORT no es válido.');
  const app = crearAplicacion({ pool, rutasAdmin, env, logger });
  await pool.query('SELECT sid FROM admin_sessions LIMIT 0');
  await pool.query('SELECT id FROM email_challenges LIMIT 0');
  try {
    await pool.query('SELECT correo_canonico FROM votantes LIMIT 0');
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    throw new Error('Falta votantes.correo_canonico. Haz un respaldo y ejecuta: npm run migrate-correo-canonico -- --confirmar-respaldo');
  }
  const limpiar = async () => {
    await pool.query('DELETE FROM email_challenges WHERE expires_at < ?', [Date.now() - 24 * 60 * 60 * 1000]);
    await pool.query('DELETE FROM admin_sessions WHERE expires_at < ?', [Date.now()]);
  };
  await limpiar();
  const servidor = await new Promise((resolve, reject) => {
    const instancia = app.listen(puerto, () => resolve(instancia));
    instancia.once('error', reject);
  });
  const limpieza = setInterval(() => limpiar().catch((err) =>
    logger.error('Error de limpieza:', err.code || err.name)), 60 * 60 * 1000);
  limpieza.unref();
  let cierre;
  function cerrar() {
    if (cierre) return cierre;
    app.locals.cerrando = true;
    clearInterval(limpieza);
    cierre = (async () => {
      await new Promise((resolve, reject) => servidor.close((err) => err ? reject(err) : resolve()));
      await pool.end();
    })();
    return cierre;
  }
  const puertoActivo = servidor.address().port;
  logger.log(`Servidor escuchando en el puerto ${puertoActivo}`);
  if (env.NODE_ENV !== 'production') {
    logger.log(`Votación: http://localhost:${puertoActivo}`);
    logger.log(`Panel admin: http://localhost:${puertoActivo}/admin/`);
  }
  return { app, servidor, cerrar };
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  let pool;
  Promise.resolve().then(async () => {
    pool = require('./db');
    const servicio = await iniciar({ pool, rutasAdmin: require('./routes/admin') });
    let apagando = false;
    const apagar = () => {
      if (apagando) return;
      apagando = true;
      console.log('Cerrando servidor y conexiones MySQL.');
      const limite = setTimeout(() => {
        console.error('Se agotó el plazo de cierre del servidor.');
        servicio.servidor.closeAllConnections();
        process.exit(1);
      }, 10000);
      servicio.cerrar().then(() => clearTimeout(limite)).catch((err) => {
        console.error('Error al cerrar:', err.code || err.name);
        process.exit(1);
      });
    };
    process.once('SIGTERM', apagar);
    process.once('SIGINT', apagar);
  }).catch(async (err) => {
    console.error('No se pudo iniciar. Revisa configuración, migraciones y MySQL:', err.code || err.message);
    process.exitCode = 1;
    if (pool) await pool.end();
  });
}

module.exports = { crearAplicacion, iniciar };
