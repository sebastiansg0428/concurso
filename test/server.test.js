const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { crearAplicacion, iniciar } = require('../src/server');
const configuracionDb = require('../src/configuracion-db');
const migrarParticipantes = require('../scripts/migrate-participants');

const entorno = {
  SESSION_SECRET: 'secreto-de-sesion-solo-para-pruebas-de-servidor',
  VERIFICATION_SECRET: 'secreto-de-verificacion-solo-para-pruebas',
  PORT: '0',
};
const logger = { error() {}, log() {} };

async function servir(app, probar) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  try {
    await probar(`http://127.0.0.1:${servidor.address().port}`);
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test('MySQL exige configuración explícita y usuario no root en producción', () => {
  const env = {
    NODE_ENV: 'production', DB_HOST: 'mysql-interno', DB_USER: 'concurso',
    DB_PASS: 'valor-solo-de-prueba', DB_NAME: 'concurso', DB_PORT: '3306',
  };
  for (const nombre of ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME']) {
    assert.throws(() => configuracionDb({ ...env, [nombre]: '' }), new RegExp(nombre));
  }
  assert.throws(() => configuracionDb({ ...env, DB_USER: 'root' }), /no root/);
  for (const puerto of ['abc', '-1', '65536', '1.2']) {
    assert.throws(() => configuracionDb({ ...env, DB_PORT: puerto }), /DB_PORT/);
  }
  assert.throws(() => configuracionDb({ ...env, DB_NAME: 'base`invalida' }), /DB_NAME/);
  assert.equal(configuracionDb(env).user, 'concurso');
  assert.equal(configuracionDb({}).host, 'localhost', 'mantiene desarrollo local');
});

test('servidor conserva 400 y 413, oculta errores internos y rechaza secretos iguales', async () => {
  const rutas = express.Router();
  rutas.get('/fallo', () => { throw new Error('dato-confidencial'); });
  const opciones = { pool: { query: async () => [[]] }, rutasAdmin: rutas, env: entorno, logger };
  assert.throws(() => crearAplicacion({
    ...opciones, env: { ...entorno, VERIFICATION_SECRET: entorno.SESSION_SECRET },
  }), /independiente/);
  await servir(crearAplicacion(opciones), async (base) => {
    for (const [cuerpo, estado] of [['{', 400], [JSON.stringify({ valor: 'x'.repeat(21000) }), 413]]) {
      const respuesta = await fetch(base + '/api/verificacion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo,
      });
      assert.equal(respuesta.status, estado);
      assert.equal(typeof (await respuesta.json()).error, 'string');
    }
    const respuesta = await fetch(base + '/admin/api/fallo');
    assert.equal(respuesta.status, 500);
    assert.deepEqual(await respuesta.json(), { error: 'Error interno del servidor' });
  });
});

test('health permite sondeo HTTP interno, informa caída MySQL y no crea cookies', async () => {
  let fallo = false;
  const consultas = [];
  const pool = { query: async (sql) => {
    consultas.push(sql);
    if (fallo) throw new Error('información-privada');
    return [[]];
  } };
  const app = crearAplicacion({
    pool, rutasAdmin: express.Router(), logger,
    env: { ...entorno, NODE_ENV: 'production', PUBLIC_URL: 'https://concurso.example' },
  });
  await servir(app, async (base) => {
    let respuesta = await fetch(base + '/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { ok: true });
    assert.equal(respuesta.headers.get('set-cookie'), null);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(consultas, [{ sql: 'SELECT 1', timeout: 3000 }]);
    assert.equal((await fetch(base + '/api/cafes')).status, 403, 'resto de rutas exige HTTPS');
    fallo = true;
    respuesta = await fetch(base + '/health');
    assert.equal(respuesta.status, 503);
    assert.deepEqual(await respuesta.json(), { ok: false });
    app.locals.cerrando = true;
    fallo = false;
    const cantidad = consultas.length;
    assert.equal((await fetch(base + '/health')).status, 503);
    assert.equal(consultas.length, cantidad, 'no consulta durante apagado');
  });
});

test('cierre espera peticiones activas y cierra MySQL una sola vez', async () => {
  let liberar;
  let notificar;
  const recibida = new Promise((resolve) => { notificar = resolve; });
  const espera = new Promise((resolve) => { liberar = resolve; });
  const rutas = express.Router();
  rutas.get('/espera', async (req, res) => {
    notificar();
    await espera;
    res.json({ ok: true });
  });
  let cierres = 0;
  const servicio = await iniciar({
    pool: { query: async () => [[]], end: async () => { cierres++; } },
    rutasAdmin: rutas, env: entorno, logger,
  });
  try {
    const respuesta = fetch(`http://127.0.0.1:${servicio.servidor.address().port}/admin/api/espera`);
    await recibida;
    const cierre = servicio.cerrar();
    assert.equal(servicio.cerrar(), cierre);
    assert.equal(servicio.app.locals.cerrando, true);
    assert.equal(cierres, 0);
    liberar();
    assert.equal((await respuesta).status, 200);
    await cierre;
    assert.equal(cierres, 1);
    assert.equal(servicio.servidor.listening, false);
  } finally {
    liberar();
    await servicio.cerrar();
  }
});

test('migración de participantes no borra datos y es repetible', async () => {
  let existe = false;
  const consultas = [];
  const pool = { query: async (sql) => {
    consultas.push(sql);
    if (sql.startsWith('SHOW')) return [existe ? [{ Field: 'establecimiento', Type: 'varchar(120)', Null: 'NO' }] : []];
    existe = true;
    return [[]];
  } };
  assert.equal(await migrarParticipantes(pool), true);
  assert.equal(await migrarParticipantes(pool), false);
  assert.equal(consultas.filter((sql) => sql.startsWith('ALTER')).length, 1);
  assert.ok(consultas.every((sql) => !/DELETE|DROP|TRUNCATE/.test(sql)));
  await assert.rejects(migrarParticipantes({
    query: async () => [[{ Type: 'text', Null: 'YES' }]],
  }), /estructura incompatible/);
  await assert.rejects(migrarParticipantes({ query: async () => { throw new Error('fallo SQL'); } }), /fallo SQL/);
});
