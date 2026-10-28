// Solo direcciones simples (addr-spec). Rechaza nombres visibles, comillas, espacios o "<...>",
// que Nodemailer podría interpretar como otro destinatario.
const CORREO_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const LARGO_MAXIMO = 160;
const DOMINIOS_GMAIL = new Set(['gmail.com', 'googlemail.com']);

function correoValido(valor) {
  if (typeof valor !== 'string') return false;
  const correo = valor.trim();
  return correo.length <= LARGO_MAXIMO && CORREO_RE.test(correo);
}

function normalizarCorreo(valor) {
  return valor.trim().toLowerCase();
}

// Identifica el buzón real para impedir votos repetidos con alias (usuario+etiqueta, puntos de Gmail).
function correoCanonico(valor) {
  const correo = normalizarCorreo(valor);
  const arroba = correo.lastIndexOf('@');
  let usuario = correo.slice(0, arroba);
  let dominio = correo.slice(arroba + 1);
  const mas = usuario.indexOf('+');
  if (mas > 0) usuario = usuario.slice(0, mas);
  if (DOMINIOS_GMAIL.has(dominio)) {
    usuario = usuario.replaceAll('.', '');
    dominio = 'gmail.com';
  }
  return `${usuario}@${dominio}`;
}

module.exports = { CORREO_RE, correoValido, normalizarCorreo, correoCanonico };
