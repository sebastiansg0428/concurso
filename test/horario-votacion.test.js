const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createHmac } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { crearHorarioVotacion, mensajeHorario } = require('../src/horario-votacion');
const crearRutasPublicas = require('../src/routes/public');

const inicio = Date.parse('2026-11-01T09:00:00-05:00');
const fin = Date.parse('2026-11-15T00:00:00-05:00');
const secreto = 'secreto-de-verificacion-para-horario-de-prueba';

test('horario: apertura inclusiva y cierre al finalizar todo el minuto 23:59 de Colombia', () => {
  const horario = crearHorarioVotacion();
  for (const [instante, fase, permitido] of [
    [inicio - 1, 'pendiente', false], [inicio, 'abierta', true],
    [fin - 60000, 'abierta', true], [fin - 1, 'abierta', true],
    [fin, 'finalizada', false], [fin + 1, 'finalizada', false],
  ]) {
    const estado = horario(instante);
    assert.equal(estado.fase, fase);
    assert.equal(estado.permiteVotar, permitido);
    assert.equal(estado.inicio, inicio);
    assert.equal(estado.fin, fin);
    assert.equal(estado.ahora, instante);
    assert.equal(estado.ensayo, false);
  }
});

test('fechas y mensajes usan un unico calendario y hora de Colombia', () => {
  const oficial = crearHorarioVotacion()(inicio - 1);
  assert.match(oficial.inicioTexto, /1 de noviembre de 2026/);
  assert.match(oficial.inicioTexto, /9:00/);
  assert.match(oficial.finTexto, /14 de noviembre de 2026/);
  assert.match(oficial.finTexto, /11:59/);
  const temporal = crearHorarioVotacion({}, {
    inicio: Date.parse('2026-10-29T10:00:00-05:00'),
    fin: Date.parse('2026-10-29T10:30:00-05:00'),
    ensayo: true,
  });
  const pendiente = temporal(Date.parse('2026-10-29T09:00:00-05:00'));
  assert.equal(pendiente.ensayo, true);
  assert.equal(pendiente.permiteVotar, false, 'el ensayo no omite el bloqueo');
  assert.match(mensajeHorario(pendiente), /29 de octubre de 2026/);
  assert.match(mensajeHorario(pendiente), /10:00/);
  const cerrado = temporal(Date.parse('2026-10-29T10:30:00-05:00'));
  assert.equal(cerrado.permiteVotar, false);
  assert.match(mensajeHorario(cerrado), /10:29/);
  for (const calendario of [
    { inicio: NaN, fin, ensayo: true },
    { inicio, fin: inicio, ensayo: false },
    { inicio, fin: inicio - 1, ensayo: false },
    { inicio, fin, ensayo: 'true' },
  ]) {
    assert.throws(() => crearHorarioVotacion({}, calendario), /Calendario/);
  }
});

test('excepcion solo explicita en development; produccion nunca acepta la opcion', () => {
  for (const NODE_ENV of ['production', 'test', undefined]) {
    assert.throws(() => crearHorarioVotacion({ NODE_ENV, PRUEBAS_VOTACION_LOCAL: 'true' }), /solo se permite/);
  }
  for (const opcion of ['1', 'TRUE', 'si', ' false ']) {
    assert.throws(() => crearHorarioVotacion({ NODE_ENV: 'development', PRUEBAS_VOTACION_LOCAL: opcion }), /true o false/);
  }
  const normal = crearHorarioVotacion({ NODE_ENV: 'development' });
  assert.equal(normal(inicio - 1).permiteVotar, false);
  const pruebas = crearHorarioVotacion({ NODE_ENV: 'development', PRUEBAS_VOTACION_LOCAL: 'true' });
  assert.equal(pruebas(inicio - 1).permiteVotar, true);
  assert.equal(pruebas(fin).permiteVotar, true);
  assert.equal(pruebas(fin).fase, 'finalizada');
});

