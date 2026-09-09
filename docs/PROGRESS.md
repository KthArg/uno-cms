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

- **Issue [#19](https://github.com/KthArg/uno-cms/issues/19)** (`spec-question`, **cerrado**):
  `SPEC.md` §6.3, §7.1 y §6.1 son incompatibles entre sí en lo que respecta a `RichText`.
  Resuelto por ADR-107 —renderizar el richtext como elementos de React, nunca como cadena
  de HTML— y **verificado al cerrar M5**: no queda ni un `dangerouslySetInnerHTML` en el árbol y
  la regla de ESLint que lo prohíbe sigue en pie.
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

**El MVP está cerrado** (M0–M6), y después se han cerrado los dos arreglos de los mensajes de
subida (#164, #165), el almacén local de imágenes (#168, ADR-700), **la vista previa de una web
que vive fuera** (#177 a #181, ADR-701), la suite de humo contra un despliegue de verdad (#207),
una fase de estética del panel y un puñado de fallos salidos de usarlo a mano.

**Las tres cosas que esperaban a un despliegue ya se miraron, y las tres están cerradas:** el
driver de Neon (#43, ejercitado por `pnpm test:humo` contra el despliegue), las capturas de
`SETUP.md` (#157, retiradas por ADR-920: la guía se queda en texto) y el iframe a
`http://localhost` desde una página `https` (#255, medido y **sin aviso de contenido mixto**).

**Hoy no queda trabajo de producto planificado.** Los únicos issues abiertos son los ocho
`post-mvp`, sin código por diseño. Lo que sigue vivo es deuda anotada, no funciones por
construir, y está en [`PENDIENTES.md`](PENDIENTES.md).

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
2. ~~**El caso «CMS desplegado, web en local» sigue sin verificar.**~~ **Cerrada** en #255. Y la
   frase que la sostenía era falsa: hacía falta un origen `https`, no que fuera de verdad. Con un
   certificado propio y quince líneas de proxy se midió que **no hay ni aviso de contenido
   mixto**, porque el bucle local no cuenta como tal — con un control que sí avisa, el mismo
   servidor por su IP de red, para saber que el mecanismo estaba activo. Está contado más abajo,
   en «El contenido mixto, medido en vez de supuesto».
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

Los tres que estaban aquí se cerraron: #157 (ADR-920 retira las capturas), #170 (el almacén local
ya lo cubre un e2e contra `next dev`, #262) y #167 (el rojo tenía mecanismo, y está contado abajo).

- **Ocho issues `post-mvp`**, sin código por diseño: del #10 al #17. Eran nueve; #138 —el selector
  de móvil y escritorio en la vista previa— se cerró al construirlo
- La deuda anotada de [`PENDIENTES.md`](PENDIENTES.md), de la que lo único con issue vivo es
  [#279](https://github.com/KthArg/uno-cms/issues/279) — que la suite de humo corra sola

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
vio entonces es que el hueco era **bastante más ancho que el driver**, y se abrió como
[#207](https://github.com/KthArg/uno-cms/issues/207) con las tres formas de cerrarlo comparadas.
**#207 y #43 están cerrados**; lo que queda vivo —que esa suite corra sola— es
[#279](https://github.com/KthArg/uno-cms/issues/279).

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
- ~~**Las capturas de `SETUP.md`**~~ ([#157](https://github.com/KthArg/uno-cms/issues/157)).
  **Cerrado sin hacerlas**: ADR-920 retira «con capturas» de `SPEC.md` y la guía se queda en
  texto, porque una captura desactualizada engaña más que un párrafo.
- **Cinco objetos huérfanos en el almacén**, de depurar todo esto
  ([#206](https://github.com/KthArg/uno-cms/issues/206)). Este documento y varios mensajes
  dijeron «tres» durante días: era una cuenta de memoria. Cruzando `vercel blob list` con la
  biblioteca del panel salen **nueve objetos y cuatro filas**, así que sobran cinco — los dos de
  nombre crudo anteriores a #199 y otros tres `media/…`.
  **#206 se cerró dando la herramienta, no barriendo**: `pnpm medios:huerfanos` compara el
  almacén con la tabla y enseña lo que sobra, y **no borra** a propósito (#263). Borrarlos sigue
  siendo un acto manual, y nadie ha escrito aquí que se hiciera.

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

### Lo que cambió al enseñarlo, y lo que enseñó

Dos peticiones más, con la composición ya entregada, y las dos de las que solo se ven mirando.

**«Sobra espacio a los lados».** Medido en 1920 px: el techo de lectura de #190 dejaba casi
cuatrocientos píxeles muertos a cada lado. Se retira (ADR-813), y con él su caso T-190-6 — que
se dice en vez de fingir que sobraba. **El error de #190 no era el techo: era dónde se
aplicaba**, al contenedor entero en vez de a la prosa. En el móvil, además, el contenedor grande
deja de llevar margen: ahí no se ve flotar y solo quitaba ancho, de 364 px a 332 de 390.

**«Que se note más el vidrio».** El problema real: una lámina translúcida sobre un fondo liso se
ve igual que una opaca, porque no hay nada que desenfocar.

Lo primero que se probó fue lo obvio —subir las manchas manteniendo el cristal claro— y **no
funciona, y está medido**: el texto terciario cae a 4,07:1 con el cristal al 8 % y a 3,34 al
16 %, por debajo de AA en las cinco combinaciones probadas. No era cuestión de afinar: la
dirección estaba equivocada.

Lo que sí funciona es lo del vidrio ahumado de verdad: **la lámina oscurece**. Las luces se ven
atenuadas —que es lo que se lee como vidrio— y el texto gana contraste en vez de perderlo. Con
ese modelo caben luces cuatro veces más fuertes y el peor caso queda en 4,88:1 (ADR-814).

Y aparece el **contenedor grande** que envuelve el panel con el rail flotando fuera, que es lo
que hace que se lea como una sola pieza de vidrio. Obliga a que la guarda componga **dos capas**
en vez de una: componer solo la primera habría sido el fallo de ADR-800 otra vez, un nivel más
abajo.

**Y el filo necesitó ficha propia.** Salía de `--color-lamina`, que en oscuro es oscura: el
«filo» se pintaba como sombra y las tarjetas no se distinguían del contenedor. Se vio en una
captura, no leyendo el CSS.

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

---

## El rail, el fondo y el acento de cada modo ✅

**Cerrado** el 1 de septiembre de 2026, issue [#231](https://github.com/KthArg/uno-cms/issues/231),
ADR-815. Cuatro peticiones sobre el despliegue ya en línea.

### Qué funciona

- **El rail va centrado** en vertical respecto al contenedor, en vez de pegado al borde de arriba.
- **La sección activa se reconoce por el dibujo**: su icono va relleno y con el trazo más grueso.
  Es una señal más, no la única — `aria-current` y el fondo siguen ahí.
- **El fondo tiene grano**, un SVG de ruido en `data:` de menos de un kilobyte, y una cuarta luz
  pequeña y apretada. Es lo que le da algo que emborronar al desenfoque: un degradado limpio
  detrás de un vidrio sigue pareciendo un degradado limpio.
- **En claro el acento es celeste** y en oscuro naranja (ADR-815). Los dos modos dejan de ser uno
  el negativo del otro.

Las 109 comprobaciones de contraste pasan en los dos modos sin relajar ninguna; el peor caso del
claro celeste queda en 4,68:1.

### Lo que NO se pudo reproducir, y por eso no se arregló

Se reportó que **la vista previa perdió el scroll para ver la página completa**. Medido en local,
con una web de verdad dentro del iframe:

| Comprobación                                      | Resultado                                    |
| ------------------------------------------------- | -------------------------------------------- |
| Contenido de la web frente a su ventana           | 3500 px contra 800                           |
| Rueda del ratón encima de la vista previa         | la desplaza (`scrollY` 0 → 600)              |
| ¿Se lleva el panel el desplazamiento en su lugar? | no, el panel se queda quieto                 |
| Rueda fuera de la vista previa                    | desplaza el panel                            |
| ¿El marco recorta la barra de la web de dentro?   | no: el iframe escalado ocupa el hueco exacto |

O sea que **el mecanismo funciona en local**. Y hay una diferencia conocida con el entorno donde
se vio: aquí el iframe apunta a `PREVIEW_URL` —la vista previa remota de ADR-701— y esa web no
está levantada, así que hubo que servir una de prueba en su puerto para poder medir.

Se deja **sin cerrar y sin arreglo inventado**, que es la lección de #134: una explicación
plausible no es una explicación. Lo que falta es saber qué se ve exactamente — si la barra no
aparece, si la rueda mueve el panel en vez de la web, o si la página de dentro sencillamente no
tiene más contenido que enseñar porque el resto de secciones están sin publicar.

---

## El logotipo, y el menú que no seguía a la navegación ✅

**Cerrado** el 1 de septiembre de 2026, issue [#234](https://github.com/KthArg/uno-cms/issues/233).

### El fallo, que era de verdad y llevaba tiempo

Se reportó que **los iconos del rail no cambiaban de color al cambiar de sección**, y que el
anterior no se deseleccionaba, mientras el resto de la aplicación sí respondía. Reproducido en el
navegador: entrando en `/admin` y pulsando «Imágenes», la URL pasaba a `/admin/media` y el menú
seguía marcando «Contenido».

**La causa no estaba en el componente.** La ruta llegaba en una cabecera que pone el middleware,
y el layout de `(panel)` es común a todas las rutas de `/admin`: en una navegación de cliente
Next **no lo vuelve a ejecutar**, así que `headers()` no se leía otra vez y la ruta se quedaba
congelada en la de la primera carga.

Y era peor que un color: **`aria-current` también se quedaba mal**, así que un lector de pantalla
anunciaba la página equivocada.

El armazón pasa a ser de cliente y la ruta la da `usePathname()`, que sí se actualiza en cada
navegación. El comentario que justificaba lo anterior —«hacerlo cliente sería descargar el panel
entero en el navegador»— **tenía un agujero y estaba en producción**; el presupuesto que
protegía es el de la landing, y la landing no monta el panel.

Hay un caso e2e que lo fija, y **tiene que ser e2e**: con la ruta como prop, un test de
componentes siempre la recibe correcta y no vería nunca este fallo.

### El logotipo

Un «1» recortado de un cuadrado redondeado, del nombre. Va **en negativo**, lo que tiene una
consecuencia práctica: el dibujo entero es un solo color y hereda `currentColor`, así que sirve
igual en el naranja del oscuro, en el celeste del claro o en blanco sobre una foto, sin una
segunda versión que mantener.

Se dibujaron cuatro y se miraron a 64, 32 y **16 píxeles**, que es donde se decide. La versión de
trazo fino era la más bonita en grande y a 16 se emborronaba hasta ser una mancha.

**Con él se cierra la deuda del favicon** que estaba anotada: `app/icon.svg`, que Next recoge por
convención. Hasta ahora cada carga del panel y de la landing dejaba un 404 en los registros.

### Lo que enseñó

- **Un comentario puede justificar un fallo durante meses.** El de la cabecera explicaba muy bien
  por qué el armazón no era de cliente, y esa explicación era correcta salvo en el detalle que
  importaba: que el layout no se reejecuta al navegar. Ningún test lo miraba porque el
  razonamiento sonaba bien.
- **Y volví a caer en la trampa del propio repositorio.** Ejecuté la suite e2e con el servidor de
  desarrollo levantado, `.next` se reescribió por debajo, y la siguiente captura salió sin CSS.
  Parece un fallo del código y no lo es — está en `CLAUDE.md` con todas las letras, y van tres.

---

## El flake de la suite en paralelo, con su mecanismo ✅

**Cerrado** el 7 de septiembre de 2026, issue [#227](https://github.com/KthArg/uno-cms/issues/227).
Llevaba abierto desde #220 con una nota honesta: «el mecanismo sigue sin identificarse». Ya está
identificado, y resultó que la pregunta estaba mal planteada.

### El mecanismo, medido y no razonado

«Publicar todo» es una operación **global**: publica todas las entradas con cambios sin publicar,
sean del test que sean. `historial.spec.ts` T-E-2 termina dejando su entrada con borrador distinto
de lo publicado —que es exactamente lo que ese caso demuestra, que restaurar no publica— y T-E-3
comprueba después que deshacer vuelve a lo publicado.

En paralelo, el caso que pulsa ese botón se colaba entre los dos. Sobre `audit_log`:

```
11:03:38.421  restoreRevision  historial@…           faqs.historial-e2e
11:03:41.033  publishAll       panel-publica@…       published: ["faqs.historial-e2e", …]
11:03:42.160  revertDraft      historial-deshacer@…  faqs.historial-e2e
```

Lo publicado dejaba de ser lo que T-E-2 había dejado, y deshacer volvía a otra cosa. Eso explica
las siete filas de la tabla del issue, incluida la que más despistaba: **dar a cada test su propia
entrada no protege**, porque `historial` ya tenía la suya y aun así se la publicaron.

### Y por qué el primer arreglo no era el arreglo

Se sacó «Publicar todo» a un proyecto de Playwright que arranca cuando el resto ha terminado.
Funcionó: T-E-3 pasó **ocho pasadas seguidas** donde antes fallaba tres de tres.

Y entonces apareció otra cosa: `vista-previa.spec.ts` empezó a fallar **cinco de cinco**, con un
elemento de colección repetido en el iframe. No lo rompió ese cambio — lo destapó: la publicación
global lo venía tapando. Está medido y abierto aparte, en
[#246](https://github.com/KthArg/uno-cms/issues/246).

**Ahí se ve el error de planteamiento.** No había un flake: había una suite que reparte **un solo
sitio** entre cuatro navegadores. Cada arreglo destapa la colisión siguiente, y en las tres pasadas
de control sobre `main` limpio cayeron además `landing.spec.ts` y el cierre de sesión de
`panel-shell.spec.ts`, cada uno por su cuenta.

### Qué se hizo

`workers: 1` siempre, no solo en CI. Cuatro pasadas locales seguidas, 77 casos verdes cada una.

Se retira de `PENDIENTES.md` la deuda que defendía la asimetría diciendo que «la ejecución local es
la exigente». Era falso: no es más exigente, es **inválida** — mide colisiones que ningún uso real
provoca.

### Lo que enseñó

- **Una tabla de descartes no es un diagnóstico.** El issue tenía siete comprobaciones bien hechas
  y ninguna miraba el sitio correcto, porque todas buscaban qué tenían de raro los casos nuevos. Lo
  que lo resolvió fue preguntarle a `audit_log` **quién** había publicado, que es un dato que
  llevaba meses ahí.
- **Un arreglo verificado ocho veces puede seguir siendo el arreglo equivocado.** Si me hubiera
  parado en «T-E-3 pasa», habría cerrado el issue y entregado una suite que falla siempre por otro
  sitio.

---

## Con la web fuera, la raíz lleva al panel ✅

**Cerrado** el 7 de septiembre de 2026, issue [#248](https://github.com/KthArg/uno-cms/issues/248),
spec [14](specs/14-la-raiz-lleva-al-panel.md). Sin ADR nuevo: no contradice nada, aplica ADR-701.

### Qué funciona

- **Con `PREVIEW_URL` coherente, `/` responde 307 al panel** y el sitemap se queda vacío. Antes ese
  despliegue servía una copia de la landing de ejemplo **con el contenido real dentro**, en el
  dominio del panel, y un buscador podía encontrarla.
- **La condición es la misma que decide a dónde apunta el iframe** (`laWebViveFuera` es
  `urlDeVistaPreviaRemota() !== null` con nombre). No hay dos interruptores que puedan discrepar, y
  hay un caso que lo amarra recorriendo los cuatro estados.
- **Una configuración incoherente no redirige**: `PREVIEW_URL` con el origen fuera de
  `PREVIEW_ORIGINS` ya se trataba como no configurada desde la spec 08, y lo hereda.
- **Un despliegue recién hecho sigue enseñando el camino a `/setup`**, aunque la web remota esté
  puesta. Es la razón de que esto viva en la página y no en el middleware: la comprobación depende
  de la base de datos, y en edge no hay base de datos.

Nueve casos unitarios, tres mutaciones —el orden de las dos comprobaciones, la condición y el corte
del sitemap—, las tres muertas.

### Comprobado a mano, porque ningún e2e lo cubre

La suite arranca **un** servidor con la fase remota apagada (`playwright.config.ts`), que es lo que
mantiene válidos los casos de la vista previa local. Así que esto se verificó contra un build de
producción, cuatro arranques:

| Configuración                                  | `GET /`                                 | Sitemap     |
| ---------------------------------------------- | --------------------------------------- | ----------- |
| Sin `PREVIEW_URL`                              | 200, la landing                         | anuncia `/` |
| `PREVIEW_URL` coherente                        | **307 → `/admin`**                      | vacío       |
| `PREVIEW_URL` con origen fuera de la lista     | 200, la landing                         | anuncia `/` |
| Base recién creada, sin cuenta, con web remota | 200, «Este sitio todavía no está listo» | —           |

### Lo que enseñó

**Casi doy por roto un caso que estaba bien.** La cuarta comprobación falló la primera vez: un
despliegue con la base recién creada redirigía al panel en vez de enseñar el camino a `/setup`. El
código era correcto y el fallo era **mío**: `unstable_cache` persiste en `.next/cache`, y yo había
arrancado cuatro servidores sobre el mismo build apuntando a bases distintas, así que el cuarto
contestó con lo que cacheó el primero. Con `rm -rf .next/cache` en medio, pasa.

Va a `CLAUDE.md` como tercera trampa del entorno local, junto a las dos que ya estaban. Y deja una
lección sobre la anterior: **el test unitario de ese caso miraba el orden de dos líneas en el
fichero, no el comportamiento**, así que habría seguido verde en las dos direcciones. Es lo que
está escrito en su propia cabecera —que es análisis de texto y qué detecta— y es exactamente por
eso que la comprobación a mano no era opcional aquí.

### Y una segunda vez, con la misma trampa

Al correr la suite de e2e después de las comprobaciones a mano, dos casos de la landing se
pusieron en rojo. **El mismo `.next/cache`**: el arranque contra la base vacía había dejado
cacheado que el sitio no estaba configurado, y `pnpm build` no borra esa caché. Con
`rm -rf .next/cache`, verde.

Dos diagnósticos falsos por la misma causa en la misma tarde. Por eso está en `CLAUDE.md` y no
solo aquí.

Queda además una cosa que **no** se pudo reproducir: el e2e de cerrar sesión falló una vez de seis,
y también había fallado una vez en el control sobre `main` limpio. No depende del paralelismo, no
se capturó el mensaje, y cuatro pasadas completas posteriores salieron verdes. Se abre en
[#249](https://github.com/KthArg/uno-cms/issues/249) en vez de explicarlo, que es la lección de
#134.

## El movimiento de las interacciones ✅

**Cerrado** el 3 de septiembre de 2026, issue [#239](https://github.com/KthArg/uno-cms/issues/239),
spec [`15-movimiento.md`](specs/15-movimiento.md), ADR-820 a ADR-822.

Se pidió «pequeñas animaciones con las interacciones, para que se sienta más cómodo y premium».
Son dos peticiones: **cómodo** es información —el botón contesta antes que el servidor— y
**premium** es coherencia. La segunda es la que decide el diseño: lo que separa una interfaz cara
de una barata no es tener más movimiento, es que todo se mueva igual.

### Qué funciona

| Área                | Estado                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| El vocabulario      | Tres duraciones y una curva, en fichas. Los veintisiete `transition` sueltos pasan a `pulsable`/`transicion` |
| La pulsación        | 2 % de hundimiento en 90 ms, en botones y tarjetas                                                           |
| La entrada          | El contenido sube 6 px y aparece al cambiar de sección, con la `key` que la rearma                           |
| Los diálogos        | La caja crece un 2 % al llegar; el velo solo aparece — el fondo **no** escala                                |
| Movimiento reducido | Nada se mueve, **medido en un navegador**, con su pareja que impide que ese caso mienta                      |
| El coste            | Solo `transform` y `opacity`: todo va al compositor. Es CSS, así que la landing no cambia ni un byte         |

### Qué es frágil

1. **La `key={ruta}` del `<main>` remonta el contenido en cada navegación.** Es lo que se quiere
   hoy —cada ruta es una pantalla con su propio estado de servidor— y sería un fallo el día que
   cuelgue de ahí un borrador que deba sobrevivir a la navegación. Está escrito junto a la línea.
2. **La regla de «lo ancho no escala» es una convención, no una guarda.** Un test no puede saber
   cuánto mide un elemento sin renderizarlo. Está en la spec 15 §3 y junto a la fila que la
   motivó.

### Lo que enseñó

- **Un test puede pasar por no casar con nada.** Las expresiones que revisan el CSS buscaban un
  salto de línea seguido de llave, y en el árbol de trabajo de Windows el fichero está en CRLF:
  **ningún** `@keyframes` casaba, los tres bloques pasaban sin que nadie los mirara, y el test
  salía verde. Lo cazó una comprobación de que hubiera algo que revisar — que estaba puesta y
  **era demasiado débil**: contaba las dos familias juntas, y como las transiciones sí casaban, la
  suma daba «más de cero» igual. Ahora se cuentan por separado.
- **Y volvió a pasar lo de siempre, que van seis.** El primer T-237-3 contaba animaciones en
  marcha para comprobar que la entrada se rearma al navegar. Quitando la `key` del `<main>`
  seguía verde: las utilidades llevan `animation-fill-mode: both`, y una animación con relleno
  **no desaparece al terminar** — `getAnimations()` devolvía la de la carga inicial. El caso
  medía que la página había cargado alguna vez. Ahora mira la identidad del nodo, que es el
  mecanismo de verdad, y muere con la mutación.
- **Lo pulsado hay que capturarlo, no imaginarlo.** El hundimiento del 2 % se veía bien en los
  botones y en las filas de secciones desalineaba la fila pulsada de sus vecinas: en 1250 px de
  ancho, un 2 % son veinticinco. En el código las dos cosas eran exactamente la misma clase, así
  que solo se podía ver en una captura del estado pulsado (ADR-822).
- **El fallo del test también puede ser del test.** El caso de movimiento reducido reventó
  listando la página entera como culpable, y el corte funcionaba perfectamente: buscaba la cadena
  `0.00001s` y Chromium escribe `1e-05s`. Ahora compara números.

---

## El acceso con Google se retira entero ❌

**Retirado** el 7 de septiembre de 2026, por decisión de producto. No se descartó por un fallo: se
descartó porque **no se quiere todavía**, y una funcionalidad que no se quiere no se deja dormida
en el árbol.

### Qué se ha ido, y qué no

Se revierten los dos PR que lo trajeron —[#238](https://github.com/KthArg/uno-cms/pull/238) y
[#245](https://github.com/KthArg/uno-cms/pull/245)—: el módulo, el proveedor de Auth.js, el botón,
el logotipo, sus cuatro ficheros de tests, la spec de fase, los ADR-900 a ADR-902, las enmiendas a
`SPEC.md` y lo escrito en `.env.example`, `SETUP.md`, `SECURITY.md` y `PENDIENTES.md`.

`SPEC.md` vuelve por tanto a decir lo que decía antes: **ADR-004 sin enmendar**, «sin proveedor
externo», y su tabla de §7.1 vuelve a once filas.

**Lo que no se toca** es lo que nunca fue de Google aunque llegara por ahí: el `workers: 1` de la
suite (#227) y la tercera trampa de `CLAUDE.md` son de otras piezas y se quedan.

### Por qué esto está aquí y no en `DECISIONS.md`

Porque `DECISIONS.md` guarda las decisiones **en vigor**, y dejar los ADR-900 a ADR-902 allí diría
que este producto acepta un proveedor externo, que es exactamente lo contrario de lo que pasa. El
rastro va donde va lo que ocurrió.

Y hay rastro: el código entero vive en el historial de los PR #238, #245 y en el commit de este
mismo revert. Si algún día se retoma, no hay que reescribirlo — hay que **volver a probarlo**
contra Google de verdad, que es lo que nunca llegó a hacerse ([#237](https://github.com/KthArg/uno-cms/issues/237)).

### El hueco del 13

`docs/specs/` pasa de la 12 a la 14: la 13 era la spec de Google. Se deja el hueco en vez de
renumerar porque esos números están citados en ADR, tests, commits y PR ya cerrados, y moverlos
convertiría un hueco visible en una docena de referencias equivocadas.

### Lo que enseñó

**Apagar y retirar no son lo mismo, y la diferencia se paga en documentación.** Cuando se apagó
—con un interruptor, dos días antes— hubo que arreglar cuatro documentos que seguían describiendo
la función encendida. Al retirarla, esos mismos cuatro documentos se van solos con el revert.

O sea que el estado intermedio, «está pero apagado», es el caro de mantener: obliga a que cada
documento diga a la vez qué hace y que no está haciéndolo. Tenía sentido mientras la decisión
estaba abierta; en cuanto se cierra, cuesta menos no tenerlo.

---

## Los dos fallos de la vista previa y de salir ✅

**Cerrados** el 7 de septiembre de 2026, issues
[#246](https://github.com/KthArg/uno-cms/issues/246) y
[#249](https://github.com/KthArg/uno-cms/issues/249). Los dos llegaron como sospechas de flake y
**ninguno lo era**.

### #246 — el elemento duplicado no era una carrera

El issue lo tituló «cuando alguien más publica a la vez», y eso era una suposición mía. La causa es
determinista y estaba escrita en un comentario que mentía.

`collectionKeysInOrder` llevaba encima: «se descartan los mismos que descarta la lectura: un
elemento sin publicar no está en la lista». El código pedía la columna `published` y **no la
miraba**. `readCollectionForPreview` sí los descarta, así que **cada elemento sin publicar por
delante corría el índice una posición**.

El proveedor escribía entonces el borrador en el hueco de al lado. Si caía dentro de la lista,
sustituía al vecino **en silencio**; si caía fuera, `siguiente[5] = data` sobre una lista de cinco
la alargaba y el elemento salía dos veces. Eso último es lo que se vio.

Arreglado en el servidor —el filtro que el comentario prometía, con el elemento autorizado exento
porque la lectura también lo conserva— y con una segunda cerradura en el cliente: un índice fuera
de la lista ya no se escribe. Tres casos de integración contra Postgres real y tres de componente;
tres mutaciones, las tres muertas.

### #249 — salir no cerraba la sesión, y eso sí era un fallo de producto

Se abrió como «falló dos veces y no se reproduce». Se reprodujo: **2 de 140** pasadas del caso
aislado. Y con la sonda puesta, lo que se vio no era un test nervioso:

| Comprobación en el momento del fallo | Resultado                |
| ------------------------------------ | ------------------------ |
| `authjs.session-token` tras salir    | **presente**             |
| `GET /admin`                         | **200**, sin redirección |
| El panel en pantalla                 | **sí**                   |

La causa está en `@auth/core`: **cada lectura de sesión reemite la cookie**, sin throttling —
comprobado con una sonda, un `GET /admin` responde con `set-cookie` y un valor nuevo—. Así que una
petición en vuelo al pulsar «Salir» llega después del borrado y devuelve la cookie a su sitio. El
panel deja varias en vuelo: Next prefetcha los enlaces del menú.

Fuera de la suite eso significa que alguien pulsa «Salir», ve la pantalla de acceso, se levanta de
un ordenador compartido, y la sesión sigue viva.

Arreglado subiendo `password_version` al salir (ADR-910): una cookie resucitada lleva el `pwdV`
viejo y la rechaza el guard del panel. Cuesta que salir cierre la sesión en todos los dispositivos,
y eso está razonado en el ADR.

### Lo que enseñó

- **«No se reproduce» quería decir «no lo he intentado bastante».** El issue se abrió tras verlo
  dos veces en ejecuciones completas. Con `--repeat-each=30` sobre el caso aislado apareció a la
  primera tanda. La diferencia entre un flake y un fallo es a veces solo cuántas veces se ejecuta.
- **Y el test que lo cierra no reproduce la carrera: reconstruye su resultado.** Guarda la cookie
  de antes de salir y la vuelve a poner después, que es exactamente lo que consigue una respuesta
  que llega tarde. Un caso que esperara a la carrera tardaría cincuenta pasadas en decir algo y
  fallaría en CI una vez al mes; este falla siempre que el arreglo no esté — comprobado quitándolo,
  y falla con el mismo mensaje que tenía el flake original.
- **Los dos fallos venían de un comentario o de una suposición**, no de código difícil. El de #246
  estaba descrito con precisión encima de la línea que no lo hacía.

---

## El rojo que no era de nadie ✅

**Cerrado** el 7 de septiembre de 2026, issue [#167](https://github.com/KthArg/uno-cms/issues/167).
Llevaba abierto desde el 21 de agosto con una nota honesta: un test falló una vez, el nombre se
perdió al filtrar la salida, y no se reprodujo en ocho intentos.

### Lo que se encontró

El comando que documenta `CLAUDE.md` para la suite rápida —`vitest run --project unit --project
ui`— **sale con código 1 sin que falle ningún test**. En esta máquina, con 2 GB libres de 16:

| Invocación                          | Resultado                           |
| ----------------------------------- | ----------------------------------- |
| Los dos proyectos juntos, sin tope  | **8 de 8 en rojo**, una con SIGABRT |
| Los dos juntos, con cuatro procesos | 6 de 6 en verde                     |
| Cada proyecto por separado          | 6 de 6 en verde cada uno            |

La causa es memoria: sin tope, Vitest levanta un fork por núcleo menos uno —once aquí— y juntar
`unit` (Node) con `ui` (jsdom) mete todos esos entornos a la vez. Un worker muere con
`FATAL ERROR: Zone Allocation failed - process out of memory` y lo que se ve arriba es un
`Channel closed`.

**Y por eso CI nunca lo vio**: ejecuta `test:unit` y `test:ui` como dos comandos separados. La
asimetría estaba en el comando local, no en la máquina.

Arreglado con `maxWorkers: 4` en la configuración. Ocho pasadas del comando que fallaba, ahora en
verde. Cuesta un 22 % en el proyecto `unit`; en los runners de CI, con dos núcleos, no llega a
aplicarse.

### Lo que NO se ha demostrado, y hay que decirlo

**Que esto sea lo que pasó en agosto.** Aquel día la línea fue `1 failed | 498 passed`, o sea un
test **reportado como fallido**. Lo que se reproduce aquí es un rojo **sin** test fallido.

Se intentó forzar la otra presentación matando un worker a propósito con un heap de 40 MB: salieron
los mismos `Channel closed` y ni un test marcado como fallido. O sea que la inferencia razonable
—«el worker murió mientras corría un test y por eso salió con nombre»— **no está comprobada**.

Se cierra igualmente porque lo que se ha arreglado es un fallo real de la misma familia: rojos que
no significan nada, en ese mismo comando, sin cambio de código. Si vuelve a aparecer uno **con** el
nombre de un test, es otra cosa y merece su issue.

### Lo que enseñó

- **Un rojo sin fallos es peor que un rojo con fallos.** Enseña a ignorar los rojos, que es
  exactamente lo que el issue temía y por lo que se negó a cerrarse como «cosas que pasan».
- **La asimetría local/CI vuelve a ser la pista.** Es la tercera vez en este repositorio: el flake
  de #227, la trampa de `.next/cache` y ahora esto. Cuando algo falla en local y pasa en CI, lo
  primero que hay que mirar es si están ejecutando lo mismo — aquí no lo estaban, y la diferencia
  llevaba escrita en `CLAUDE.md` desde el principio sin que nadie la leyera como una diferencia.

---

## El almacén local, por fin en un navegador ✅

**Cerrado** el 7 de septiembre de 2026, issue [#170](https://github.com/KthArg/uno-cms/issues/170).
Estaba abierto desde el 21 de agosto con las tres salidas evaluadas y la conclusión de aceptarlo.

### Qué faltaba

El almacén local (ADR-700) guarda las imágenes en disco y **solo se enciende fuera de producción**.
La suite de e2e arranca con `next start`, o sea producción, así que ninguna de sus rutas se podía
ejercitar con un navegador. Lo cubierto eran los manejadores llamados directamente y la
bifurcación del editor con componentes; el bucle entero —elegir el fichero, que llegue, que la fila
se cree, que la imagen se vea— no lo cubría nada.

### Qué cambió respecto a cuando se aceptó

La salida que se descartaba por cara era «un segundo proyecto con `next dev`», y la que se
descartaba por peligrosa era meterle una puerta trasera a `usarAlmacenLocal()`. La segunda sigue
descartada por lo mismo: es la función que impide que este almacén se active donde haría daño.

Lo que ha cambiado es el coste de la primera. **No es un segundo proyecto dentro de la suite: es
una configuración aparte con un fichero de casos.** No alarga la suite normal ni un segundo, corre
en CI como un paso más del job que ya existe —mismo Postgres, mismos navegadores— y añade unos
veinte segundos.

Y la objeción de «ejercita un servidor que no se despliega» se disuelve al mirarla de frente:
**esto no se despliega nunca, por diseño**. Probar en desarrollo algo que solo existe en desarrollo
no es un compromiso, es el único sitio donde se puede probar.

### La pieza que lo hacía imposible, y ya no

`next dev` reescribe `.next`, que es la trampa que `CLAUDE.md` avisa: levantarlo mientras la otra
suite sirve desde ahí rompe la otra suite. Con `NEXT_DIST_DIR` cada una tiene su directorio y
conviven. Es una línea en `next.config.ts` y sin ella nada de esto era posible.

### Lo que enseñó

- **Escribí primero un caso que buscaba un texto en la pantalla —«disco» o «local»— y falló.**
  Estaba bien que fallara: la pantalla no dice en ningún sitio qué almacén hay detrás, así que ese
  caso se estaba inventando la señal. Lo que sí se observa desde el navegador es a dónde va la
  subida, y eso es lo que ahora comprueba.
- **Y una hora perdida por unas comillas.** `consultarValor` devuelve JSON, así que un `text` llega
  entrecomillado; el resto de la suite no se entera porque compara con `toContain`. Aquí la cadena
  se pedía por HTTP y salía un 404 contra `/%22/api/...%22`. Queda escrito junto al helper que lo
  decodifica.

---

## Los huérfanos del almacén, por fin visibles ✅

**Cerrado** el 7 de septiembre de 2026, issue [#206](https://github.com/KthArg/uno-cms/issues/206).
Abierto desde el 30 de agosto, salido de ADR-705.

### El problema

ADR-705 dejó **dos** escrituras de la fila de una imagen: la del navegador al terminar la subida y
el aviso `blob.upload-completed` de Vercel. Las dos pueden fallar, y si fallan las dos el fichero
está en el almacén y el CMS no lo tiene. Para el CMS esa imagen no existió, y no había forma de
enterarse.

### La decisión: enseña, no borra

Es la parte que el issue dejaba explícitamente sin decidir. `pnpm medios:huerfanos` lista lo que
sobra por cada lado y **no toca nada**, por dos motivos distintos:

- **Un objeto sin fila puede ser una subida en vuelo.** Entre que el fichero llega al almacén y que
  la fila se escribe pasan milisegundos, y el script no puede distinguir eso de un huérfano de hace
  un mes. Borrar ahí es destruir la foto de alguien mientras la sube.
- **Una fila sin objeto es un rastro, no basura.** Dice que hubo una imagen y ya no está; borrarla
  deja el mismo estado que si nunca hubiera existido.

Así que decide una persona, y lo que faltaba para eso era poder verlo.

### Funciona, y lo primero que hizo fue encontrar siete

Ejecutado contra la base de e2e encontró **siete objetos huérfanos** en `.uploads/` — de las
propias pruebas de esta sesión. Exactamente la clase de resto que el issue describía, y que hasta
ahora no salía en ningún sitio.

### Cómo está probado

- **La comparación**, que es donde está la decisión, es una función pura y tiene sus casos: los dos
  lados, los dos a la vez, y uno que exige que **compare conjuntos y no cuente** — dos listas del
  mismo tamaño y distinto contenido.
- **La lectura de la base**, contra Postgres real, incluida la mitad de T-206-3 que dice que mirar
  no escribe.
- **Sin almacén devuelve `null`, no una lista vacía.** La diferencia es todo el caso T-206-4: una
  lista vacía diría que el almacén está vacío y **todas** las filas saldrían como huérfanas — un
  informe alarmante y falso, que es peor que no tener informe.

Dos mutaciones, las dos muertas: la comparación convertida en un contador y el `null` convertido en
lista vacía.

### Lo que enseñó

**Una mutación que no se aplica se lee igual que una que sobrevive.** La primera pasada de M1 no
encontró el texto que iba a sustituir —la cadena no coincidía— y el comando salió sin decir nada,
que es indistinguible de «el test no la mató». Solo al pedirle la salida entera apareció el
`encontrado: 0`. Desde ahora, una mutación que no cambia el fichero es un fallo del método, no un
resultado.

---

## La contradicción del driver, cerrada con evidencia ✅

**Cerrado** el 7 de septiembre de 2026, issue [#43](https://github.com/KthArg/uno-cms/issues/43).
Era el issue abierto más antiguo del repositorio: del 13 de agosto, del primer día de M1.

### Qué decía

ADR-002 fija el driver de Neon por un motivo real —en serverless, un driver TCP abre una conexión
por invocación y agota el free tier— y `SPEC.md` §11.4 exige tests de integración contra un
Postgres efímero, que no habla ese protocolo. Lo que se probaría en CI no sería el código que se
despliega.

Se resolvió en su día con **ADR-200**: el driver se elige por destino y hacia arriba se expone el
mismo tipo de Drizzle, así que ni el esquema ni las consultas ni las actions saben cuál hay debajo.
Y el issue se dejó abierto con una condición explícita: _«hasta que M6 verifique en un despliegue
real que la rama de Neon funciona, que es lo único que los tests no pueden decir»_.

### Por qué se cierra ahora

**Porque esa verificación ya ocurrió y estaba anotada sin conectarla con este issue.** La suite de
humo de #207 corrió en verde contra `uno-cms.vercel.app`: entra con una cuenta de verdad, sube una
imagen, comprueba que sigue ahí al recargar y la borra. Eso es una lectura, una escritura y un
borrado **a través del driver de producción**, más T-207-4, que afirma que la base del despliegue
tiene el esquema.

Si la rama de Neon no funcionara, ninguno de esos cuatro casos pasaría.

### Lo que NO se cierra con esto, y queda en su sitio

Que ningún test **automático** ejercite ese driver. CI sigue corriendo contra Postgres local con
`node-postgres`, y lo único que toca la rama de Neon es una suite que hay que lanzar a mano.

Eso no es este issue: es [#207](https://github.com/KthArg/uno-cms/issues/207), que ya lo describe
—hace falta un despliegue de pruebas separado del de verdad y credenciales en el repositorio—. La
fila de `PENDIENTES.md` se reescribe para que apunte allí en vez de a un issue cerrado, que es como
un pendiente se disuelve.

### Lo que enseñó

**Un issue puede quedarse abierto después de resolverse.** Su condición de cierre se cumplió el día
que se ejecutó la suite de humo, y nadie volvió a leerla: quien la ejecutó estaba cerrando #207 y
no sabía que de paso cerraba el issue más antiguo del tablero.

Es el mismo modo de fallo que la regla 5 persigue en los comentarios, un nivel más arriba: **una
condición escrita en un sitio y cumplida en otro no se junta sola.**

---

## El contenido mixto, medido en vez de supuesto ✅

**Cerrado** el 8 de septiembre de 2026, issue [#255](https://github.com/KthArg/uno-cms/issues/255).

### La pregunta

La spec 08 §1 promete que los tres casos funcionan, y el mezclado —«CMS desplegado, web en
local»— es un panel servido por `https` embebiendo un `http://localhost`. Nuestra CSP lo permite y
eso está cubierto por tests; lo que nadie sabía es si el navegador lo bloquearía después por
**contenido mixto**, que tiene reglas propias.

Estaba anotado como «no se puede comprobar en local: hace falta un origen `https` de verdad». Es
falso: hace falta un origen `https`, no que sea de verdad.

### El montaje

Un certificado propio, un proxy `https` en el 3443 por delante del `next start` del 3100, y la
«web remota» en `http` servida a la vez en `localhost:4321` y en la IP de red de la máquina.

### El resultado

**Carga, y sin un solo aviso.**

Lo que lo convierte en una medida y no en una impresión es el control: en la misma página, un
iframe al **mismo servidor** por su IP de red —`http://10.x.x.x:4321`— sí produce
`Mixed Content: … requested an insecure frame`. O sea que el mecanismo estaba activo y lo que exime
a `localhost` es ser bucle local, como dice la especificación de contextos seguros.

| Origen del iframe, desde una página `https`             | Aviso de contenido mixto               |
| ------------------------------------------------------- | -------------------------------------- |
| `http://localhost:4321`                                 | **ninguno**                            |
| `http://10.x.x.x:4321` (mismo servidor, otra dirección) | sí                                     |
| El panel real, con su vista previa                      | **ninguno**, y el iframe enseña la web |

### Los dos intentos fallidos, que son la parte útil

**El primer control no valía.** Lancé Chromium con `ignoreHTTPSErrors` y comprobé que el iframe
cargaba. Antes de darlo por bueno probé un `fetch` inseguro a la IP de red — que Chrome bloquea
siempre— y salió **permitido**. O sea que en ese navegador no había refuerzo de contenido mixto y
mi medida no probaba nada: habría dado el mismo verde con la respuesta contraria.

Se rehízo confiando **ese certificado en concreto** por su huella SPKI, en vez de apagar la
seguridad del navegador. Ahí el control empezó a distinguir los dos orígenes.

**Y el segundo control tampoco es el que yo quería.** Buscaba enseñar que un `http` no loopback se
**bloquea**; lo que hace Chromium con los iframes es **avisar y cargar**. Así que lo demostrado no
es «bloquea todo menos localhost», es la asimetría: **para `localhost` no hay ni aviso, porque no
cuenta como contenido mixto**. Es exactamente lo que la pregunta necesitaba, y es menos de lo que
pretendía medir.

### Lo que enseñó

- **«No se puede comprobar en local» era una suposición, no un hecho.** Lo que hacía falta era un
  origen `https`, y eso son un certificado y quince líneas de proxy. La frase llevaba desde agosto
  en `PENDIENTES.md` sin que nadie la pusiera a prueba — y la escribí yo.
- **Un experimento sin control es una opinión con pasos.** El primer montaje daba el resultado
  correcto por el motivo equivocado, y solo se vio al preguntarle al navegador algo cuya respuesta
  ya conocía.

## Los temporizadores de la suite `ui`, con mecanismo en vez de estadística ✅

**Cerrado** el 8 de septiembre de 2026, issue [#276](https://github.com/KthArg/uno-cms/issues/276).

### La pregunta

`jsdom` subió de la serie 25 a la 30 —cinco mayores— en #174, el mismo día que apareció el flake
del autosave (#274). T-C-1 era el **único** caso de la suite que afirmaba que algo _todavía no_
había pasado apoyándose en tiempo real, y #275 lo pasó a reloj falso: o sea que tapó el único sitio
donde un cambio de comportamiento de los temporizadores se habría visto.

Lo probable era que fueran independientes. Pero probable no es comprobado, y aquí ya se cerró un
flake con un razonamiento convincente y equivocado (#134).

### Lo que se midió, y por qué no fue lo que el issue proponía

El issue pedía correr el T-C-1 viejo en bucle sobre dos árboles y comparar proporciones. Se hizo
—dos worktrees idénticos salvo `jsdom`, rondas **intercaladas** bajo la misma carga, para que la
deriva de la máquina afectara a los dos por igual—, pero antes salió algo más barato y más fuerte:
**preguntar de quién es el `setTimeout` que ven esos tests.**

| Entorno                               | `setTimeout === node:timers.setTimeout` |
| ------------------------------------- | --------------------------------------- |
| Proyecto `ui`, con jsdom **25.0.1**   | **sí**                                  |
| Proyecto `ui`, con jsdom **30.0.1**   | **sí**                                  |
| Una ventana de jsdom levantada a mano | no — pasa por `webIDLConversions`       |

Idénticos byte a byte, misma identidad, mismo constructor `Timeout`, y `window.setTimeout` es el
mismo objeto que el global. La tercera fila es la que convierte esto en una medida: el probe **sabe
decir que no**, y de hecho lo dice en cuanto se le pregunta por una ventana de verdad de jsdom.

### El motivo, que está en Vitest y no en jsdom

`populateGlobal` copia al global las propiedades de la ventana, filtrando así:

```js
if (skipKeys.includes(k)) return false;
if (k in global) return keysArray.includes(k); // choca con un global de Node
return true; // no choca → se copia de jsdom
```

O sea que **la lista `KEYS` solo se consulta para los nombres que chocan con un global de Node**.
`setTimeout` es uno de esos y no está en la lista: se descarta y el global conserva el de Node.
`document` y `requestAnimationFrame` no chocan con nada —Node no los tiene, comprobado en el
proyecto `unit`— y por eso de esos sí llega la versión de jsdom.

Las dos condiciones —que Node tenga `setTimeout`, y que Vitest no lo liste— **no dependen de la
versión de jsdom**. Por eso la respuesta no es «salió parecido en las dos», es que la subida no
podía cambiarlo.

### El dato que sí explica el flake, y corrige la cuenta del issue

Midiendo el reparto real de la pausa de 12 ms del T-C-1 viejo, 400 muestras por pasada:

| Máquina           | p50         | pasan de los 20 ms de la espera |
| ----------------- | ----------- | ------------------------------- |
| ociosa            | ~15,5 ms    | 0–1 de 400                      |
| con 16 quemadores | hasta 37 ms | **hasta 285 de 400**            |

O sea que **el margen nunca fue de 8 ms**: en Windows un `setTimeout(12)` ocioso ya tarda ~15,5 ms
por la resolución del reloj, así que el margen de verdad era de ~4,5 ms. Con la máquina cargada la
pausa se va a 30 ms y se come la espera entera. Los dos árboles dan el mismo reparto y se solapan
por completo: lo que mueve el número es la carga, no la versión.

### Lo que NO se ha demostrado, y hay que decirlo

- **El T-C-1 viejo no llegó a caer ni una vez** en el montaje local: 440 pasadas, 0 rojos, con las
  dos versiones. O sea que la comparación de proporciones que pedía el issue salió **vacía por los
  dos lados** y no distingue nada. Lo que cierra el issue es el mecanismo, no ese contraste.
- Tres ejecuciones no dieron salida, seguramente por la muerte de un worker bajo presión de memoria
  (#167). Se cuentan como perdidas, no como verdes.
- Las cifras de tiempo son de **Windows y Node 24**; CI es Linux. Lo que sí es independiente de la
  plataforma es la procedencia de los temporizadores, que depende de cómo Vitest arma el entorno.

### Lo que queda vigilándolo

`tests/ui/temporizadores-son-los-de-node.test.ts`, tres milisegundos, con su comprobación de que
puede fallar incluida en el propio fichero. Comprobado por mutación: metiendo el `setTimeout` de
jsdom en el global desde `tests/ui/setup.ts`, el aserto muere
(`- [Function setTimeout]` / `+ [Function anonymous]`).

### Lo que enseñó

- **La pregunta barata iba antes que el experimento caro.** El issue pedía reconstruir un árbol
  viejo y hacer decenas de pasadas; la respuesta estaba en una comparación de identidad que tarda
  tres milisegundos. Se hizo igual el experimento caro, y lo único que aportó fue confirmar que no
  aportaba nada.
- **Una comparación estadística que sale 0 contra 0 no es un empate, es un instrumento sin
  sensibilidad.** Si el mecanismo no hubiera aparecido, lo honesto habría sido escribir que no se
  pudo medir — como se hizo en #167.
- **La cuenta de los 8 ms que estaba en el issue era optimista.** El suelo del reloj de Windows se
  comía casi la mitad del margen antes de que la máquina hiciera nada.
- **Y la autorevisión cazó el mismo fallo que este repositorio ya tiene contado.** La primera
  versión del comentario explicaba que `requestAnimationFrame` llega de jsdom «porque está en la
  lista `KEYS`». Comprobé la pertenencia a la lista y di por buena la consecuencia sin medirla:
  llega porque Node no lo tiene, y la lista solo pinta en los nombres que chocan. La conclusión no
  cambiaba, pero era un comentario que explicaba un mecanismo con una causa que no es la causa —
  justo lo de `/api/media/upload`.

## La documentación, puesta al día contra el código ✅

**Cerrado** el 8 de septiembre de 2026, issue [#278](https://github.com/KthArg/uno-cms/issues/278).

### Cómo salió

Buscando dónde colocar lo de #276. La sección «Dónde está el trabajo ahora» lleva escrito _«Si
dice algo que ya no es cierto, es peor que si no existiera»_ — y era de las que estaban mal.

### Lo que decía y no era

| Documento       | Decía                                                           | Es                                             |
| --------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `PROGRESS.md`   | Tres cosas esperan a un despliegue (#43, #157, contenido mixto) | Las tres cerradas                              |
| `PROGRESS.md`   | El contenido mixto «no se puede mirar en local»                 | Medido en #255, y sin aviso                    |
| `PROGRESS.md`   | Abiertos #157, #170, #167, y «nueve» `post-mvp`                 | Cerrados los tres; quedan **ocho** `post-mvp`  |
| `PROGRESS.md`   | #19 y #207 «abiertos»                                           | Cerrados los dos                               |
| `PENDIENTES.md` | Diez filas de deuda viva con su issue                           | Ocho resueltas en el código                    |
| `DECISIONS.md`  | ADR-107 y ADR-200: «el issue queda abierto»                     | #19 y #43 cerrados                             |
| `DEVELOPER.md`  | El contenido mixto «nadie lo ha comprobado todavía»             | Medido, y remitía a una fila que ya no existía |
| `README.md`     | `SETUP.md` y `SECURITY.md` «(esqueleto, M6)»                    | 219 y 186 líneas escritas                      |

### Lo que no se borró, y por qué

**Dos filas parecían resueltas porque su issue estaba cerrado, y no lo estaban.** Es el fallo que
esta pasada tenía que evitar, no cometer:

- **Los topes de la pantalla de una colección.** `MAX_PUBLISH_ALL = 100` y `reorderItems` con 500
  siguen ahí, comprobado en el código. #119 cerró el encadenado de `publishAll` (ADR-600), que es
  otra cosa. La fila se queda como limitación aceptada, ya sin issue, y diciendo por qué.
- **La suite de humo no corre sola.** `test:humo` no aparece en `.github/workflows/`, comprobado.
  #207 se cerró **al entregar la suite**, y la fila se quedó apuntando allí: pareciendo seguida
  sin estarlo. Ahora la sigue [#279](https://github.com/KthArg/uno-cms/issues/279).

Las ocho que sí estaban hechas no se borran a secas: van a **«Deuda saldada»** con dónde se
comprueba que se cerró. Una fila que desaparece sin rastro deja la duda de si se arregló o se
olvidó, y este documento vive de poder contrastar lo que se dijo con lo que pasó.

### Lo que enseñó

- **El óxido no llega de golpe, llega por cerrar bien.** Ningún issue se cerró mal: #207 entregó
  su suite, #119 su encadenado. Lo que quedó atrás fue la fila que los citaba — y una fila que
  apunta a un issue cerrado **parece seguida y no lo está**, que es justo #162 → #164 otra vez.
- **«Cerrado como completado» no es prueba de que la deuda muriera.** De diez filas, dos seguían
  vivas con su issue cerrado. Comprobarlas contra el código costó cinco minutos; darlas por
  buenas habría borrado deuda real de la única lista que la registra.
- **La documentación tiene el mismo problema que un comentario que promete de más.** Al leer «no
  se puede comprobar en local» dos veces se deja de intentar, y eso ya pasó: la frase sobrevivió
  desde agosto hasta que alguien la puso a prueba y resultó ser un certificado y quince líneas de
  proxy.
