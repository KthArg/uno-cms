# 19 — Lo que encontró la auditoría de seguridad de octubre

> Escrita **antes** del código. Los casos de la sección 5 son la definición de "hecho".
>
> No es una fase de producto: es lo que salió de leer el repositorio entero buscando por dónde se
> pueden escapar datos o saltarse una defensa, contra OWASP ASVS 5.0 nivel 2, el Top 10 de 2025
> y el de APIs de 2023. Cuatro revisiones en paralelo —autenticación, rutas y medios, actions y
> autorización, cabeceras y cadena de suministro— y **cada hallazgo comprobado después contra el
> código** antes de entrar aquí. Lo que no se pudo comprobar lo dice.

## 1. Qué se encontró, y qué no

Nada crítico ni alto. Lo que hay son defensas que **existen y no cubren todo lo que dicen
cubrir**, que es justo la clase de fallo que este repositorio persigue: en casi todos los casos
había un comentario o una fila de `docs/SECURITY.md` prometiendo lo que el código no hacía.

| #   | Hallazgo                                                                                                                                                                                | Severidad | Dónde                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------- |
| 1   | `/admin/login?next=` redirige a **cualquier URL** si ya hay sesión. La validación solo existía en la rama del formulario                                                                | media     | `app/admin/login/page.tsx`                               |
| 2   | El bloqueo de cuenta se lee antes de Argon2 y se escribe después: intentos **en paralelo** cuentan como uno, y una escritura vieja puede **levantar** un bloqueo recién puesto          | media     | `cms/auth/authenticate.ts`                               |
| 3   | El middleware reemite la cookie de sesión con el `maxAge` por defecto de Auth.js, **30 días**, en cada visita. SPEC §7.1 dice 7. Y no hay caducidad absoluta: usada a diario, no caduca | media     | `middleware.ts`                                          |
| 4   | La IP del limitador es la **primera** entrada de `X-Forwarded-For`, que es la que escribe el cliente. El comentario dice lo contrario                                                   | media     | `cms/auth/index.ts`, `app/setup`, `app/admin/invitacion` |
| 5   | El token de subida a Blob no lleva `maximumSizeInBytes`. Los 10 MB solo miran el tamaño **que declara el cliente**; con el token se sube lo que se quiera durante una hora              | media     | `app/api/media/upload/route.ts`                          |
| 6   | «Nuestro almacén» se comprueba por el sufijo `.public.blob.vercel-storage.com`, que comparten **todos** los clientes de Vercel. Lo mismo en `remotePatterns` del optimizador            | baja      | `media.actions.ts`, `next.config.ts`                     |
| 7   | Un editor puede borrar elementos de colección: la restricción a admin vive solo en la interfaz                                                                                          | baja      | `content.actions.ts` (`deleteItem`)                      |
| 8   | Una cuenta **bloqueada** responde sin gastar el señuelo: con un cronómetro se sabe si el correo existe                                                                                  | baja      | `cms/auth/authenticate.ts`                               |
| 9   | `changePassword` deja tantear la contraseña actual sin bloqueo: con una sesión robada, 240 intentos por hora y luego la cuenta es suya                                                  | baja      | `cms/actions/user.actions.ts`                            |
| 10  | `isSafeLink` acepta `/\evil.com`, que el navegador resuelve como externa                                                                                                                | baja      | `cms/links.ts`                                           |
| 11  | Un campo `image` acepta cualquier `url`: `javascript:`, `data:`, otro host. La API pública la sirve tal cual a las webs que la consumen                                                 | baja      | `cms/core/schema-gen.ts`                                 |
| 12  | `deleteMedia` no implementa `MEDIA_IN_USE`, que SPEC §5.3 exige, y no estaba en `PENDIENTES.md`: borrar una imagen publicada rompe la web sin aviso                                     | baja      | `cms/actions/media.actions.ts`                           |
| 13  | Las búsquedas en las allowlist usan `in` y `obj[clave]`: `constructor`, `__proto__` o `toString` las pasan. Un nodo `{type:'constructor'}` se guarda y se publica                       | baja      | `richtext.ts`, `content.actions.ts`, `collections.ts`    |
| 14  | `/api/content/:key` y `/api/settings` van a la base en cada petición que no sale de la CDN, y la CDN se salta con cualquier parámetro                                                   | baja      | las dos rutas                                            |
| 15  | `pnpm/action-setup` es de terceros, va por etiqueta, y `SECURITY.md` justifica no anclar diciendo que «las cuatro acciones son oficiales»                                               | baja      | `.github/workflows/ci.yml`                               |
| 16  | `AUTH_SECRET` no se valida en longitud; `APP_SECRET` sí                                                                                                                                 | info      | `cms/auth/index.ts`                                      |
| 17  | El tope de longitud de la contraseña no se aplica al entrar, aunque `passwords.ts` lo presenta como defensa de CPU                                                                      | info      | `cms/auth/authenticate.ts`                               |
| 18  | Un cuerpo que no es JSON en la ruta de subida da 500 y no el 400 uniforme que promete el comentario                                                                                     | info      | `app/api/media/upload/route.ts`                          |
| 19  | La CSP le llega a Next por un camino no documentado (la copia de las cabeceras de respuesta); la cabecera `x-nonce` que dice el comentario no la lee nadie                              | info      | `middleware.ts`                                          |
| 20  | Sin `Cross-Origin-Opener-Policy`; `.gitignore` versionaría un `.env.production`                                                                                                         | info      | `middleware.ts`, `.gitignore`                            |

