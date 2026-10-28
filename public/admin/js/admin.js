async function solicitarApi(ruta, opciones = {}) {
  const respuesta = await fetch('/admin/api' + ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  if (respuesta.status === 401) {
    location.href = '/admin/login.html';
    throw new Error('No autorizado');
  }
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || 'Error en la solicitud');
  return datos;
}

function crearElemento(etiqueta, propiedades = {}, ...hijos) {
  const elemento = document.createElement(etiqueta);
  Object.assign(elemento, propiedades);
  elemento.append(...hijos);
  return elemento;
}

// Pestañas
const cargadores = { resultados: cargarResultados, votantes: cargarVotantes, cafes: cargarCafes, qr: cargarQR };
const mensajePanel = document.getElementById('mensaje-panel');
function mostrarErrorPanel(error) {
  mensajePanel.textContent = `No se pudo completar la operación. ${error.message}`;
  mensajePanel.hidden = false;
}

async function cargarPanel(cargador) {
  mensajePanel.hidden = true;
  try {
    await cargador();
  } catch (error) {
    mostrarErrorPanel(error);
  }
}

const pestanas = [...document.querySelectorAll('.tabs button')];
function seleccionarPestana(boton) {
  for (const otra of pestanas) {
    const activa = otra === boton;
    otra.classList.toggle('activo', activa);
    otra.setAttribute('aria-selected', String(activa));
    otra.tabIndex = activa ? 0 : -1;
  }
  document.querySelectorAll('.tab').forEach((panel) => (panel.hidden = panel.id !== 'tab-' + boton.dataset.tab));
  return cargarPanel(cargadores[boton.dataset.tab]);
}
pestanas.forEach((boton, indice) => {
  boton.addEventListener('click', () => seleccionarPestana(boton));
  boton.addEventListener('keydown', (evento) => {
    let destino;
    if (evento.key === 'ArrowRight') destino = (indice + 1) % pestanas.length;
    else if (evento.key === 'ArrowLeft') destino = (indice + pestanas.length - 1) % pestanas.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = pestanas.length - 1;
    else return;
    evento.preventDefault();
    pestanas[destino].focus();
    seleccionarPestana(pestanas[destino]);
  });
});

// Resultados
async function cargarResultados() {
  const { total, cafes } = await solicitarApi('/resultados');
  document.getElementById('total').textContent = `(${total} voto${total === 1 ? '' : 's'})`;
  const contenedor = document.getElementById('resultados');
  contenedor.innerHTML = '';
  const maximo = Math.max(0, ...cafes.map((cafe) => Number(cafe.votos)));
  for (const cafe of cafes) {
    const votos = Number(cafe.votos);
    const porcentaje = total ? Math.round((votos / total) * 1000) / 10 : 0;
    const relleno = crearElemento('div', { className: 'relleno' });
    relleno.style.width = porcentaje + '%';
    contenedor.append(
      crearElemento(
        'div',
        { className: 'barra' + (votos > 0 && votos === maximo ? ' lider' : '') },
        crearElemento('div', { className: 'info' },
          crearElemento('strong', { textContent: `${cafe.nombre} — ${cafe.establecimiento}` + (cafe.activo ? '' : ' (inactivo)') }),
          crearElemento('span', { textContent: `${votos} · ${porcentaje}%` })),
        crearElemento('div', { className: 'fondo' }, relleno)
      )
    );
  }
  if (!cafes.length) contenedor.textContent = 'No hay bebidas registradas.';
}
document.getElementById('btn-refrescar').addEventListener('click', () => cargarPanel(cargarResultados));

// Votantes
let votantes = [];
async function cargarVotantes() {
  votantes = await solicitarApi('/votantes');
  pintarVotantes();
}
function pintarVotantes() {
  const busqueda = document.getElementById('buscar').value.trim().toLowerCase();
  const cuerpoTabla = document.getElementById('tabla-votantes');
  cuerpoTabla.innerHTML = '';
  const filas = votantes.filter((votante) =>
    !busqueda || [votante.nombre, votante.correo, votante.ciudad, votante.cafe, votante.establecimiento, votante.telefono].some((valor) => String(valor).toLowerCase().includes(busqueda))
  );
  for (const votante of filas) {
    cuerpoTabla.append(
      crearElemento('tr', {},
        crearElemento('td', { textContent: new Date(votante.fecha).toLocaleString() }),
        crearElemento('td', { textContent: votante.nombre }),
        crearElemento('td', { textContent: votante.correo }),
        crearElemento('td', { textContent: votante.telefono }),
        crearElemento('td', { textContent: votante.ciudad }),
        crearElemento('td', { textContent: votante.cafe }),
        crearElemento('td', { textContent: votante.establecimiento }))
    );
  }
  if (!filas.length) cuerpoTabla.append(crearElemento('tr', {}, crearElemento('td', { colSpan: 7, textContent: 'Sin registros.' })));
}
document.getElementById('buscar').addEventListener('input', pintarVotantes);