async function servir(opciones, probar) {
  const app = express();
  app.use(express.json());
  app.use('/api', crearRutasPublicas({ secret: secreto, ...opciones }));
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const post = (ruta, cuerpo = {}) => fetch(base + ruta, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  try {
    await probar(base, post);
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test('API informa hora sin cache y bloquea codigos, reenvios y votos sin tocar MySQL', async () => {
  let ahora = inicio - 1;
  await servir({
    now: () => ahora,
    pool: { getConnection() { assert.fail('No debe conectarse fuera del plazo'); } },
    sendCode() { assert.fail('No debe enviar fuera del plazo'); },
  }, async (base, post) => {
    const respuesta = await fetch(base + '/horario-votacion');
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), crearHorarioVotacion()(ahora));
    for (const instante of [inicio - 1, fin, fin + 1]) {
      ahora = instante;
      for (const ruta of ['/verificacion', '/verificacion', '/votos']) {
        const rechazo = await post(ruta);
        assert.equal(rechazo.status, 403);
        assert.match((await rechazo.json()).error, /votación/);
      }
    }
  });
});

test('servidor revalida el cierre tras bloqueo MySQL antes de enviar o insertar voto', async () => {
  for (const ruta of ['/verificacion', '/votos']) {
    let ahora = fin - 1;
    let reversiones = 0;
    const consultas = [];
    const id = 'a'.repeat(64);
    const codigo = '123456';
    const conexion = {
      beginTransaction: async () => {},
      rollback: async () => { reversiones++; },
      commit: async () => { assert.fail('No debe confirmar'); },
      release() {},
      async query(sql) {
        consultas.push(sql);
        if (sql.startsWith('SELECT * FROM email_challenges')) {
          if (ruta === '/verificacion') ahora = fin;
          return [[{
            id, expires_at: fin + 600000, attempts: 0, consumed: 0,
            code_hash: createHmac('sha256', secreto).update(`${id}:${codigo}`).digest('hex'),
          }]];
        }
        if (sql.startsWith('SELECT id FROM cafes')) {
          ahora = fin;
          return [[{ id: 1 }]];
        }
        return [[]];
      },
    };
    await servir({
      pool: { getConnection: async () => conexion }, now: () => ahora,
      sendCode() { assert.fail('No debe enviar'); },
    }, async (base, post) => {
      const respuesta = await post(ruta, {
        correo: 'ana@example.com', nombre: 'Ana', telefono: '3001234567',
        cafeId: 1, codigo, challengeId: id,
      });
      assert.equal(respuesta.status, 403);
      assert.equal(reversiones, 1);
      assert.equal(consultas.some((sql) => sql.startsWith('INSERT INTO votantes')), false);
      assert.equal(consultas.some((sql) => sql.startsWith('INSERT INTO votos')), false);
    });
  }
});

test('modo local permite solicitar un codigo fuera de fechas y conserva el proveedor', async () => {
  let enviados = 0;
  let confirmaciones = 0;
  const conexion = {
    beginTransaction: async () => {}, rollback: async () => {}, release() {},
    commit: async () => { confirmaciones++; },
    query: async (sql) => sql.startsWith('SELECT')
      ? [[{ next_send_at: 0, expires_at: 0, attempts: 0, consumed: 0 }]] : [[]],
  };
  await servir({
    pool: { getConnection: async () => conexion }, now: () => inicio - 100000,
    horario: crearHorarioVotacion({ NODE_ENV: 'development', PRUEBAS_VOTACION_LOCAL: 'true' }),
    sendCode: async () => { enviados++; },
  }, async (base, post) => {
    const respuesta = await post('/verificacion', { correo: 'ana@example.com' });
    assert.equal(respuesta.status, 200);
    assert.match((await respuesta.json()).challengeId, /^[a-f0-9]{64}$/);
    assert.equal(enviados, 1);
    assert.equal(confirmaciones, 1);
  });
});

test('revierte el voto si una escritura espera hasta despues del cierre', async () => {
  let ahora = fin - 1;
  let reversiones = 0;
  const id = 'b'.repeat(64);
  const conexion = {
    beginTransaction: async () => {}, release() {},
    rollback: async () => { reversiones++; },
    commit: async () => { assert.fail('No debe confirmar despues del cierre'); },
    async query(sql) {
      if (sql.startsWith('SELECT * FROM email_challenges')) return [[{
        id, expires_at: fin + 600000, attempts: 0, consumed: 0,
        code_hash: createHmac('sha256', secreto).update(`${id}:123456`).digest('hex'),
      }]];
      if (sql.startsWith('SELECT id FROM cafes')) return [[{ id: 1 }]];
      if (sql.startsWith('INSERT INTO votantes')) {
        ahora = fin;
        return [{ insertId: 1 }];
      }
      return [[]];
    },
  };
  await servir({
    now: () => ahora, pool: { getConnection: async () => conexion },
  }, async (base, post) => {
    const respuesta = await post('/votos', {
      correo: 'ana@example.com', nombre: 'Ana', telefono: '3001234567',
      cafeId: 1, codigo: '123456', challengeId: id,
    });
    assert.equal(respuesta.status, 403);
    assert.equal(reversiones, 1, 'las escrituras no se conservan');
  });
});

function crearContador(ahoraInicial, { pruebas = false, calendario } = {}) {
  let ahora = ahoraInicial;
  let monotono = 0;
  let fallo = false;
  let intervalo;
  let consultas = 0;
  const elementos = new Map();
  const eventos = {};
  const avisos = [];
  const document = {
    hidden: false,
    getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, { textContent: '', hidden: false, addEventListener(tipo, fn) { this[tipo] = fn; } });
      return elementos.get(id);
    },
    addEventListener(tipo, fn) { eventos[tipo] = fn; },
  };
  const politica = crearHorarioVotacion(pruebas
    ? { NODE_ENV: 'development', PRUEBAS_VOTACION_LOCAL: 'true' } : {}, calendario);
  const contexto = vm.createContext({
    document, performance: { now: () => monotono }, AbortSignal,
    console: { warn() {} },
    setInterval(fn) { intervalo = fn; },
    async fetch() {
      consultas++;
      if (fallo) throw new Error('red');
      return { ok: true, json: async () => politica(ahora) };
    },
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'public', 'js', 'contador-votacion.js'), 'utf8'), contexto);
  const contador = vm.runInContext('contadorVotacion', contexto);
  contador.iniciar((permite) => avisos.push(permite));
  return {
    contador, elementos, eventos, avisos,
    get consultas() { return consultas; },
    avanzar(ms) { ahora += ms; monotono += ms; intervalo(); },
    fallar(valor = true) { fallo = valor; },
  };
}

