# ☕ Concurso de Cafés – Votación por QR

Aplicación web para que los asistentes escaneen un código QR, vean las bebidas de autor y voten por su favorita. Nombre, correo y teléfono son obligatorios y se indican con un asterisco (*); ciudad es opcional. Si se informa ciudad, debe tener al menos dos caracteres después de quitar espacios externos. Si se deja vacía, se guarda como texto vacío y aparece en blanco en el panel y el CSV. Cada correo solo puede votar una vez.

Cada opción muestra la bebida como título, su establecimiento y su frase:

Las tarjetas muestran una foto de cada bebida y resaltan al seleccionarlas. Las fotos se muestran completas, sin recortar ni deformar, sobre fondo neutro. Debajo aparece «Tu elección» con la bebida y su establecimiento; puedes cambiar de opción antes de votar. La selección por sí sola no registra el voto: debes completar los datos, pulsar **Recibir código para votar** y confirmar el código recibido por correo. Las tarjetas admiten teclado y reducen sus efectos si el dispositivo tiene activada la preferencia de movimiento reducido.

| Bebida | Establecimiento |
|---|---|
| Cold Brew de lulo. | Café Espíritu de Paz |
| Brisa Mirandeña | Cafelado |
| Café Paramo | Esmikafé |
| MOMI, Mocaccino Mirandeño | Raíces de Miranda |

**Tecnologías:** HTML, CSS, JavaScript, Node.js, Express y MySQL/MariaDB.

## Fotos de las bebidas

Las imágenes están en `public/img/bebidas/` y se publican junto con la aplicación, también en Railway:

| Bebida | Archivo |
|---|---|
| Cold Brew de lulo. | `cold-brew-de-lulo.jpg` |
| Brisa Mirandeña | `brisa-mirandena.jpg` |
| Café Paramo | `cafe-paramo.jpg` |
| MOMI, Mocaccino Mirandeño | `momi.jpg` |

Para reemplazar una foto, guarda el nuevo JPG con el mismo nombre y vuelve a desplegar (en desarrollo, recarga la página). No hace falta modificar MySQL. Conviene optimizar el peso sin ampliar imágenes pequeñas.

La asociación se define en `fotosBebidas` en `public/js/votar.js` usando el nombre de la bebida y su establecimiento, no su ID. Si editas esos nombres en el panel o agregas otra bebida, actualiza también esa lista y su archivo. Para Cold Brew se admite el nombre con o sin el punto final. Las bebidas sin foto configurada conservan el icono de taza; si una foto configurada falla al cargar, se muestra «Foto no disponible» y un aviso en la consola. No hay carga de imágenes desde el panel.

## Requisitos
- Node.js 22 o 24 (LTS); recomendado Node.js 24 para Railway. `engines` declara las versiones compatibles.
- MySQL o MariaDB (por ejemplo XAMPP/WAMP) en ejecución

## Instalación
```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
```
Edita `.env` con tus datos de MySQL, un `SESSION_SECRET` largo y la clave del administrador (`ADMIN_PASS`).
Configura también `VERIFICATION_SECRET` y Gmail como se explica en la sección de seguridad. Sin Gmail configurado, la solicitud de códigos devolverá un error explícito; no se registran votos sin verificación.

```bash
npm run init-db        # instalación nueva: tablas y cuatro participantes (database/schema.sql)
npm run create-admin   # crea el admin con ADMIN_USER / ADMIN_PASS del .env
npm run dev            # desarrollo (se reinicia solo) — o: npm start
```
También puedes importar `database/schema.sql` desde phpMyAdmin o MySQL Workbench.

Para crear otro administrador, configura `ADMIN_USER` y `ADMIN_PASS` en tu entorno protegido y ejecuta `npm run create-admin`. Evita contraseñas en argumentos de consola: pueden quedar en el historial o en la lista de procesos. No subas `.env` al repositorio.

