const lista = document.getElementById('lista-cafes');
const form = document.getElementById('form-voto');
const mensaje = document.getElementById('mensaje');
const btn = document.getElementById('btn-votar');
const seleccion = document.getElementById('seleccion-bebida');
const verificacion = document.getElementById('verificacion');
const formCodigo = document.getElementById('form-codigo');
const inputCodigo = document.getElementById('codigo');
const msgCodigo = document.getElementById('mensaje-codigo');
const btnConfirmar = document.getElementById('btn-confirmar');
const btnReenviar = document.getElementById('btn-reenviar');
const btnCorregir = document.getElementById('btn-corregir');
let pendiente;
let challengeId;
let resendAt = 0;
let resendTimer;
let enviando = false;

const fotosBebidas = [
  { nombre: 'Cold Brew de lulo', establecimiento: 'Café Espíritu de Paz', archivo: 'cold-brew-de-lulo.jpg' },
  { nombre: 'Brisa Mirandeña', establecimiento: 'Cafelado', archivo: 'brisa-mirandena.jpg' },
  { nombre: 'Café Paramo', establecimiento: 'Esmikafé', archivo: 'cafe-paramo.jpg' },
  { nombre: 'MOMI, Mocaccino Mirandeño', establecimiento: 'Raíces de Miranda', archivo: 'momi.jpg' },
];

async function post(url, datos) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function mostrarCodigo(texto, tipo = 'error') {
  msgCodigo.textContent = texto;
  msgCodigo.className = `alert ${tipo}`;
  msgCodigo.hidden = false;
}

function actualizarReenvio() {
  const segundos = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
  btnReenviar.disabled = enviando || segundos > 0;
  btnReenviar.textContent = segundos ? `Reenviar en ${segundos}s` : 'Reenviar código';
  if (!segundos) clearInterval(resendTimer);
}

async function solicitarCodigo() {
  const data = await post('/api/verificacion', { correo: pendiente.correo });
  challengeId = data.challengeId;
  inputCodigo.value = '';
  resendAt = Date.now() + data.resendAfter * 1000;
  clearInterval(resendTimer);
  resendTimer = setInterval(actualizarReenvio, 1000);
  actualizarReenvio();
}

function mostrarMensaje(texto, tipo = 'error') {
  mensaje.textContent = texto;
  mensaje.className = `alert ${tipo}`;
  mensaje.hidden = false;
}

async function cargarCafes() {
  try {
    const res = await fetch('/api/cafes');
    if (!res.ok) throw new Error();
    const cafes = await res.json();
    lista.innerHTML = '';
    if (!cafes.length) {
      lista.innerHTML = '<p class="muted">Aún no hay bebidas disponibles.</p>';
      return;
    }
    for (const cafe of cafes) {
      const label = document.createElement('label');
      label.className = 'cafe-card';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'cafeId';
      input.value = cafe.id;
      input.required = true;
      input.setAttribute('aria-labelledby', `bebida-${cafe.id} establecimiento-${cafe.id}`);
      input.setAttribute('aria-describedby', `frase-${cafe.id}`);
      input.addEventListener('change', () => {
        if (input.checked) {
          seleccion.textContent = `Tu elección: ${cafe.nombre} — ${cafe.establecimiento}`;
        }
      });

      const detalle = document.createElement('img');
      const foto = fotosBebidas.find((bebida) =>
        bebida.nombre === cafe.nombre.replace(/\.$/, '') && bebida.establecimiento === cafe.establecimiento);
      detalle.className = foto ? 'cafe-card-foto' : 'cafe-card-icon';
      detalle.src = foto ? `/img/bebidas/${foto.archivo}` : '/img/logo-cafe.svg';
      detalle.alt = '';
      detalle.width = foto ? 600 : 44;
      detalle.height = foto ? 600 : 44;
      if (foto) {
        detalle.loading = 'lazy';
        detalle.decoding = 'async';
        detalle.addEventListener('error', () => {
          console.warn(`No se pudo cargar la foto de ${cafe.nombre}.`);
          detalle.hidden = true;
          const aviso = document.createElement('p');
          aviso.className = 'foto-no-disponible';
          aviso.textContent = 'Foto no disponible.';
          detalle.after(aviso);
        }, { once: true });
      }

      const h3 = document.createElement('h3');
      h3.id = `bebida-${cafe.id}`;
      h3.textContent = cafe.nombre;
      const establecimiento = document.createElement('p');
      establecimiento.id = `establecimiento-${cafe.id}`;
      establecimiento.className = 'establecimiento';
      establecimiento.textContent = cafe.establecimiento;
      const p = document.createElement('p');
      p.id = `frase-${cafe.id}`;
      p.textContent = cafe.descripcion || '';

      label.append(input, detalle, h3, establecimiento, p);
      lista.appendChild(label);
    }
  } catch {
    lista.innerHTML = '<p class="alert error">No se pudieron cargar las bebidas. Recarga la página.</p>';
  }
}

