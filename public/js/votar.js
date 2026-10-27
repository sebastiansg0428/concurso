const lista = document.getElementById('lista-cafes');
const form = document.getElementById('form-voto');
const mensaje = document.getElementById('mensaje');
const btn = document.getElementById('btn-votar');

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

      const h3 = document.createElement('h3');
      h3.textContent = cafe.nombre;
      const establecimiento = document.createElement('p');
      establecimiento.className = 'establecimiento';
      establecimiento.textContent = cafe.establecimiento;
      const p = document.createElement('p');
      p.textContent = cafe.descripcion || '';

      label.append(input, h3, establecimiento, p);
      lista.appendChild(label);
    }
  } catch {
    lista.innerHTML = '<p class="alert error">No se pudieron cargar las bebidas. Recarga la página.</p>';
  }
}

function validar(datos) {
  if (!datos.cafeId) return 'Selecciona un café.';
  if (datos.nombre.trim().length < 2) return 'Escribe tu nombre.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.correo.trim())) return 'Escribe un correo válido.';
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
    const res = await fetch('/api/votos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      localStorage.setItem('cafes_voto', '1');
      location.href = '/gracias.html';
      return;
    }
    mostrarMensaje(data.error || 'No se pudo registrar el voto.');
  } catch {
    mostrarMensaje('Error de conexión. Intenta de nuevo.');
  }
  btn.disabled = false;
  btn.textContent = 'Votar';
});

if (localStorage.getItem('cafes_voto')) {
  document.getElementById('ya-voto').hidden = false;
}
cargarCafes();
