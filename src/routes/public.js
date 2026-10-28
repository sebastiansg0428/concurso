const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomInt, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');

const { correoValido: esCorreoValido, normalizarCorreo, correoCanonico } = require('../correo');

const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;
const DURATION = 10 * 60 * 1000;
const COOLDOWN = 60 * 1000;
const UN_DIA = 24 * 60 * 60 * 1000;

function limpiar(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function createPublicRoutes({ pool, sendCode, secret, now = Date.now, logger = console, limiteCorreosPorDia = 400 }) {
  if (!secret || secret.length < 32) throw new Error('Secreto de verificación inválido.');
  if (!Number.isInteger(limiteCorreosPorDia) || limiteCorreosPorDia < 1) {
    throw new Error('El límite de correos por día debe ser un entero positivo.');
  }
  // Tope global en memoria (válido con una sola instancia) para no agotar la cuota diaria de Gmail
  // aunque alguien rote direcciones IP. Guarda los instantes de envío de las últimas 24 horas.
  const enviosRecientes = [];
  const reservarEnvio = () => {
    const limite = now() - UN_DIA;
    while (enviosRecientes.length && enviosRecientes[0] <= limite) enviosRecientes.shift();
    if (enviosRecientes.length >= limiteCorreosPorDia) return null;
    const marca = now();
    enviosRecientes.push(marca);
    return marca;
  };
  const liberarEnvio = (marca) => {
    const posicion = enviosRecientes.indexOf(marca);
    if (posicion !== -1) enviosRecientes.splice(posicion, 1);
  };
  const router = express.Router();
  const limiter = (limit) => rateLimit({
    windowMs: 10 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos, intenta más tarde.' },
  });
  const hash = (id, code) => createHmac('sha256', secret).update(`${id}:${code}`).digest('hex');
  const correoValido = (body) => esCorreoValido(body.correo);

  router.get('/cafes', async (req, res) => {
    const [rows] = await pool.query(
      'SELECT id, nombre, establecimiento, descripcion FROM cafes WHERE activo = 1 ORDER BY nombre'
    );
    res.json(rows);
  });

  async function procesarVerificacion(conn, destinatario, clave) {
    await conn.beginTransaction();
    const currentTime = now();
    const id = randomBytes(32).toString('hex');
    // email_challenges.correo guarda el correo canónico: los alias comparten espera, intentos y bloqueo.
    await conn.query(
      'INSERT INTO email_challenges (id, correo, code_hash, expires_at, next_send_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE correo = VALUES(correo)',
      [id, clave, hash(id, 'unused'), currentTime, 0]
    );
    const [[challenge]] = await conn.query('SELECT * FROM email_challenges WHERE correo = ? FOR UPDATE', [clave]);
    if (challenge.next_send_at > currentTime) {
      await conn.rollback();
      return { estado: 429, cuerpo: { error: 'Espera 60 segundos antes de solicitar otro código.' } };
    }
    const active = challenge.expires_at > currentTime;
    if (active && (challenge.attempts >= 5 || challenge.consumed)) {
      await conn.rollback();
      return { estado: 429, cuerpo: { error: 'Verificación bloqueada. Espera a que termine el plazo de 10 minutos.' } };
    }
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    // No se renueva la caducidad ni el presupuesto de intentos mediante reenvíos.
    await conn.query(
      'UPDATE email_challenges SET id = ?, code_hash = ?, expires_at = ?, attempts = ?, next_send_at = ?, consumed = 0 WHERE correo = ?',
      [id, hash(id, code), active ? challenge.expires_at : currentTime + DURATION,
        active ? challenge.attempts : 0, currentTime + COOLDOWN, clave]
    );
    const reserva = reservarEnvio();
    if (reserva === null) {
      await conn.rollback();
      logger.error('Se alcanzó el límite diario de correos de verificación.');
      return { estado: 503, cuerpo: { error: 'Se alcanzó el límite de códigos por hoy. Intenta más tarde.' } };
    }
    try {
      await sendCode(destinatario, code);
    } catch (err) {
      liberarEnvio(reserva);
      await conn.rollback();
      const diagnostics = {};
      for (const field of ['name', 'code', 'command']) {
        if (typeof err?.[field] === 'string' && /^[a-zA-Z0-9 _-]{1,64}$/.test(err[field])) {
          diagnostics[field] = err[field];
        }
      }
      if (Number.isInteger(err?.responseCode) && err.responseCode >= 100 && err.responseCode <= 599) {
        diagnostics.responseCode = err.responseCode;
      }
      logger.error('Error enviando verificación SMTP:', diagnostics);
      return { estado: 503, cuerpo: { error: 'No se pudo enviar el código. Revisa la configuración de Gmail o intenta más tarde.' } };
    }
    await conn.commit();
    return { estado: 200, cuerpo: { challengeId: id, expiresAt: active ? challenge.expires_at : currentTime + DURATION, resendAfter: 60 } };
  }

  router.post('/verificacion', limiter(10), async (req, res) => {
    const body = req.body || {};
    if (!correoValido(body)) return res.status(400).json({ error: 'Correo inválido' });
    const correo = normalizarCorreo(body.correo);
    const clave = correoCanonico(correo);
    const conn = await pool.getConnection();
    try {
      // Cambiar el id (clave primaria) en solicitudes simultáneas puede provocar interbloqueos en InnoDB.
      // La víctima se revierte antes de enviar el correo, así que reintentarla es seguro.
      for (let intento = 1; ; intento++) {
        try {
          const { estado, cuerpo } = await procesarVerificacion(conn, correo, clave);
          return res.status(estado).json(cuerpo);
        } catch (err) {
          await conn.rollback();
          if (err.code !== 'ER_LOCK_DEADLOCK' || intento >= 3) throw err;
        }
      }
    } finally {
      conn.release();
    }
  });

  router.post('/votos', limiter(40), async (req, res) => {
    const body = req.body || {};
    const nombre = limpiar(body.nombre, 120);
    const correo = limpiar(body.correo, 160).toLowerCase();
    const clave = correoValido(body) ? correoCanonico(correo) : '';
    const telefono = limpiar(body.telefono, 30);
    const ciudad = limpiar(body.ciudad, 80);
    const cafeId = Number(body.cafeId);
    const errores = [];
    if (nombre.length < 2) errores.push('Nombre inválido');
    if (!correoValido(body)) errores.push('Correo inválido');
    if (!PHONE_RE.test(telefono)) errores.push('Teléfono inválido');
    if (ciudad && ciudad.length < 2) errores.push('La ciudad debe tener al menos 2 caracteres');
    if (!Number.isInteger(cafeId) || cafeId <= 0) errores.push('Selecciona una bebida');
    if (typeof body.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(body.challengeId) ||
      typeof body.codigo !== 'string' || !/^\d{6}$/.test(body.codigo)) {
      errores.push('Solicita e introduce el código de verificación de tu correo');
    }
    if (errores.length) return res.status(400).json({ error: errores.join('. ') });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[challenge]] = await conn.query(
        'SELECT * FROM email_challenges WHERE id = ? AND correo = ? FOR UPDATE', [body.challengeId, clave]
      );
      if (!challenge || challenge.expires_at <= now() || challenge.consumed || challenge.attempts >= 5) {
        await conn.rollback();
        return res.status(400).json({ error: 'Código vencido, bloqueado o utilizado. Solicita uno nuevo cuando termine el plazo.' });
      }
      if (!timingSafeEqual(Buffer.from(challenge.code_hash, 'hex'), Buffer.from(hash(challenge.id, body.codigo), 'hex'))) {
        await conn.query('UPDATE email_challenges SET attempts = attempts + 1 WHERE id = ?', [challenge.id]);
        await conn.commit();
        return res.status(400).json({ error: `Código incorrecto. Intentos restantes: ${4 - challenge.attempts}.` });
      }
      const [cafe] = await conn.query('SELECT id FROM cafes WHERE id = ? AND activo = 1 FOR UPDATE', [cafeId]);
      if (!cafe.length) {
        await conn.rollback();
        return res.status(400).json({ error: 'La bebida seleccionada no está disponible' });
      }
      const [result] = await conn.query(
        'INSERT INTO votantes (nombre, correo, correo_canonico, telefono, ciudad, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [nombre, correo, clave, telefono, ciudad, req.ip]
      );
      await conn.query('INSERT INTO votos (votante_id, cafe_id) VALUES (?, ?)', [result.insertId, cafeId]);
      await conn.query('UPDATE email_challenges SET consumed = 1 WHERE id = ?', [challenge.id]);
      await conn.commit();
      res.status(201).json({ ok: true });
    } catch (err) {
      await conn.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este correo ya registró un voto. ¡Gracias por participar!' });
      }
      throw err;
    } finally {
      conn.release();
    }
  });
  return router;
}

module.exports = createPublicRoutes;