> **PowerShell en Windows:** `npm run comando -- --opción` puede perder las opciones, porque PowerShell elimina el `--` al ejecutar `npm.ps1`. En ese caso, el script responderá que falta la confirmación aunque la hayas escrito. Usa `npm.cmd` en lugar de `npm`, por ejemplo `npm.cmd run migrate-correo-canonico -- --confirmar-respaldo`, o ejecuta el script directamente: `node scripts\migrate-correo-canonico.js --confirmar-respaldo`. En CMD, Git Bash y la consola de Railway los comandos funcionan tal como aparecen.

## Migrar participantes sin borrar datos

Si una instalación antigua no tiene la columna `establecimiento`, detén el servidor, verifica una copia de seguridad y ensaya la actualización en una base temporal representativa:

```powershell
npm run migrate-participants -- --confirmar-respaldo
```

La migración agrega únicamente esa columna y se puede repetir. Conserva IDs, votos, votantes y administradores; los establecimientos antiguos quedan vacíos hasta completarlos desde el panel. Las instalaciones nuevas ya incluyen la columna. MySQL confirma los cambios DDL de forma implícita: esta migración es un paso separado, nunca parte de la transacción que reemplaza datos.

## Migrar el correo canónico (un voto por buzón)

Las bases creadas antes de esta versión no tienen `votantes.correo_canonico` y el servidor no arranca hasta migrarlas. Detén el servidor, haz una copia de seguridad, ensaya en una base temporal y ejecuta:

```powershell
npm run migrate-correo-canonico -- --confirmar-respaldo
```

Agrega la columna, la rellena para los votantes existentes y crea el índice único `uq_votantes_correo_canonico`, sin borrar datos. Se puede repetir y completa estados parciales. Si dos votantes ya comparten buzón (por ejemplo `ana.perez@gmail.com` y `anaperez+2@gmail.com`), se detiene sin modificar nada e indica sus ID para revisarlos manualmente. Los códigos pendientes de alias anteriores a la migración dejan de valer: basta pedir uno nuevo.

## Reemplazar los participantes de ejemplo de una instalación existente

**Advertencia: este comando elimina TODOS los votos, votantes y participantes actuales de la base configurada en `.env`.** Úsalo solo cuando estos datos sean de prueba y antes de abrir el concurso. Conserva los administradores y exige que el esquema ya esté actualizado; no ejecuta DDL.

Detén el servidor antes del reemplazo para evitar nuevos votos durante el cambio. Verifica una copia de seguridad y ensaya primero en una base temporal:

```bash
npm run replace-participants -- --confirm-delete-test-data --confirmar-respaldo
npm run dev
```

El reemplazo de datos se hace en una transacción. Los cuatro participantes vuelven a crearse con los ID 1 a 4, igual que en una instalación nueva. No se ejecuta al arrancar el servidor ni al correr `init-db`. Volver a ejecutar el comando de reemplazo vuelve a borrar los votos: **no lo uses durante el concurso**. `init-db` por sí solo no actualiza la estructura de tablas que ya existen.

Si un navegador usado en las pruebas conserva el aviso de «ya votaste», abre su consola en la página de votación y ejecuta `localStorage.removeItem('cafes_voto')`, luego recarga. Esto solo quita la marca visual de ese navegador; la restricción real de votos está en MySQL.

## Reiniciar los IDs para un concurso nuevo

Para empezar los IDs de votos y votantes desde 1, este comando elimina **todos los votos y votantes actuales**. Conserva los cafés y las cuentas de administrador. No se puede reiniciar el siguiente ID a 1 mientras existan registros, y los IDs del CSV son los de la base de datos.

Detén el servidor, verifica una copia de seguridad y ensaya primero en una base temporal representativa. Úsalo solo antes de iniciar un concurso nuevo; no durante la votación:

```powershell
npm.cmd run reiniciar-votos -- --confirmar-eliminacion --confirmar-respaldo
```

En Railway, ejecútalo desde tu PC con las mismas variables temporales de `root` que se usan para `init-db` (ver «Preparar la base MySQL de Railway desde tu PC»), porque reiniciar `AUTO_INCREMENT` requiere permiso `ALTER`, y el usuario de la app (`concurso_app`) no lo tiene:

```powershell
node scripts\reiniciar-votos.js --confirmar-eliminacion --confirmar-respaldo
```

