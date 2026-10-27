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

    const env = { ...process.env, DB_NAME: dbName };
    const refused = spawnSync(process.execPath, ['scripts\\replace-participants.js'], { cwd: root, env });
    assert.equal(refused.status, 1, 'se exige confirmación explícita');
    const [[before]] = await connection.query('SELECT COUNT(*) AS total FROM votos');
    assert.equal(before.total, 1, 'sin confirmación no se borran votos');
    execFileSync(process.execPath, ['scripts\\replace-participants.js', '--confirm-delete-test-data'], { cwd: root, env });
    assert.deepEqual(await readParticipants(), expected);
    for (const table of ['votos', 'votantes']) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS total FROM ${table}`);
      assert.equal(row.total, 0);
    }
    const [[admin]] = await connection.query('SELECT password_hash FROM admins WHERE usuario = ?', ['test-admin']);
    assert.equal(admin.password_hash, passwordHash, 'administrador intacto');

    process.env.DB_NAME = dbName;
    pool = require('../src/db');
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'integration-test-only', resave: false, saveUninitialized: false }));
    app.use('/api', require('../src/routes/public'));
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
    assert.equal((await request('/api/votos', 'POST', voter)).status, 201);
    assert.equal((await request('/api/votos', 'POST', { ...voter, correo: 'FIRST@example.com' })).status, 409);
    assert.equal((await request('/api/votos', 'POST', { ...voter, correo: 'second@example.com', cafeId: drinks[1].id })).status, 201);
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
      }
    }
    response = await request('/api/votos', 'POST', { ...voter, correo: 'short@example.com', ciudad: ' A ' });
    assert.equal(response.status, 400, 'ciudad informada exige dos caracteres');
    const cityCases = [
      [undefined, ''],
      ['', ''],
      ['   ', ''],
      [' AB ', 'AB'],
    ];
    for (const [index, [input, stored]] of cityCases.entries()) {
      const correo = `city-${index}@example.com`;
      response = await request('/api/votos', 'POST', { ...voter, correo, ciudad: input });
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
    assert.equal((await request(`/admin/api/cafes/${drinks[0].id}`, 'DELETE')).status, 409);
    const qr = await request('/admin/api/qr');
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    await qr.arrayBuffer();
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end();
    if (created) await connection.query(`DROP DATABASE \`${dbName}\``);
    await connection.end();
  }
});
