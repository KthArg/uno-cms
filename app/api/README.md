Rutas HTTP mínimas (SPEC §3, §5.3).

`auth` (Auth.js), `health` (ping a Postgres), `content/[key]` (lectura pública con su
`Cache-Control`), `media/upload` (emite el token de subida directa, ADR-005), `media/local`
(el almacén en disco de ADR-700, solo fuera de producción) y `preview/contenido` (la única
ruta por la que salen borradores, y solo con `PREVIEW_ORIGINS` definida — ADR-701).

Cada ruta declara si es pública o exige sesión, **con un motivo escrito**, en
`tests/support/api-routes.ts`. Un test compara esa declaración con el código en los dos
sentidos: una ruta nueva sin declarar no pasa, y una que dice exigir sesión y no la comprueba
tampoco.