Ambas confirmaciones son obligatorias. La eliminación de los datos se realiza en una transacción y luego se reinician los contadores `AUTO_INCREMENT` de `votos` y `votantes`. Exporta de nuevo el CSV para ver los nuevos registros. El comando no se ejecuta al iniciar la aplicación.

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
database/                Esquema nuevo y SQL de migración de seguridad
scripts/                 Inicialización, migraciones, admin y reemplazo de pruebas
src/server.js            Servidor Express, healthcheck y cierre ordenado
src/configuracion-db.js  Validación de configuración MySQL
src/security.js          HTTPS, proxy, cookies y CSP
src/session-store.js     Sesiones persistentes y renovación en MySQL
src/mailer.js            Envío de códigos por la API de Brevo o Gmail SMTP con TLS
src/routes/public.js     GET /api/cafes, POST /api/verificacion, POST /api/votos
src/routes/admin.js      API del panel (protegida con sesión)
public/                  Página de votación y panel admin
test/                    Pruebas unitarias e integración en base temporal
```

## Reglas y seguridad
- Un voto por **correo verificado**, no por persona: alguien con varias cuentas podría votar varias veces. Los votos antiguos se conservan; no quedan verificados retroactivamente.
- Validación de datos en el navegador y en el servidor; consultas parametrizadas.
- Límite de intentos en votación y login; claves de admin cifradas con bcrypt.

### Actualizar una instalación existente (sin borrar votos)

Detén el servidor, verifica un respaldo, ensaya en una base temporal, actualiza dependencias y ejecuta:

```powershell
npm install
npm run migrate-security
```

La migración agrega `email_challenges` y `admin_sessions` sin borrar participantes, votos, votantes ni administradores. **No uses `replace-participants` para actualizar seguridad.** Los esquemas nuevos ya incluyen estas tablas.

### Secretos y Gmail

1. En `.env`, conserva un `SESSION_SECRET` aleatorio de al menos 32 caracteres y agrega otro secreto **distinto**, `VERIFICATION_SECRET`. Para generar cada uno en tu terminal:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Activa la verificación en dos pasos de tu cuenta Google. En la configuración de seguridad de Google crea una **contraseña de aplicación**; algunas cuentas administradas no permiten hacerlo.
3. Configura localmente:

   ```dotenv
   SMTP_USER=tu-cuenta@gmail.com
   SMTP_PASS=tu-contrasena-de-aplicacion
   NODE_ENV=development
   TRUSTED_PROXIES=
   PROXY_SALTOS_CONFIABLES=
   ```

No uses tu contraseña habitual de Gmail, no compartas estos valores ni subas `.env`. El envío usa `smtp.gmail.com:465` con TLS. Gmail tiene cuotas de envío; verifica que sean suficientes para el evento.

### Envío por Brevo (Railway Hobby)

Railway bloquea SMTP (puertos 25, 465 y 587) en los planes Free, Trial y Hobby, así que en Railway el código se envía con la API HTTPS de [Brevo](https://www.brevo.com) (plan gratuito: 300 correos al día). Si `BREVO_API_KEY` está definida, la app usa Brevo; si no, usa Gmail SMTP.

1. Crea una cuenta gratuita en Brevo.
2. En **Senders, Domains & Dedicated IPs → Senders**, agrega tu correo Gmail como remitente y confírmalo con el enlace que te llega.
3. En **SMTP & API → API Keys**, crea una clave (empieza por `xkeysib-`). Cópiala: solo se muestra una vez.
4. En Railway, servicio de la app → **Variables**, agrega `BREVO_API_KEY` con esa clave y `CORREO_REMITENTE` con el Gmail verificado. Despliega los cambios.

Los remitentes `@gmail.com` sin dominio propio pueden llegar a spam; avisa a los votantes que revisen esa carpeta.

### Horario y contador de votación

El concurso abre el **1 de noviembre de 2026 a las 9:00 a. m.** y permite votar hasta el **14 de noviembre de 2026 a las 11:59 p. m.**, hora de Colombia (UTC−5). Incluye ese último minuto: se cierra al comenzar el 15 de noviembre. Las fechas se definen en `src/horario-votacion.js`.

La página muestra una cuenta regresiva para la apertura y luego para el cierre, sincronizada con la hora del servidor mediante `GET /api/horario-votacion`. Fuera del plazo se conserva el catálogo, pero no se pueden solicitar códigos (ni reenviarlos) o confirmar votos, tampoco llamando directamente a la API. Un código pedido antes del cierre no permite votar después. El panel administrativo y el QR siguen disponibles.

Para probar el flujo completo **en tu PC**, usa una base MySQL local o temporal y configura en tu `.env`:

```dotenv
NODE_ENV=development
PRUEBAS_VOTACION_LOCAL=true
```

La página mostrará un aviso de pruebas y mantendrá el contador real. Se siguen exigiendo correo verificado y voto único por buzón; los votos se guardan en la base configurada. **Si apuntas a MySQL de Railway, serían datos reales.** No se borran registros automáticamente.

La excepción está desactivada por defecto. Con otro entorno, incluido `production`, habilitarla impide arrancar; no añadas `PRUEBAS_VOTACION_LOCAL=true` en Railway. Para volver al horario normal local, usa `false` y reinicia el servidor. No cambies la hora del dispositivo para probar: el servidor decide si se puede votar.

### Cómo se registra un voto

1. Seleccionar bebida y completar nombre, correo y teléfono (ciudad opcional).
2. Pulsar **Recibir código para votar** y revisar el correo o spam.
3. Introducir el código de seis dígitos y pulsar **Confirmar y registrar voto**.

El código vence en 10 minutos y admite 5 intentos incorrectos. Un reenvío solo se permite tras 60 segundos, invalida el código anterior y **no reinicia** el plazo ni los intentos del desafío. Tras agotar intentos, esperar el plazo original antes de pedir otro. El voto se registra en una transacción que consume el desafío para evitar reutilización. La ruta antigua sin código ya no acepta votos. El navegador no guarda los datos del formulario en almacenamiento persistente.

Los códigos se almacenan como HMAC con secreto independiente, no como texto. Los desafíos vencidos se eliminan al arrancar y cada hora cuando llevan más de 24 horas vencidos. Las sesiones admin vencen tras 8 horas de inactividad: cada petición con sesión renueva tanto la cookie como su vencimiento en MySQL; las expiradas se eliminan en la misma limpieza. Reiniciar invalida los contadores por IP en memoria; para varias instancias se necesita un almacén compartido para los rate limits. Los límites de intentos y reenvío por correo sí persisten en MySQL.

### Publicación segura

- En producción configurar `NODE_ENV=production` y `PUBLIC_URL=https://tu-dominio`. **Cambiar la variable no instala HTTPS:** el hosting/proxy debe tener un certificado válido y terminar TLS.
- Configurar el proxy de confianza con **una** de estas variables (en producción es obligatorio; sin ella la app no arranca):
  - `PROXY_SALTOS_CONFIABLES` (1–3): número de proxies delante de Node. Para plataformas sin IP fija como Railway usa `1`. Express toma la IP del cliente que añade el propio proxy (extremo derecho de `X-Forwarded-For`), así que un visitante no puede falsificarla.
  - `TRUSTED_PROXIES`: IP/CIDR reales del proxy, separadas por comas, cuando son fijas. No usar `true`, `1` ni subredes de todo internet.
  
  El puerto interno de Node no debe ser público.
