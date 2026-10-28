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

test('mailer usa la API HTTPS de Brevo cuando hay BREVO_API_KEY', async () => {
  const createMailer = require('../src/mailer');
  const llamadas = [];
  let estado = 201;
  const fetchFalso = async (url, opciones) => { llamadas.push({ url, opciones }); return { ok: estado < 300, status: estado }; };
  const enviar = createMailer({ BREVO_API_KEY: ' clave-prueba ', CORREO_REMITENTE: 'remitente@example.com', SMTP_PASS: '' }, { fetch: fetchFalso });
  await enviar(' ana@example.com ', '123456');
  assert.equal(llamadas[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(llamadas[0].opciones.headers['api-key'], 'clave-prueba');
  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  assert.deepEqual(cuerpo.to, [{ email: 'ana@example.com' }]);
  assert.equal(cuerpo.sender.email, 'remitente@example.com');
  assert.match(cuerpo.textContent, /123456/);
  await assert.rejects(enviar('x<otro@example.com>', '123456'), /Destinatario/);
  assert.equal(llamadas.length, 1);
  estado = 401;
  await assert.rejects(enviar('ana@example.com', '123456'), /HTTP 401/);
  const conSmtpUser = createMailer({ BREVO_API_KEY: 'k', SMTP_USER: 'gmail@example.com' }, { fetch: fetchFalso });
  estado = 201;
  await conSmtpUser('ana@example.com', '1');
  assert.equal(JSON.parse(llamadas.at(-1).opciones.body).sender.email, 'gmail@example.com');
  assert.throws(() => createMailer({ BREVO_API_KEY: 'k' }), /CORREO_REMITENTE/);
});

test('tope global diario de correos de verificación', async () => {
  let reloj = Date.parse('2026-11-05T12:00:00-05:00');
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
    horario: require('../src/horario-votacion').crearHorarioVotacion({}, {
      inicio: Date.parse('2026-11-01T09:00:00-05:00'),
      fin: Date.parse('2026-11-15T00:00:00-05:00'),
      ensayo: false,
    }),
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
