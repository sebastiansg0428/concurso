const contadorVotacion = (() => {
  let estado;
  let referencia;
  let notificar;
  let consultando = false;
  let faseAnterior;
  const titulo = document.getElementById('titulo-contador');
  const tiempo = document.getElementById('tiempo-contador');
  const aviso = document.getElementById('aviso-horario');
  const reintentar = document.getElementById('reintentar-horario');
  const pruebas = document.getElementById('pruebas-votacion');
  const periodo = document.getElementById('periodo-votacion');
  const ensayo = document.getElementById('ensayo-votacion');
  let permiteVotar = false;

  function actualizar() {
    if (!estado) return;
    const ahora = estado.ahora + performance.now() - referencia;
    const fase = ahora < estado.inicio ? 'pendiente' : ahora < estado.fin ? 'abierta' : 'finalizada';
    permiteVotar = estado.pruebasLocales || (fase === 'abierta' && estado.fase === 'abierta');
    const destino = fase === 'pendiente' ? estado.inicio : estado.fin;
    const segundos = Math.max(0, Math.ceil((destino - ahora) / 1000));
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor(segundos / 3600) % 24;
    const minutos = Math.floor(segundos / 60) % 60;
    const resto = segundos % 60;
    const textoTitulo = fase === 'pendiente' ? 'La votación comienza en…'
      : fase === 'abierta' ? 'La votación termina en…' : 'Votación finalizada';
    if (titulo.textContent !== textoTitulo) titulo.textContent = textoTitulo;
    tiempo.textContent = fase === 'finalizada' ? 'Gracias por participar.'
      : `${dias} días · ${String(horas).padStart(2, '0')} horas · ${String(minutos).padStart(2, '0')} minutos · ${String(resto).padStart(2, '0')} segundos`;
    pruebas.hidden = !estado.pruebasLocales;
    notificar(permiteVotar);
    if (faseAnterior && fase !== faseAnterior) {
      faseAnterior = fase;
      sincronizar();
    }
    faseAnterior = fase;
  }

  async function sincronizar() {
    if (consultando) return;
    consultando = true;
    estado = null;
    permiteVotar = false;
    notificar(false);
    reintentar.disabled = true;
    try {
      const respuesta = await fetch('/api/horario-votacion', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!respuesta.ok) throw new Error('No se pudo consultar el horario.');
      const datos = await respuesta.json();
      if (![datos.inicio, datos.fin, datos.ahora].every(Number.isFinite) || datos.fin <= datos.inicio ||
          !['pendiente', 'abierta', 'finalizada'].includes(datos.fase) ||
          typeof datos.pruebasLocales !== 'boolean' || typeof datos.permiteVotar !== 'boolean' ||
          typeof datos.ensayo !== 'boolean' || typeof datos.inicioTexto !== 'string' || !datos.inicioTexto ||
          typeof datos.finTexto !== 'string' || !datos.finTexto) {
        throw new Error('El horario recibido no es válido.');
      }
      estado = datos;
      periodo.textContent = `Del ${datos.inicioTexto} al ${datos.finTexto} (hora de Colombia, UTC−5).`;
      ensayo.hidden = !datos.ensayo;
      referencia = performance.now();
      faseAnterior = undefined;
      aviso.textContent = '';
      reintentar.hidden = true;
      actualizar();
    } catch (err) {
      estado = null;
      permiteVotar = false;
      notificar(false);
      titulo.textContent = 'Horario no disponible';
      tiempo.textContent = '';
      aviso.textContent = 'No se pudo comprobar el horario. Reintenta para habilitar la votación.';
      reintentar.hidden = false;
      console.warn('Error consultando el horario:', err.name);
    } finally {
      consultando = false;
      reintentar.disabled = false;
    }
  }

  return {
    get permiteVotar() { return permiteVotar; },
    iniciar(alCambiar) {
      notificar = alCambiar;
      notificar(false);
      reintentar.addEventListener('click', sincronizar);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          permiteVotar = false;
          notificar(false);
          sincronizar();
        }
      });
      setInterval(actualizar, 1000);
      sincronizar();
    },
  };
})();
