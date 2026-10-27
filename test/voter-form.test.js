const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.join(__dirname, '..', 'public');

test('formulario: asteriscos y atributos de campos obligatorios', () => {
  const html = readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  for (const id of ['nombre', 'correo', 'telefono']) {
    const input = html.match(new RegExp(`<input\\s[^>]*id="${id}"[^>]*>`))[0];
    assert.match(input, /\srequired(?:\s|\/?>)/);
    assert.match(html, new RegExp(`<label for="${id}">[^<]*\\*</label>`));
  }
  const ciudad = html.match(/<input\s[^>]*id="ciudad"[^>]*>/)[0];
  assert.doesNotMatch(ciudad, /\srequired(?:\s|\/?>)/);
  assert.match(html, /<label for="ciudad">Ciudad \(opcional\)<\/label>/);
});

test('validación del navegador: ciudad opcional y otros datos obligatorios', async () => {
  const context = vm.createContext({
    document: { getElementById: () => ({ addEventListener() {} }) },
    localStorage: { getItem: () => null },
    fetch: async () => ({ ok: true, json: async () => [] }),
  });
  vm.runInContext(readFileSync(path.join(publicDir, 'js', 'votar.js'), 'utf8'), context);
  const validar = vm.runInContext('validar', context);
  const valid = { cafeId: '1', nombre: 'Ana', correo: 'ana@example.com', telefono: '3001234567', ciudad: '' };
  for (const ciudad of ['', '   ', 'AB', ' AB ']) {
    assert.equal(validar({ ...valid, ciudad }), null);
  }
  assert.match(validar({ ...valid, ciudad: ' A ' }), /2 caracteres/);
  for (const field of ['nombre', 'correo', 'telefono']) {
    assert.equal(typeof validar({ ...valid, [field]: '' }), 'string');
    assert.equal(typeof validar({ ...valid, [field]: '   ' }), 'string');
  }
  assert.equal(typeof validar({ ...valid, correo: 'invalid' }), 'string');
  assert.equal(typeof validar({ ...valid, telefono: 'abc' }), 'string');
  assert.equal(typeof validar({ ...valid, cafeId: null }), 'string');
});

test('tarjetas: contenido accesible y selección sin enviar el voto', async () => {
  function element(tag) {
    return {
      tag,
      children: [],
      attributes: {},
      events: {},
      textContent: '',
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.events[name] = callback; },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); },
    };
  }
  const nodes = Object.fromEntries(
    ['lista-cafes', 'form-voto', 'mensaje', 'btn-votar', 'seleccion-bebida']
      .map((id) => [id, element('div')])
  );
  const drinks = [
    { id: 6, nombre: 'Brisa Mirandeña', establecimiento: 'Cafelado', descripcion: 'El frescor de nuestra tierra.' },
    { id: 7, nombre: '<Bebida & especial>', establecimiento: 'Local <test>', descripcion: 'Frase '.repeat(60) },
  ];
  const requests = [];
  const context = vm.createContext({
    document: {
      getElementById: (id) => nodes[id],
      createElement: element,
    },
    localStorage: { getItem: () => null },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => drinks };
    },
  });
  vm.runInContext(readFileSync(path.join(publicDir, 'js', 'votar.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  const cards = nodes['lista-cafes'].children;
  assert.equal(cards.length, 2);
  for (const [index, card] of cards.entries()) {
    assert.equal(card.tag, 'label');
    const [radio, icon, heading, establishment, phrase] = card.children;
    assert.equal(radio.type, 'radio');
    assert.equal(radio.name, 'cafeId', 'mismo grupo nativo de selección única');
    assert.equal(radio.value, drinks[index].id);
    assert.equal(radio.required, true);
    assert.equal(radio.attributes['aria-labelledby'], `${heading.id} ${establishment.id}`);
    assert.equal(radio.attributes['aria-describedby'], phrase.id);
    assert.equal(icon.tag, 'img');
    assert.equal(icon.alt, '');
    assert.equal(icon.src, '/img/logo-cafe.svg');
    assert.equal(heading.textContent, drinks[index].nombre);
    assert.equal(establishment.textContent, drinks[index].establecimiento);
    assert.equal(phrase.textContent, drinks[index].descripcion, 'frase completa como texto');
    radio.checked = true;
    radio.events.change();
    assert.equal(nodes['seleccion-bebida'].textContent,
      `Tu elección: ${drinks[index].nombre} — ${drinks[index].establecimiento}`);
    radio.checked = false;
  }
  cards[0].children[0].events.change();
  assert.equal(nodes['seleccion-bebida'].textContent, 'Tu elección: <Bebida & especial> — Local <test>');
  assert.equal(requests.length, 1, 'seleccionar no genera solicitudes adicionales');
  assert.equal(requests[0].url, '/api/cafes');
  assert.equal(requests[0].options, undefined);
  const html = readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /id="seleccion-bebida"[^>]*role="status"[^>]*aria-live="polite"/);
});
