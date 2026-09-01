# Progreso

Un apartado por hito. Se cierra al terminarlo, con tres respuestas: **qué funciona**, **qué
es frágil** y **qué habría que probar a mano**. Sin maquillar: el valor de este documento
depende por completo de que la columna de lo frágil sea creíble.

Lo frágil que además hay que **arreglar** vive en [`PENDIENTES.md`](PENDIENTES.md), con su
issue. Aquí se cuenta cómo quedó cada hito; allí, qué falta por hacer y dónde está anotado.

---

## M0 — Fundaciones e infraestructura ✅

**Cerrado.** 9 issues, 9 PR, todos con auto-revisión escrita y correcciones antes de
mergear. Repositorio: [KthArg/uno-cms](https://github.com/KthArg/uno-cms).

### Qué funciona

| Área                      | Estado                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold                  | Next 15.5.23 + React 19 + TS 5.9 estricto (`strict` + `noUncheckedIndexedAccess`) + Tailwind 4. `pnpm dev`, `build` y `typecheck` limpios                                           |
| Estructura                | El árbol completo de SPEC §3, con un README por directorio que dice qué hito lo llena                                                                                               |
| Frontera servidor/cliente | Dos capas: test estático sobre las cabeceras de `cms/{core,db,auth,security}` y el error de compilación de `server-only`. **Ambas verificadas**, la segunda con una fuga deliberada |
| Calidad                   | ESLint 9 flat config con reglas propias de SPEC §7.1 (`dangerouslySetInnerHTML` prohibido sin excepciones, `sql.raw` prohibido), Prettier, Husky, lint-staged                       |
| Tests                     | Vitest con proyectos `unit` (36 tests, incluye tipos) e `integration` (contra Postgres real); Playwright e2e contra el build de producción                                          |
| CI                        | 8 jobs, check agregador `ci`. Demostrado en rojo y en verde con enlaces                                                                                                             |
| Protección de `main`      | PR obligatorio, `ci` obligatorio, conversación resuelta, sin force-push, `enforce_admins: true`. Versionada en `.github/branch-protection.json`                                     |
| Dependencias              | `pnpm audit --audit-level=high` bloqueante y limpio; Dependabot semanal agrupado                                                                                                    |
| Documentación             | Spec de fase, los ADR de la serie 1xx, `.env.example`, esqueletos de SETUP / DEVELOPER / SECURITY                                                                                   |

Casos de prueba del spec de fase: **todos verdes**. T-06-4 se pospuso de #6 a #3 y se cerró
allí; ningún caso quedó dado por bueno estando en rojo.

### Qué es frágil

1. **Nadie ha revisado este código más que quien lo escribió.** Es ADR-104 y no es una
   formalidad: de los 9 PR, 8 tuvieron hallazgos en la auto-revisión, y dos de esos
   hallazgos eran errores de criterio míos que un segundo par de ojos habría visto antes
   (el `enforce_admins: false` de ADR-105, la allowlist de `RichText`). Los que no vi, no
   los sé.
2. ~~**`pnpm/action-setup@v4` está anclada a Node 20 y GitHub ya lo marca deprecado.**~~
   **Cerrado** en el PR #36: `pnpm/action-setup` sube a v6, cuyas notas dicen "Updated the
   action to use Node.js 24", y la anotación de deprecación ya no aparece en las
   ejecuciones. Se deja tachado y no borrado, porque el valor de esta lista está en poder
   contrastar lo que se dijo con lo que pasó.
3. **Los `overrides` de `postcss` y `sharp`** fuerzan versiones que Next 15.5 no eligió,
   para cerrar tres advisories `high`. Build y tests pasan, pero es una combinación que el
   equipo de Next no prueba.
4. **La capa estática de la frontera mira cabeceras, no el grafo de imports.** La que de
   verdad para una fuga es la build, y solo actúa cuando el código llega al cliente.
   `cms/preview` es isomorfo y no tiene barrera propia: nada impide hoy importar `cms/db`
   desde ahí.
5. **`branch-protection.json` no se aplica solo.** Un cambio desde la interfaz web dejaría
   el fichero desincronizado sin aviso. No se automatiza a propósito: comprobarlo exigiría
   un token de admin como secreto de CI, y el vigilante se convertiría en llave.
6. **Un admin puede desactivar la protección, actuar y reactivarla.** Yo mismo lo hice una
   vez, para borrar el commit basura que dejó el primer T-08-1 fallido. No es hipotético.
7. **La caché de navegadores de Playwright no tiene acierto verificado.** Todas las
   ejecuciones hasta ahora han sido con la clave recién creada.
8. **Un pipeline verde no significa que un cambio sea correcto**, y hay demostración. El
   primer lote de Dependabot abrió un PR proponiendo subir `eslint-config-next` a la serie
   16 con `next` fijado en la 15 por ADR-100. **El PR estaba en verde**: `ci` no puede
   detectar esa desalineación, porque el config de la 16 lintaría igual el código de la 15
   hasta el día que dejara de hacerlo. Corregido en el issue #34, pero la lección se queda:
   las barreras de M0 atrapan errores mecánicos, no errores de criterio.

### Qué probaría a mano

- Clonar el repositorio en una máquina limpia (Linux, sin cachés) y ejecutar la secuencia
  de `docs/SETUP.md` de principio a fin. Todo lo de M0 se ha verificado en Windows y en los
  runners de CI, que no son un tercer entorno independiente.
- Abrir un PR **desde la interfaz web** para comprobar T-08-3, el único caso de M0 que
  quedó sin verificar: que la plantilla prerrellena de verdad.
- Intentar mergear un PR con `ci` en rojo desde la interfaz, para ver el bloqueo con los
  ojos y no por el `mergeStateStatus` de la API.
- Revisar el primer lote de PR de Dependabot cuando llegue, y comprobar que el agrupado
  produce dos o tres y no quince.

### Decisiones que dejaron rastro

- **Issue [#19](https://github.com/KthArg/uno-cms/issues/19)** (`spec-question`, abierto):
  `SPEC.md` §6.3, §7.1 y §6.1 son incompatibles entre sí en lo que respecta a `RichText`.
  Resuelto por ADR-107 —renderizar el richtext como elementos de React, nunca como cadena
  de HTML— y **pendiente de verificar en M5**.
- **ADR-105 se reescribió** después de que su caso de prueba lo tumbara.
- **El orden de la fase se corrigió** a mitad: #5 pasó delante de #4, porque las reglas de
  ESLint necesitaban un runner para probarse en vez de verificarse a ojo.
- **`rehype-sanitize` no se instalará**, por consecuencia de ADR-107. Es la única
  desviación del stack de `SPEC.md` §2 hasta ahora.

---

## M1 — Núcleo de datos y configuración ✅

**Cerrado.** 6 issues de fase más 2 de corrección (#46, #48), 8 PR.

### Qué funciona

| Área                       | Estado                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato del desarrollador | `defineConfig` y los 8 tipos de campo de SPEC §5.1; el ejemplo de la spec se acepta literal                                           |
| Inferencia                 | `Content<K>` distingue requeridos de opcionales; `select` infiere su unión literal; una clave inexistente es **error de compilación** |
| Validación                 | Dos esquemas Zod por objeto (laxo y estricto) con la regla de presencia de ADR-202                                                    |
| Seguridad de contenido     | Allowlist de protocolos de enlace resistente a ofuscación; allowlist de nodos, marcas **y atributos** de richtext, en profundidad     |
| Base de datos              | Las 6 tablas de SPEC §4 con índices, claves foráneas y restricciones `CHECK`; migraciones commiteadas                                 |
| Cliente                    | Driver dual (ADR-200) con el mismo tipo de Drizzle hacia arriba                                                                       |
| Harness de integración     | Migraciones automáticas y limpieza entre tests, verificados por mutación. **Salda la deuda que M0 dejó anotada**                      |
| Seed                       | Idempotente y no destructivo, verificado por mutación                                                                                 |

130 tests unitarios y 19 de integración contra Postgres 16 real, en local y en CI.

### Qué es frágil

1. **La rama Neon del cliente no la ejecuta ningún test** (ADR-200, issue #43, abierto a
   propósito). Los tests ejercitan esquema, consultas y migraciones; el driver de
   producción, no. Lo único que hoy protege de una divergencia entre ramas es `typecheck`.
   Se cubre en el despliegue de verificación de M6.
2. **Las migraciones se han probado contra Postgres 16 estándar, no contra Neon.** Deberían
   ser equivalentes; "deberían" es la palabra.
3. **La coherencia entre el `enum` de TypeScript y el `CHECK` de Postgres depende de un
   test**, no de la construcción (ADR-203). Si alguien borra ese test, la divergencia vuelve
   a ser silenciosa.
4. **`Presence<O>` se apoya en `const` type parameters.** Si alguien llama a `s.text(opciones)`
   con una variable en vez de un literal, la inferencia de `required` se pierde y el campo se
   vuelve opcional **en silencio**. No conozco forma de detectarlo desde el tipo.
5. **La allowlist de richtext usa los nombres de nodo de Tiptap.** Si el editor de M4 se
   configura con otro esquema de ProseMirror, no coincidirán. Falla en la dirección segura
   —rechaza en vez de aceptar mal— pero fallará.
6. **La salvaguarda que impide vaciar la base equivocada es una heurística sobre un nombre**,
   y ya ha dado un falso positivo. Mejor que nada, no una garantía.
7. **`closeDatabase` accede a `$client`, interno de Drizzle.** Ahora lanza si desaparece en
   vez de tragárselo, pero sigue dependiendo de un detalle privado.
8. **La limpieza entre tests es un `TRUNCATE` completo.** Milisegundos con 19 tests; con
   cien habrá que medir si conviene una transacción con rollback por test.

### Qué probaría a mano

- Desplegar contra un Neon real y comprobar que la rama del driver HTTP funciona. Es lo
  único que cierra el issue #43 y no hay test que lo sustituya.
- Editar `cms.config.ts` añadiendo un campo y comprobar que **no** hace falta migración
  (es la promesa de ADR-003 y nadie la ha ejercitado todavía).
- Ejecutar el seed dos veces sobre una base con contenido real, no de test.

### Decisiones que dejaron rastro

- **Issue #48**: ADR-003 prometía que la base de datos garantiza los estados y el esquema de
  §4 no lo hacía —el `enum` de Drizzle es solo de TypeScript—. Resuelto con `CHECK`
  (ADR-203). Lo descubrió un test al fallar, no una lectura del código.
- **Issue #43** (abierto): el driver HTTP de Neon de ADR-002 no puede hablar con el Postgres
  efímero de §11.4. Resuelto con selección de driver por destino (ADR-200).
- **Issue #46**: la exención `// isomorphic:` de la frontera se comprobaba una vez y luego
  era permanente. Ahora un test exige que el fichero exento no emita JavaScript.
- **Tres protecciones resultaron no estar ejercitadas** por ningún test hasta que las
  comprobé por mutación: el filtro de caracteres de control de los enlaces, la limpieza
  entre tests y el tipado de `titleField`. Las tres pasaron a estarlo.

## M2 — Autenticación y seguridad base ✅

**Cerrado.** 8 issues de fase, 8 PR. 256 tests unitarios, 54 de integración y 14 e2e.

### Qué funciona

| Área            | Estado                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens firmados | HMAC-SHA256 con el **propósito dentro de la firma**; comparación en tiempo constante; expiración comprobada después de la firma              |
| Contraseñas     | Argon2id con parámetros de OWASP; hash señuelo contra enumeración; política de 12 caracteres con lista de comunes embebida                   |
| Rate limit      | 5 por 15 min por IP+correo, con la degradación anunciada al arrancar. Un acierto **no** consume cuota                                        |
| Auditoría       | IP truncada al /24 y /64, limpieza de secretos en profundidad, retención de 90 días. **Nunca tumba la operación**                            |
| Autenticación   | Lockout exponencial con tope de 24 h; un intento durante el bloqueo no lo alarga; sesión invalidada al cambiar contraseña o borrar la cuenta |
| Middleware      | Cabeceras de §7.2, CSP con nonce por petición, guard de `/admin`, comprobación de origen                                                     |
| Bootstrap       | Un solo uso, transaccional, con límite de intentos y sin oráculo de token                                                                    |

### La tabla de amenazas de §7.1

| Amenaza                     | Estado                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Fuerza bruta en login       | ✅ Lockout persistente + rate limit + Argon2id                                       |
| XSS vía contenido           | ✅ Cerrada en M1                                                                     |
| CSRF                        | ✅ Comprobación de origen en el middleware, sobre lo que ya hacen las Server Actions |
| Clickjacking                | ✅ `frame-ancestors 'self'`, verificado sobre la respuesta real                      |
| Inyección SQL               | ✅ Regla de lint (M0) + Drizzle (M1)                                                 |
| **Escalada de privilegios** | ⚠️ Abierta en M2; **cerrada en M3** con el envoltorio de actions y T-75-6            |
| Robo de sesión              | ✅ Cookies, claim `pwdV`, cuenta borrada = sesión inválida                           |
| **Abuso de uploads**        | ⚠️ **Abierta.** No hay uploads todavía; M4                                           |
| Enumeración                 | ✅ Mismo resultado y mismo coste temporal en login, tokens y bootstrap               |
| Secretos en cliente         | ✅ Frontera `server-only` (M0/M1)                                                    |
| Dependencias                | ✅ `pnpm audit` bloqueante                                                           |

Dos filas abiertas **con dueño**, tal como declara el spec de fase. Una fila abierta con
dueño vale más que una cerrada de forma optimista.

### Qué es frágil

1. **`next-auth` es una beta** en el camino de la autenticación. Lo fija SPEC §2, así que no
   es una decisión de este proyecto, pero es una beta.
2. **La landing ya no cumple SPEC §8.** El guard de bootstrap la obliga a ser dinámica, y
   sin `force-dynamic` **el build falla sin base de datos**. Issue #71, con evidencia.
3. **Los dos guards de `/admin` pueden divergir** (#70). El caso que no se nota: una ruta
   privada creada fuera del grupo `(panel)` queda sin la comprobación de `pwdV` y funciona
   perfectamente mientras protege menos de lo que parece.
4. **`trustHost: true`.** Con mitigaciones y con `AUTH_URL` documentado, pero es confianza en
   una cabecera. Apareció como error en los logs del e2e **sin tumbar ningún test**.
5. **El rate limit es por instancia** (ADR-303, #65). El lockout, que sí es global, es lo que
   sostiene el caso.
6. **Ninguna comparación en tiempo constante está demostrada**, solo defendida de que alguien
   la elimine, con tests que leen el fuente. La propiedad no es observable.
7. **Los parámetros de Argon2id no se han medido en Vercel**, y `@node-rs/argon2` es un
   módulo nativo cuyo funcionamiento en ese runtime sigue siendo una suposición.
8. **El proveedor de credenciales de Auth.js no lo ejercita ningún test.** Sí todo lo que
   hay debajo; la cadena completa se prueba de verdad en M4.

### Qué probaría a mano

- El flujo entero en un despliegue real: `/setup` → crear administrador → entrar → `/admin`.
  Es lo único que ejercita el proveedor de credenciales y las cookies de verdad.
- Cambiar la contraseña con dos navegadores abiertos y comprobar que el segundo cae.
- Bloquear una cuenta a propósito y comprobar el mensaje que ve el editor.

### Lo que enseñó este hito

**Cuatro protecciones resultaron no estar ejercitadas por ningún test**, y las cuatro se
descubrieron por mutación, no leyendo:

- El filtro de caracteres de control de los enlaces (M1).
- El señuelo de tiempo del login: el umbral laxo que copié del test unitario dejaba pasar la
  mutación, porque el camino del correo inexistente ya hace una consulta a la base de datos.
- La poda del rate limit: comprobaba que una clave volviera a permitirse, y eso pasa igual
  sin poda.
- La comparación en tiempo constante, dos veces — y esa no se puede arreglar, solo proteger.

Y dos veces el **build** cazó lo que los tests no: el `const enum` de Argon2 y el prerender
de la landing.

## M3 — API de contenido (server actions) ✅

Nueve issues, nueve PR, todos con autorrevisión. Es el hito donde el CMS pasa de tener piezas
a tener una API.

### Qué funciona

| Área              | Estado                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envoltorio        | `defineAction` impone el pipeline de §5.3: sesión → rol → límite → Zod → lógica → auditoría. **Toda** action pasa por él, y hay un test que falla si aparece una suelta |
| Contrato          | Diez códigos de error con mensaje en español llano; los diez ejercitados por al menos un test, comprobado automáticamente                                               |
| Lectura           | `getContent`, `getCollection`, `getDraft`, con `unstable_cache` + `cache()` de React y el tag `content:<key>`                                                           |
| Contenido         | `saveDraft` con bloqueo optimista, `publish`/`publishAll` con revisiones y poda a 20, `revertDraft`, `restoreRevision`                                                  |
| Colecciones       | `createItem`, `deleteItem` (con sus revisiones), `reorderItems`                                                                                                         |
| Usuarios          | `inviteUser`, `updateUserRole`, `deactivateUser`, `changePassword`, con `LAST_ADMIN` serializado por `FOR UPDATE`                                                       |
| Ajustes y preview | `updateSettings`, `createPreviewToken`, `GET /api/content/:key`                                                                                                         |
| Cobertura         | **`COVERAGE_ENFORCE=1` activo**: 93 % global, por encima del 80 % que exige §11.4 en `cms/core` y `cms/security`                                                        |

469 tests automáticos (281 unitarios, 188 de integración contra Postgres real) y 24 e2e.

### La tabla de amenazas de §7.1, actualizada

| Amenaza                     | Estado                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Escalada de privilegios** | ✅ **Cerrada.** Rol comprobado en el servidor y desde la sesión en cada action, con el test T-75-6 que impide reabrirla |
| **Abuso de uploads**        | ⚠️ **Abierta.** Sigue sin haber uploads; M4                                                                             |

El resto siguen como las dejó M2. La fila de escalada se cierra con dos garantías, no con una:
el envoltorio comprueba el rol desde la sesión —nunca desde el input, y hay un test que lo
ataca desde el payload— y **T-75-6 recorre `cms/actions/` y falla si alguna función exportada
no pasa por el envoltorio**. Sin lo segundo, la fila se cerraría hoy y se reabriría sola con la
primera action de M4 sin que nadie lo notara.

Ese test ya ha hecho su trabajo una vez: rechazó `readSettings` en el PR #97, que estaba puesta
junto a las actions sin ser una. Leer no es mutar, y se movió a `cms/core`.

### Qué es frágil

- **`publishAll` corre en secuencia y tiene un tope de 100 entradas por llamada.** Está
  reportado en `remaining`, no truncado en silencio, pero un sitio con muchas colecciones
  necesitará varias pasadas. El tope existe porque el bucle vive dentro de una Server Action y
  en serverless hay un límite de duración; lo que se pierde al agotarlo no es la publicación
  —lo escrito está confirmado— sino el informe.
- **La invalidación de caché no está verificada de extremo a extremo.** Se comprueba que
  `publish` llama a `revalidateTag` con el tag correcto, pero que la landing cambie de verdad al
  publicar necesita un servidor: llega en e2e, en M5 (ADR-405).
- **Dos creaciones simultáneas en la misma colección pueden empatar en `sortOrder`.** Está dicho
  en el código con todas las letras, incluido por qué el `FOR UPDATE` que probé **no lo
  arregla**: bloquea filas existentes y no protege de una fila que otra transacción inserta. El
  orden resultante sigue siendo determinista y el editor lo arregla arrastrando.
- **El token de invitación no se puede canjear todavía.** `inviteUser` funciona y entrega un
  token de 24 h, pero no hay ninguna ruta que lo consuma, así que hoy una invitación crea una
  cuenta a la que nadie puede entrar. Issue #95, M4.
- **Los ajustes no los lee nadie aún.** `readSettings` y el tag `settings` existen y están
  probados; el layout que los use llega en M5.
- **Las cuotas siguen siendo por instancia**, como todo el rate limit desde M2 (issue #65).

### Qué probaría a mano

1. Guardar un borrador desde dos pestañas con la misma versión y ver que la segunda avisa del
   conflicto en vez de pisar.
2. Publicar una sección con un campo requerido vacío y leer el mensaje: tiene que decir "Falta
   Título principal en Portada", no una clave técnica.
3. Publicar 25 veces la misma sección y contar las revisiones: 20.
4. Degradar a un administrador desde otra cuenta y comprobar que **al recargar ya no entra** en
   el panel, no siete días después.
5. Pedir `GET /api/content/hero` sin sesión y confirmar que no aparece nada del borrador.
6. Pegar un párrafo copiado de una web en un campo de texto rico y ver que se guarda sin el
   formato raro, en vez de fallar el autosave en silencio.

### Lo que enseñó este hito

**Los tests de concurrencia con `Promise.all` no prueban concurrencia.** Es el hallazgo más útil
de M3 y salió de una mutación que sobrevivía. Dos actions lanzadas a la vez no se entrelazan: la
primera reutiliza la conexión libre del pool y la segunda tiene que abrir una nueva —saludo TCP
y autenticación—, así que la primera termina su transacción entera antes de que la segunda
consulte. Lo confirmé midiendo con `pg_sleep`: las transacciones sí se entrelazan cuando una
tarda; lo que serializa es la latencia de conexión.

El patrón que sí funciona es abrir una transacción a mano, tomar el bloqueo, arrancar la action,
**esperar**, y solo entonces soltar. Está usado en `publish`, en `LAST_ADMIN` y en colecciones.
Tres tests que parecían cubrir carreras y no cubrían nada.

**Dos comentarios prometían lo que el código no hacía.** En `createItem`, que la transacción
evitaba un empate que no evitaba; en `ogImageUrl`, que el destino se validaba con `isSafeLink`
cuando no se validaba con nada. Los dos tienen la misma forma —un razonamiento correcto escrito
junto a una implementación que no lo cumple— y los dos pasan una lectura normal, porque el
comentario convence. Lo que los detectó fue preguntar por cada afirmación si la cumple el código
de al lado.

**La spec se contradijo tres veces, y las tres se resolvieron por escrito** (#86, #89, #94): la
lectura pública aplicando el esquema estricto a valores vacíos, los singletons sin nombre visible
para un mensaje que exige nombrarlos, y `deactivateUser` sin columna donde apoyarse. Ninguna se
resolvió en silencio.

## M4 — Panel de administración ✅

Cerrado. El CMS ya se puede usar: se entra, se escribe, se publica y se puede volver atrás,
todo desde el navegador y sin tocar la base de datos.

### Qué funciona

- **El armazón y el panel de inicio**, con el estado de cada sección —publicado, con cambios,
  sin publicar— y «Publicar todo», que dice qué se quedó fuera en vez de callarse.
- **El formulario se genera desde `cms.config.ts`**, no se escribe a mano. Añadir un campo a la
  configuración lo hace aparecer en el panel sin tocar ningún componente, que es la promesa de
  §5.1 y lo que hace que este CMS sea adaptable a otro proyecto.
- **Autosave** con la versión que devuelve el servidor, sin reintentos ante un conflicto, y un
  borrador local que se **ofrece** al volver en vez de aplicarse solo.
- **Imágenes**: subida directa al almacenamiento con token emitido por el servidor (ADR-005),
  allowlist de tipos, tamaño máximo, nombre generado y `alt` obligatorio.
- **Colecciones**: listar, crear, ordenar con botones —no arrastrando, porque arrastrar no
  funciona con teclado— y eliminar con confirmación que dice qué se pierde.
- **Historial** con un fragmento del contenido de cada versión, y «volver a esta versión» que
  deja el texto en el borrador sin publicar nada.
- **Personas, ajustes y tu cuenta**, y la ruta pública que **canjea la invitación** (ADR-412),
  que es lo que hacía falta para que `inviteUser` sirviera de algo: hasta este hito creaba
  cuentas a las que no podía entrar nadie.

### La tabla de amenazas de §7.1, actualizada

| Amenaza                     | Estado                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Abuso de uploads**        | ✅ **Cerrada.** Allowlist de tipos, tamaño máximo, nombre generado y **SVG rechazado**, todo decidido en el servidor al emitir el token     |
| **Enumeración**             | ✅ Ampliada con el canje de la invitación: enlace inválido, caducado, ya usado o de cuenta desactivada dan el mismo 404                     |
| **Escalada de privilegios** | ✅ Ampliada: además del rol en cada action, el rol se comprueba **en cada página** de administración, con un test que enumera las pantallas |

**Sin ADR sobre el SVG**, y merece explicación porque la definición de hecho de la fase lo pedía:
`SPEC.md` §5.3 ya lo decide con todas las letras —"SVG se rechaza en MVP (vector XSS)"—, así que
un ADR solo repetiría la spec y se leería como si hubiera habido algo que decidir. La línea de la
spec de fase que lo pedía está corregida.

Lo que cierra la fila de uploads no es la lista de tipos: es **dónde se aplica**. El `accept` del
formulario viaja en el cliente y es comodidad para quien sube, no una defensa. La decisión se toma
en el servidor al emitir el token, y hay test de que un tipo fuera de la lista se rechaza aunque
el formulario lo hubiera aceptado.

### Qué es frágil

- **Los tests de tiempo.** `T-59-4` medía con cronómetro algo estructural y falló en CI en un PR
  que no tocaba autenticación (#131). El instrumento era el equivocado, no el umbral. Quedan dos
  comprobaciones por tiempo en la suite, las dos con umbrales que no dependen del disco.
- **El estado compartido en los e2e.** Un CMS acoplado 1:1 a una landing es **un solo sitio**: no
  hay forma de darle a cada test su propio `hero`. La regla que funciona es crear el estado que se
  necesita, y cuando no se puede aislar, crear uno propio. Ha hecho falta tres veces (#105, #134).
- **La suite e2e corre en paralelo en local y con un solo worker en CI.** La ejecución local es la
  exigente. Si falla en local y pasa en CI, el sospechoso es el estado compartido.
- **El tamaño de las imágenes se guarda como 0**: el callback de subida completada no lo trae.
- **La condición de concurrencia del canje** no tiene test que la ejercite a solas; sí lo tiene el
  contrato que promete hacia fuera.

### Qué probaría a mano

1. **Invitar a alguien y canjear el enlace desde otro navegador.** Es el recorrido con más piezas
   ajenas: token firmado, cuenta sin contraseña utilizable, sesión nueva. El e2e lo cubre, pero
   quiero ver el texto que lee una persona que no ha visto nunca este panel.
2. **Escribir con el editor de texto enriquecido durante un rato largo**, con negritas, enlaces y
   listas. jsdom no maqueta, así que los tests de componentes no pueden comprobar dónde queda el
   cursor; el e2e cubre un caso y no la experiencia de escribir diez minutos.
3. **Subir una imagen de verdad a Vercel Blob.** En CI no hay token, así que el camino que se
   ejercita es el de la validación, no el de la subida completa.
4. **Cambiar la contraseña con dos pestañas abiertas.** Que la otra pestaña se caiga es lo
   correcto (ADR-301) y quiero ver qué se encuentra quien la tenía delante.

### Lo que enseñó este hito

- **Un comentario que promete lo que el código no hace es peor que no tener comentario.** Pasó
  cuatro veces: una transacción que no envolvía nada, un enlace que no se validaba, un `switch`
  que creía ser exhaustivo y una fila con identificador inventado que decía no ofrecer acciones.
  Las cuatro con `typecheck`, `lint` y `build` en verde. La única defensa que ha funcionado es
  leer el código de al lado **antes** de escribir la frase.
- **Un test que no puede fallar es peor que no tener test.** También cuatro veces: un `if` que
  envolvía la aserción, un umbral tan laxo que sobrevivía a la mutación, una comprobación de que
  no aparece un texto que nunca podría aparecer, y un caso que solo pasaba con la base recién
  creada. La mutación los encuentra todos y cuesta minutos.
- **Y una explicación plausible no es una explicación.** El flake de #134 tenía un culpable que
  encajaba con todo lo que sabía; escribí el arreglo y **el fallo siguió**. La captura del fallo
  decía otra cosa. Mirar la evidencia antes que la hipótesis habría ahorrado el rodeo entero.

## M5 — Landing de ejemplo y vista previa en vivo ✅

Cerrado. **Este es el hito que justifica el proyecto**: lo construido hasta M4 se parecía, visto
desde fuera, a cualquier otro CMS. Escribir y ver la web cambiar al lado, no.

### Qué funciona

- **La landing de ejemplo**, con `useContent` y `useCollection` leyendo del contexto. La promesa
  de §6.3 —adaptar el CMS es escribir `cms.config.ts`, las secciones y componer `page.tsx`— se
  cumple: escribir la landing entera **no exigió tocar nada de `cms/`**.
- **`<RichText>`**, que emite elementos de React y nunca una cadena de HTML. Con él queda
  verificado ADR-107, que llevaba desde M0 escrito y sin ejercitar.
- **`/preview`** con token firmado, que carga el borrador de la clave autorizada y lo publicado
  del resto (ADR-501).
- **La vista previa en vivo**: escribir en el formulario cambia el iframe sin recargar, sin
  publicar y sin que haya llegado a guardarse.

### La tabla de amenazas de §7.1, actualizada

| Amenaza               | Estado                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **XSS vía contenido** | ✅ **Cerrada del todo.** El render no sanea una cadena: no hay cadena. Y los enlaces se validan también al pintarlos, con la misma función que al guardar (ADR-500) |
| **Clickjacking**      | ✅ Ampliada: `frame-ancestors 'self'` cubre también el iframe de la vista previa, con test sobre la cabecera servida                                                |
| **Enumeración**       | ✅ Ampliada: un enlace de vista previa inválido, caducado o de otro propósito da el mismo 404                                                                       |

Y una fila nueva que no estaba en §7.1 porque la spec no la previó: **el canal entre ventanas**.
Cada mensaje pasa tres comprobaciones —quién habla, si lo que dice tiene sentido, y si habla de
lo que ese iframe puede enseñar— y lo que no pasa se ignora en silencio.

### Qué es frágil

- **Los tests de un canal asíncrono son fáciles de escribir mal.** Los quince que cubren los
  mensajes hostiles pasaban con las cuatro defensas quitadas: `waitFor` acierta en su primera
  comprobación, antes de que React repinte. Se arreglaron con `act`, y la lección se generaliza:
  **un test que afirma que algo NO pasó tiene que forzar antes el momento en que habría pasado.**
- **El «schema laxo» de §6.1 no está replicado en el navegador**, y está razonado: llevarlo allí
  movería la frontera de `server-only` entera. Lo que se pierde es cazar nuestros propios
  errores —un campo mal escrito llega y se ignora en silencio—, no una vía de ataque.
- **La landing es dinámica y §8 pide ISR** (ADR-502). Se midió: 6,8 ms contra 3,6 ms de mediana,
  sobre un presupuesto de LCP de 2500 ms. Lo que compra la versión estática es que `pnpm build`
  exija una base de datos accesible, y §0 exige auto-hospedable.
- **La condición de concurrencia del canje de invitación** sigue sin test propio (viene de M4).

### Qué probaría a mano

1. **Escribir un rato largo con la vista previa abierta**, en una landing de verdad. El e2e
   comprueba que un cambio llega; no comprueba que la experiencia de escribir con un iframe
   repintándose al lado sea agradable.
2. **Abrir la vista previa en un móvil.** El iframe tiene una altura fija y la vista partida se
   esconde por debajo de `lg`. Funciona, pero no lo he mirado con las manos.
3. **Un documento de texto enriquecido largo**, con enlaces, listas anidadas y citas, para ver
   si el renderizador se deja algo que el editor sí muestra.

### Lo que enseñó este hito

- **Espiar una llamada no es comprobar un efecto.** Desde M3 estaba «comprobado» que `publish`
  llama a `revalidateTag` con el tag correcto. Al mirar por primera vez **la landing servida**
  apareció que publicar el cambio de un elemento de colección invalidaba `content:coleccion.id`
  mientras la landing leía `content:coleccion`: **la web no cambiaba y no había ningún error**.
  Dos hitos con ese fallo dentro y el test en verde.
- **Una explicación que encaja no es una explicación.** Ya pasó con el flake de #134; volvió a
  pasar al medir el build sin base de datos, que «pasó» por una caché de `.next` de la ejecución
  anterior. Borrar y repetir cambió la conclusión entera.
- **El instrumento tiene que poder equivocarse.** Las mutaciones han encontrado en este hito
  cuatro tests que no probaban nada, un fallo de invalidación de dos hitos de antigüedad y un
  efecto duplicado que la lectura no vio.

## M6 — Endurecimiento, rendimiento y release ✅

Cerrado. Es el único hito cuyo trabajo consistió sobre todo en **comprobar lo que ya estaba**, y
eso tiene un riesgo propio: sin un criterio escrito de antemano, "endurecer" se convierte en
tocar cosas hasta que parezcan más seguras. Por eso su documento de fase fijó, para cada
presupuesto, qué herramienta, contra qué contenido y con qué umbral.

### Qué funciona

- **Los presupuestos de §8, medidos y bloqueantes.** Lighthouse en perfil móvil contra la
  landing con contenido de ejemplo, y el peso del JavaScript comprimido, con dos números.
- **El modelo de amenazas cerrado**, fila por fila, con el test que sostiene cada una — y un
  test que comprueba que esas citas existen.
- **Las cabeceras verificadas sobre todas las clases de ruta**: landing, panel con sesión, vista
  previa, API pública, subida de imágenes y `/setup`.
- **`sitemap.ts`** que deja fuera lo que el middleware marca como no indexable, con la misma
  lista.
- **Publicar todo encadena sus vueltas** sin depender de que la petición aguante (ADR-600).
- **La documentación completa**: la guía de despliegue para quien no programa y la del
  desarrollador con los tres pasos para montar el CMS sobre otra landing.

### Los seis criterios de `SPEC.md` §11

| #   | Criterio                                                       | Estado                                                                                               |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Deploy limpio → landing pública y admin protegido              | ⚠️ **No verificado.** Ver abajo                                                                      |
| 2   | Un no técnico edita, ve la preview, publica y revierte         | ✅ e2e del recorrido completo (T-F-2) y de la vista previa en vivo (T-J-1)                           |
| 3   | Toda mutación rechaza sin sesión y con rol insuficiente        | ✅ El envoltorio, con T-75-6 impidiendo que alguna se lo salte, y T-E-4 para las pantallas           |
| 4   | Suite verde en CI, cobertura ≥ 80 % en `core` y `security`     | ✅ Nueve jobs, todos bloqueantes                                                                     |
| 5   | Sin findings high/critical; CSP verificada; zod en cada action | ✅ `audit` limpio, T-60-3 y T-N-1 sobre respuestas reales, y los tests de payloads malformados de M3 |
| 6   | Un dev externo monta el CMS sobre una landing nueva en < 1 h   | ⚠️ **No verificable desde dentro.** Ver abajo                                                        |

**El criterio 1 no está verificado, y no lo doy por bueno.** Exige desplegar de verdad en una
cuenta de Vercel siguiendo `SETUP.md` sin saltarse pasos, y eso no se puede hacer desde donde se
escribió la guía. Lo que sí está: la guía cubre el camino entero, el botón de despliegue está
compuesto con los parámetros que Vercel documenta, y el proyecto arranca contra Postgres y Blob
en local y en CI. Queda en el issue #157, junto con las capturas.

**El criterio 6 no lo puedo verificar honestamente.** Dice "validado con el proyecto de ejemplo
incluido", y el proyecto de ejemplo lo escribí yo: conozco cada paso implícito porque los puse.
Que yo pueda seguir mi propia guía no dice nada sobre la hora de alguien que no la escribió. Lo
que sí afirmo es que la guía no se salta ningún paso.

Prefiero dos criterios marcados como no verificados que seis marcados como cumplidos por alguien
que no podía comprobar dos de ellos.

### Qué es frágil

- **El presupuesto de 60 KB de §8 no lo cumple ningún stack**, y está resuelto midiendo lo que
  sí controlamos (ADR-601). El techo del total —120 KB— es el número peor calibrado del
  proyecto: detecta un salto grande y no protege de nada concreto.
- **El LCP real en CI es 1855 ms**, no los 1,7 s medidos en local. El margen contra el
  presupuesto es de 645 ms: una fuente web o una imagen sin optimizar se lo comen.
- **Lighthouse no está en el lockfile.** Se ejecuta con `pnpm dlx` y versión fijada, porque
  `@lhci/cli` arrastra tres vulnerabilidades altas transitivas y §11 exige `audit` limpio. La
  contrapartida es que sus dependencias no están ancladas.
- **El límite de intentos sigue siendo por instancia** (#65, cerrado como limitación conocida).

### Qué probaría a mano

1. **Un despliegue limpio siguiendo `SETUP.md`, sin saltarse pasos y cronometrando.** Es el
   criterio 1, y es lo único que puede decir si la meta de quince minutos de §9 es real.
2. **Darle la guía a alguien que no programa** y mirar sin ayudar. Cada vez que pregunte algo,
   eso es un paso implícito que hay que escribir.
3. **Montar el CMS sobre una landing distinta** siguiendo `DEVELOPER.md`, con un cronómetro y
   sin mirar el código de `cms/`. Si hace falta abrirlo, el contrato de §6.3 no es cierto.

### Lo que enseñó este hito

- **Un presupuesto hay que calibrarlo contra el fallo que existe para cazar.** Puse 20 KB para
  el JavaScript propio y metí `zod` en una sección para probarlo: sumó 12,6 y **cabía**. Un
  umbral que deja pasar justo lo que vigila no es un umbral.
- **Una afirmación sobre la cobertura es una afirmación como cualquier otra.** El componente del
  editor decía que `emitUpdate` no estaba verificado; al comprobarlo, sí lo estaba. Esa nota
  llevaba dos hitos desactivando la curiosidad de quien la leyera.
- **Los tests que leen código fuente necesitan un analizador, no una expresión regular.** El
  primer intento se tragaba 1677 caracteres de código real porque la CSP contiene `https://*.…`
  y ese `/*` abría un comentario falso. Aquí dio un rojo; en el test de al lado habría dado un
  verde.
- **Y lo que más se repite en seis hitos:** lo que no se ha visto fallar, no se sabe si funciona.
  Este hito puso en rojo a propósito el presupuesto de Lighthouse, el de JavaScript, el modelo de
  amenazas y las cuatro defensas del canal de mensajes — y en dos de esos casos el rojo no llegó
  a la primera.

---

## Después de cerrar M6

El MVP quedó cerrado con los seis hitos en verde. Una pasada de repaso encontró **tres fallos de
verdad**, y merecen estar aquí: leer que el proyecto terminó sin incidencias sería falso.

### Lo que apareció

- **El panel se quedaba bloqueado si la red se caía** (#160). Seis pantallas subían la bandera de
  "ocupado", esperaban a una action y la bajaban después. Si la llamada **lanza** en vez de
  responder, el manejador muere ahí y la bandera no vuelve a bajar: botón deshabilitado diciendo
  "Guardando…" para siempre, sin un mensaje, y a recargar.
- **El autoguardado mentía** (#161). La misma causa, peor sitio: el indicador que existe justo
  para decir si lo escrito está a salvo se quedaba en "Guardando…" sobre algo que nunca se
  guardó. El borrador local seguía ahí, así que no se perdía nada — lo que se perdía era saberlo.
- **Una subida fallida hablaba en inglés** (#162). El `catch` enseñaba el texto del navegador
  —"Failed to fetch"— a alguien que solo quería subir una foto, con un comentario encima que
  afirmaba que ese mensaje venía siempre de nuestra ruta.

Y **quince README de directorio** seguían anunciando "se llena en **M4**" con los directorios
llenos (#159).

### Por qué ninguna suite los detectaba

**La condición no existe en local ni en CI.** La red no se cae, el servidor no devuelve 500, el
despliegue no cambia a mitad de una petición. Solo pasa en producción, con alguien delante.

Eso no es un descuido de los tests: es el límite de lo que un test puede ver. Tres suites en
verde, cobertura por encima del umbral, y el fallo estaba en el camino más usado del panel.

### Qué se hizo para que no vuelva

Un test estructural que recorre `cms/ui` con el AST y **exige que toda espera al servidor esté
dentro de un `try`**, con dos excepciones declaradas y su motivo escrito. No comprueba que el
código de hoy esté bien —eso lo hacen los tests de comportamiento— sino que el **próximo** `await`
no repita el patrón.

Y otro que exige que cada directorio con código tenga su README y que ninguno prometa un hito que
ya pasó.

### Lo que enseñó esta pasada

- **Un cabo suelto escrito en una autorevisión hay que seguirlo.** El fallo de la subida salió de
  una frase que yo mismo había dejado en #161: "no he comprobado que su recuperación sea buena,
  solo que existe". Un pendiente que se escribe y no se sigue vale lo mismo que no escribirlo.
- **Arreglar puede romper.** El arreglo del autoguardado metió una recursión infinita que tumbó
  el proceso de tests. No lo vi releyendo el código que acababa de escribir; lo vi porque el
  worker se cayó.
- **Y la mutación mal elegida da falsos verdes.** Quité un `finally` dejando la línea justo
  después: con el `catch` presente eso es equivalente, así que los ocho tests pasaron y estuve a
  punto de escribir "comprobado por mutación". Es la tercera vez en el proyecto, y las tres por
  lo mismo — **mutar la forma en vez del comportamiento**.

---

## Probando el CMS en local

Levantar el proyecto y usarlo como lo usaría cualquiera destapó, en una tarde, más que la última
pasada de repaso entera. Los tres hallazgos salieron del mismo intento: **subir una foto**.

### Lo que apareció

- **El editor enseñaba `Vercel Blob: Failed to retrieve the client token`** (#164). En inglés y
  con el nombre del proveedor, a alguien que solo quería subir una imagen. Mi clasificación de
  errores era una lista negra de un caso, y la librería tiene decenas. La regla correcta es la
  inversa: **enseñar solo texto que hemos escrito nosotros**.
- **Y la ruta lo seguía mandando** (#165). Arreglado el cliente, dejó de verse — no de enviarse.
  El `catch` devolvía `error.message` sin mirar, con un comentario encima afirmando justo lo
  contrario. No es solo idioma: el texto de un fallo interno cuenta qué hay detrás del servidor.
- **Sin cuenta de Vercel no se podía subir nada** (#168, ADR-700). Los dos arreglos anteriores
  mejoraron lo que el CMS _dice_ cuando esto falla; ninguno lo arreglaba. Ahora hay un almacén en
  disco que se activa solo fuera de producción.

### Lo que enseñó

- **Usar el producto encuentra cosas que ninguna suite busca.** Ochocientos tests en verde y el
  primer clic en "subir una imagen" enseñó jerga en inglés. No es que faltara un test: es que
  nadie había mirado esa pantalla con los ojos de quien la usa.
- **"Arreglado" y "ha dejado de verse" no son lo mismo.** Tapé la fuga en el cliente y la di por
  cerrada. Seguía saliendo por la respuesta HTTP, y solo se vio al ir a buscarla.
- **La mutación volvió a cazar dos guardas de adorno**, y las dos eran las piezas de seguridad
  que más confianza me daban: el test de recorrido de directorios pasaba con la defensa quitada,
  y una comprobación de tamaño que escribí "por seguridad" no comprobaba nada. El código era
  correcto en los dos casos; lo que no probaba nada eran los tests.
- **Escribir la spec antes no protege de una premisa falsa.** La comprobación redundante la
  escribí porque creía algo del funcionamiento de `formData()` que no había verificado. La spec
  la recogió tal cual. Lo único que lo destapó fue mutar.
- **Y el borrado no estaba.** Construí la subida entera —rutas, tests, spec, ADR— sin caer en que
  una imagen también se borra. Salió al releer el diff preguntándome qué más toca una imagen.

---

## Dónde está el trabajo ahora

> Esta sección es la que hay que actualizar al terminar cada pieza. Si dice algo que ya no es
> cierto, es peor que si no existiera.

**El MVP está cerrado** (M0–M6) y después se han cerrado cuatro cosas más: los dos arreglos de
los mensajes de subida (#164, #165), el almacén local de imágenes (#168, ADR-700) y **la vista
previa de una web que vive fuera** (#177 a #181, ADR-701).

**Lo siguiente es desplegar.** No queda trabajo de producto planificado, y hay tres cosas que
solo se pueden comprobar con un despliegue delante: el driver de Neon (#43), las capturas de
`SETUP.md` (#157) y el iframe a `http://localhost` desde una página `https`.

### La vista previa de una web que vive fuera ✅

**Cerrada.** 5 issues, 5 PR, todos con autorevisión escrita y con hallazgos arreglados antes de
mergear. El diseño se mezcló en #182; la contradicción que lo motiva es
[#176](https://github.com/KthArg/uno-cms/issues/176) y la decisión, **ADR-701**.

| Pieza                             | Issue                                                | Estado    |
| --------------------------------- | ---------------------------------------------------- | --------- |
| El interruptor y la CSP           | [#177](https://github.com/KthArg/uno-cms/issues/177) | **hecho** |
| El propósito de token propio      | [#178](https://github.com/KthArg/uno-cms/issues/178) | **hecho** |
| La ruta que sirve borradores      | [#179](https://github.com/KthArg/uno-cms/issues/179) | **hecho** |
| El iframe remoto y los mensajes   | [#180](https://github.com/KthArg/uno-cms/issues/180) | **hecho** |
| El cliente para la web de destino | [#181](https://github.com/KthArg/uno-cms/issues/181) | **hecho** |

Los veinte casos de la spec, en verde.

#### Qué funciona

| Área              | Estado                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| El interruptor    | `PREVIEW_ORIGINS` y `PREVIEW_URL` por entorno. Sin la primera, la CSP es byte a byte la de antes y las dos rutas nuevas responden 404  |
| La CSP            | Solo cambia `frame-src`, comprobado comparando la política entera y no la directiva añadida                                            |
| El token          | Propósito `preview-remoto`, quince minutos, con techo vigilado. No vale en `/preview` ni al revés                                      |
| La renovación     | El panel lo releva por `postMessage` sin recargar el iframe; si falla, lo dice y ofrece recargar                                       |
| La ruta           | Origen exacto en `Access-Control-Allow-Origin` —nunca `*`—, `Vary: Origin` y `no-store`. 404 idéntico en todos los rechazos            |
| Lo de siempre     | `/api/content/:key` sigue sin borradores y sin CORS **con la fase encendida**, y `/preview` sigue apuntando a este sitio               |
| El cliente remoto | Se sirve por una ruta con CORS, se prueba importando **los mismos bytes** que se sirven, y descarta lo que no venga del origen del CMS |

#### Qué es frágil

1. ~~**Nadie ha integrado esto en una web de verdad.**~~ **Cerrada a medias** (#195). Se integró
   a mano con una web ajena en otro puerto —y salió un hueco de documentación: lo publicado hay
   que pedirlo desde el servidor porque esa ruta no manda CORS— y después quedó como
   `examples/web-remota/`, desplegable y con tests que la sostienen. Lo que **sigue sin verse** es
   una web con su propia CSP, su enrutador y su ciclo de vida: el ejemplo no tiene ninguna de las
   tres, a propósito, porque cuanto menos se parezca a una aplicación real menos esconde del
   contrato.
2. **El caso «CMS desplegado, web en local» sigue sin verificar.** Empotrar `http://localhost`
   desde una página `https` tiene reglas propias del navegador. No se puede mirar en local
   —hace falta un origen `https` de verdad— y va con el primer despliegue.
3. **El margen de renovación de tres minutos está razonado, no medido.** Sale de que los
   navegadores estrangulan los temporizadores de las pestañas de fondo hasta ~uno por minuto,
   que es comportamiento documentado; que tres minutos basten no lo ha medido nadie con una
   pestaña real.
4. **`conectar()` saca el origen del CMS de `import.meta.url` y esa línea no la cubre ningún
   test**: un módulo importado desde una URL `data:` no tiene origen, así que los casos usan
   `crearCliente(origen)`. Es una línea y se ve a la primera al integrar, pero no está probada.
5. **La ruta de borradores no tiene límite de peticiones.** No es una exposición nueva
   —`/preview` tiene la misma forma desde M5, con un token de dos horas— y por eso no se le puso
   uno solo a ella. Está en `PENDIENTES.md` con ese razonamiento.
6. **Si se navega dentro del iframe, la vista previa se acaba**: el parámetro `unocms_preview` no
   viaja solo a la página siguiente. Está documentado, no resuelto.

#### Qué probaría a mano

- **Integrarlo en una web de verdad**, que es lo que cierra la fragilidad 1. Con su CSP puesta,
  para ver si `docs/DEVELOPER.md` dice lo suficiente o falta algo que solo se descubre fallando.
- Dejar el panel abierto **más de quince minutos** y comprobar que el relevo ocurre y que el
  iframe no parpadea. Y luego dormir la pestaña media hora, para ver el aviso.
- Abrir la vista previa con un token ya caducado en la dirección, para ver si el reintento con
  el token nuevo la levanta.

#### Lo que enseñó

- **Escribí el interruptor como una comprobación explícita tres veces, y las tres sobraban.**
  `if (lista.length === 0)` delante de un allowlist no hace nada: una lista vacía no autoriza a
  nadie. Las tres se descubrieron mutando, ninguna leyendo. Y la lección de verdad es la de
  después: T-R-1 no puede fallar quitando una línea, pero sí **añadiéndola** —
  `lista.length === 0 || lista.includes(x)`, o sea «sin configurar, deja pasar»—, que es el
  error que alguien cometería de verdad.
- **Todo lo que falla en esta fase falla callado.** El `NaN` que daba un token por sano para
  siempre, el reloj que se reiniciaba al rearmarse un efecto, el token nuevo que no leía nadie:
  ninguno rompe un test, ninguno da error, y la pantalla se ve perfecta hasta que deja de verse.
- **Un test puede dar el resultado correcto por el camino equivocado.** El aviso de "la vista
  previa dejó de actualizarse" salía aunque se ignorase el fallo de la renovación — llegaba por
  otra comprobación, quince segundos tarde. Pasaba en verde y no probaba lo que decía.
- **La mezcla de idiomas produjo su primer fallo.** `{ origin }` es el atajo de `origin: origin`
  y mi parámetro se llamaba `origen`: el atajo se enganchó al **global del navegador** sin que
  TypeScript dijera nada, y cuatro casos daban cero con pinta de fallo del componente.
- **Y un guard tenía un punto ciego que nadie había tocado en seis hitos**: el inventario de
  accesos de #104 solo miraba `app/api`. La primera ruta fuera de ahí habría entrado sin
  declararse. Ahora recorre `app/` entero.

### Lo que está abierto y no bloquea

- [#157](https://github.com/KthArg/uno-cms/issues/157) — las capturas de `SETUP.md`. Hacerlas
  exige el primer despliegue limpio, que cierra además el criterio §11.1 y
  [#43](https://github.com/KthArg/uno-cms/issues/43)
- [#170](https://github.com/KthArg/uno-cms/issues/170) — el almacén local no lo cubre ningún e2e
- [#167](https://github.com/KthArg/uno-cms/issues/167) — un test falló una vez y no se reproduce
- Nueve issues `post-mvp`, **sin código por diseño**

### El primer despliegue en línea

Hecho, y en `uno-cms.vercel.app` funciona el recorrido entero: entrar, editar, publicar, subir
una imagen y verla en la biblioteca. Con base de datos Neon y almacén Vercel Blob de verdad.

**Salieron cinco fallos, todos del mismo camino: subir una imagen.** Y cada uno tapaba al
siguiente, lo que hizo que durante un rato pareciera un solo fallo intermitente.

1. **La CSP bloqueaba la subida.** `connect-src` no dejaba salir a `https://vercel.com`, que es a
   donde el navegador sube directamente por ADR-005. En local nunca se vio: allí las imágenes van
   al disco. → ADR-703.
2. **El almacén estaba privado, y el token no era el que mandaba.** `@vercel/blob@2.8.0` da
   preferencia a `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID` sobre `BLOB_READ_WRITE_TOKEN`, así que
   apuntaba a un almacén distinto del configurado. Ninguna documentación nuestra lo decía porque
   nadie lo había ejecutado.
3. **El nombre del objeto lo ponía el cliente sin que nadie lo mirara** (#199). El comentario
   encima afirmaba lo contrario: el SDK descartaba en silencio el `pathname` que devolvía el
   servidor. Se vio al subir dos veces la misma foto. → ADR-704.
4. **El aviso de subida completada llegaba con 401**, porque la ruta le exigía sesión y ese aviso
   viene de los servidores de Vercel, no de un navegador con cookie (#201).
5. **Y la fila la escribía solo ese aviso, que llega tarde** (#205). Medido: el refresco del
   cliente salía un segundo **antes** que la escritura. → ADR-705.

### Por qué ninguna suite los detectaba

Porque **el camino que se despliega no lo ejercita ningún test**, y no es un descuido puntual:

- En local las imágenes van al disco (ADR-700), así que Vercel Blob no corre en ninguna suite.
- La base de datos de los tests es Postgres a secas con `node-postgres`; Neon usa otro driver.
- Un aviso de un tercero no lo manda nadie en local.

Estaba anotado desde M6 como «el driver de producción nunca ha hablado con Neon» (#43). Lo que se
ve ahora es que el hueco es **bastante más ancho que el driver**, y está abierto como
[#207](https://github.com/KthArg/uno-cms/issues/207) con las tres formas de cerrarlo comparadas.

Desde #207 hay una suite que lo mira desde fuera: `pnpm test:humo`, contra el despliegue que se le
diga. Entra, sube una imagen, comprueba que sigue ahí **al recargar** y borra lo que ha subido.
Ejecutada en verde contra `uno-cms.vercel.app`. De los cinco fallos de arriba habría cazado cuatro;
el cuarto no se le escapa por descuido —desde ADR-705 un aviso perdido ya no tiene consecuencia
observable, y eso es [#206](https://github.com/KthArg/uno-cms/issues/206)—. **Y hay que lanzarla a
mano**, que es lo que sigue vivo del hueco.

### Lo que enseñó

- **Desplegar es una pasada de pruebas, no un trámite.** Encontró en una sesión más que la última
  auditoría entera, y todo en el camino que menos test tenía.
- **Un fallo tapa al siguiente.** Los cinco eran del mismo clic. Cada arreglo destapaba el
  posterior, y hasta el tercero pareció razonable pensar que ya estaba.
- **Y hay que medir antes de explicar.** Los dos últimos se cerraron con razonamientos plausibles
  —«será la caché»— que eran ciertos a medias. Lo que lo cerró fue desplegar una versión con la
  cuenta de filas en cada render y leer las marcas de tiempo. Es la lección de #134 otra vez.
- **La mutación volvió a cazar un test que se probaba a sí mismo** (#205, el sexto). Reproducía
  el criterio de la action en vez de llamarla: cinco casos en verde con las comprobaciones
  quitadas.

### Lo que CI confirmó después, y por qué importa decirlo

Cinco PR de esta tanda —#200, #202, #204, #208, #210, #214, #215 y #216— se mergearon con
`--admin` y **verificación solo local**, porque GitHub Actions estaba parado por facturación. En
cada uno quedó escrito que nadie los había reejecutado en una máquina limpia.

El 31 de agosto de 2026 el repositorio pasó a público y CI volvió a correr. **Los nueve jobs
pasan sobre `main`**: lint, typecheck, unit, ui, integration, e2e, build, presupuesto de
JavaScript y auditoría. Eso valida a posteriori toda la tanda, y es lo que convierte «pasa en mi
máquina» en el criterio §11.4 de verdad.

Antes de hacerlo público se barrió el historial entero buscando secretos —ficheros de entorno
versionados, tokens de Blob, cadenas de conexión con credenciales, claves privadas— y no había
ninguno. Lo único que aparecía eran literales falsos de tests y el hash señuelo de
`cms/auth/passwords.ts`, que está documentado como no secreto.

### Lo que sigue sin hacerse

- **No hay etiqueta `v0.1.0`.** Sigue sin etiquetar.
- **Los criterios sin verificar son §11.1 y §11.6**, como dice la tabla más arriba. Este
  documento llegó a decir «§11.1 y §11.4» y **era falso**: §11.4 es la suite verde en CI, que sí
  está. El error se escribió aquí mismo al cerrar el despliegue y sobrevivió a dos revisiones.
- **§11.1 sigue sin verificarse, y el despliegue no lo cierra.** Dice «deploy limpio _siguiendo
  `docs/SETUP.md`_», y este despliegue no siguió la guía paso a paso: se fue resolviendo sobre la
  marcha, que es precisamente lo que la guía tiene que evitar. Lo que hay es la prueba de que el
  producto **funciona** desplegado, no de que la guía **lleve** hasta ahí.
- **Las capturas de `SETUP.md`** ([#157](https://github.com/KthArg/uno-cms/issues/157)), que
  ahora sí se pueden hacer.
- **Cinco objetos huérfanos en el almacén**, de depurar todo esto
  ([#206](https://github.com/KthArg/uno-cms/issues/206)). Este documento y varios mensajes
  dijeron «tres» durante días: era una cuenta de memoria. Cruzando `vercel blob list` con la
  biblioteca del panel salen **nueve objetos y cuatro filas**, así que sobran cinco — los dos de
  nombre crudo anteriores a #199 y otros tres `media/…`.

---

## Recorrer el panel a mano, con el despliegue delante

Con el CMS ya en línea, el recorrido completo de `SPEC.md` §11.2 —entrar, editar viendo la vista
previa, publicar, verlo en la web, revertir— se hizo **con un navegador de verdad contra el
despliegue**, no contra un servidor local. Es la primera vez.

### Lo que funciona, verificado

- **§11.2 entero.** La vista previa cambia al escribir, el `Guardado ✓` aparece al salir del
  campo, publicar deja la landing actualizada **al instante** contra un presupuesto de 60 s, y
  revertir avisa antes: «Quedará como borrador. Tu web no cambia hasta que lo publiques».
- **Colecciones**: crear, publicar, ver en la web y borrar. La confirmación de borrado sabe si el
  elemento está publicado y lo dice — «también desaparecerá de tu web».
- **Las guardas, en vivo**: `/admin` sin sesión redirige con `?next=`, una mutación sin sesión da
  401, `/preview` sin token da 404, una clave inexistente da 404, la ruta de borradores remotos
  con la fase apagada da 404, `X-Robots-Tag: noindex` está en el admin y **no** en la landing.
- **No puedes dejarte fuera solo**: tu propia cuenta aparece sin selector de rol y sin botón de
  quitar acceso.

### Lo que apareció, y ninguna suite lo veía

- **No se podía cerrar sesión.** `signOut` estaba exportado y sin usar en todo el proyecto
  (#211). No lo cazó nada porque **`SPEC.md` no lo menciona ni una vez**: sin caso en la spec no
  hay caso en la suite. Y los e2e no iban a notarlo — cada uno abre un contexto limpio y entra;
  nadie **termina** de usar el panel en un test.
- **El dueño del sitio aparecía como que nunca había entrado** (#212). `/setup` creaba su cuenta
  sin tocar `password_version`, y la etiqueta se deduce de que valga 0. Pasaba en todos los
  despliegues, desde el primer minuto, en la pantalla que sirve para saber a quién falta mandarle
  su enlace.
- **Un test que dependía del disco de quien lo ejecuta** (#213). Salió verificando lo anterior:
  la suite falló una vez y pasó cuatro seguidas.

### Lo que se midió y no es un fallo

- **`/api/content/:key` se cachea 60 s en el CDN**, con `stale-while-revalidate=300`. Es
  deliberado (`SPEC.md` §5.3, #82) y publicar no lo purga. La landing propia ve el cambio al
  instante porque la pinta el servidor; **una web remota (ADR-701) puede tardar hasta un
  minuto**, y se llegó a medir `Age: 71`. Justo en el límite del presupuesto de §11.2.
- **Huérfanos en el almacén: cinco**, no tres.

### Lo que enseñó

- **Usar el producto en el sitio donde vive encuentra cosas que no encuentra nada más.** Los dos
  fallos de arriba llevaban meses ahí, con 790 tests rápidos, 287 de integración y 66 e2e en
  verde. Ninguno era un descuido de implementación: eran **preguntas que nadie había hecho**.
- **La spec es el techo de lo que la suite puede cubrir.** «No se puede cerrar sesión» no es un
  test que falte: es una funcionalidad que nadie pidió, y por eso ningún test la echaba de menos.
  Una suite completa sobre una spec incompleta se ve exactamente igual que una suite completa.
- **Un flake que pasa a la segunda no es un flake.** #213 falló una vez y pasó cuatro veces
  seguidas, y estuve a punto de anotarlo como irreproducible citando #167. Lo era solo porque el
  propio `afterEach` había arreglado el estado del disco.

---

## La estética del panel — en marcha, y con la dirección cambiada

Spec: [`docs/specs/10-estetica-del-panel.md`](specs/10-estetica-del-panel.md), con su enmienda.

### El diagnóstico del que se parte, medido

| En un móvil de 390 px                            | Valor                                       |
| ------------------------------------------------ | ------------------------------------------- |
| Ancho útil del contenido en `/admin`             | **103 px** — el menú fijo se lleva 192      |
| Desbordamiento horizontal                        | **sí**, la página mide 495 px de ancho real |
| Ancho del campo «Título principal» en el editor  | **103 px**                                  |
| Zonas pulsables por debajo de 44 px en el editor | **11 de 14**                                |

### Hecho

- **#219 — fichas de color y los dos modos.** El color estaba en ~250 clases literales repartidas
  por veintitrés ficheros; ahora se define una vez como fichas semánticas y cada modo les da un
  valor. **Cero variantes `dark:`**, con guardas que lo exigen. El modo va en cookie, así que el
  servidor lo pinta en el primer byte: cero parpadeo y cero JavaScript. Sin preferencia guardada
  manda el sistema operativo.
- **21 parejas texto/fondo comprobadas con la fórmula de WCAG**, en los dos modos. Es lo que
  sostiene el listón de accesibilidad ≥ 95 de CI, y a ojo no se distingue de 3:1.

### Lo que enseñó esta pieza

- **Un cambio de estética se comprueba mirándolo.** La primera versión ponía las fichas oscuras
  bajo `:root[data-tema='oscuro']` y **no cambiaba ni un color**: Tailwind emite las fichas en
  `:root` y el atributo se pinta en el contenedor del panel, no en el `<html>` —que se comparte
  con la landing—. Todos los tests pasaban, porque cada uno miraba el CSS o el DOM por separado y
  ninguno el resultado de aplicar uno al otro.
- **Una mutación sobrevivió por elegir mal los valores de referencia.** El caso que protege la
  fórmula de contraste usaba solo grises, y en un gris los tres canales pesan igual: sustituir
  los pesos de WCAG por una media aritmética no cambiaba ni un resultado.
- **Y una guarda cazó una deriva de verdad**, cometida por quien la acababa de escribir: una
  ficha añadida a un bloque oscuro y no al otro.

### Abierto

- **#220 — el panel en un móvil.** Es funcionalidad, no acabado: hoy no se puede usar.
- **#224 — la dirección visual cambia.** Tras entregar #219 la valoración fue «todavía no se ve
  bien»: se pide algo más único, tirando a **liquid glass**, y **iconos de librerías existentes**.
  Decaen §1 y §6 de la spec; el resto sigue en pie, y las fichas de #219 son justamente lo que
  permite cambiar de dirección sin volver a tocar veintitrés ficheros.
- La tensión que hay que resolver antes del CSS: **sobre superficies translúcidas el contraste
  deja de ser calculable**, porque el fondo efectivo depende de lo que haya debajo. La guarda
  actual pasaría comprobando un color que no es el que se ve.

---

## El cristal, los iconos y la paleta nocturna ✅

**Cerrado** el 1 de septiembre de 2026, issue [#224](https://github.com/KthArg/uno-cms/issues/224),
spec [`11-cristal-e-iconos.md`](specs/11-cristal-e-iconos.md), ADR-800 a ADR-803.

Es la respuesta a «todavía no se ve bien». Alcance confirmado otra vez con quien lo pidió: **solo
el panel**, y el **modo claro sigue disponible** —se pidió a mitad y decide toda la paleta, porque
obliga a que la lámina funcione en dos direcciones opuestas—.

### Qué funciona

| Área             | Estado                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El idioma visual | Cristal sobre un fondo con luz propia: la cabecera, la navegación, las tarjetas y los diálogos flotan; el texto largo y los campos van sobre superficie opaca                 |
| El contraste     | **Se sigue calculando, sobre el color compuesto** (ADR-800). 22 comprobaciones nuevas: cada ficha de texto sobre el cristal, en los dos extremos del fondo y en los dos modos |
| Los iconos       | Lucide, con importación individual, en **un solo módulo** con nombres en español que dicen el papel y no el dibujo                                                            |
| La accesibilidad | El envoltorio **obliga a decidir** si un icono significa algo: o lleva nombre accesible, o se oculta al lector de pantalla. No es disciplina, es el tipo                      |
| El vocabulario   | `cms/ui/estilos.ts`: los botones, campos y avisos con nombre, y **44 px de alto en la base** de todo lo pulsable                                                              |
| La letra         | Una sola familia de interfaz con `next/font`, autoalojada. La ficha `--font-serif` se retira porque **no la usaba nadie** (ADR-803)                                           |
| Los dos modos    | Intactos: mismas guardas, mismos tres estados, cero parpadeo y cero JavaScript                                                                                                |

**Verificado con el panel delante**, no solo con tests: se recorrieron el acceso, el contenido, el
editor, la biblioteca, las personas y los ajustes, en los dos modos, con capturas.

Y con números: **837 tests rápidos y los 66 e2e en verde**, y el presupuesto de JavaScript de la
landing **byte a byte igual que antes** —5,6 KB nuestro, 106,1 KB de total—, que es lo que cierra
T-215-4 y T-215-11 midiendo en vez de razonando.

### Qué es frágil

1. **«Nada de cristal sobre una imagen» no lo impone ningún test.** Es la regla que sostiene
   ADR-800 —el único fondo que no controlamos es la foto que suba alguien— y lo que hay es la
   tabla de la spec 11 §3 y que la biblioteca use superficies opacas. Es el punto débil del ADR y
   está dicho allí.
2. **`--color-fondo-claro` se escribe a mano.** Hay un caso que comprueba que sigue siendo la
   composición real de las dos manchas del halo, así que no puede quedarse atrás en silencio —
   pero es un valor calculado fuera del CSS y metido dentro.
3. **El margen de contraste sobre cristal es de 0,4 puntos** en el peor caso (4,93:1 sobre 4,5).
   Subir el halo a 11/9 % lo dejaba en 4,63 y a 13/11 % lo tumbaba. Está medido y elegido, pero
   quiere decir que el halo no se puede tocar sin mirar la guarda.
4. **Lighthouse no se ha vuelto a medir** con el desenfoque puesto. El listón de rendimiento ≥ 90
   va en CI y las superficies son pequeñas y `contain`idas a propósito, pero **eso es el diseño,
   no la medida**. Se cierra en la próxima ejecución de CI.
5. **La vista previa del editor se sale por el borde derecho** en una ventana de 1440 px. Es
   anterior a esta pieza —viene del ancho completo de #190— y se vio en las capturas, no en el
   código.
6. **Los iconos entran como dependencia de tiempo de ejecución** del panel, la primera de interfaz
   desde el editor de texto rico.

### Qué probaría a mano

- **Escribir media hora seguida en el editor con el modo oscuro puesto.** Las capturas dicen que
  se lee; lo que no dicen es si cansa, que es la mitad de lo que se pidió.
- **Subir una imagen y mirar la biblioteca llena.** Se vio vacía: la regla de «nada de cristal
  sobre una imagen» está aplicada pero no vista con fotos de verdad delante.
- **Abrirlo en un móvil.** No está hecho —es #220— y por eso mismo conviene ver de qué se parte.
- **Con `prefers-reduced-motion` activado**, para ver que el único giro del panel se para.

### Lo que enseñó esta pasada

- **Tres de los cuatro hallazgos salieron de mirar la pantalla, no el código.** Los títulos de las
  tarjetas partidos en tres líneas, la barra de acciones flotante tapando la vista previa y el
  halo invisible pasaron `typecheck`, `lint`, 837 tests y 66 e2e. Un cambio de estética se
  comprueba mirándolo — es la misma lección de #219 y volvió a hacer falta.
- **Y el cuarto lo cazaron los tests, en la dirección contraria.** El nombre de la cuenta se
  anunciaba como «Ana Ana» porque el texto visible y su copia para lectores de pantalla se
  sumaban. En un navegador no se habría visto nunca: `hidden` es `display:none` y la copia no
  cuenta. Lo que enseña es que el nombre accesible dependía de que una hoja de estilos cargara.
- **Una guarda que grita donde no hay nada es la que se acaba borrando.** El detector de trabajo
  aplazado denunció `AVISO_PENDIENTE`, una constante de estilos. Se arregló excluyendo el guion
  bajo **y se comprobó por mutación en las dos direcciones**: que el falso positivo muere, y que
  la detección de verdad sigue viva.
- **Una guarda que deja de mirar donde se concentra el riesgo es peor todavía.** Al mover las
  clases compartidas a `cms/ui/estilos.ts`, la guarda de colores literales —que solo recorría
  `.tsx`— habría dejado fuera justo el fichero con más clases de color del panel.
- **Y lo que la spec fija no se toca aunque estorbe al diseño.** El indicador de autosave lleva un
  ✓ tipográfico haciendo de icono, que es exactamente lo que esta pieza venía a quitar. Se queda:
  `SPEC.md` §8 fija ese texto literalmente y el vocabulario está fuera de alcance. Cambiarlo
  habría roto doce aserciones e2e, que es la forma barata de enterarse; la cara es que un
  producto cuya interfaz dice una cosa y cuya spec dice otra ya no tiene fuente de verdad.

### Abierto

- **#220 — el panel en un móvil.** Sigue abierto y sigue siendo funcionalidad, no acabado. Esta
  pieza no lo empeora y deja la navegación ya construida con el icono como elemento principal,
  que es lo que permitirá la barra inferior sin rediseñarla otra vez.

---

## El panel en un móvil ✅

**Cerrado** el 1 de septiembre de 2026, issue [#220](https://github.com/KthArg/uno-cms/issues/220),
casos T-213-1 a T-213-5 de [`10-estetica-del-panel.md`](specs/10-estetica-del-panel.md) §5.

Esto no era acabado, era **funcionalidad**: el panel no se podía usar en un teléfono.

### Lo que estaba roto, medido antes y después

| Medido en un móvil de 390 px               | Antes             | Ahora         |
| ------------------------------------------ | ----------------- | ------------- |
| Ancho útil del contenido                   | 102 px (**26 %**) | 358 px (92 %) |
| Ancho real de la página en `/admin`        | 524 px (desborda) | 390 px        |
| Zonas pulsables por debajo de 44 px        | 3 en el editor    | **0**         |
| Formas de ver la vista previa en el editor | **ninguna**       | una pestaña   |

Y a 320 px, que es el suelo de la spec, tampoco desborda ninguna pantalla.

### Qué funciona

- **La navegación es una sola**, y cambia de forma: barra pegada abajo en un móvil —donde llega
  el pulgar— y columna de cristal a partir de `lg`. **Mismo marcado**, que es lo que impide que
  las dos versiones se separen.
- **El editor apila** por debajo del ancho de dos columnas, con pestañas «Escribir» y «Vista
  previa». El divisor arrastrable no se ofrece donde no hay sitio para arrastrar.
- **Los 44 px viven en el vocabulario**, no en cada pantalla: `BOTON_*`, `BOTON_ICONO` y `CAMPO`
  los llevan de fábrica.

### Qué es frágil

1. **La suite e2e en paralelo y en local falla en `historial.spec.ts` T-E-3** desde que existen
   estos cinco casos. Con un worker —como corre CI— pasan los 71, siempre. Está en
   [#227](https://github.com/KthArg/uno-cms/issues/227) con las siete comprobaciones que se
   hicieron y, sobre todo, **con el mecanismo sin identificar**: se descartaron la caché de Next
   y que los casos nuevos toquen su estado, y no se cerró con la explicación cómoda.
2. **La barra de abajo tapa la última línea si algo se sale del `main`.** El hueco se reserva con
   `pb-24` en el contenido, así que cualquier cosa pintada fuera de `<main>` no lo tiene.
3. **`env(safe-area-inset-bottom)` no lo ejercita ningún test.** Playwright no simula el área de
   gestos de un teléfono, así que lo que hay es el CSS correcto y ninguna comprobación.
4. **Las pestañas del editor esconden con CSS y no desmontan.** Es lo correcto —desmontar
   recargaría el iframe y con él la sesión de vista previa— pero significa que en un móvil el
   iframe de la vista previa **está cargado aunque no se vea**, con lo que eso cuesta en datos.

### Qué probaría a mano

- **Escribir una sección entera desde un teléfono de verdad**, con el teclado abierto tapando
  media pantalla. Es lo único que dice si esto se puede usar o solo cabe.
- **Girar el teléfono** a horizontal en el editor, que cae justo alrededor del corte de dos
  columnas.
- **Un teléfono con barra de gestos**, para ver si el área segura está bien reservada.

### Lo que enseñó esta pieza

- **Una mutación mal elegida no prueba nada, y casi cuela.** La primera mutación —quitar las
  clases `lg:` de la navegación— dejó los cinco casos en verde, y la conclusión fácil era «los
  tests no sirven». Lo que pasaba es que la mutación **no restauraba el fallo**: la barra seguía
  fija abajo, así que el móvil seguía arreglado. Con la mutación correcta murieron tres.
- **Y entonces sí apareció un test que no probaba lo que decía.** `T-213-4` se llamaba «se llega
  a las cuatro secciones **sin menú lateral**» y sobrevivía con el menú lateral puesto: los
  enlaces existen y funcionan aunque el menú se coma dos tercios de la pantalla. Ahora mide
  dónde está la caja, que es lo que distingue una cosa de la otra.
- **Los botones del editor de texto rico medían 24 px**, la mitad del mínimo. No los había visto
  nadie porque solo se pintan en secciones con texto enriquecido, y la medición a mano se hizo
  sobre `hero`, que no tiene ninguno. Los cazó el e2e al darle a estos casos **su propia
  entrada** — o sea que el aislamiento, que se hizo por higiene, encontró un fallo de paso.
- **Y un estilo se escapó de la migración por llevar comillas simples.** Los campos de ajustes
  tenían su clase escrita dentro de un objeto de atributos, así que se quedaron fuera cuando el
  resto del panel pasó al vocabulario común: tres campos de 42 px. A ojo, 42 y 44 son lo mismo.

---

## El bento, el rail y la paleta tierra ✅

**Cerrado** el 1 de septiembre de 2026, issue [#229](https://github.com/KthArg/uno-cms/issues/229),
spec [`12-bento-y-rail.md`](specs/12-bento-y-rail.md), ADR-810 a ADR-812.

Es la tercera pasada sobre el mismo problema, y la primera con una referencia visual delante. Lo
que enseñó: **#224 acertó el material y falló la composición**. Cristal, iconos y profundidad
sobre un layout de barra lateral con texto y contenido en una columna — la misma forma de
siempre. Por eso «se ve bien» y «se ve como cualquier otro» podían ser ciertas a la vez.

### Qué funciona

| Área            | Estado                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| La composición  | Bento: rail de iconos, pieza principal con la portada y sus cifras dentro, columna de apoyo a la derecha, y las secciones en filas anchas abajo |
| El rail         | Iconos sin texto pintado, **con nombre accesible y `title`** — las condiciones de ADR-810, con un caso que las exige                            |
| La paleta       | Tierra cálido con acento naranja. Las mismas fichas y las mismas guardas: **73 comprobaciones de contraste en verde sin tocar ninguna**         |
| Las cifras      | Secciones, sin publicar, imágenes y personas. **Todas salen de algo que ya se leía**; ninguna se estima                                         |
| La gráfica      | Publicaciones por día de los últimos 14, de `revisions` más las entradas publicadas una sola vez, con lo que **no puede ver** escrito (ADR-812) |
| Lo que §9 exige | Intacto y con caso propio: el estado de cada sección con su vocabulario, y «Publicar todo»                                                      |

**Verificado con el panel delante** en los dos modos y a 390 px, y con números: 853 tests
rápidos, 293 de integración y los 71 e2e en verde, y el presupuesto de la landing **byte a byte
igual**: 5,6 KB nuestro, 106,1 KB de total.

### Qué es frágil

1. **La gráfica puede subcontar.** Si una entrada se publica por primera vez y se republica
   dentro de la misma ventana, la primera publicación no aparece: **su fecha no existe en el
   esquema**. Está en ADR-812 y en el propio módulo, y falla en la dirección que no infla.
2. **Con más de 20 republicaciones de una entrada en 14 días, la poda se lleva las viejas.** Con
   el ritmo de una landing es improbable; queda escrito porque improbable y «no pasa» no son lo
   mismo.
3. **El rail cuesta la primera vez en escritorio**: hay que pasar el ratón para saber qué es cada
   icono. Son cuatro secciones, y es el precio elegido en ADR-810.
4. **La pieza principal se ve vacía si la portada no tiene imagen.** Con imagen se lee como la
   referencia; sin ella queda un hueco a la derecha. No se rellena con nada inventado a propósito.
5. **El `data:` URI que se usó para verlo con imagen no es lo que se despliega.** Lo que se
   probó a mano fue el caso con imagen, no la subida real.

### Qué probaría a mano

- **Subir una foto de verdad y ponerla de portada**, para ver la fusión con una imagen real y no
  con un degradado generado.
- **Un sitio recién estrenado**, sin nada publicado: es donde la gráfica está a cero y las cifras
  a uno, y donde peor puede quedar una composición pensada con datos.
- **El rail con el teclado**, tabulando: el `title` no se lee al tabular, solo al pasar el ratón.
  Lo que sostiene ese caso es el nombre accesible, y quien navega con teclado y vista lo tiene
  peor que los dos extremos.

### Lo que enseñó esta pasada

- **La forma se reconoce antes que el color, y es lo que se pidió dos veces sin acertar.** Las
  dos entregas anteriores cambiaron material y paleta; lo que no se parecía era la disposición.
- **Cambiar la dirección de color entera volvió a costar un fichero.** Es la segunda vez en tres
  días que se cobra la inversión de #219, y esta vez con las 73 comprobaciones de contraste
  pasando sin relajar ninguna: se ajustaron los valores hasta que entraron.
- **El rediseño se llevó por delante el `<h1>` de la pantalla**, y lo cazó un e2e que ya existía.
  Una página sin encabezado de nivel 1 deja sin punto de partida a quien navega por encabezados,
  y es de lo que Lighthouse mira en la nota que va en CI. El test decía «el panel carga y lista
  las secciones»; tenía razón por debajo de lo que decía.
- **Copiar la forma de un gráfico sin mirar el dato es como se hacen los gráficos que mienten.**
  La referencia tenía una curva suave porque medía usuarios activos, que es una magnitud continua;
  aquí son conteos de cero a tres, y una curva habría dibujado «1,4 publicaciones» un martes por
  la tarde. Van barras.
- **El panel de inicio se acopló a una clave de la configuración de quien lo monta, y eso lo
  encontró la autorrevisión.** La primera versión leía `getDraft('hero')` a pelo; `hero` es una
  clave de **este** `cms.config.ts`, no del producto, y la promesa de `SPEC.md` §5.1 es que las
  secciones las decide quien monta el CMS sobre su landing. Un panel de inicio que da por hecha
  una clave se rompe en la primera configuración que no la tenga — y en la pantalla que se abre
  primero. Ahora usa el primer singleton de la lista y saca el título y la imagen **por el tipo
  del campo**, que es lo estable, no por su nombre.
- **Y dos avisos del linter de seguridad se resolvieron sin declarar excepciones**, cambiando el
  código en vez del test: una expresión regular construida con una variable se sustituyó por una
  función de filtro. Una excepción es a veces la respuesta correcta; no debería ser la primera.
