# ☕ Concurso de Cafés – Votación por QR

Aplicación web para que los asistentes escaneen un código QR, vean las bebidas de autor y voten por su favorita. Nombre, correo y teléfono son obligatorios y se indican con un asterisco (*); ciudad es opcional. Si se informa ciudad, debe tener al menos dos caracteres después de quitar espacios externos. Si se deja vacía, se guarda como texto vacío y aparece en blanco en el panel y el CSV. Cada correo solo puede votar una vez.

Cada opción muestra la bebida como título, su establecimiento y su frase:

Las tarjetas tienen un detalle de café y resaltan al seleccionarlas. Debajo aparece «Tu elección» con la bebida y su establecimiento; puedes cambiar de opción antes de votar. La selección por sí sola no registra el voto: debes completar los datos obligatorios y pulsar **Votar**. Las tarjetas admiten teclado y reducen sus efectos si el dispositivo tiene activada la preferencia de movimiento reducido.

| Bebida | Establecimiento |
|---|---|
| Cold Brew de lulo. | Café Espíritu de Paz |
| Brisa Mirandeña | Cafelado |
| Café Paramo | Esmikafé |
| MOMI, Mocaccino Mirandeño | Raíces de Miranda |

**Tecnologías:** HTML, CSS, JavaScript, Node.js, Express y MySQL/MariaDB.

## Requisitos
- Node.js 18 o superior
- MySQL o MariaDB (por ejemplo XAMPP/WAMP) en ejecución

## Instalación
```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
```
Edita `.env` con tus datos de MySQL, un `SESSION_SECRET` largo y la clave del administrador (`ADMIN_PASS`).

```bash
npm run init-db        # instalación nueva: tablas y cuatro participantes (database/schema.sql)
npm run create-admin   # crea el admin con ADMIN_USER / ADMIN_PASS del .env
npm run dev            # desarrollo (se reinicia solo) — o: npm start
```
También puedes importar `database/schema.sql` desde phpMyAdmin o MySQL Workbench.

Para crear otro administrador: `npm run create-admin -- usuario claveSegura123`

## Reemplazar los participantes de ejemplo de una instalación existente

**Advertencia: este comando elimina TODOS los votos, votantes y participantes actuales de la base configurada en `.env`.** Úsalo solo cuando estos datos sean de prueba y antes de abrir el concurso. Conserva los administradores y agrega la columna `establecimiento` si falta.

Detén el servidor antes del reemplazo para evitar nuevos votos durante el cambio:

```bash
npm run replace-participants -- --confirm-delete-test-data
npm run dev
```

El reemplazo de datos se hace en una transacción. No se ejecuta al arrancar el servidor ni al correr `init-db`. Volver a ejecutar el comando de reemplazo vuelve a borrar los votos: **no lo uses durante el concurso**. `init-db` por sí solo no actualiza la estructura de tablas que ya existen.

Si un navegador usado en las pruebas conserva el aviso de «ya votaste», abre su consola en la página de votación y ejecuta `localStorage.removeItem('cafes_voto')`, luego recarga. Esto solo quita la marca visual de ese navegador; la restricción real de votos está en MySQL.

## Uso
- **Votación:** http://localhost:3000
- **Panel admin:** http://localhost:3000/admin/
  - Resultados con porcentajes
  - Listado de votantes con buscador y exportación a CSV (se abre en Excel, incluye `votante_id`, `voto_id`, bebida en la columna `cafe` y `establecimiento` en orden cronológico)
  - Gestión de bebidas, establecimientos y frases (agregar, editar, activar/desactivar, eliminar si no tienen votos)
  - Código QR descargable/imprimible

## Probar desde el celular (misma red Wi-Fi)
1. Averigua la IP de tu PC (`ipconfig` → Dirección IPv4, ej. `192.168.1.10`).
2. En `.env` pon `PUBLIC_URL=http://192.168.1.10:3000` y reinicia el servidor.
3. Si es necesario, permite Node.js en el Firewall de Windows.
4. Escanea el QR desde la pestaña **Código QR** del panel.

Al publicar en internet (VPS, Railway, Render…), cambia `PUBLIC_URL` por el dominio final y vuelve a descargar el QR.

## Estructura
```
database/schema.sql      Esquema de la BD
scripts/                 init-db.js y create-admin.js
src/server.js            Servidor Express
src/routes/public.js     GET /api/cafes, POST /api/votos
src/routes/admin.js      API del panel (protegida con sesión)
public/                  Página de votación y panel admin
```

## Reglas y seguridad
- Un voto por correo (restricción `UNIQUE` en la BD y transacción al votar).
- Validación de datos en el navegador y en el servidor; consultas parametrizadas.
- Límite de intentos en votación y login; claves de admin cifradas con bcrypt.

## Pruebas

`npm test` comprueba instalación nueva, actualización de la estructura anterior, participantes, CRUD y flujo de votación/CSV. Requiere MySQL/MariaDB y permisos de crear/eliminar una base temporal de pruebas con las credenciales de `.env`; no borra los datos del concurso.
