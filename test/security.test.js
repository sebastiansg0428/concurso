const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const configureSecurity = require('../src/security');
const createMailer = require('../src/mailer');
const MysqlSessionStore = require('../src/session-store');

const secret = 'a-test-secret-longer-than-thirty-two-characters';

async function serve(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('configuración rechaza secretos, HTTPS y proxies inseguros', () => {
  assert.throws(() => configureSecurity(express(), {}), /SESSION_SECRET/);
  assert.throws(() => configureSecurity(express(), { SESSION_SECRET: secret, TRUSTED_PROXIES: '1' }), /TRUSTED_PROXIES/);
  assert.throws(() => configureSecurity(express(), { SESSION_SECRET: secret, TRUSTED_PROXIES: '0.0.0.0/0' }), /todas/);
  assert.throws(() => configureSecurity(express(), {
    SESSION_SECRET: secret, NODE_ENV: 'production', PUBLIC_URL: 'http://example.com',
  }), /HTTPS/);
  assert.throws(() => createMailer({}), /SMTP_USER/);
});

test('producción exige HTTPS sin confiar en cabeceras directas', async () => {
  const app = express();
  configureSecurity(app, { SESSION_SECRET: secret, NODE_ENV: 'production', PUBLIC_URL: 'https://example.com' });
  app.get('/', (req, res) => res.send('ok'));
  await serve(app, async (base) => {
    const response = await fetch(base, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(response.status, 403);
  });
});

test('proxy autorizado permite HTTPS y cookie segura; HTTP local sigue disponible', async () => {
  const app = express();
  const options = configureSecurity(app, {
    SESSION_SECRET: secret, NODE_ENV: 'production', PUBLIC_URL: 'https://example.com',
    TRUSTED_PROXIES: '127.0.0.1/32',
  });
  app.use(session(options));
  app.get('/', (req, res) => { req.session.adminId = 1; res.json({ ip: req.ip }); });
  await serve(app, async (base) => {
    assert.equal((await fetch(base)).status, 403);
    const response = await fetch(base, { headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.4' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /;\s*Secure/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    const politica = response.headers.get('content-security-policy');
    assert.match(politica, /script-src 'self'/);
    assert.match(politica, /frame-ancestors 'none'/);
    assert.doesNotMatch(politica, /unsafe-inline|unsafe-eval/);
    assert.equal((await response.json()).ip, '203.0.113.4');
  });

  const local = express();
  configureSecurity(local, { SESSION_SECRET: secret });
  local.get('/', (req, res) => res.send('ok'));
  await serve(local, async (base) => assert.equal((await fetch(base)).status, 200));
});

test('actividad renueva cookie y vencimiento MySQL; inactividad vence sin revivir la sesión', async (contexto) => {
  let ahora = Date.now();
  contexto.mock.method(Date, 'now', () => ahora);
  let guardada;
  let renovaciones = 0;
  const pool = { query: async (sql, args) => {
    if (sql.startsWith('INSERT')) guardada = { sid: args[0], data: args[1], vence: args[2] };
    if (sql.startsWith('SELECT')) {
      return [guardada && guardada.vence > args[1] ? [{ data: guardada.data }] : []];
    }
    if (sql.startsWith('UPDATE') && guardada && guardada.sid === args[1] && guardada.vence > args[2]) {
      guardada.vence = args[0];
      renovaciones++;
    }
    return [{ affectedRows: 1 }];
  } };
  const app = express();
  const opciones = configureSecurity(app, { SESSION_SECRET: secret });
  app.use(session({ ...opciones, store: new MysqlSessionStore(pool) }));
  app.get('/entrar', (req, res) => { req.session.adminId = 1; res.json({ ok: true }); });
  app.get('/me', (req, res) => res.status(req.session.adminId ? 200 : 401).json({ ok: !!req.session.adminId }));
  await serve(app, async (base) => {
    const inicial = await fetch(base + '/entrar');
    const cookie = inicial.headers.get('set-cookie').split(';')[0];
    const vencimientoInicial = guardada.vence;
    ahora += 7 * 60 * 60 * 1000;
    const activa = await fetch(base + '/me', { headers: { Cookie: cookie } });
    assert.equal(activa.status, 200);
    assert.ok(activa.headers.get('set-cookie'), 'renueva también la cookie del navegador');
    assert.ok(guardada.vence > vencimientoInicial);
    assert.equal(renovaciones, 1);
    ahora += 2 * 60 * 60 * 1000;
    assert.ok(ahora > vencimientoInicial);
    assert.equal((await fetch(base + '/me', { headers: { Cookie: cookie } })).status, 200);
    ahora += 9 * 60 * 60 * 1000;
    assert.equal((await fetch(base + '/me', { headers: { Cookie: cookie } })).status, 401);
    const vencida = guardada.vence;
    const store = new MysqlSessionStore(pool);
    await new Promise((resolve, reject) => store.touch(guardada.sid, {
      cookie: { expires: new Date(ahora + 10000) },
    }, (err) => err ? reject(err) : resolve()));
    assert.equal(guardada.vence, vencida, 'touch no revive una sesión vencida');
  });
});

test('touch comunica errores MySQL', async () => {
  const store = new MysqlSessionStore({ query: async () => { throw new Error('fallo MySQL'); } });
  await assert.rejects(new Promise((resolve, reject) => store.touch('sid', {
    cookie: { expires: new Date() },
  }, (err) => err ? reject(err) : resolve())), /fallo MySQL/);
});

test('X-Forwarded-For no permite eludir límites sin proxy confiable', async () => {
  const app = express();
  configureSecurity(app, { SESSION_SECRET: secret });
  app.use(rateLimit({ windowMs: 60000, limit: 1, validate: { xForwardedForHeader: false } }));
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  await serve(app, async (base) => {
    const first = await fetch(base, { headers: { 'X-Forwarded-For': '203.0.113.1' } });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ip, '127.0.0.1');
    assert.equal((await fetch(base, { headers: { 'X-Forwarded-For': '203.0.113.2' } })).status, 429);
  });
});

test('almacén de sesiones usa MySQL, recupera y destruye sesiones', async () => {
  let saved;
  const pool = {
    query: async (sql, args) => {
      if (sql.startsWith('INSERT')) saved = args;
      if (sql.startsWith('SELECT')) return [[{ data: saved[1] }]];
      if (sql.startsWith('DELETE')) saved = null;
      return [{ affectedRows: 1 }];
    },
  };
  const store = new MysqlSessionStore(pool);
  const data = { cookie: { expires: new Date(Date.now() + 10000) }, adminId: 1 };
  await new Promise((resolve, reject) => store.set('sid', data, (err) => err ? reject(err) : resolve()));
  const read = await new Promise((resolve, reject) => store.get('sid', (err, result) => err ? reject(err) : resolve(result)));
  assert.equal(read.adminId, 1);
  assert.ok(saved[2] > Date.now());
  await new Promise((resolve, reject) => store.destroy('sid', (err) => err ? reject(err) : resolve()));
  assert.equal(saved, null);
});
