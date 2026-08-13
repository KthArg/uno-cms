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
2. **`pnpm/action-setup@v4` está anclada a Node 20 y GitHub ya lo marca deprecado** en cada
   ejecución. Cuando los runners lo retiren, CI se cae — y con `enforce_admins: true` eso
   significa que no se puede mergear nada hasta arreglarlo. Deuda con fecha de caducidad
   ajena.
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

## M1 — Núcleo de datos y configuración ⏳

Pendiente. Esquema Drizzle de SPEC §4 y migraciones, cliente Neon, `defineConfig`/`s.*` con
inferencia de tipos, `schema-gen` laxo y estricto, seed de singletons.

**Entra ya con deuda conocida:** el proyecto `integration` de Vitest todavía no gestiona
esquema ni limpieza entre tests; hay que resolverlo con las migraciones.

## M2 — Autenticación y seguridad base ⏳

Pendiente.

## M3 — API de contenido (server actions) ⏳

Pendiente. Aquí se activa `COVERAGE_ENFORCE=1` en CI (SPEC §11.4).

## M4 — Panel de administración ⏳

Pendiente.

## M5 — Landing de ejemplo y vista previa en vivo ⏳

Pendiente. Aquí se verifica ADR-107 y se cierra el issue #19.

## M6 — Endurecimiento, rendimiento y release ⏳

Pendiente. Aquí se escribe el modelo de amenazas completo en `docs/SECURITY.md` y se
verifican los seis criterios de `SPEC.md` §11.
