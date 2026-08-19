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

## M5 — Landing de ejemplo y vista previa en vivo ⏳

Pendiente. Aquí se verifica ADR-107 y se cierra el issue #19.

## M6 — Endurecimiento, rendimiento y release ⏳

Pendiente. Aquí se escribe el modelo de amenazas completo en `docs/SECURITY.md` y se
verifican los seis criterios de `SPEC.md` §11.
