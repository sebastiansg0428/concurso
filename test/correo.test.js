const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { correoValido, correoCanonico } = require('../src/correo');
const crearRutasPublicas = require('../src/routes/public');

test('correo: valida solo direcciones simples', () => {
  for (const correo of ['ana@example.com', ' Ana.Maria+voto@Gmail.com ', 'a_b-c@sub.example.co']) {
    assert.equal(correoValido(correo), true, `acepta ${correo}`);
  }
  for (const correo of [
    'x<otro@example.com>', '"Ana" <ana@example.com>', 'ana@example.com, otro@example.com', 'ana @example.com',
    'ana@example', 'ana@-example.com', 'ana@example..com', '@example.com', `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(160)}.com`, 'ana@example.com\r\nBcc: otro@example.com', 42, null,
  ]) {
    assert.equal(correoValido(correo), false, `rechaza ${correo}`);
  }
});

test('correo canónico: un buzón, una clave', () => {
  assert.equal(correoCanonico(' Ana.Maria+voto@GoogleMail.com '), 'anamaria@gmail.com');
  assert.equal(correoCanonico('a.n.a.maria@gmail.com'), 'anamaria@gmail.com');
  assert.equal(correoCanonico('Ana.Maria+x@Example.com'), 'ana.maria@example.com', 'otros dominios conservan puntos');
  assert.equal(correoCanonico('+solo@example.com'), '+solo@example.com');
});

test('mailer envía a un objeto de dirección y rechaza destinatarios no válidos', async () => {
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  const enviados = [];
  nodemailer.createTransport = () => ({ sendMail: async (mensaje) => { enviados.push(mensaje); return { accepted: ['ok'] }; } });
  try {
    delete require.cache[require.resolve('../src/mailer')];
    const enviar = require('../src/mailer')({ SMTP_USER: 'remitente@example.com', SMTP_PASS: 'prueba' });
    await enviar('ana@example.com', '123456');
    assert.deepEqual(enviados[0].to, { name: '', address: 'ana@example.com' });
    await assert.rejects(enviar('x<otro@example.com>', '123456'), /Destinatario/);
    assert.equal(enviados.length, 1);
  } finally {
    nodemailer.createTransport = original;
    delete require.cache[require.resolve('../src/mailer')];
  }
});

test('tope global diario de correos de verificación', async () => {
  let reloj = 1_000_000;
  const enviados = [];
  let fallar = false;
  const conexion = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql) => sql.startsWith('SELECT')
      ? [[{ next_send_at: 0, expires_at: 0, attempts: 0, consumed: 0 }]]
      : [[]],
  };
  const errores = [];
  const app = express();
  app.use(express.json());
  app.use('/api', crearRutasPublicas({
    pool: { getConnection: async () => conexion },
    secret: 'x'.repeat(32),
    now: () => reloj,
    logger: { error: (...args) => errores.push(args) },
    limiteCorreosPorDia: 2,
    sendCode: async (correo) => {
      if (fallar) throw new Error('fallo');
      enviados.push(correo);
    },
  }));
  assert.throws(() => crearRutasPublicas({ pool: {}, secret: 'x'.repeat(32), limiteCorreosPorDia: 0 }), /límite/);
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  const pedir = (correo) => fetch(`http://127.0.0.1:${servidor.address().port}/api/verificacion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo }),
  }).then((r) => r.status);
  try {
    fallar = true;
    assert.equal(await pedir('a@example.com'), 503, 'SMTP fallido');
    fallar = false;
    assert.equal(await pedir('a@example.com'), 200, 'un envío fallido no consume cupo');
    assert.equal(await pedir('b@example.com'), 200);
    assert.equal(await pedir('c@example.com'), 503, 'cupo diario agotado');
    assert.deepEqual(enviados, ['a@example.com', 'b@example.com']);
    assert.match(JSON.stringify(errores), /límite diario/);
    reloj += 24 * 60 * 60 * 1000;
    assert.equal(await pedir('c@example.com'), 200, 'el cupo se libera tras 24 horas');
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
