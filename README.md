# ☕ Concurso de Cafés – Votación por QR

Aplicación web para que los asistentes escaneen un código QR, vean el listado de cafés y voten por su favorito, registrando sus datos (nombre, correo, teléfono y ciudad). Cada correo solo puede votar una vez.

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
npm run init-db        # crea la base de datos, tablas y cafés de ejemplo (database/schema.sql)
npm run create-admin   # crea el admin con ADMIN_USER / ADMIN_PASS del .env
npm run dev            # desarrollo (se reinicia solo) — o: npm start
```
También puedes importar `database/schema.sql` desde phpMyAdmin o MySQL Workbench.

Para crear otro administrador: `npm run create-admin -- usuario claveSegura123`

## Uso
- **Votación:** http://localhost:3000
- **Panel admin:** http://localhost:3000/admin/
  - Resultados con porcentajes
  - Listado de votantes con buscador y exportación a CSV (se abre en Excel, incluye `votante_id` y `voto_id` en orden cronológico)
  - Gestión de cafés (agregar, editar, activar/desactivar, eliminar si no tienen votos)
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
