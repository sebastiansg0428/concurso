const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.join(__dirname, '..', 'public');

test('almacenamiento bloqueado no impide cargar las bebidas', async () => {
  let solicitudes = 0;
  const avisos = [];
  const context = vm.createContext({
    document: { getElementById: () => ({ addEventListener() {} }) },
    localStorage: { getItem() { throw new Error('bloqueado'); } },
    console: { warn: (...args) => avisos.push(args) },
    fetch: async () => {
      solicitudes++;
      return { ok: true, json: async () => [] };
    },
  });
  vm.runInContext(readFileSync(path.join(publicDir, 'js', 'votar.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(solicitudes, 1);
  assert.equal(avisos.length, 1);
});

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
  for (const correo of ['x<otro@example.com>', '"a b"@example.com', 'ana@example', 'ana @example.com', 'a@-example.com']) {
    assert.equal(typeof validar({ ...valid, correo }), 'string', `rechaza ${correo}`);
  }
  for (const correo of ['ana.maria+voto@gmail.com', 'ANA@Sub.Example.co']) {
    assert.equal(validar({ ...valid, correo }), null, `acepta ${correo}`);
  }
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
      after(child) { this.followingSibling = child; },
    };
  }
  const nodes = Object.fromEntries(
    ['lista-cafes', 'form-voto', 'mensaje', 'btn-votar', 'seleccion-bebida',
      'verificacion', 'form-codigo', 'codigo', 'mensaje-codigo', 'btn-confirmar', 'btn-reenviar', 'btn-corregir']
      .map((id) => [id, element('div')])
  );
  const drinks = [
    { id: 6, nombre: 'Brisa Mirandeña', establecimiento: 'Cafelado', descripcion: 'El frescor de nuestra tierra.' },
    { id: 7, nombre: '<Bebida & especial>', establecimiento: 'Local <test>', descripcion: 'Frase '.repeat(60) },
    { id: 105, nombre: 'Cold Brew de lulo.', establecimiento: 'Café Espíritu de Paz', descripcion: 'Lulo' },
    { id: 208, nombre: 'Café Paramo', establecimiento: 'Esmikafé', descripcion: 'Frutos rojos' },
    { id: 309, nombre: 'MOMI, Mocaccino Mirandeño', establecimiento: 'Raíces de Miranda', descripcion: 'Mocaccino' },
    { id: 410, nombre: 'Cold Brew de lulo', establecimiento: 'Café Espíritu de Paz', descripcion: 'Sin punto final' },
    { id: 511, nombre: 'Brisa Mirandeña', establecimiento: 'Otro local', descripcion: 'Sin foto configurada' },
  ];
  const fotos = ['brisa-mirandena.jpg', null, 'cold-brew-de-lulo.jpg', 'cafe-paramo.jpg',
    'momi.jpg', 'cold-brew-de-lulo.jpg', null];
  const requests = [];
  const avisos = [];
  const context = vm.createContext({
    document: {
      getElementById: (id) => nodes[id],
      createElement: element,
    },
    localStorage: { getItem: () => null },
    console: { warn: (aviso) => avisos.push(aviso) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => drinks };
    },
  });
  vm.runInContext(readFileSync(path.join(publicDir, 'js', 'votar.js'), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  const cards = nodes['lista-cafes'].children;
  assert.equal(cards.length, drinks.length);
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
    assert.equal(icon.src, fotos[index] ? `/img/bebidas/${fotos[index]}` : '/img/logo-cafe.svg');
    assert.equal(icon.className, fotos[index] ? 'cafe-card-foto' : 'cafe-card-icon');
    assert.equal(icon.width, fotos[index] ? 600 : 44);
    assert.equal(icon.height, fotos[index] ? 600 : 44);
    if (fotos[index]) {
      assert.equal(icon.loading, 'lazy');
      assert.equal(icon.decoding, 'async');
      const archivo = readFileSync(path.join(publicDir, 'img', 'bebidas', fotos[index]));
      assert.equal(archivo.subarray(0, 3).toString('hex'), 'ffd8ff', 'foto JPG incluida en el proyecto');
      assert.ok(archivo.length < 150000, 'cada foto pesa menos de 150 KB');
    }
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
  assert.equal(nodes['seleccion-bebida'].textContent, 'Tu elección: Brisa Mirandeña — Otro local');
  assert.equal(requests.length, 1, 'seleccionar no genera solicitudes adicionales');
  assert.equal(requests[0].url, '/api/cafes');
  assert.equal(requests[0].options, undefined);
  const foto = cards[0].children[1];
  foto.events.error();
  assert.equal(foto.hidden, true);
  assert.equal(foto.followingSibling.textContent, 'Foto no disponible.');
  assert.match(avisos[0], /No se pudo cargar la foto de Brisa Mirandeña/);
  assert.equal(cards[0].children[0].required, true, 'un error de foto no desactiva la selección');
  const html = readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /id="seleccion-bebida"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('fotos: espacio uniforme adaptable, imagen completa y selección con contraste', () => {
  const css = readFileSync(path.join(publicDir, 'css', 'styles.css'), 'utf8');
  const foto = css.match(/\.cafe-card-foto\s*\{([^}]+)\}/)[1];
  assert.match(foto, /width:\s*100%/);
  assert.match(foto, /height:\s*auto/);
  assert.match(foto, /aspect-ratio:\s*1\s*;/);
  assert.match(foto, /object-fit:\s*contain/);
  assert.match(foto, /background:\s*#[a-f0-9]+/);
  assert.match(css, /\.cafe-card-foto\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.cafe-card::after\s*\{[^}]*background:\s*#fff/);
  assert.match(css, /\.cafe-card:has\(input:focus-visible\)/);
});

test('formulario: solo confirma el voto después del código y muestra errores SMTP', async () => {
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = {
    hidden: false, value: '', events: {},
    addEventListener(name, callback) { this.events[name] = callback; },
    focus() { this.focused = true; },
  });
  const fields = { nombre: 'Ana', correo: 'ana@example.com', telefono: '3001234567', ciudad: '', cafeId: '6' };
  const requests = [];
  let smtpFailure = false;
  let voteFailure = false;
  let localMark = false;
  const location = {};
  const context = vm.createContext({
    document: { getElementById: node },
    FormData: class { get(key) { return fields[key]; } },
    localStorage: { getItem: () => null, setItem: () => { localMark = true; } },
    location,
    setInterval: () => 1,
    clearInterval() {},
    fetch: async (url, options) => {
      if (!options) return { ok: true, json: async () => [] };
      requests.push({ url, data: JSON.parse(options.body) });
      if (url === '/api/verificacion') {
        return { ok: !smtpFailure, json: async () => smtpFailure ?
          { error: 'SMTP no disponible' } : { challengeId: 'a'.repeat(64), resendAfter: 60 } };
      }
      return { ok: !voteFailure, json: async () => voteFailure ? { error: 'Código incorrecto' } : { ok: true } };
    },
  });
  vm.runInContext(readFileSync(path.join(publicDir, 'js', 'votar.js'), 'utf8'), context);
  const event = { preventDefault() {} };
  smtpFailure = true;
  await node('form-voto').events.submit(event);
  assert.equal(node('mensaje').textContent, 'SMTP no disponible');
  assert.equal(localMark, false);
  assert.equal(location.href, undefined);
  smtpFailure = false;
  await node('form-voto').events.submit(event);
  assert.equal(node('form-voto').hidden, true);
  assert.equal(node('verificacion').hidden, false);
  assert.equal(localMark, false, 'solicitar código no marca el voto');
  assert.equal(location.href, undefined);
  node('codigo').value = '123456';
  voteFailure = true;
  await node('form-codigo').events.submit(event);
  assert.equal(node('mensaje-codigo').textContent, 'Código incorrecto');
  assert.equal(location.href, undefined);
  voteFailure = false;
  await node('form-codigo').events.submit(event);
  assert.equal(localMark, true);
  assert.equal(location.href, '/gracias.html');
  assert.equal(requests.at(-1).data.challengeId, 'a'.repeat(64));
  assert.equal(requests.at(-1).data.codigo, '123456');
  assert.equal(requests.at(-1).data.ciudad, '');
});