- `LIMITE_CORREOS_POR_DIA` (por defecto 400) limita los códigos enviados en una ventana móvil de 24 horas por la instancia, aunque alguien rote direcciones IP; al alcanzarlo responde 503. Incluye reenvíos. Ajustarlo a la cuota real del proveedor: el valor predeterminado supera los 300 envíos diarios del plan gratuito de Brevo. El contador está en memoria: se reinicia con la app, requiere una sola instancia y no mide el saldo disponible en Brevo ni coincide necesariamente con su período de cuota.
- Base MySQL de Railway: si es nueva, `npm run init-db` crea todas las tablas, incluida `votantes.correo_canonico`. Si ya existía, no basta con `init-db`. Antes de desplegar esta versión, haz una copia de seguridad, prueba en una base temporal y ejecuta una vez contra esa base, con sus variables de conexión, `npm run migrate-correo-canonico -- --confirmar-respaldo`. Si la base es anterior a `establecimiento` o a las tablas de seguridad, ejecuta antes `npm run migrate-participants -- --confirmar-respaldo` y `npm run migrate-security`. Sin esta migración, la app no arranca.
- Un buzón vota una sola vez: se guarda `correo_canonico` (minúsculas, sin `+etiqueta` y, en Gmail, sin puntos) con índice único. El correo solo acepta direcciones simples (sin nombres ni `<...>`).
- La app rechaza peticiones HTTP en producción y usa cookies `Secure`, `HttpOnly`, `SameSite=Lax` y HSTS. Localmente permite HTTP para pruebas por Wi-Fi.
- Usa un usuario MySQL propio de la app con permisos mínimos sobre su base, no `root`. Ejecuta migraciones con una cuenta autorizada a crear tablas; el servidor solo necesita leer/escribir datos.
- Cambia las contraseñas de prueba y usa una clave admin larga y única. Cambiar `ADMIN_PASS` en `.env` no actualiza la base hasta ejecutar `npm run create-admin`.
- Protege el acceso a CSV y copias de seguridad. Define un aviso de privacidad, finalidad y plazo de conservación de nombre, correo y teléfono adecuado al evento. No hay borrado automático de votos ni votantes.

