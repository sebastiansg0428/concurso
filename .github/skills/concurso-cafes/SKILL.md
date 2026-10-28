---
name: concurso-cafes
description: Desarrolla y mantiene la aplicación de votación Concurso de Cafés. Úsala para cambios en Node.js, Express, la interfaz web, la API o MySQL, especialmente al añadir nombres en español o modificar esquemas y migraciones.
---

# Desarrollo de Concurso de Cafés

Aplica estas pautas al trabajar en este repositorio.

## Contexto del proyecto

- Aplicación de votación por QR para cafés, construida con Node.js, Express, JavaScript del navegador y MySQL/MariaDB.
- El servidor y las rutas están en `src/`; la interfaz está en `public/`; el esquema está en `database/`; los comandos operativos están en `scripts/`; las pruebas usan `node:test` en `test/`.
- `npm run init-db` inicializa una instalación nueva desde `database/schema.sql`. No actualiza el esquema de una base existente.
- `npm run migrate-security` ejecuta `scripts/migrate-security.js` con `database/security.sql`; es una migración específica, no un sistema general de migraciones.
- `npm run replace-participants` es destructivo para los datos de votación y requiere su opción de confirmación. No lo uses para actualizar el esquema ni como parte del arranque normal.

## Idioma y nombres

- Escribe en español los nombres nuevos de funciones, variables, módulos, tablas, columnas, índices, restricciones, scripts, comandos y documentación.
- Usa `camelCase` en JavaScript y `snake_case` en SQL. Elige nombres claros y coherentes con el dominio: `votantes`, `cafes`, `votos`, `correo`, `creado_en`.
- Mantén en inglés los nombres propios de tecnologías y protocolos, como Node.js, Express, MySQL, HTTP y API.
- Antes de renombrar algo existente, busca todos sus usos y determina si es un contrato compartido. Coordina los cambios de servidor, clientes, esquema, pruebas y documentación; añade compatibilidad o migración cuando corresponda.
- No cambies claves JSON, rutas, variables de entorno ni nombres de columnas ya desplegados como si fueran identificadores internos. Un cambio de contrato debe ser explícito y compatible.
- Conserva el estilo y las convenciones existentes en el código cercano. No traduzcas indiscriminadamente nombres de dependencias o identificadores que pertenecen a una interfaz externa.

## Cambios de base de datos

Antes de editar SQL:

1. Lee `database/schema.sql` y los scripts SQL relacionados.
2. Busca todos los consumidores de las tablas y columnas afectadas, incluidas consultas en `src/`, scripts y pruebas.
3. Determina si el cambio aplica a instalaciones nuevas, existentes o ambas. `CREATE TABLE IF NOT EXISTS` no transforma tablas existentes.

Para modificar una instalación existente:

- Proporciona un paso de migración explícito en `scripts/` y un comando de ejecución documentado en `package.json` cuando sea necesario.
- Diseña la migración para conservar los registros y relaciones. No elimines ni recrees tablas para cambiar nombres.
- Haz que la migración sea segura al repetirse o que detecte y comunique claramente los estados ya aplicados y parciales. No ocultes errores.
- No combines inicialización con migraciones ni ejecutes cambios destructivos automáticamente al arrancar la aplicación.
- Antes de cualquier operación que pueda borrar o transformar datos, exige una copia de seguridad y un entorno temporal representativo. No ejecutes una migración contra datos reales sin autorización explícita.
- Actualiza esquema nuevo, migración, consultas, pruebas y documentación de forma coordinada. Comprueba índices, claves foráneas, restricciones y valores existentes.

## Seguridad y configuración

- Lee nombres y valores requeridos de `.env.example`; nunca muestres, registres ni incluyas secretos de `.env`.
- Usa consultas parametrizadas para valores proporcionados por usuarios.
- Conserva las validaciones del servidor, los límites de intentos y los controles de sesión existentes al modificar autenticación o votación.
- No agregues credenciales ni valores sensibles a código, pruebas, documentación o salidas de comandos.

## Flujo de trabajo y verificación

1. Inspecciona los archivos y cambios existentes antes de editar. Limita el diff al objetivo solicitado y no sobrescribas trabajo ajeno.
2. Sigue las referencias hasta los consumidores afectados; no supongas que cambiar el esquema o un nombre local basta.
3. Añade o actualiza pruebas para el comportamiento y los contratos afectados.
4. Ejecuta las pruebas pertinentes; para cambios de lógica, el comando general del proyecto es `npm test`.
5. Para cambios SQL, valida la migración en una base de datos temporal con datos relacionados, verifica que preserve esos datos y que los flujos afectados sigan funcionando.
6. Informa qué cambió y qué verificaciones se ejecutaron. Indica con claridad cualquier validación que no pudo realizarse.
