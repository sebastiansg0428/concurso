document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const mensaje = document.getElementById('mensaje');
  mensaje.hidden = true;
  try {
    const respuesta = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: document.getElementById('usuario').value,
        clave: document.getElementById('clave').value,
      }),
    });
    if (!respuesta.ok) {
      const datos = await respuesta.json();
      throw new Error(datos.error || 'No se pudo iniciar sesión');
    }
    location.href = '/admin/';
  } catch (error) {
    mensaje.textContent = `No se pudo iniciar sesión. ${error.message}`;
    mensaje.hidden = false;
  }
});
