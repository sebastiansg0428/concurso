require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

(async () => {
  const usuario = process.argv[2] || process.env.ADMIN_USER;
  const clave = process.argv[3] || process.env.ADMIN_PASS;
  if (!usuario || !clave || clave.length < 8) {
    console.error('Uso: npm run create-admin -- <usuario> <clave (mín. 8 caracteres)>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(clave, 10);
  await pool.query(
    'INSERT INTO admins (usuario, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [usuario, hash]
  );
  console.log(`Administrador "${usuario}" creado/actualizado.`);
  await pool.end();
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