### Checklist de Railway (una instancia)

1. Selecciona Node.js 24 o 22 y usa `npm ci` para instalar y `npm start` para arrancar. La app escucha el `PORT` asignado por Railway; no ejecutes scripts destructivos como comandos de despliegue.
2. Define `NODE_ENV=production`, `PUBLIC_URL` HTTPS, secretos independientes, correo (en Railway Hobby, `BREVO_API_KEY` y `CORREO_REMITENTE`) y todas las variables MySQL. Faltar una credencial, usar `root` o un puerto inválido impide iniciar en producción. Los defaults de MySQL solo se conservan en desarrollo.
3. Usa una base separada para staging y un usuario propio con permisos mínimos. Usa la red privada del proveedor entre app y MySQL; si la conexión cruza una red pública, valida/configura TLS de MySQL antes de publicar (esta app no lo activa automáticamente).
4. Migra manualmente tras respaldo y ensayo, con un usuario autorizado a DDL. Comprueba el esquema antes de arrancar la app; el inicio nunca aplica migraciones.
5. Configura el healthcheck como `GET /health`. Devuelve 200 si MySQL responde y 503 si falla o se está cerrando. Es la única ruta disponible por HTTP interno en producción, no crea sesiones ni expone diagnósticos; el resto exige HTTPS. El sondeo no prueba el envío de correo.
6. Define `PROXY_SALTOS_CONFIABLES=1` (Railway no publica IP fijas de proxy). Prueba en staging que login produzca una cookie `Secure` y que la IP de los límites sea la del cliente, no la del proxy.
7. El servidor maneja `SIGTERM`/`SIGINT`: deja de aceptar conexiones, espera las peticiones activas y cierra MySQL. Tiene un límite de 10 segundos; agotarlo registra error y termina con código no exitoso. Configura un período de terminación mayor en el hosting.
8. Prueba en staging: catálogo, código real de Gmail, voto único, reintentos, login/logout, panel, CSV, QR e impresión. La CSP permite recursos propios y bloquea scripts inline y marcos externos.
9. Mantén una instancia mientras los límites por IP sigan en memoria. Confirma copias recuperables, acceso restringido a CSV y monitoreo de errores/healthcheck.

### Preparación sin un entorno adicional de Railway

Los ensayos locales reducen riesgos pero no equivalen a probar la apertura real en Railway. No se garantiza disponibilidad absoluta ni entrega de correo solo porque `/health` responda correctamente.

**Antes del push:**

