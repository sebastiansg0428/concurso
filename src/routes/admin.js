const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const pool = require('../db');
const requireAdmin = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión, espera unos minutos.' },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  const { usuario, clave } = req.body || {};
  if (typeof usuario !== 'string' || typeof clave !== 'string') {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  const [rows] = await pool.query('SELECT id, password_hash FROM admins WHERE usuario = ?', [usuario]);
  const ok = rows.length && (await bcrypt.compare(clave, rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: 'Usuario o clave incorrectos' });

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.adminId = rows[0].id;
    req.session.usuario = usuario;
    res.json({ ok: true });
  });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('cafes.sid');
    res.json({ ok: true });
  });
});

router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ usuario: req.session.usuario }));

function datosCafe(body) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
  const establecimiento = typeof body.establecimiento === 'string' ? body.establecimiento.trim() : '';
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim().slice(0, 1000) : '';
  const activo = body.activo === false || body.activo === 0 ? 0 : 1;
  return { nombre, establecimiento, descripcion, activo };
}

router.get('/cafes', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.establecimiento, c.descripcion, c.activo, COUNT(v.id) AS votos
     FROM cafes c LEFT JOIN votos v ON v.cafe_id = c.id
     GROUP BY c.id ORDER BY c.nombre`
  );
  res.json(rows);
});

router.post('/cafes', async (req, res) => {
  const c = datosCafe(req.body || {});
  if (c.nombre.length < 2) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (c.establecimiento.length < 2 || c.establecimiento.length > 120) {
    return res.status(400).json({ error: 'El establecimiento debe tener entre 2 y 120 caracteres' });
  }
  const [r] = await pool.query('INSERT INTO cafes (nombre, establecimiento, descripcion, activo) VALUES (?, ?, ?, ?)', [
    c.nombre,
    c.establecimiento,
    c.descripcion,
    c.activo,
  ]);
  res.status(201).json({ id: r.insertId });
});

router.put('/cafes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const c = datosCafe(req.body || {});
  if (c.nombre.length < 2) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (c.establecimiento.length < 2 || c.establecimiento.length > 120) {
    return res.status(400).json({ error: 'El establecimiento debe tener entre 2 y 120 caracteres' });
  }
  const [r] = await pool.query('UPDATE cafes SET nombre = ?, establecimiento = ?, descripcion = ?, activo = ? WHERE id = ?', [
    c.nombre,
    c.establecimiento,
    c.descripcion,
    c.activo,
    id,
  ]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Café no encontrado' });
  res.json({ ok: true });
});

router.delete('/cafes/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [r] = await pool.query('DELETE FROM cafes WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Café no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Este café ya tiene votos; desactívalo en lugar de eliminarlo.' });
    }
    throw err;
  }
});

router.get('/resultados', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.establecimiento, c.activo, COUNT(v.id) AS votos
     FROM cafes c LEFT JOIN votos v ON v.cafe_id = c.id
     GROUP BY c.id ORDER BY votos DESC, c.nombre`
  );
  const total = rows.reduce((s, r) => s + Number(r.votos), 0);
  res.json({ total, cafes: rows });
});

const UNION_VOTANTES = 'FROM votantes vt JOIN votos v ON v.votante_id = vt.id JOIN cafes c ON c.id = v.cafe_id';

const SQL_VOTANTES = `SELECT vt.id, vt.nombre, vt.correo, vt.telefono, vt.ciudad, c.nombre AS cafe, c.establecimiento, v.creado_en AS fecha
  ${UNION_VOTANTES}
  ORDER BY v.creado_en DESC, v.id DESC`;

const SQL_VOTANTES_CSV = `SELECT
  vt.id AS votante_id,
  v.id AS voto_id,
  vt.nombre,
  vt.correo,
  vt.telefono,
  vt.ciudad,
  c.nombre AS cafe,
  c.establecimiento,
  v.creado_en AS fecha
  ${UNION_VOTANTES}
  ORDER BY v.creado_en ASC, v.id ASC`;

router.get('/votantes', async (req, res) => {
  const [rows] = await pool.query(SQL_VOTANTES);
  res.json(rows);
});

function csvCelda(valor) {
  let s = valor instanceof Date ? valor.toISOString() : String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
  return '"' + s.replace(/"/g, '""') + '"';
}

router.get('/export.csv', async (req, res) => {
  const [rows] = await pool.query(SQL_VOTANTES_CSV);
  const cols = ['votante_id', 'voto_id', 'nombre', 'correo', 'telefono', 'ciudad', 'cafe', 'establecimiento', 'fecha'];
  const lineas = [cols.join(';'), ...rows.map((r) => cols.map((c) => csvCelda(r[c])).join(';'))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="votantes.csv"');
  res.send('\uFEFF' + lineas.join('\r\n'));
});

function urlPublica(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}/`;
}

router.get('/qr-info', (req, res) => res.json({ url: urlPublica(req) }));

router.get('/qr', async (req, res) => {
  const png = await QRCode.toBuffer(urlPublica(req), { width: 600, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  if (req.query.descargar) res.setHeader('Content-Disposition', 'attachment; filename="qr-concurso.png"');
  res.send(png);
});

module.exports = router;