## 2. Lo que se decidió antes de escribir código

| Pregunta                                                 | Respuesta                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Quién puede eliminar elementos de una colección?        | **Solo admin**, decidido por el dueño del producto. Igual que borrar imágenes: quita contenido publicado y sus revisiones sin deshacer. Enmienda SPEC §5.3 (ADR-1300)                                                                                                                                                |
| ¿Cómo se cierra la carrera del bloqueo?                  | **Reservando el intento antes de Argon2**, en una sola sentencia que suma uno y pone el bloqueo si toca, condicionada a que la cuenta no esté bloqueada. Un intento que no consigue reservar no llega a verificar. No hace falta transacción ni `FOR UPDATE`: la atomicidad la da el `UPDATE … RETURNING` (ADR-1301) |
| ¿De dónde sale la IP?                                    | En Vercel, de `x-real-ip`, que escribe la plataforma. Fuera, de la **última** entrada de `X-Forwarded-For`, que es la que añade el proxy de delante. Sin ninguna, `desconocida`. Expuesto directamente sin proxy no hay forma fiable, y se dice en `.env.example` (ADR-1302)                                         |
| ¿La caducidad absoluta echa a quien ya tenía sesión?     | **Sí, una vez.** Un token sin `authTime` es de antes del arreglo y no se puede saber cuándo se emitió; darle siete días más sería inventarse el dato. Es volver a entrar una vez                                                                                                                                     |
| ¿Cuál es «nuestro almacén»?                              | El que dice `BLOB_READ_WRITE_TOKEN`: el SDK construye el host con el tercer segmento del token (`chunk-*.js`, `https://${storeId}.public.blob…`), comprobado contra el host real de producción. Sin token no hay host remoto admitido                                                                                |
| ¿Qué es `MEDIA_IN_USE`?                                  | Una búsqueda JSONB del `mediaId` en `draft` y `published` de todas las entradas, en todos los idiomas, como dice SPEC §5.3. Las revisiones **no** cuentan: son historia, y bloquear por ellas impediría borrar nada nunca                                                                                            |
| ¿El `img-src` de la CSP también se acota al host propio? | **No.** La CSP se construye en el middleware, en edge, y leer allí `BLOB_READ_WRITE_TOKEN` arriesga que el empaquetador lo incruste en el código del middleware. Con `script-src` cerrado, una imagen de otro almacén no ejecuta nada. Se queda como está y se dice                                                  |

## 3. Fuera de alcance

- **Subir `next` a 15.5.27.** Los dos avisos moderados (GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p)
  exigen Pages Router o un catch-all con SSG, y aquí no hay ninguno de los dos. El PR de
  Dependabot que los cierra está en rojo por otros motivos; va a `PENDIENTES.md` con su issue.
- **`report-uri` en la CSP.** Exige un sitio donde recibir los informes, y eso es otra pieza.
- **Comprobar los bytes del fichero subido.** En producción se sirven desde el origen de Blob,
  no el nuestro, así que un políglota no ejecuta en nuestro origen. Se anota en `SECURITY.md`.
- **Límite de peticiones en la API pública.** Lo que la hace cara es la base de datos, y eso lo
  quita el caso 14. Un límite por IP encima sería por instancia (ADR-303).

## 4. Contratos

