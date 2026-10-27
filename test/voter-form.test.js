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
