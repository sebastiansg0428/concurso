async function api(url, opciones = {}) {
  const res = await fetch('/admin/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  if (res.status === 401) {
    location.href = '/admin/login.html';
    throw new Error('No autorizado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

// Pestañas
const cargadores = { resultados: cargarResultados, votantes: cargarVotantes, cafes: cargarCafes, qr: cargarQR };
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('activo', x === b));
    document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== 'tab-' + b.dataset.tab));
    cargadores[b.dataset.tab]();
  })
);

// Resultados
async function cargarResultados() {
  const { total, cafes } = await api('/resultados');
  document.getElementById('total').textContent = `(${total} voto${total === 1 ? '' : 's'})`;
  const cont = document.getElementById('resultados');
  cont.innerHTML = '';
  const max = Math.max(0, ...cafes.map((c) => Number(c.votos)));
  for (const c of cafes) {
    const votos = Number(c.votos);
    const pct = total ? Math.round((votos / total) * 1000) / 10 : 0;
    const relleno = el('div', { className: 'relleno' });
    relleno.style.width = pct + '%';
    cont.append(
      el(
        'div',
        { className: 'barra' + (votos > 0 && votos === max ? ' lider' : '') },
        el('div', { className: 'info' },
          el('strong', { textContent: `${c.nombre} — ${c.establecimiento}` + (c.activo ? '' : ' (inactivo)') }),
          el('span', { textContent: `${votos} · ${pct}%` })),
        el('div', { className: 'fondo' }, relleno)
      )
    );
  }
  if (!cafes.length) cont.textContent = 'No hay bebidas registradas.';
}
document.getElementById('btn-refrescar').addEventListener('click', cargarResultados);

// Votantes
let votantes = [];
async function cargarVotantes() {
  votantes = await api('/votantes');
  pintarVotantes();
}
function pintarVotantes() {
  const q = document.getElementById('buscar').value.trim().toLowerCase();
  const tbody = document.getElementById('tabla-votantes');
  tbody.innerHTML = '';
  const filas = votantes.filter((v) =>
    !q || [v.nombre, v.correo, v.ciudad, v.cafe, v.establecimiento, v.telefono].some((x) => String(x).toLowerCase().includes(q))
  );
  for (const v of filas) {
    tbody.append(
      el('tr', {},
        el('td', { textContent: new Date(v.fecha).toLocaleString() }),
        el('td', { textContent: v.nombre }),
        el('td', { textContent: v.correo }),
        el('td', { textContent: v.telefono }),
        el('td', { textContent: v.ciudad }),
        el('td', { textContent: v.cafe }),
        el('td', { textContent: v.establecimiento }))
    );
  }
  if (!filas.length) tbody.append(el('tr', {}, el('td', { colSpan: 7, textContent: 'Sin registros.' })));
}
document.getElementById('buscar').addEventListener('input', pintarVotantes);

// Cafés
const formCafe = document.getElementById('form-cafe');
const msgCafes = document.getElementById('msg-cafes');

function aviso(texto, tipo = 'ok') {
  msgCafes.textContent = texto;
  msgCafes.className = 'alert ' + tipo;
  msgCafes.hidden = false;
  setTimeout(() => (msgCafes.hidden = true), 4000);
}

function resetForm() {
  formCafe.reset();
  document.getElementById('cafe-id').value = '';
  document.getElementById('cafe-activo').checked = true;
  document.getElementById('titulo-form-cafe').textContent = 'Agregar bebida';
  document.getElementById('btn-cancelar').hidden = true;
}
document.getElementById('btn-cancelar').addEventListener('click', resetForm);

async function cargarCafes() {
  const cafes = await api('/cafes');
  const tbody = document.getElementById('tabla-cafes');
  tbody.innerHTML = '';
  for (const c of cafes) {
    const editar = el('button', { className: 'btn sm sec', textContent: 'Editar' });
    editar.onclick = () => {
      document.getElementById('cafe-id').value = c.id;
      document.getElementById('cafe-nombre').value = c.nombre;
      document.getElementById('cafe-establecimiento').value = c.establecimiento;
      document.getElementById('cafe-descripcion').value = c.descripcion || '';
      document.getElementById('cafe-activo').checked = !!c.activo;
      document.getElementById('titulo-form-cafe').textContent = 'Editar bebida';
      document.getElementById('btn-cancelar').hidden = false;
      formCafe.scrollIntoView({ behavior: 'smooth' });
    };
    const eliminar = el('button', { className: 'btn sm danger', textContent: 'Eliminar' });
    eliminar.onclick = async () => {
      if (!confirm(`¿Eliminar "${c.nombre}"?`)) return;
      try {
        await api('/cafes/' + c.id, { method: 'DELETE' });
        aviso('Bebida eliminada');
        cargarCafes();
      } catch (err) {
        aviso(err.message, 'error');
      }
    };
    tbody.append(
      el('tr', {},
        el('td', { textContent: c.nombre }),
        el('td', { textContent: c.establecimiento }),
        el('td', { textContent: c.descripcion || '' }),
        el('td', {}, el('span', { className: 'badge ' + (c.activo ? 'on' : 'off'), textContent: c.activo ? 'Activo' : 'Inactivo' })),
        el('td', { textContent: c.votos }),
        el('td', {}, editar, eliminar))
    );
  }
}

formCafe.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('cafe-id').value;
  const body = JSON.stringify({
    nombre: document.getElementById('cafe-nombre').value,
    establecimiento: document.getElementById('cafe-establecimiento').value,
    descripcion: document.getElementById('cafe-descripcion').value,
    activo: document.getElementById('cafe-activo').checked,
  });
  try {
    await api(id ? '/cafes/' + id : '/cafes', { method: id ? 'PUT' : 'POST', body });
    aviso(id ? 'Bebida actualizada' : 'Bebida agregada');
    resetForm();
    cargarCafes();
  } catch (err) {
    aviso(err.message, 'error');
  }
});

// QR
async function cargarQR() {
  const { url } = await api('/qr-info');
  const a = document.getElementById('qr-url');
  a.href = url;
  a.textContent = url;
  document.getElementById('qr-img').src = '/admin/api/qr?t=' + Date.now();
}

// Sesión
document.getElementById('btn-salir').addEventListener('click', async () => {
  await fetch('/admin/api/logout', { method: 'POST' });
  location.href = '/admin/login.html';
});

api('/me').then(({ usuario }) => {
  document.getElementById('usuario').textContent = usuario;
  cargarResultados();
});
