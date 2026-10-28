const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validarUsuarioApp, crearUsuarioApp } = require('../scripts/crear-usuario-app');

const claveValida = 'a'.repeat(16);

test('validarUsuarioApp acepta un usuario propio con clave larga', () => {
  assert.deepEqual(
    validarUsuarioApp({ DB_USER: 'root', USUARIO_APP: ' concurso_app ', CLAVE_USUARIO_APP: claveValida }),
    { usuario: 'concurso_app', clave: claveValida }
  );
});

test('validarUsuarioApp rechaza root, el mismo DB_USER, nombres inválidos y claves cortas', () => {
  const casos = [
    { DB_USER: 'root', USUARIO_APP: 'ROOT', CLAVE_USUARIO_APP: claveValida },
    { DB_USER: 'admin_db', USUARIO_APP: 'admin_db', CLAVE_USUARIO_APP: claveValida },
    { DB_USER: 'root', USUARIO_APP: "app'@'%", CLAVE_USUARIO_APP: claveValida },
    { DB_USER: 'root', USUARIO_APP: '', CLAVE_USUARIO_APP: claveValida },
    { DB_USER: 'root', USUARIO_APP: 'a'.repeat(33), CLAVE_USUARIO_APP: claveValida },
    { DB_USER: 'root', USUARIO_APP: 'concurso_app', CLAVE_USUARIO_APP: 'corta' },
  ];
  for (const env of casos) assert.throws(() => validarUsuarioApp(env));
});

test('crearUsuarioApp concede solo permisos de datos y envía usuario y clave como parámetros', async () => {
  const consultas = [];
  const conn = { query: async (sql, valores) => consultas.push([sql, valores]) };
  await crearUsuarioApp(conn, { usuario: 'concurso_app', clave: claveValida, base: 'railway' });
  assert.equal(consultas.length, 3);
  for (const [sql, valores] of consultas) {
    assert.ok(!sql.includes(claveValida));
    assert.equal(valores[0], 'concurso_app');
  }
  assert.match(consultas[2][0], /^GRANT SELECT, INSERT, UPDATE, DELETE ON `railway`\.\* TO \?@'%'$/);
});