1. Ejecuta las pruebas con MySQL local o desechable y revisa el diff. Las pruebas de horario usan un reloj simulado; no cambies el reloj del PC ni las fechas definitivas para publicar.
2. Prueba en tu PC selección, código real, confirmación y rechazo de voto repetido; revisa panel y CSV. Usa tu base local, no MySQL de Railway. Prueba también desde el celular en la misma red.
3. Comprueba el bloqueo local con `PRUEBAS_VOTACION_LOCAL=false` y reinicia; vuelve a `true` solo para pruebas en `development`. Confirma pérdida de conexión y recuperación con el botón de reintento.
4. Revisa en Brevo la cuota vigente y el consumo de la cuenta. Para unos 200 códigos diarios y una cuota de 300, el margen nominal es de 100 envíos, incluidos otros usos de la cuenta. Los reenvíos y las pruebas también consumen. Si la cuenta es exclusiva del concurso y tiene esa cuota, puede acordarse un límite de 250 como protección, pero bloquearía solicitudes al alcanzarlo: no es garantía de capacidad ni un cambio automático.
5. Define quién revisará consumo y errores del proveedor y qué hará si se acerca al límite; ampliar capacidad requiere decisión del organizador. No simules carga enviando cientos de correos reales.
6. Prepara una copia de seguridad de producción y comprueba su recuperación en una base temporal antes de cualquier limpieza. Identifica los votos de prueba con el organizador: no los borres automáticamente ni uses scripts destructivos durante el despliegue.
7. En Railway confirma `NODE_ENV=production`, `PRUEBAS_VOTACION_LOCAL` ausente o `false`, dominio HTTPS, una réplica y credenciales existentes de MySQL/Brevo. No copies el archivo `.env` local a producción.
8. Comprueba que `.env` y los respaldos no estén incluidos en el commit. Autoriza explícitamente commit y push; si la rama está conectada al despliegue automático, un push puede publicar inmediatamente.

**Después de una publicación autorizada:**

1. Confirma en Railway el commit desplegado y su estado exitoso; un push por sí solo no confirma la publicación.
2. Desde el dominio público consulta `/health` y `/api/horario-votacion`: antes de la apertura debe informar `fase: "pendiente"`, `pruebasLocales: false`, `permiteVotar: false` y las fechas definitivas. No hagas la prueba contra `localhost` por error.
3. Comprueba contador y catálogo desde un celular con datos móviles. Verifica que solicitudes directas a `POST /api/verificacion` y `POST /api/votos` devuelvan 403 fuera del plazo, sin enviar códigos ni registrar votos.
4. Revisa con el administrador login/logout, panel, CSV y QR. El QR debe abrir el dominio público, no la IP local.
5. Antes de abrir revisa disponibilidad, recursos/facturación de Railway, cuota de Brevo y respaldos. Al abrir comprueba `fase: "abierta"` y realiza un voto legítimo, o una prueba acordada con el organizador y con tratamiento explícito de sus datos.

**Si aparece un fallo:** conserva la referencia del despliegue anterior y revisa logs sin publicar secretos. Una restauración manual de la versión anterior puede recuperar la página, pero podría volver a permitir votos anticipados si esa versión no tenía el bloqueo; valora ese efecto antes de restaurar. No borres la base ni redespliegues repetidamente sin diagnóstico. Quitar el contador no resuelve una cuota de correo agotada.

### Ensayo coordinado en la misma página de Railway

Solo realizarlo antes de difundir el enlace o el QR, con autorización del organizador y respaldo previo. Durante la apertura temporal cualquiera con el enlace podrá votar. Los votos quedan en la base real y consumen la cuota de correo; identifica las cuentas de prueba y acuerda su tratamiento por separado. Mientras sus registros existan no podrán votar otra vez.

