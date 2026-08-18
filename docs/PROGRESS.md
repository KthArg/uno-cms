# Progreso

Un apartado por hito. Se cierra al terminarlo, con tres respuestas: **qué funciona**, **qué
es frágil** y **qué habría que probar a mano**. Sin maquillar: el valor de este documento
depende por completo de que la columna de lo frágil sea creíble.

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

| Amenaza                     | Estado                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Fuerza bruta en login       | ✅ Lockout persistente + rate limit + Argon2id                                                                               |
| XSS vía contenido           | ✅ Cerrada en M1                                                                                                             |
| CSRF                        | ✅ Comprobación de origen en el middleware, sobre lo que ya hacen las Server Actions                                         |
| Clickjacking                | ✅ `frame-ancestors 'self'`, verificado sobre la respuesta real                                                              |
| Inyección SQL               | ✅ Regla de lint (M0) + Drizzle (M1)                                                                                         |
| **Escalada de privilegios** | ⚠️ **Abierta.** §7.1 pide "chequeo de rol en cada action", y las actions son de M3. M2 aporta que el rol exista y sea fiable |
| Robo de sesión              | ✅ Cookies, claim `pwdV`, cuenta borrada = sesión inválida                                                                   |
| **Abuso de uploads**        | ⚠️ **Abierta.** No hay uploads todavía; M4                                                                                   |
| Enumeración                 | ✅ Mismo resultado y mismo coste temporal en login, tokens y bootstrap                                                       |
| Secretos en cliente         | ✅ Frontera `server-only` (M0/M1)                                                                                            |
| Dependencias                | ✅ `pnpm audit` bloqueante                                                                                                   |

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

## M3 — API de contenido (server actions) ⏳

Pendiente. Aquí se activa `COVERAGE_ENFORCE=1` en CI (SPEC §11.4).

## M4 — Panel de administración ⏳

Pendiente.

## M5 — Landing de ejemplo y vista previa en vivo ⏳

Pendiente. Aquí se verifica ADR-107 y se cierra el issue #19.

## M6 — Endurecimiento, rendimiento y release ⏳

Pendiente. Aquí se escribe el modelo de amenazas completo en `docs/SECURITY.md` y se
verifican los seis criterios de `SPEC.md` §11.