function validar(datos) {
  if (!datos.cafeId) return 'Selecciona un café.';
  if (datos.nombre.trim().length < 2) return 'Escribe tu nombre.';
  const correo = datos.correo.trim();
  // Misma regla que src/correo.js: solo direcciones simples, sin nombres ni "<...>".
  if (correo.length > 160 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(correo)) {
    return 'Escribe un correo válido.';
  }
  if (!/^[0-9+\-\s()]{7,20}$/.test(datos.telefono.trim())) return 'Escribe un teléfono válido.';
  const ciudad = datos.ciudad.trim();
  if (ciudad && ciudad.length < 2) return 'Si escribes tu ciudad, usa al menos 2 caracteres.';
  return null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensaje.hidden = true;
  const fd = new FormData(form);
  const datos = {
    cafeId: fd.get('cafeId'),
    nombre: fd.get('nombre') || '',
    correo: fd.get('correo') || '',
    telefono: fd.get('telefono') || '',
    ciudad: fd.get('ciudad') || '',
  };
  const error = validar(datos);
  if (error) return mostrarMensaje(error);

  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    pendiente = { ...datos, correo: datos.correo.trim().toLowerCase() };
    await solicitarCodigo();
    form.hidden = true;
    verificacion.hidden = false;
    msgCodigo.hidden = true;
    document.getElementById('destino-codigo').textContent = `Enviamos un código a ${pendiente.correo}. Revisa también spam.`;
    inputCodigo.focus();
  } catch (err) {
    mostrarMensaje(err.message);
  }
  btn.disabled = false;
  btn.textContent = 'Recibir código para votar';
});

formCodigo.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (enviando || !pendiente || !challengeId) return;
  if (!/^\d{6}$/.test(inputCodigo.value)) return mostrarCodigo('Introduce los 6 dígitos del código.');
  enviando = true;
  btnConfirmar.disabled = true;
  btnReenviar.disabled = true;
  btnCorregir.disabled = true;
  try {
    await post('/api/votos', { ...pendiente, challengeId, codigo: inputCodigo.value });
    // El almacenamiento local es solo una ayuda visual; su fallo no invalida un voto confirmado.
    try { localStorage.setItem('cafes_voto', '1'); } catch (err) { console.warn('No se pudo guardar la marca local del voto:', err.name); }
    location.href = '/gracias.html';
  } catch (err) {
    mostrarCodigo(err.message);
  } finally {
    enviando = false;
    btnConfirmar.disabled = false;
    btnCorregir.disabled = false;
    actualizarReenvio();
  }
});

btnReenviar.addEventListener('click', async () => {
  if (enviando || Date.now() < resendAt) return;
  enviando = true;
  btnConfirmar.disabled = true;
  btnCorregir.disabled = true;
  actualizarReenvio();
  try {
    await solicitarCodigo();
    mostrarCodigo('Nuevo código enviado. Usa el más reciente; el plazo original no se extiende.', 'ok');
  } catch (err) {
    mostrarCodigo(err.message);
  } finally {
    enviando = false;
    btnConfirmar.disabled = false;
    btnCorregir.disabled = false;
    actualizarReenvio();
  }
});

btnCorregir.addEventListener('click', () => {
  clearInterval(resendTimer);
  verificacion.hidden = true;
  form.hidden = false;
  challengeId = null;
  document.getElementById('correo').focus();
});

try {
  if (localStorage.getItem('cafes_voto')) {
    document.getElementById('ya-voto').hidden = false;
  }
} catch (err) {
  console.warn('No se pudo leer la marca local del voto:', err.name);
}
cargarCafes();