1. Coordina la sesión con quien vaya a probar. En `src/horario-votacion.js`, el objeto `CALENDARIO` reúne `inicio`, `fin` (exclusivo) y `ensayo`. Prepara fechas temporales futuras con zona `-05:00` y `ensayo: true`, dejando margen para confirmar el despliegue antes de abrir. No habilites `PRUEBAS_VOTACION_LOCAL` en Railway.
2. El endpoint de horario, las fechas visibles y los mensajes de rechazo usan ese mismo calendario. Con `ensayo: true` la página advierte que no es la votación oficial; la marca no omite las restricciones de horario.
3. Ejecuta las pruebas; conserva las comprobaciones del calendario oficial y adapta las del calendario publicado cuando corresponda. Autoriza los cambios temporales y su restauración antes del push. Si el despliegue llega después de la apertura prevista, reprograma el ensayo.
4. Comprueba bloqueo antes de abrir, apertura sin recargar, código recibido, voto registrado, panel/CSV y rechazo de duplicados. Después comprueba cierre y rechazo de un código pendiente.
5. Restaura `inicio: Date.parse('2026-11-01T09:00:00-05:00')`, `fin: Date.parse('2026-11-15T00:00:00-05:00')` y `ensayo: false`. Ejecuta las pruebas y publica la restauración autorizada. Comprueba las fechas y `ensayo: false`, `pruebasLocales: false`, `fase: "pendiente"`, `permiteVotar: false` en el dominio público.
6. No des por terminado el ensayo hasta verificar la restauración. Mantén el mismo dominio: el QR no cambia. Solo después de restaurar imprime y reparte el QR.

La preparación del código por sí sola no acredita este ensayo: registra qué comprobaciones se hicieron realmente y cuáles faltan. No se crean servicios adicionales ni se borran votos automáticamente.

### Preparar la base MySQL de Railway desde tu PC

El MySQL de Railway solo trae el usuario `root`, que la app rechaza en producción. Prepara la base una vez desde tu PC con `root` y crea un usuario propio para la app:

1. En el servicio **MySQL** de Railway → **Variables**, copia `MYSQLPASSWORD` y, de `MYSQL_PUBLIC_URL`, el host y el puerto públicos (`...proxy.rlwy.net:NNNNN`).
2. En PowerShell, dentro del proyecto (las variables solo duran en esa ventana; reemplaza los valores entre `<>`):

   ```powershell
   $env:DB_HOST="<host público>"; $env:DB_PORT="<puerto público>"
   $env:DB_USER="root"; $env:DB_PASS="<MYSQLPASSWORD>"; $env:DB_NAME="railway"
   node scripts\init-db.js
   $env:USUARIO_APP="concurso_app"; $env:CLAVE_USUARIO_APP="<clave larga, mínimo 16>"
   node scripts\crear-usuario-app.js
   $env:ADMIN_USER="<usuario panel>"; $env:ADMIN_PASS="<clave panel>"
   node scripts\create-admin.js
   ```

   `crear-usuario-app` concede solo `SELECT, INSERT, UPDATE, DELETE` sobre la base; repetirlo actualiza la clave.
3. En el servicio web usa `DB_HOST=${{MySQL.MYSQLHOST}}`, `DB_PORT=${{MySQL.MYSQLPORT}}`, `DB_NAME=${{MySQL.MYSQLDATABASE}}`, `DB_USER=concurso_app` y `DB_PASS=<clave del paso 2>`. Así la app usa la red privada de Railway.
4. Cierra esa ventana de PowerShell al terminar para descartar las credenciales.

**Pendiente de decisión del organizador antes de abrir el concurso:** responsable y contacto para los datos, finalidad, aviso visible y plazo de conservación (incluidas IP, CSV y backups). No se inventa una política legal ni se programa borrado automático sin esos requisitos; conservar correos es lo que impide votos repetidos durante el evento.

## Pruebas

`npm test` comprueba instalación, actualización, CRUD, correo verificado, vencimiento, intentos, reenvío, concurrencia, errores SMTP, votos, CSV, sesiones MySQL y configuración HTTPS/proxy. El envío se simula por inyección en los tests; no se envían correos reales ni se crea un bypass en producción. Requiere MySQL/MariaDB y permisos de crear/eliminar una base temporal de pruebas con las credenciales de `.env`; no borra los datos del concurso. El envío real por Gmail y el HTTPS público deben validarse al configurar las credenciales y el hosting.

Ejecuta la suite completa únicamente con un servidor MySQL desechable y variables `DB_HOST`, `DB_PORT`, `DB_USER` y `DB_PASS` que apunten a ese servidor. La prueba crea una base `concurso_test_*`, carga datos sintéticos, comprueba preservación y repetición de la migración y elimina solo esa base al terminar; no apuntes la suite a producción.

Para validar sin MySQL ni correo real:

```powershell
node --test test\server.test.js test\security.test.js test\voter-form.test.js test\admin-ui.test.js
```
