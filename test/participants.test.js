require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const root = path.join(__dirname, '..');
const expected = [
  ['Brisa Mirandeña', 'Cafelado', 'El frescor de nuestra tierra, con alma de café.'],
  ['Café Paramo', 'Esmikafé', 'El equilibrio del café con un toque del dulzor natural de los frutos rojos y la sedosidad de la leche, la convierte en una bebida única, diferente, refrescante y muy deliciosa.'],
  ['Cold Brew de lulo.', 'Café Espíritu de Paz', 'Una experiencia que conecta origen, cultura y comunidad.'],
  ['MOMI, Mocaccino Mirandeño', 'Raíces de Miranda', 'Un sorbo de nuestra tierra, una experiencia para el alma.'],
];

test('participantes: instalación, actualización, CRUD, votos y CSV', async () => {
  const dbName = `concurso_test_${process.pid}_${Date.now()}`;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  let server;
  let pool;
  let created = false;
  try {
    await connection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await connection.query(`USE \`${dbName}\``);
    const schema = readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8')
      .replaceAll('concurso_cafes', dbName);
    await connection.query(schema);
    const readParticipants = async () => {
      const [rows] = await connection.query('SELECT nombre, establecimiento, descripcion FROM cafes ORDER BY nombre');
      return rows.map((r) => [r.nombre, r.establecimiento, r.descripcion]);
    };
    assert.deepEqual(await readParticipants(), expected);
    await connection.query(schema);
    assert.deepEqual(await readParticipants(), expected, 'init-db no duplica participantes');

    const passwordHash = await bcrypt.hash('test-only-password', 4);
    await connection.query('INSERT INTO admins (usuario, password_hash) VALUES (?, ?)', ['test-admin', passwordHash]);
    await connection.query("UPDATE cafes SET nombre = CONCAT('Ejemplo ', id)");
    await connection.query('ALTER TABLE cafes DROP COLUMN establecimiento');
    await connection.query(
      'INSERT INTO votantes (nombre, correo, telefono, ciudad) VALUES (?, ?, ?, ?)',
      ['Prueba', 'old@example.com', '3001234567', 'Miranda']
    );
    await connection.query('INSERT INTO votos (votante_id, cafe_id) SELECT 1, MIN(id) FROM cafes');

    const env = { ...process.env, DB_NAME: dbName, NODE_ENV: 'test' };
    const refused = spawnSync(process.execPath, ['scripts\\replace-participants.js'], { cwd: root, env });
    assert.equal(refused.status, 1, 'se exige confirmación explícita');
    const [[before]] = await connection.query('SELECT COUNT(*) AS total FROM votos');
    assert.equal(before.total, 1, 'sin confirmación no se borran votos');
    const sinRespaldo = spawnSync(process.execPath, ['scripts\\replace-participants.js', '--confirm-delete-test-data'], { cwd: root, env });
    assert.equal(sinRespaldo.status, 1, 'se exige respaldo confirmado');
    const sinMigracion = spawnSync(process.execPath, [
      'scripts\\replace-participants.js', '--confirm-delete-test-data', '--confirmar-respaldo',
    ], { cwd: root, env });
    assert.equal(sinMigracion.status, 1, 'el reemplazo no migra el esquema');
    const [columnasAntes] = await connection.query("SHOW COLUMNS FROM cafes LIKE 'establecimiento'");
    assert.equal(columnasAntes.length, 0);
    const migracionSinRespaldo = spawnSync(process.execPath, ['scripts\\migrate-participants.js'], { cwd: root, env });
    assert.equal(migracionSinRespaldo.status, 1);
    const registrosPrevios = {};
    for (const tabla of ['cafes', 'votantes', 'votos', 'admins']) {
      [registrosPrevios[tabla]] = await connection.query(`SELECT * FROM ${tabla} ORDER BY id`);
    }
    for (let intento = 0; intento < 2; intento++) {
      execFileSync(process.execPath, ['scripts\\migrate-participants.js', '--confirmar-respaldo'], { cwd: root, env });
      for (const tabla of Object.keys(registrosPrevios)) {
        const [registros] = await connection.query(`SELECT * FROM ${tabla} ORDER BY id`);
        if (tabla === 'cafes') {
          for (const registro of registros) {
            assert.equal(registro.establecimiento, '');
            delete registro.establecimiento;
          }
        }
        assert.deepEqual(registros, registrosPrevios[tabla], `migración repetible conserva todos los datos de ${tabla}`);
      }
    }
    execFileSync(process.execPath, [
      'scripts\\replace-participants.js', '--confirm-delete-test-data', '--confirmar-respaldo',
    ], { cwd: root, env });
    assert.deepEqual(await readParticipants(), expected);
    for (const table of ['votos', 'votantes']) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS total FROM ${table}`);
      assert.equal(row.total, 0);
    }
    const [[admin]] = await connection.query('SELECT password_hash FROM admins WHERE usuario = ?', ['test-admin']);
    assert.equal(admin.password_hash, passwordHash, 'administrador intacto');

    process.env.DB_NAME = dbName;
    pool = require('../src/db');
    let clock = Date.now();
    const sentCodes = new Map();
    const smtpLogs = [];
    let smtpFailure = false;
    const routesOptions = {
      pool,
      secret: 'test-verification-secret-32-characters-minimum',
      now: () => clock,
      logger: { error: (...args) => smtpLogs.push(args) },
      sendCode: async (correo, code) => {
        if (smtpFailure) {
          const error = new Error('SMTP simulado no disponible: contraseña-sensible');
          Object.assign(error, { code: 'ESOCKET', command: 'CONN', responseCode: 421, auth: 'secreto' });
          throw error;
        }
        sentCodes.set(correo, code);
      },
    };
    const app = express();
    app.use(express.json());
    const MysqlSessionStore = require('../src/session-store');
    app.use(session({
      secret: 'integration-test-only', resave: false, saveUninitialized: false,
      store: new MysqlSessionStore(pool),
      cookie: { maxAge: 8 * 60 * 60 * 1000 },
    }));
    app.use('/api', require('../src/routes/public')(routesOptions));
    app.use('/checks', require('../src/routes/public')(routesOptions));
    app.use('/admin/api', require('../src/routes/admin'));
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const request = async (route, method = 'GET', body) => fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let response = await request('/admin/api/resultados');
    assert.equal(response.status, 401);
    response = await request('/admin/api/login', 'POST', { usuario: 'test-admin', clave: 'test-only-password' });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0];

    response = await request('/api/cafes');
    const drinks = await response.json();
    assert.deepEqual(drinks.map((r) => [r.nombre, r.establecimiento, r.descripcion]), expected);
    const draft = { nombre: 'Bebida prueba', establecimiento: 'Local prueba', descripcion: 'Frase prueba', activo: true };
    response = await request('/admin/api/cafes', 'POST', { ...draft, establecimiento: '' });
    assert.equal(response.status, 400);
    response = await request('/admin/api/cafes', 'POST', { ...draft, establecimiento: 'x'.repeat(121) });
    assert.equal(response.status, 400);
    response = await request('/admin/api/cafes', 'POST', draft);
    assert.equal(response.status, 201);
    const { id } = await response.json();
    response = await request(`/admin/api/cafes/${id}`, 'PUT', { ...draft, establecimiento: '' });
    assert.equal(response.status, 400);
    response = await request(`/admin/api/cafes/${id}`, 'PUT', { ...draft, establecimiento: 'Local actualizado', activo: false });
    assert.equal(response.status, 200);
    const adminDrinks = await (await request('/admin/api/cafes')).json();
    assert.equal(adminDrinks.find((r) => r.id === id).establecimiento, 'Local actualizado');
    assert.equal((await (await request('/api/cafes')).json()).length, 4, 'inactiva no visible');
    response = await request(`/admin/api/cafes/${id}`, 'DELETE');
    assert.equal(response.status, 200);

    const voter = { nombre: 'Prueba flujo', correo: 'first@example.com', telefono: '3001234567', ciudad: 'Miranda', cafeId: drinks[0].id };
    assert.equal((await request('/api/votos', 'POST', voter)).status, 400, 'ruta anterior no permite votos sin código');
    const verify = async (data) => {
      clock += 10 * 60 * 1000 + 1;
      const email = data.correo.trim().toLowerCase();
      const sent = await request('/api/verificacion', 'POST', { correo: email });
      assert.equal(sent.status, 200);
      const challenge = await sent.json();
      return { ...data, challengeId: challenge.challengeId, codigo: sentCodes.get(email) };
    };
    assert.equal((await request('/api/votos', 'POST', await verify(voter))).status, 201);
    assert.equal((await request('/api/votos', 'POST', await verify({ ...voter, correo: 'FIRST@example.com' }))).status, 409);
    assert.equal((await request('/api/votos', 'POST', await verify({ ...voter, correo: 'second@example.com', cafeId: drinks[1].id }))).status, 201);
    const results = await (await request('/admin/api/resultados')).json();
    assert.equal(results.total, 2);
    assert.equal(results.cafes.find((r) => r.id === drinks[0].id).establecimiento, expected[0][1]);
    const voters = await (await request('/admin/api/votantes')).json();
    assert.equal(voters.length, 2);
    assert.ok(voters.every((r) => r.establecimiento && r.cafe && r.id));
    const csv = await (await request('/admin/api/export.csv')).text();
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    assert.equal(lines[0], 'votante_id;voto_id;nombre;correo;telefono;ciudad;cafe;establecimiento;fecha');
    assert.equal(lines.length, 3);
    assert.ok(lines[1].includes('"first@example.com"'));
    assert.ok(lines[1].includes('"Brisa Mirandeña";"Cafelado"'));
    assert.ok(lines[2].includes('"second@example.com"'));

    for (const field of ['nombre', 'correo', 'telefono']) {
      for (const value of [undefined, '   ']) {
        response = await request('/api/votos', 'POST', { ...voter, [field]: value });
        assert.equal(response.status, 400, `${field} es obligatorio`);
        assert.match((await response.json()).error, new RegExp(
          { nombre: 'Nombre inválido', correo: 'Correo inválido', telefono: 'Teléfono inválido' }[field]
        ));
      }
    }
    response = await request('/api/votos', 'POST', { ...voter, correo: 'short@example.com', ciudad: ' A ' });
    assert.equal(response.status, 400, 'ciudad informada exige dos caracteres');
    assert.match((await response.json()).error, /ciudad debe tener al menos 2/);
    const cityCases = [
      [undefined, ''],
      ['', ''],
      ['   ', ''],
      [' AB ', 'AB'],
    ];
    for (const [index, [input, stored]] of cityCases.entries()) {
      const correo = `city-${index}@example.com`;
      response = await request('/api/votos', 'POST', await verify({ ...voter, correo, ciudad: input }));
      assert.equal(response.status, 201, `ciudad opcional: ${String(input)}`);
      const [[saved]] = await connection.query('SELECT ciudad FROM votantes WHERE correo = ?', [correo]);
      assert.equal(saved.ciudad, stored);
    }
    const updatedVoters = await (await request('/admin/api/votantes')).json();
    assert.equal(updatedVoters.find((r) => r.correo === 'city-0@example.com').ciudad, '');
    const updatedCsv = await (await request('/admin/api/export.csv')).text();
    const noCityRow = updatedCsv.split('\r\n').find((line) => line.includes('"city-0@example.com"'));
    assert.ok(noCityRow.includes('"3001234567";"";"Brisa Mirandeña"'));
    assert.equal((await (await request('/admin/api/resultados')).json()).total, 6);

    const email = 'security@example.com';
    const send = () => request('/checks/verificacion', 'POST', { correo: email });
    response = await send();
    assert.equal(response.status, 200);
    let challenge = await response.json();
    const oldCode = sentCodes.get(email);
    const [[storedChallenge]] = await connection.query('SELECT code_hash FROM email_challenges WHERE correo = ?', [email]);
    assert.match(storedChallenge.code_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(storedChallenge.code_hash, oldCode);
    assert.equal((await request('/checks/votos', 'POST', {
      ...voter, correo: 'other@example.com', challengeId: challenge.challengeId, codigo: oldCode,
    })).status, 400, 'el desafío está vinculado al correo');
    assert.equal((await send()).status, 429, 'cooldown por correo');
    const wrongCode = oldCode === '000000' ? '000001' : '000000';
    const confirm = (codigo, challengeId = challenge.challengeId) => request('/checks/votos', 'POST', {
      ...voter, correo: email, codigo, challengeId,
    });
    assert.equal((await confirm(wrongCode)).status, 400);
    clock += 60001;
    const simultaneousResends = await Promise.all([send(), send()]);
    assert.deepEqual(simultaneousResends.map((r) => r.status).sort(), [200, 429], 'reenvío concurrente limitado');
    response = simultaneousResends.find((r) => r.status === 200);
    const resent = await response.json();
    assert.equal(resent.expiresAt, challenge.expiresAt, 'reenvío no extiende caducidad');
    assert.notEqual(resent.challengeId, challenge.challengeId);
    assert.equal((await confirm(oldCode)).status, 400, 'desafío anterior invalidado');
    challenge = resent;
    const newCode = sentCodes.get(email);
    const wrongNew = newCode === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i++) assert.equal((await confirm(wrongNew)).status, 400);
    assert.equal((await confirm(newCode)).status, 400, 'cinco intentos agotan el desafío');
    clock += 60001;
    assert.equal((await send()).status, 429, 'no reiniciar intentos con reenvío');
    clock += 10 * 60 * 1000;
    response = await send();
    assert.equal(response.status, 200);
    challenge = await response.json();
    clock += 10 * 60 * 1000;
    assert.equal((await confirm(sentCodes.get(email))).status, 400, 'código vencido');
    response = await send();
    challenge = await response.json();
    const concurrent = await Promise.all([confirm(sentCodes.get(email)), confirm(sentCodes.get(email))]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 400], 'solo un voto ante concurrencia');
    assert.equal((await confirm(sentCodes.get(email))).status, 400, 'no reutilizar código consumido');
    assert.equal((await (await request('/admin/api/resultados')).json()).total, 7);
    smtpFailure = true;
    response = await request('/checks/verificacion', 'POST', { correo: 'smtp-fail@example.com' });
    assert.equal(response.status, 503, 'SMTP fallido no simula éxito');
    assert.deepEqual(smtpLogs.at(-1), ['Error enviando verificación SMTP:', {
      name: 'Error', code: 'ESOCKET', command: 'CONN', responseCode: 421,
    }]);
    assert.doesNotMatch(JSON.stringify(smtpLogs), /contraseña-sensible|secreto/);
    const [[failed]] = await connection.query('SELECT COUNT(*) AS total FROM email_challenges WHERE correo = ?', ['smtp-fail@example.com']);
    assert.equal(failed.total, 0, 'SMTP fallido hace rollback');
    smtpFailure = false;
    assert.equal((await request(`/admin/api/cafes/${drinks[0].id}`, 'DELETE')).status, 409);
    const qr = await request('/admin/api/qr');
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    await qr.arrayBuffer();
    const [[savedSession]] = await connection.query('SELECT COUNT(*) AS total FROM admin_sessions');
    assert.equal(savedSession.total, 1, 'sesión persistida en MySQL');
    assert.equal((await request('/admin/api/logout', 'POST')).status, 200);
    assert.equal((await request('/admin/api/me')).status, 401);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end();
    if (created) await connection.query(`DROP DATABASE \`${dbName}\``);
    await connection.end();
  }
});