const completar = () => new Promise((resolve) => setImmediate(resolve));

test('contador transiciona sin recarga, no depende del reloj del dispositivo y cierra sin negativos', async () => {
  const vista = crearContador(inicio - 1000);
  await completar();
  assert.equal(vista.contador.permiteVotar, false);
  assert.equal(vista.elementos.get('ensayo-votacion').hidden, true);
  assert.match(vista.elementos.get('periodo-votacion').textContent, /1 de noviembre de 2026/);
  assert.match(vista.elementos.get('periodo-votacion').textContent, /14 de noviembre de 2026/);
  assert.match(vista.elementos.get('titulo-contador').textContent, /comienza/);
  vista.avanzar(1000);
  assert.equal(vista.contador.permiteVotar, false, 'espera confirmacion de servidor al abrir');
  await completar();
  assert.equal(vista.contador.permiteVotar, true);
  assert.match(vista.elementos.get('titulo-contador').textContent, /termina/);
  vista.avanzar(fin - inicio);
  assert.equal(vista.contador.permiteVotar, false);
  await completar();
  assert.equal(vista.elementos.get('titulo-contador').textContent, 'Votación finalizada');
  assert.doesNotMatch(vista.elementos.get('tiempo-contador').textContent, /-/);
  assert.equal(vista.consultas, 3);
});

test('contador identifica ensayo temporal y conserva apertura y cierre automaticos', async () => {
  const apertura = Date.parse('2026-10-29T10:00:00-05:00');
  const vista = crearContador(apertura - 1000, {
    calendario: { inicio: apertura, fin: apertura + 60000, ensayo: true },
  });
  await completar();
  assert.equal(vista.elementos.get('ensayo-votacion').hidden, false);
  assert.equal(vista.elementos.get('pruebas-votacion').hidden, true);
  assert.match(vista.elementos.get('periodo-votacion').textContent, /29 de octubre de 2026/);
  assert.equal(vista.contador.permiteVotar, false);
  vista.avanzar(1000);
  await completar();
  assert.equal(vista.contador.permiteVotar, true);
  vista.avanzar(60000);
  await completar();
  assert.equal(vista.contador.permiteVotar, false);
});
test('contador muestra error y bloquea al resincronizar; reintento y aviso de modo local', async () => {
  const vista = crearContador(inicio - 1000, { pruebas: true });
  await completar();
  assert.equal(vista.contador.permiteVotar, true);
  assert.equal(vista.elementos.get('pruebas-votacion').hidden, false);
  vista.fallar();
  vista.eventos.visibilitychange();
  assert.equal(vista.contador.permiteVotar, false);
  vista.avanzar(100);
  assert.equal(vista.contador.permiteVotar, false, 'un tick no restaura el permiso antiguo');
  await completar();
  assert.match(vista.elementos.get('aviso-horario').textContent, /Reintenta/);
  assert.equal(vista.elementos.get('reintentar-horario').hidden, false);
  vista.fallar(false);
  vista.elementos.get('reintentar-horario').click();
  await completar();
  assert.equal(vista.consultas, 3);
  assert.equal(vista.contador.permiteVotar, true);
  assert.equal(vista.elementos.get('reintentar-horario').hidden, true);
  assert.equal(vista.elementos.get('aviso-horario').textContent, '');
});

test('modo local permite confirmar un voto despues del cierre con un codigo valido', async () => {
  const id = 'c'.repeat(64);
  let confirmado = false;
  const conexion = {
    beginTransaction: async () => {}, release() {},
    rollback: async () => { assert.fail('El voto local valido no debe revertirse'); },
    commit: async () => { confirmado = true; },
    async query(sql) {
      if (sql.startsWith('SELECT * FROM email_challenges')) return [[{
        id, expires_at: fin + 600000, attempts: 0, consumed: 0,
        code_hash: createHmac('sha256', secreto).update(`${id}:123456`).digest('hex'),
      }]];
      if (sql.startsWith('SELECT id FROM cafes')) return [[{ id: 1 }]];
      if (sql.startsWith('INSERT INTO votantes')) return [{ insertId: 1 }];
      return [[]];
    },
  };
  await servir({
    now: () => fin + 1000, pool: { getConnection: async () => conexion },
    horario: crearHorarioVotacion({ NODE_ENV: 'development', PRUEBAS_VOTACION_LOCAL: 'true' }),
  }, async (base, post) => {
    const respuesta = await post('/votos', {
      correo: 'ana@example.com', nombre: 'Ana', telefono: '3001234567',
      cafeId: 1, codigo: '123456', challengeId: id,
    });
    assert.equal(respuesta.status, 201);
    assert.deepEqual(await respuesta.json(), { ok: true });
    assert.equal(confirmado, true);
  });
});