// Cafés
const formularioCafe = document.getElementById('form-cafe');
const mensajeCafes = document.getElementById('msg-cafes');

function aviso(texto, tipo = 'ok') {
  mensajeCafes.textContent = texto;
  mensajeCafes.className = 'alert ' + tipo;
  mensajeCafes.hidden = false;
  setTimeout(() => (mensajeCafes.hidden = true), 4000);
}

function reiniciarFormulario() {
  formularioCafe.reset();
  document.getElementById('cafe-id').value = '';
  document.getElementById('cafe-activo').checked = true;
  document.getElementById('titulo-form-cafe').textContent = 'Agregar bebida';
  document.getElementById('btn-cancelar').hidden = true;
}
document.getElementById('btn-cancelar').addEventListener('click', reiniciarFormulario);

async function cargarCafes() {
  const cafes = await solicitarApi('/cafes');
  const cuerpoTabla = document.getElementById('tabla-cafes');
  cuerpoTabla.innerHTML = '';
  for (const cafe of cafes) {
    const editar = crearElemento('button', { className: 'btn sm sec', textContent: 'Editar' });
    editar.onclick = () => {
      document.getElementById('cafe-id').value = cafe.id;
      document.getElementById('cafe-nombre').value = cafe.nombre;
      document.getElementById('cafe-establecimiento').value = cafe.establecimiento;
      document.getElementById('cafe-descripcion').value = cafe.descripcion || '';
      document.getElementById('cafe-activo').checked = !!cafe.activo;
      document.getElementById('titulo-form-cafe').textContent = 'Editar bebida';
      document.getElementById('btn-cancelar').hidden = false;
      formularioCafe.scrollIntoView({ behavior: 'smooth' });
    };
    const eliminar = crearElemento('button', { className: 'btn sm danger', textContent: 'Eliminar' });
    eliminar.onclick = async () => {
      if (!confirm(`¿Eliminar "${cafe.nombre}"?`)) return;
      try {
        await solicitarApi('/cafes/' + cafe.id, { method: 'DELETE' });
        aviso('Bebida eliminada');
        await cargarCafes();
      } catch (error) {
        aviso(error.message, 'error');
      }
    };
    cuerpoTabla.append(
      crearElemento('tr', {},
        crearElemento('td', { textContent: cafe.nombre }),
        crearElemento('td', { textContent: cafe.establecimiento }),
        crearElemento('td', { textContent: cafe.descripcion || '' }),
        crearElemento('td', {}, crearElemento('span', { className: 'badge ' + (cafe.activo ? 'on' : 'off'), textContent: cafe.activo ? 'Activo' : 'Inactivo' })),
        crearElemento('td', { textContent: cafe.votos }),
        crearElemento('td', {}, editar, eliminar))
    );
  }
}

formularioCafe.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const id = document.getElementById('cafe-id').value;
  const cuerpoSolicitud = JSON.stringify({
    nombre: document.getElementById('cafe-nombre').value,
    establecimiento: document.getElementById('cafe-establecimiento').value,
    descripcion: document.getElementById('cafe-descripcion').value,
    activo: document.getElementById('cafe-activo').checked,
  });
  try {
    await solicitarApi(id ? '/cafes/' + id : '/cafes', { method: id ? 'PUT' : 'POST', body: cuerpoSolicitud });
    aviso(id ? 'Bebida actualizada' : 'Bebida agregada');
    reiniciarFormulario();
    await cargarCafes();
  } catch (error) {
    aviso(error.message, 'error');
  }
});

// QR
async function cargarQR() {
  const { url: direccion } = await solicitarApi('/qr-info');
  const enlaceQR = document.getElementById('qr-url');
  enlaceQR.href = direccion;
  enlaceQR.textContent = direccion;
  document.getElementById('qr-img').src = '/admin/api/qr?t=' + Date.now();
}
document.getElementById('qr-img').addEventListener('error', () =>
  mostrarErrorPanel(new Error('No se pudo cargar el código QR. Vuelve a abrir la pestaña.')));
document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

// Sesión
document.getElementById('btn-salir').addEventListener('click', async () => {
  try {
    await solicitarApi('/logout', { method: 'POST' });
    location.href = '/admin/login.html';
  } catch (error) {
    mostrarErrorPanel(error);
  }
});

solicitarApi('/me').then(({ usuario }) => {
  document.getElementById('usuario').textContent = usuario;
  return cargarResultados();
}).catch(mostrarErrorPanel);
