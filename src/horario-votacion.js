const CALENDARIO = {
  inicio: Date.parse('2026-11-01T09:00:00-05:00'),
  // Incluye todo el ultimo minuto del 14 de noviembre, hora de Colombia.
  fin: Date.parse('2026-11-15T00:00:00-05:00'),
  ensayo: false,
};

function crearHorarioVotacion(env = {}, calendario = CALENDARIO) {
  const { inicio, fin, ensayo } = calendario;
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio || typeof ensayo !== 'boolean') {
    throw new Error('Calendario de votación inválido.');
  }
  const formato = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const inicioTexto = formato.format(inicio);
  const finTexto = formato.format(fin - 1);
  const opcion = env.PRUEBAS_VOTACION_LOCAL || '';
  if (!['', 'false', 'true'].includes(opcion)) {
    throw new Error('PRUEBAS_VOTACION_LOCAL debe ser true o false.');
  }
  const pruebasLocales = opcion === 'true';
  if (pruebasLocales && env.NODE_ENV !== 'development') {
    throw new Error('PRUEBAS_VOTACION_LOCAL solo se permite con NODE_ENV=development.');
  }
  return (ahora) => {
    const fase = ahora < inicio ? 'pendiente' : ahora < fin ? 'abierta' : 'finalizada';
    return {
      inicio,
      fin,
      inicioTexto,
      finTexto,
      ensayo,
      ahora,
      fase,
      pruebasLocales,
      permiteVotar: pruebasLocales || fase === 'abierta',
    };
  };
}

function mensajeHorario(estado) {
  return estado.fase === 'pendiente'
    ? `La votación comienza el ${estado.inicioTexto}, hora de Colombia.`
    : `La votación finalizó el ${estado.finTexto}, hora de Colombia.`;
}

module.exports = { crearHorarioVotacion, mensajeHorario };
