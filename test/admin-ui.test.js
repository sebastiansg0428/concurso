const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directorio = path.join(__dirname, '..', 'public', 'admin');
const esperar = () => new Promise((resolve) => setImmediate(resolve));

function prepararPanel(solicitar) {
  const nodos = {};
  function nodo(id) {
    if (!nodos[id]) {
      nodos[id] = {
        id, hidden: true, value: '', events: {}, atributos: {}, children: [],
        classList: { toggle() {} },
        addEventListener(tipo, accion) { this.events[tipo] = accion; },
        setAttribute(nombre, valor) { this.atributos[nombre] = valor; },
        append(...hijos) { this.children.push(...hijos); },
        focus() { this.enfocado = true; },
      };
    }
    return nodos[id];
  }
  const pestanas = ['resultados', 'votantes', 'cafes', 'qr'].map((nombre) => {
    const boton = nodo('pestana-' + nombre);
    boton.dataset = { tab: nombre };
    return boton;
  });
  const paneles = pestanas.map((boton) => nodo('tab-' + boton.dataset.tab));
  const location = {};
  const contexto = vm.createContext({
    document: {
      getElementById: nodo,
      querySelectorAll: (selector) => selector === '.tabs button' ? pestanas : paneles,
      createElement: (nombre) => nodo('nuevo-' + nombre + '-' + Math.random()),
    },
    fetch: solicitar,
    location,
    setTimeout() {},
    window: { print() {} },
  });
  vm.runInContext(readFileSync(path.join(directorio, 'js', 'admin.js'), 'utf8'), contexto);
  return { nodo, pestanas, paneles, location };
}

function respuestaNormal(url) {
  const datos = url.endsWith('/me') ? { usuario: 'prueba' }
    : url.endsWith('/resultados') ? { total: 0, cafes: [] }
    : url.endsWith('/qr-info') ? { url: 'https://concurso.example' } : [];
  return { ok: true, status: 200, json: async () => datos };
}

test('panel muestra errores iniciales, de carga y logout sin promesas rechazadas', async () => {
  let fallo = true;
  const { nodo, pestanas, location } = prepararPanel(async (url) => {
    if (fallo) throw new Error('Sin conexión');
    return respuestaNormal(url);
  });
  await esperar();
  assert.equal(nodo('mensaje-panel').hidden, false);
  assert.match(nodo('mensaje-panel').textContent, /Sin conexión/);
  fallo = false;
  await nodo('btn-refrescar').events.click();
  assert.equal(nodo('mensaje-panel').hidden, true);
  assert.equal(nodo('resultados').textContent, 'No hay bebidas registradas.');
  fallo = true;
  for (const boton of pestanas) {
    await boton.events.click();
    assert.equal(nodo('mensaje-panel').hidden, false);
  }
  await nodo('btn-salir').events.click();
  assert.equal(location.href, undefined, 'no simula logout exitoso cuando falla');
  assert.match(nodo('mensaje-panel').textContent, /Sin conexión/);
});

test('pestañas permiten flechas, Home y End y mantienen estado ARIA', async () => {
  const { pestanas, paneles } = prepararPanel(async (url) => respuestaNormal(url));
  await esperar();
  const pulsar = (indice, tecla) => pestanas[indice].events.keydown({ key: tecla, preventDefault() {} });
  pulsar(0, 'ArrowRight');
  await esperar();
  assert.equal(pestanas[1].enfocado, true);
  for (let indice = 0; indice < pestanas.length; indice++) {
    assert.equal(pestanas[indice].atributos['aria-selected'], String(indice === 1));
    assert.equal(pestanas[indice].tabIndex, indice === 1 ? 0 : -1);
    assert.equal(paneles[indice].hidden, indice !== 1);
  }
  pulsar(1, 'End');
  pulsar(3, 'ArrowRight');
  assert.equal(pestanas[0].atributos['aria-selected'], 'true');
  pulsar(0, 'ArrowLeft');
  assert.equal(pestanas[3].atributos['aria-selected'], 'true');
  pulsar(3, 'Home');
  assert.equal(pestanas[0].atributos['aria-selected'], 'true');
  await esperar();
});

test('panel redirige sesiones vencidas y muestra respuestas JSON inválidas', async () => {
  let vencida = true;
  const { nodo, location } = prepararPanel(async () => ({
    status: vencida ? 401 : 200,
    ok: !vencida,
    json: async () => { throw new Error('Respuesta inválida'); },
  }));
  await esperar();
  assert.equal(location.href, '/admin/login.html');
  vencida = false;
  await nodo('btn-refrescar').events.click();
  assert.match(nodo('mensaje-panel').textContent, /Respuesta inválida/);
});

test('login informa fallo de red y solo redirige tras éxito', async () => {
  const nodos = {
    'form-login': { addEventListener(tipo, accion) { this[tipo] = accion; } },
    mensaje: {}, usuario: { value: 'prueba' }, clave: { value: 'clave-de-prueba' },
  };
  let fallo = true;
  const location = {};
  const contexto = vm.createContext({
    document: { getElementById: (id) => nodos[id] },
    location,
    fetch: async () => {
      if (fallo) throw new Error('Sin conexión');
      return { ok: true };
    },
  });
  vm.runInContext(readFileSync(path.join(directorio, 'js', 'acceso.js'), 'utf8'), contexto);
  await nodos['form-login'].submit({ preventDefault() {} });
  assert.equal(nodos.mensaje.hidden, false);
  assert.match(nodos.mensaje.textContent, /Sin conexión/);
  assert.equal(location.href, undefined);
  fallo = false;
  await nodos['form-login'].submit({ preventDefault() {} });
  assert.equal(location.href, '/admin/');
});

test('HTML del panel no requiere scripts ni estilos inline para CSP', () => {
  for (const nombre of ['index.html', 'login.html']) {
    const html = readFileSync(path.join(directorio, nombre), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(html, /\s(?:onclick|style)=/i);
  }
});