- `destinoInterno(next: unknown): string` en `cms/routes.ts` (isomórfico): devuelve `next` si es
  `/admin`, `/admin/…` o `/admin?…` sin caracteres de control; si no, `/admin`. Lo usan **las dos**
  ramas de la página de acceso. Lo que protege es el prefijo: una ruta que empieza por `/admin/`
  no puede cambiar de host, así que no hace falta mirar `//` ni `\` aparte (la mutación lo
  demostró: esas dos comprobaciones no mataban nada).
- `ipDelCliente(cabeceras, entorno?)` en `cms/security/ip.ts`: la única que lee
  `x-forwarded-for`.
- `reservarIntento(userId, now)` y `olvidarFallos(userId, now)` en `cms/auth/authenticate.ts`:
  los usan el login y `changePassword`.
- `SESSION_MAX_AGE_SECONDS` sale de `cms/sesion.ts`, que comparten el middleware y `cms/auth`.
- `hostDelAlmacen(token)` en `cms/nombres-de-subida.ts` (isomórfico, sin el token en la salida):
  lo usan `registrarImagen` y `next.config.ts`.
- `declarada(registro, clave)` en `cms/core/collections.ts`: la búsqueda en lo que declara
  `cms.config.ts` con `Object.hasOwn`. La usan `definicionDeColeccion` y `schemaForType`, y a
  través de ellas las actions.
- `getSettings(key)` en `cms/core/settings.ts`: `readSettings` por la caché de datos, con el tag
  que invalida `updateSettings`.
- `ActionErrorCode` gana `MEDIA_IN_USE`.

## 5. Casos

Cada uno, comprobado por mutación antes de darlo por hecho.

### Sesión y acceso

- **T-S-1** `destinoInterno` deja pasar `/admin/collections/x?y=1` y devuelve `/admin` para
  `https://ajeno.example`, `//ajeno.example`, `/\ajeno.example`, `/landing` y `undefined`. **Y** la
  página de acceso lo usa en las dos ramas: con sesión, `?next=https://ajeno.example` acaba en
  `/admin`.
- **T-S-2** `isSafeLink` rechaza `/\evil.com` y cualquier valor con `\`.
- **T-S-3** Veinte intentos fallidos **a la vez** contra la misma cuenta, desde IP distintas,
  dejan la cuenta bloqueada con `failed_logins` exactamente en el umbral: los que llegan con el
  bloqueo puesto no verifican ni cuentan.
- **T-S-4** Con la cuenta bloqueada, un intento gasta el señuelo igual que uno contra un correo
  que no existe (contando la llamada, como T-59-4).
- **T-S-5** Una contraseña de más de `MAX_PASSWORD_LENGTH` no llega a Argon2 con ese valor y
  responde el mismo fallo.
- **T-S-6** `changePassword` con la actual mal, `LOCKOUT_THRESHOLD` veces, bloquea la cuenta; con
  la cuenta bloqueada, la correcta tampoco cambia nada.
- **T-S-7** La cookie que reemite el middleware no vive más de siete días.
- **T-S-8** Un token con `authTime` de hace más de siete días, o sin `authTime`, deja de ser una
  sesión aunque `pwdV` siga siendo válido.
- **T-S-9** `ipDelCliente`: en Vercel, `x-real-ip`; fuera, la última entrada de
  `X-Forwarded-For`; sin cabeceras, `desconocida`. **Y** ningún fichero de `app/` ni `cms/` fuera
  de `cms/security/ip.ts` lee `x-forwarded-for`.
- **T-S-10** Con un `AUTH_SECRET` de menos de 32 caracteres no se inicia sesión ni sobrevive
  ninguna: falla cerrado, igual que `APP_SECRET`.

### Medios

- **T-S-11** El token de subida lleva `maximumSizeInBytes` igual a `TAMANO_MAXIMO_BYTES` y caduca
  en cinco minutos como mucho.
- **T-S-12** Un cuerpo que no es JSON, o `null`, en la ruta de subida responde 400.
- **T-S-13** `registrarImagen` rechaza una URL de **otro** almacén de Blob con la forma correcta,
  y acepta la del propio.
- **T-S-14** `remotePatterns` solo admite el host del almacén propio; sin token, ninguno.
- **T-S-15** `deleteMedia` de una imagen referenciada en el borrador o en lo publicado de
  cualquier entrada, en cualquier idioma, devuelve `MEDIA_IN_USE` sin tocar ni el fichero ni la
  fila. Sin referencias, borra.
- **T-S-16** Un campo `image` con `url` `javascript:`, `data:` o `http:` no se guarda.

### Contenido y autorización

- **T-S-17** Un editor que llama a `deleteItem` recibe `FORBIDDEN` y el elemento sigue ahí.
- **T-S-18** Un nodo o una marca de richtext llamados `constructor`, `__proto__` o `toString` se
  descartan al sanear y no pasan el esquema.
- **T-S-19** `createItem` y `reorderItems` con la colección `__proto__` o `constructor` responden
  `NOT_FOUND` sin auditar ni avisar a nadie.

### API pública y cadena de suministro

- **T-S-20** `/api/content/:key` y `/api/settings` leen por la caché de datos con tag, la que
  invalida publicar, y no directamente de la base.
- **T-S-21** Toda acción de terceros en `.github/workflows` va anclada por SHA, y todo
  `actions/checkout` lleva `persist-credentials: false`.
- **T-S-22** `Cross-Origin-Opener-Policy: same-origin` en todas las clases de ruta.
- **T-S-23** `.env.production` y `.env.development` quedan fuera de git; `.env.example` no.
