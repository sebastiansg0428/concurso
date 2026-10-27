const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db');

const router = express.Router();

const votoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta más tarde.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

function limpiar(v, max) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

router.get('/cafes', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, nombre, descripcion FROM cafes WHERE activo = 1 ORDER BY nombre'
  );
  res.json(rows);
});

router.post('/votos', votoLimiter, async (req, res) => {
  const body = req.body || {};
  const nombre = limpiar(body.nombre, 120);
  const correo = limpiar(body.correo, 160).toLowerCase();
  const telefono = limpiar(body.telefono, 30);
  const ciudad = limpiar(body.ciudad, 80);
  const cafeId = Number(body.cafeId);

  const errores = [];
  if (nombre.length < 2) errores.push('Nombre inválido');
  if (!EMAIL_RE.test(correo)) errores.push('Correo inválido');
  if (!PHONE_RE.test(telefono)) errores.push('Teléfono inválido');
  if (ciudad.length < 2) errores.push('Ciudad inválida');
  if (!Number.isInteger(cafeId) || cafeId <= 0) errores.push('Selecciona un café');
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cafe] = await conn.query('SELECT id FROM cafes WHERE id = ? AND activo = 1', [cafeId]);
    if (!cafe.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'El café seleccionado no existe' });
    }
    const [r] = await conn.query(
      'INSERT INTO votantes (nombre, correo, telefono, ciudad, ip) VALUES (?, ?, ?, ?, ?)',
      [nombre, correo, telefono, ciudad, req.ip]
    );
    await conn.query('INSERT INTO votos (votante_id, cafe_id) VALUES (?, ?)', [r.insertId, cafeId]);
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

module.exports = router;
