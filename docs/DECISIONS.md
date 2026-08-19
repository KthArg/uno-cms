# Decisiones de arquitectura (ADR)

Registro de las decisiones **no cubiertas por `SPEC.md`**. Las decisiones que sí están en
la spec viven allí (`SPEC.md` §1, ADR-001…ADR-007) y no se duplican aquí.

Formato: contexto (por qué hubo que decidir) → decisión → consecuencias (incluido lo malo).
Numeración: ADR-1xx para M0, ADR-2xx para M1, y así sucesivamente.

---

## ADR-100 — Fijar Next.js 15, no la mayor siguiente

**Contexto.** `SPEC.md` §2 dice "Next.js 15 (App Router, React 19, Server Actions)". En el
momento de escribir esto ya existe una mayor posterior de Next disponible en npm.

**Decisión.** Se fija `next@15.5.x`. La spec nombra la mayor de forma explícita y la regla
de proceso dice que ante ambigüedad manda la spec; aquí no hay ni ambigüedad.

**Consecuencias.** El proyecto arranca con una mayor que no es la última. A cambio, todo el
material de referencia del que parte la spec (App Router de Next 15, comportamiento de
`unstable_cache`, `revalidateTag`, Server Actions) coincide con lo implementado. Subir de
mayor es un trabajo propio, con su ADR y su PR, y no se hace dentro del MVP.

---

## ADR-101 — TypeScript 5.9

**Contexto.** `SPEC.md` §2 exige "TypeScript estricto (`strict: true`,
`noUncheckedIndexedAccess`)" sin fijar versión. Existe una mayor de TypeScript posterior a
la serie 5.

**Decisión.** `typescript@5.9.x`.

**Consecuencias.** Es la serie con la que `eslint-config-next` 15, `typescript-eslint` y
`vitest --typecheck` están probados. Se renuncia a las mejoras de la mayor siguiente;
ninguna es necesaria para el MVP. Riesgo asumido: en algún momento habrá que migrar.

---

## ADR-102 — Vitest 3.2

**Contexto.** `SPEC.md` §2 dice "Vitest" sin versión. Hay una mayor posterior.

**Decisión.** `vitest@3.2.x` con `@vitest/coverage-v8` de la misma serie, usando la API de
`projects` para separar `unit` de `integration`.

**Consecuencias.** `projects`, `--typecheck` y los umbrales de cobertura por glob que
exige `SPEC.md` §11.4 están disponibles y estables en 3.2. Se evita estrenar una mayor en
la pieza que sostiene el criterio de aceptación de cobertura.

---

## ADR-103 — ESLint 9 con flat config

**Contexto.** `SPEC.md` §2 pide "ESLint (config next + security)". `eslint-config-next` de
la serie 15 declara compatibilidad con ESLint 8 y 9; existe una mayor posterior de ESLint
que ese paquete todavía no soporta.

**Decisión.** `eslint@9.x` con `eslint.config.mjs` (flat config).

**Consecuencias.** Compatibilidad garantizada con el config oficial de Next. Flat config es
el formato que ESLint mantendrá a futuro, así que la migración posterior es menor.

---

## ADR-104 — Auto-revisión sin aprobación formal

**Contexto.** La regla de proceso 2 exige, tras abrir cada PR, cambiar de rol a revisor,
dejar los hallazgos como comentarios de review reales, corregirlos y "solo entonces
aprobar y mergear". GitHub **rechaza** que el autor de un PR lo apruebe
(`Can not approve your own pull request`). El repositorio tiene un único actor.

**Decisión.** La auto-revisión se materializa como:

1. `gh pr review --comment` con los hallazgos reales sobre el diff completo, incluida la
   pasada por el checklist de `SPEC.md` §7.1.
2. Commits de corrección sobre la misma rama, referenciados en el hilo.
3. Un comentario final que declara la revisión cerrada y enumera lo que queda como riesgo
   conocido.
4. `required_approving_review_count: 0` en la protección de rama.

**Consecuencias.** El requisito literal de "aprobación" no se cumple porque es imposible
con un solo actor; lo que sí se cumple —y es lo que aporta valor— es que cada PR tiene una
pasada de revisión escrita y trazable. **Brecha residual honesta:** no existe un segundo
par de ojos. Ningún hallazgo se descubre por contraste con otra persona.

---

## ADR-105 — `enforce_admins: true` en la protección de `main`

> **Este ADR sustituye a su primera versión, que decidía `enforce_admins: false`.** La
> decisión original era incorrecta y el caso de prueba T-08-1 lo demostró. Se conserva el
> razonamiento fallido porque explica por qué se llegó a él.

**Contexto.** El repositorio tiene un único mantenedor, que además es admin. Con
`enforce_admins: false`, las reglas de protección (PR obligatorio, check `ci`, conversación
resuelta, historial lineal) quedan activas para cualquiera **menos** para él.

El razonamiento inicial fue: si alguna vez se exigieran aprobaciones y solo hay una
persona, `enforce_admins: true` dejaría el repositorio en bloqueo total, porque nadie puede
aprobar su propio PR. Se prefirió dejar la puerta abierta.

**Lo que pasó al ejecutar T-08-1.** Con `enforce_admins: false`, un `git push origin main`
directo **entró sin resistencia**. No fue una brecha teórica: quedó un commit vacío en el
historial de `main`, y para quitarlo hubo que habilitar force-push temporalmente
—`allow_force_pushes: false` sí se aplica a los admins, a diferencia del requisito de PR—.
El primer intento serio de saltarse la barrera la atravesó, y no a propósito: fue el propio
test el que la cruzó.

El razonamiento inicial tenía además un error de hecho: el bloqueo total que temía requiere
`required_approving_review_count > 0`, y ese valor es **0** (ADR-104). Se estaba protegiendo
contra una configuración que no existe, a costa de anular la protección que sí existe.

**Decisión.** `enforce_admins: true`. Ni siquiera el mantenedor puede hacer push directo a
`main`; todo pasa por PR con `ci` en verde.

La configuración completa vive versionada en
[`.github/branch-protection.json`](../.github/branch-protection.json), de modo que es
auditable en el repositorio y reaplicable con un solo comando, en vez de ser un ajuste
invisible en la interfaz de GitHub.

**Consecuencias.**

- La protección pasa de ser una barrera de proceso a un control técnico real. T-08-1
  verificado: `GH006: Protected branch update failed`.
- **Riesgo asumido:** si el pipeline se rompiera por una causa ajena (por ejemplo, la
  retirada de Node 20 en los runners, que ya afecta a `pnpm/action-setup@v4`), no se podría
  mergear nada hasta arreglarlo. La salida sería desactivar la protección temporalmente
  —cosa que un admin sí puede hacer, porque `enforce_admins` restringe las operaciones de
  git, no la edición de la configuración—. Es una salida deliberada y con fricción, que es
  justo lo que se quiere.
- **Brecha residual, ahora sí la única:** un admin puede desactivar la protección, hacer lo
  que quiera y volver a activarla. Ningún ajuste de GitHub lo impide en un repositorio de
  un solo dueño. La diferencia con la situación anterior es que ahora saltársela exige tres
  actos deliberados y deja rastro en el registro de auditoría del repositorio, en lugar de
  ocurrir con un `git push` distraído.

---

## ADR-106 — `RichText` vive en `cms/preview/`, no en `cms/ui/`

**Contexto.** `SPEC.md` §6.3 introduce `<RichText value={...} />` como parte del contrato
con los componentes de la **landing**: convierte el JSON de ProseMirror a HTML pasando
siempre por `sanitize.ts`. Pero `SPEC.md` §3 no le asigna ubicación en el árbol, y la
decisión no es cosmética por dos razones:

1. La regla de ESLint que prohíbe `dangerouslySetInnerHTML` fuera de una allowlist
   (§7.1) necesita una ruta literal, y esa regla se implementa en el issue #4.
2. Si `RichText` cayera en `cms/ui/` —el árbol del panel— los componentes públicos de la
   landing importarían desde el árbol del panel, lo que choca con `SPEC.md` §8: "el
   visitante jamás descarga código del panel".

**Decisión.** `cms/preview/RichText.tsx`.

`cms/preview/` ya alberga `useContent.ts`, que tiene exactamente la misma naturaleza:
código de cliente, isomorfo, consumido por los componentes de la landing tanto en
producción como en la vista previa. `RichText` pertenece a ese conjunto. La alternativa
—crear un `cms/render/`— resolvía lo mismo pero inventaba un directorio que `SPEC.md` §3
no contempla, y la regla es no desviarse del árbol de la spec sin necesidad.

**Consecuencias.** El nombre del directorio queda algo desafortunado: `cms/preview/`
contiene código que también corre en producción. Se asume a cambio de no tocar el árbol de
la spec. Consecuencia operativa: `cms/preview/` es el único árbol de `cms/` que **no**
lleva `server-only`, y así queda anotado en el documento de fase §3.3 y §3.5. Que
`RichText` pueda ser isomorfo sin violar §7.1 depende de ADR-107.

---

## ADR-107 — El richtext se renderiza como elementos de React, nunca como cadena de HTML

**Contexto.** Registrado en detalle en el issue #19 (`spec-question`). En resumen, tres
afirmaciones de `SPEC.md` son incompatibles: §6.3 dice que `RichText` sanea "siempre" con
`sanitize.ts`; §7.1 obliga a que `cms/security/` sea `server-only`; y §6.1 exige que en
`/preview` el contenido tecleado se renderice **en el cliente**, sin red ni BD. Un
componente de cliente no puede llamar a un módulo server-only.

Se descartaron dos salidas: hacer `sanitize.ts` isomorfo (viola §7.1 de frente) y no
sanear en la preview (un XSS en la preview es un XSS same-origin con la sesión del editor).

**Decisión.** El renderizador recorre el JSON de ProseMirror y emite **elementos de
React** según la allowlist de nodos y marcas de §6.3 (`p`, `strong`, `em`,
`a[href http/https/mailto]`, `ul`, `ol`, `li`, `h2`–`h4`, `blockquote`); lo que no está en
la allowlist se descarta. Nunca se construye una cadena de HTML, así que no se usa
`dangerouslySetInnerHTML` en ninguna parte del proyecto.

`cms/security/sanitize.ts` sigue existiendo y sigue siendo server-only: su trabajo es
sanear el **JSON al guardar** (podar nodos y marcas fuera de allowlist, validar el
protocolo de los `href` contra `javascript:`), que es lo que §7.1 llama "sanitización
server-side en save".

**Consecuencias.**

- La exigencia de §7.1 de sanear "en save Y en render" se cumple con una garantía más
  fuerte: en render no se sanea una cadena, es que no hay cadena que sanear. React escapa
  el texto por defecto y no queda ningún punto de inyección de markup.
- **Desviación de §2:** `rehype-sanitize` deja de ser necesario y no se instala, porque no
  hay "HTML derivado" sobre el que operar. Es la única desviación del stack que introduce
  esta decisión.
- **Efecto en M0:** la regla de ESLint del issue #4 prohíbe `dangerouslySetInnerHTML` sin
  allowlist. Es más estricta que el criterio de aceptación original del issue, no más laxa.
- **Pendiente de verificación:** que la salida C se sostenga en la práctica no se sabrá
  hasta implementar el renderizador en M5. El issue #19 queda abierto hasta entonces.

---

## ADR-200 — Driver de base de datos según el destino

**Contexto.** Registrado en detalle en el issue #43 (`spec-question`). ADR-002 fija
`@neondatabase/serverless` (HTTP) con un motivo real: en serverless, un driver TCP abriría
una conexión por invocación y agotaría el free tier de Neon. `SPEC.md` §11.4 exige tests de
integración contra Postgres efímero. El driver HTTP de Neon no habla con un `postgres:16`
en un runner: no son el mismo protocolo.

Se descartaron: usar `node-postgres` en todas partes (rompe el motivo de ADR-002) y montar
el proxy HTTP de Neon en CI (una imagen de terceros en el camino crítico de todos los PR,
imposible de arreglar desde este proyecto si se rompe).

**Decisión.** `cms/db/index.ts` selecciona el driver y expone **el mismo tipo** de Drizzle
hacia arriba. La selección es explícita —variable de entorno `DB_DRIVER` con valores
`neon` y `pg`— y la detección por host solo actúa como valor por defecto cuando no se
declara. Adivinar el driver sin poder forzarlo sería frágil justo donde no conviene.

> **Corregido tras el issue #53.** La primera versión de este ADR decía "Neon **HTTP** en
> producción", siguiendo el paréntesis de ADR-002. Estaba mal: el driver HTTP de Neon **no
> soporta transacciones** —cada consulta va en una petición independiente, así que no hay
> sesión donde abrir un `BEGIN` ni donde sostener un `FOR UPDATE`— y `SPEC.md` §4 exige que
> toda mutación corra en transacción con bloqueo de fila para serializar publicaciones
> concurrentes.
>
> La rama de producción usa el `Pool` del mismo paquete sobre **WebSocket**
> (`drizzle-orm/neon-serverless`), que sí soporta transacciones interactivas. Sigue siendo
> el paquete que ADR-002 nombra y sigue pensado para serverless, pero **la palabra "HTTP"
> de ADR-002 deja de ser cierta**, y con ella su "sin pool que agotar": vuelve a haber un
> pool que vigilar en producción. Es el precio de cumplir §4.
>
> Efecto lateral bueno: la rama de test y la de producción pasan a ser más parecidas, lo
> que estrecha —sin cerrarla— la brecha que este mismo ADR declara abajo.

Esto no es un rodeo a ADR-002: es la costura que ADR-002 ya describía cuando decía
"detrás de una interfaz `db/` para no acoplar".

**Consecuencias.**

- El esquema, las consultas y las acciones no saben qué driver hay debajo.
- **`typecheck` NO detecta divergencias entre drivers.** La primera implementación declaraba
  la unión de ambos tipos con ese argumento, y no funcionaba: TypeScript no resuelve una
  llamada sobre la unión de dos firmas, así que `onConflictDoNothing({ … })` fallaba con
  "Expected 0 arguments". Y el argumento tampoco se sostenía, porque lo que la unión
  detectaba era divergencia de nombres de clase, no de capacidades. Se declara un solo tipo
  y una conversión acotada. Lo que protege de una divergencia real es el despliegue de
  verificación de M6, no el compilador.
- **Brecha residual honesta:** los tests de integración ejercitan esquema, consultas y
  migraciones, pero **no el driver de producción**. Un fallo específico del driver HTTP de
  Neon no lo atraparía CI. Lo cubre el despliegue de verificación de M6, no los tests, y
  por eso el issue #43 queda abierto hasta entonces.
- Una dependencia más (`pg`), solo en desarrollo y test.

---

## ADR-201 — Unicidad de email por índice sobre `lower(email)`, sin `citext`

**Contexto.** `SPEC.md` §4 comenta, junto a la columna `email`, "citext en migración; unique
lower(email)". Las dos cosas a la vez son redundantes: `citext` es un tipo que ignora
mayúsculas, y un índice único sobre `lower(email)` consigue lo mismo sin cambiar el tipo.

**Decisión.** Solo el índice único sobre `lower(email)`, sobre una columna `text`. Las
consultas de búsqueda por email comparan también por `lower()`.

**Consecuencias.** No se depende de que la extensión `citext` esté disponible ni instalada
en el Postgres de destino, cosa que no controlamos en un despliegue auto-hospedado. A
cambio, cualquier consulta que busque por email debe acordarse de usar `lower()`: si alguien
lo olvida, la consulta no fallará, simplemente no encontrará al usuario. Es un fallo
silencioso, y por eso el acceso por email se concentrará en una única función en `cms/auth/`
en M2 en lugar de repartirse por el código.

---

## ADR-202 — Regla de presencia: `required`, `default` y opcionalidad

**Contexto.** `SPEC.md` §5.1 usa `required: true` en unos campos y `default: true` en otro,
y §5.1 exige derivar dos esquemas Zod —laxo para guardar borradores, estricto para
publicar— más los tipos TypeScript. Qué significa cada combinación no está escrito.

**Decisión.** Una sola regla, de la que se derivan tipos y ambos esquemas:

| Declaración      | Tipo TS          | Laxo (borrador)      | Estricto (publicar)        |
| ---------------- | ---------------- | -------------------- | -------------------------- |
| `required: true` | `V`              | opcional             | obligatorio y **no vacío** |
| `default: x`     | `V`              | opcional, se rellena | opcional, se rellena       |
| ninguno          | `V \| undefined` | opcional             | opcional                   |

"No vacío" es más que "presente" **para los tipos que llevan contenido**: una cadena de
espacios no cuenta, un `RichTextDoc` sin texto tampoco, y una imagen sin `url` tampoco. Un
editor que teclea un espacio en el título y publica no debería pasar la puerta.

Para `boolean` y `number`, en cambio, **presente es suficiente**. `false` y `0` son valores
legítimos, y aplicarles una comprobación de veracidad haría imposible publicar un booleano
obligatorio en `false` o una valoración de `0`. La tabla completa por tipo está en el
documento de fase §3.2; se detalla ahí y no aquí porque es donde la va a leer quien
implemente.

`required` junto a `default` se **rechaza** al construir la config, con un mensaje que
nombra el campo: la combinación no tiene sentido —el default satisface siempre el
requisito— y aceptarla en silencio dejaría al desarrollador creyendo que ha marcado algo
como obligatorio cuando no lo ha hecho.

**Consecuencias.** El tipo que ve la landing (`Content<K>`) refleja el esquema **estricto**,
porque la landing solo lee contenido publicado y publicado implica estricto superado. El
borrador tiene su propio tipo (`Draft<K>`), con todo opcional. Son dos tipos distintos a
propósito: confundirlos es cómo se acaba renderizando `undefined` en producción.

---

## ADR-203 — Los estados se garantizan con `CHECK`, no solo con el `enum` de Drizzle

**Contexto.** Registrado en el issue #48 (`spec-question`). ADR-003 afirma que "la BD
garantiza integridad estructural (claves, **estados**, versiones)". `SPEC.md` §4 escribe
esos estados como `text('role', { enum: ['admin', 'editor'] })`, y el `enum` de `text()` en
Drizzle es **solo de TypeScript**: no genera tipo enum de Postgres ni restricción alguna.

No es una sospecha: al escribir T-40-6 comprobé que Postgres acepta sin rechistar un
`role = 'superadmin'` y un `status = 'publicado'`, y que `pg_constraint` sobre `users` solo
devolvía la clave primaria.

Importa porque `role` decide quién invita usuarios, cambia roles y toca ajustes
(`SPEC.md` §5.3), y §7.1 lista la escalada de privilegios entre las amenazas. Un rol
desconocido no falla de forma ruidosa: se comporta como el `else` de cada comprobación, que
según cómo esté escrito el código puede ser inocuo o desastroso.

Se descartó `pgEnum`, que sería más fuerte pero cambia la declaración de §4 y convierte
añadir un valor en una migración incómoda (`ALTER TYPE ... ADD VALUE` no admite borrar
valores y arrastra restricciones transaccionales).

**Decisión.** La columna se queda como la escribe §4 —`text(..., { enum })`, que aporta el
tipo— y se le añade una restricción `CHECK` que aporta la garantía. drizzle-kit la genera y
la versiona en la migración como cualquier otro cambio.

**Consecuencias.**

- La lista de valores queda escrita **dos veces** en el mismo fichero: en el `enum` y en el
  literal del `CHECK`. Derivar una de otra exigiría `sql.raw`, que este proyecto prohíbe por
  regla de lint (§7.1), y saltarse esa regla para ahorrar una duplicación de dos palabras
  sería un mal cambio.
- La divergencia entre ambas la detecta un test de integración que lee
  `pg_get_constraintdef` y lo compara con las constantes de TypeScript, en los dos sentidos.
  Es una garantía por test y no por construcción; se dice tal cual.
- Un valor nuevo exige tocar tres sitios (constante, `CHECK`, migración). Es fricción
  deliberada sobre la columna que decide los permisos.

---

## ADR-300 — Parámetros de Argon2id

**Contexto.** ADR-004 fija Argon2id "con parámetros OWASP" sin dar números. Los parámetros
son la diferencia entre un hash que cuesta atacar y uno que no, así que dejarlos al criterio
del momento es dejarlos sin decidir.

**Decisión.** `m = 19456` KiB (19 MiB), `t = 2`, `p = 1`, en una constante única de
`cms/auth/passwords.ts`.

Es el perfil de memoria moderada que recomienda OWASP para Argon2id. Se elige sobre los
perfiles de más memoria porque el destino de despliegue es una función serverless de Vercel
con límite de memoria, y un `hash` que agote la memoria de la función convierte el login en
un error 500 — o sea, en una denegación de servicio autoinfligida en el peor momento posible.

**Consecuencias.**

- Subir los parámetros más adelante es fácil y no invalida los hashes existentes: la cadena
  de Argon2 lleva sus propios parámetros dentro, así que los antiguos se siguen verificando.
  **Bajarlos exige un ADR nuevo.**
- No se implementa rehash progresivo al iniciar sesión. Es lo correcto cuando se suben los
  parámetros, y hoy no hay parámetros antiguos que migrar. Queda anotado para cuando los
  haya.
- 19 MiB por verificación limita cuántos logins concurrentes caben en una función. Es un
  coste consciente: el objetivo es precisamente que verificar sea caro.

---

## ADR-301 — Columna `password_version` para invalidar sesiones

**Contexto.** `SPEC.md` §7.1, "Robo de sesión", exige "invalidación al cambiar contraseña
(claim `pwdV`)". Un JWT es autónomo por definición: el servidor no guarda estado de sesión,
así que no hay nada que borrar cuando alguien cambia su contraseña. Sin un contador contra
el que comparar, las sesiones robadas siguen vivas hasta que expiren, y cambiar la contraseña
—que es lo que hace cualquiera al sospechar que le han entrado— no sirve de nada.

`SPEC.md` §4 no contempla la columna que hace falta.

**Decisión.** Se añade `password_version integer not null default 0` a `users`, con su
migración. El JWT lleva el valor en el claim `pwdV`; cada petición autenticada lo compara con
el de la fila. `changePassword` lo incrementa.

**Consecuencias.**

- **Cada petición autenticada lee la fila del usuario.** Eso contradice en parte la ventaja
  del JWT autónomo y añade una consulta por petición al panel. Se acepta: el panel no está
  en el camino crítico de rendimiento —la landing pública no autentica nada (§8)— y la
  alternativa es que cambiar la contraseña no expulse a nadie.
- Es una desviación de `SPEC.md` §4, que es la tabla de referencia del esquema. Queda
  anotada también en el documento de fase.
- Si la lectura por petición resultara cara en M4, la salida es cachearla por unos segundos,
  no quitarla: una ventana de segundos es aceptable, una de siete días no.

---

## ADR-302 — Política de contraseñas sin exigencias de composición

**Contexto.** `SPEC.md` §5.3 pide, para `changePassword`: "≥ 12 chars, chequeo contra lista
de comunes". No menciona mayúsculas, dígitos ni símbolos.

**Decisión.** Se implementa exactamente eso y **no se añaden** exigencias de composición.

No es pereza: las guías actuales (NIST SP 800-63B entre ellas) las desaconsejan
explícitamente, porque empujan a patrones predecibles —la mayúscula al principio, el número
y el símbolo al final— que reducen el espacio de búsqueda real en vez de ampliarlo. La
longitud y el rechazo de contraseñas conocidas hacen más trabajo que cualquier regla de
composición.

**Consecuencias.**

- Alguien puede elegir `abcdefghijklm`: doce caracteres, no está en la lista de comunes, y
  es mala. La lista embebida acota el problema pero no lo cierra. Un medidor de entropía
  sería mejor y es post-MVP.
- La lista embebida es finita y envejece. Actualizarla es trabajo manual, y no hacerlo no
  produce ningún síntoma visible. Es una deuda silenciosa y por eso se escribe aquí.

---

## ADR-303 — Degradación del rate limit sin Upstash

**Contexto.** `SPEC.md` §2 admite "@upstash/ratelimit + Vercel KV (opcional) con fallback
in-memory" y exige "degradación documentada". Esto es esa documentación.

**Decisión.** Con `KV_REST_API_URL` definida, el contador es distribuido. Sin ella, vive en
memoria del proceso.

**Consecuencias, dichas sin adornos.**

- En serverless, **cada instancia tiene su propio contador**. Con N instancias vivas, el
  límite efectivo de "5 intentos por 15 minutos" pasa a ser 5 × N. Un atacante que genere
  carga suficiente para que Vercel escale multiplica su presupuesto de intentos, y no
  necesita saber que lo está haciendo.
- **Por eso el rate limit no es la defensa principal contra la fuerza bruta.** La defensa es
  el lockout incremental de §7.1, que vive en la base de datos: es común a todas las
  instancias, sobrevive a los reinicios y no se puede diluir escalando. El rate limit
  protege del ruido; el lockout, del ataque.
- La degradación **se anuncia en el arranque**, una vez, en los logs. Una degradación de
  seguridad silenciosa es peor que no tener la protección, porque quien despliega cree que
  la tiene.

> **Ampliación al implementarlo (#57).** El backend distribuido **no se implementa en M2**,
> y queda registrado en el issue #65 en vez de darse por hecho. El motivo: no hay ninguna
> instancia de Upstash contra la que ejercitarlo, ni en local ni en CI, así que sería código
> de seguridad sin un solo test **en el módulo que decide cuántas veces se puede intentar
> adivinar una contraseña**.
>
> Su modo de fallo es peor que no tenerlo: una integración mal hecha —una clave mal formada,
> un error de red tratado como "permitido"— dejaría de aplicar el límite y el sistema
> seguiría pareciendo protegido. La degradación en memoria, en cambio, es conocida, está
> medida y avisa de sí misma.
>
> Lo que sí queda: la interfaz `RateLimiter`, de modo que añadir el backend es implementarla
> sin tocar a quien la consume.

---

## ADR-400 — Las actions devuelven un resultado, no lanzan

**Contexto.** `SPEC.md` §5.3 dice que "los errores se devuelven como `{ ok: false, code, message }` con mensajes genéricos". No dice qué pasa con las excepciones que nadie previó.

Y es la parte que importa: una excepción no capturada dentro de una Server Action se convierte en un error genérico de Next que el panel no puede explicar. El editor ve "algo ha fallado" sin saber si su texto se guardó, y en un CMS con autosave esa duda es peor que el fallo.

**Decisión.** Un envoltorio único captura todo y devuelve `{ ok: false, code: 'INTERNAL' }`. El detalle del error va al log del servidor y **nunca a la respuesta**.

Catálogo de códigos, con lo que revela cada uno:

| Código                                      | Revela                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL`  | Nada                                                                |
| `FORBIDDEN`                                 | Que la operación existe. Aceptable: quien lo recibe ya tiene sesión |
| `NOT_FOUND`                                 | Deliberadamente ambiguo entre "no existe" y "no tienes permiso"     |
| `VALIDATION_FAILED`                         | Solo campos del propio contenido del usuario                        |
| `VERSION_CONFLICT`                          | Que hay otro editor. Es exactamente el punto                        |
| `NEVER_PUBLISHED`, `LAST_ADMIN`, `CONFLICT` | Estado del propio sitio, nada sensible                              |

**Consecuencias.**

- El panel puede reaccionar a cada caso sin adivinar, que es lo que necesita el flujo de SPEC §9 ("Otra persona guardó cambios mientras editabas" → ofrecer recargar).
- **Coste real:** las actions dejan de poder usar `throw` como control de flujo, y eso obliga a propagar resultados a mano por dentro. Es más verboso y es el precio de que ningún camino se escape sin convertirse en un código.
- `message` va en español llano dirigido al editor, no en jerga. Un `code` sirve al panel; un `message` sirve a la persona.

---

## ADR-401 — `publishAll` es todo-o-nada por entrada, no global

**Contexto.** `SPEC.md` §5.3 dice de `publishAll`: "iterando entries con `status='changed'`; **todo-o-nada por entry**, reporta resultado por key". La spec ya decide; este ADR registra por qué, porque la alternativa parece más segura y no lo es.

**Decisión.** Cada entrada se publica en su propia transacción. Si una falla la validación estricta, las demás se publican igualmente y se devuelve el resultado por clave.

**Consecuencias.**

- Un campo requerido olvidado en una sección que a nadie le urge —un `seo.description` a medias— **no bloquea** la publicación del resto. Con una transacción global lo bloquearía, y el editor tendría que arreglar algo que no estaba tocando para publicar lo que sí acaba de escribir.
- **A cambio:** el sitio puede quedar en un estado mixto, con unas secciones publicadas y otras no. Es visible en el panel (SPEC §9: tarjeta por sección con su estado), así que no es un estado oculto.
- El resultado por clave es obligatorio, no informativo: sin él, el editor no sabe qué se publicó.

---

## ADR-402 — La revisión guarda el estado sustituido, no el entrante

**Contexto.** `SPEC.md` §4 describe `revisions.data` como "snapshot de lo publicado" y §5.3 dice que `publish` hace "snapshot a `revisions`". Ambas frases admiten dos lecturas: el estado que **se va a sustituir** o el que **entra**.

**Decisión.** Se guarda el que se sustituye, es decir, lo que estaba publicado **antes** de esta publicación.

El motivo es para qué sirve una revisión: para volver atrás. Y "atrás" es lo que había. Guardando el estado entrante, la revisión más reciente sería idéntica a lo publicado actual —inútil— y para volver a la versión anterior habría que ir dos pasos atrás en la lista, cosa que nadie espera de un historial.

**Consecuencias.**

- La primera publicación de una entrada **no genera revisión**, porque no había nada que sustituir. El historial de un contenido recién publicado está vacío, y eso es correcto aunque a primera vista parezca un fallo.
- El número de revisiones es siempre uno menos que el número de publicaciones. La poda a 20 de `SPEC.md` §4 se aplica sobre esa cuenta.
- `restoreRevision` lleva el snapshot al **borrador** y no publica (SPEC §9), así que volver atrás sigue siendo una acción deliberada de dos pasos.

---

## ADR-403 — Qué rechazos se auditan, y cuáles no

**Contexto.** `SPEC.md` §5.3 coloca `audit()` después de la lógica, y §4 describe `audit_log` como el rastro de "quién hizo qué". Ninguna de las dos dice qué pasa cuando la operación **no** se hace. Escribir el envoltorio obliga a decidirlo: el primer borrador auditaba solo lo que devolvía el handler, y un editor intentando ejecutar una action de administrador no dejaba ni una línea. Lo detectó un test que afirmaba justo eso.

**Decisión.** Se audita **todo lo que ocurre después de que el límite haya dado el visto bueno**: `FORBIDDEN`, `VALIDATION_FAILED`, `INTERNAL` y los fallos que devuelve el handler, cada uno con su código en `meta`. Quedan fuera dos casos:

- `UNAUTHORIZED`. No hay actor que registrar, y quien lo dispara es un anónimo: una fila por petición sin sesión deja que cualquiera en internet haga crecer una tabla nuestra. Los intentos de acceso sí se auditan, pero en `authenticate.ts`, donde al menos hay un correo.
- `RATE_LIMITED`. Auditar justo lo que el límite acaba de frenar convierte la protección en una escritura por cada petición bloqueada, que es el gasto que el límite existe para evitar.

Para que "después del límite" sea cierto también en el rechazo por rol, **un `FORBIDDEN` consume cuota**. La decisión de rol se sigue tomando antes que la del límite, como fija el orden de §5.3 —un editor llamando a una action de admin recibe `FORBIDDEN`, nunca `RATE_LIMITED`—, pero la cuota se gasta igual.

**Consecuencias.**

- El número de filas de auditoría que puede provocar un editor llamando en bucle a una action que no le corresponde queda acotado por su propia cuota: 20 en cinco minutos, no una por petición.
- Un rechazo por rol gasta cuota de un bucket que ese usuario no puede usar. Es intencionado y no afecta a nadie que trabaje normalmente.
- Un pico de `RATE_LIMITED` no deja rastro en `audit_log`. Si algún día hace falta verlo, el sitio es una métrica o un log, no la tabla de auditoría.

---

## ADR-404 — La lectura pública nunca lanza (resuelve #86)

**Contexto.** `SPEC.md` §5.2 escribe la lectura como `strictSchema(key).parse(row?.published ?? defaults(key))`. El esquema estricto es la puerta de publicación: por ADR-202, un campo `required` no admite ausencia ni valor vacío. `hero.title` es `required` y no tiene `default`, así que ese `.parse()` **lanza** cuando no hay nada publicado — y una landing recién desplegada devuelve 500 hasta que alguien publica. §5.1, en cambio, habla de crear los singletons "con valores **vacíos**/default", y el criterio T-76-2 del issue #76 pide explícitamente "sin publicar → valores por defecto, no error".

Hay un segundo caso que llega más tarde y hace más daño: **añadir un campo `required` a `cms.config.ts` con contenido ya publicado**. Lo publicado deja de pasar el esquema estricto y, con `.parse()`, la landing entera cae por una edición de configuración. Para un CMS auto-hospedable eso es una operación de día 2 normal.

**Decisión.** La lectura pública **no aplica el esquema estricto como puerta y no lanza nunca**. `getContent` y `getCollection` resuelven campo a campo:

1. El valor publicado, si pasa el esquema de **tipo** de su campo.
2. Si no, el `default` de la config.
3. Si tampoco lo hay y el campo es `required`, el **vacío de su tipo** (`''`, `0`, `false`, documento de texto rico vacío, imagen sin `url`).
4. Si es opcional, se omite.

Resolver campo a campo y no bloque a bloque es lo que evita el daño colateral: si la config gana un campo requerido, la sección sigue mostrando todo lo que sí estaba publicado, en vez de quedarse en blanco entera.

Que la palabra "vacíos" salga de la propia §5.1 es lo que convierte esto en una lectura de la spec y no en una desviación de ella.

**Consecuencias.**

- El tipo `Content<K>` sigue siendo cierto: un campo requerido siempre trae un valor del tipo prometido. Puede ser el vacío, y eso es visible al renderizar.
- Una imagen requerida sin publicar llega como `{ mediaId: '', url: '', alt: '' }`. **Los componentes deben tratar `url === ''` como "no hay imagen"**, porque un `<img src="">` provoca una segunda petición a la propia página. Queda anotado para los componentes de M5.
- Cuando lo publicado no pasa el esquema de su campo, se registra en el log del servidor. Sustituir en silencio dejaría una landing mostrando defaults sin que nadie supiera por qué.
- El esquema estricto sigue siendo la puerta de `publish` (§5.3), que es donde tiene sentido: ahí el editor puede arreglar lo que falta. En la lectura no hay nadie a quien pedírselo.

---

## ADR-405 — El caché se prueba donde existe, no donde se define

**Contexto.** `unstable_cache` necesita el `incrementalCache` de Next, que solo existe dentro de una petición. Llamarlo desde Vitest lanza `Invariant: incrementalCache missing`. Eso deja los casos T-76-1 a T-76-3 sin sitio: no se pueden probar contra la función que usará la landing.

**Decisión.** El módulo se parte en dos: `readContent`/`readCollection`, que hacen la consulta y la resolución por campo y no saben nada de caché, y `getContent`/`getCollection`, envoltorios finos de `unstable_cache` con el tag `content:<key>`. La lógica se prueba contra los primeros, en integración y con Postgres real.

Que el envoltorio sea el correcto se comprueba con la propia limitación, que resulta ser un aserto útil: **`getContent` lanza el invariante fuera de una petición y `getDraft` no**. Eso demuestra a la vez que uno está cacheado y que el otro no — que es justo el criterio de #76 ("`getDraft` no se cachea").

**Consecuencias.**

- La invalidación real (publicar y ver la landing cambiar) se verifica en e2e, en M5, donde hay un servidor de verdad. Hasta entonces, lo que hay es que `publish` llama a `revalidateTag` con el tag correcto, y eso sí se prueba en #78.
- El aserto del invariante depende de un mensaje interno de Next. Si una versión lo cambia, el test falla y hay que actualizarlo; es un fallo ruidoso y no silencioso, que es la propiedad que importa.

---

## ADR-406 — Los singletons tienen nombre visible (resuelve #89)

**Contexto.** `SPEC.md` §9 fija el aviso de validación al publicar: "Falta el Título principal en **Portada**". Pero el `cms.config.ts` de §5.1 no le da nombre a ningún singleton: los campos tienen `label`, las colecciones tienen `label`, y los singletons solo tienen su clave técnica. Lo único disponible para nombrar la sección era `hero`, y "Falta el Título principal en hero" es la clave del desarrollador asomando en la interfaz del editor.

**Decisión.** `s.object` acepta un segundo argumento opcional con la etiqueta:

```ts
hero: s.object({ … }, { label: 'Portada' })
```

Compatible hacia atrás y sin tocar la inferencia de tipos, porque los campos siguen siendo el primer argumento. Sin etiqueta se usa la clave.

**Consecuencias.**

- Los tres singletons de `cms.config.ts` pasan a llamarse "Portada", "Sobre nosotros" y "SEO y redes sociales". Son también los nombres que verá el panel en M4.
- El respaldo a la clave técnica es **feo a propósito**: si alguien añade un singleton sin etiqueta, lo verá en el mensaje y lo corregirá. Un respaldo bonito —humanizar la clave a "Hero"— daría un nombre inventado que parece correcto y nadie arreglaría nunca.
- `ObjectSchema.label` es opcional, así que ningún esquema existente deja de compilar.

---

## ADR-407 — Publicar lo mismo no crea revisión, y la comparación tiene que ser estable

**Contexto.** `saveDraft` marca `status = 'changed'` en cada guardado, también cuando el editor escribe una letra y la borra. Sin más, "publicar todo" acabaría publicando entradas que no han cambiado y creando una revisión idéntica a la anterior en cada pasada — comiéndose el presupuesto de 20 revisiones por entrada de `SPEC.md` §4 con copias del mismo estado.

**Decisión.** `publish` compara el borrador validado con lo publicado y, si son iguales, no crea revisión ni reescribe el contenido. Sí corrige el `status`, porque la fila decía "con cambios" y no los tenía.

La comparación se hace con una serialización **estable** —claves ordenadas, recursivamente— y no con `JSON.stringify`. No es un refinamiento teórico: lo publicado vuelve de Postgres como JSONB, que ordena las claves por longitud (`body`, `heading`, `visible`), mientras que Zod las devuelve en el orden del esquema (`heading`, `body`, `visible`). Con `JSON.stringify` a secas, `about` daría "ha cambiado" **siempre**.

Ese detalle sobrevivió a la primera tanda de mutación porque el caso de prueba usaba `hero`, donde los dos órdenes coinciden por casualidad. El caso está ahora escrito sobre `about`.

**Consecuencias.**

- La comparación vive en `publish` y no en `saveDraft`, aunque el `status` inexacto nazca allí. `publish` ya necesita comparar para decidir la revisión, así que se escribe una vez; y equivocarse tiene coste asimétrico: marcar como "sin cambios" algo que sí cambió pierde trabajo del editor, mientras que marcar de más solo publica un no-op.
- `publish` devuelve `changed: false` en ese caso, para que el panel pueda decir "no había nada que publicar" en vez de fingir una publicación.

---

## ADR-408 — `crypto.randomUUID()` en vez de nanoid para las claves de colección

**Contexto.** `SPEC.md` §5.3 escribe la clave de un elemento de colección como `key = collection + '.' + nanoid`. `nanoid` no está entre las dependencias del proyecto, así que seguir la letra exige añadir una.

**Decisión.** Se usa `crypto.randomUUID()`, que viene en la plataforma.

Lo que la clave necesita es ser imposible de adivinar y no colisionar; las dos propiedades las da igual. Lo que aporta nanoid es una cadena más corta —21 caracteres frente a 36—, y esa cadena no la lee nadie: no aparece en ninguna URL pública ni en la interfaz del editor, solo en la columna `key`.

Añadir una dependencia de tiempo de ejecución tiene coste permanente: entra en `pnpm audit` (§7.1 pide cero _findings_ high o critical), hay que actualizarla, y amplía la superficie de suministro. Pagarlo para acortar una cadena que nadie ve no sale a cuenta.

**Consecuencias.**

- Las claves quedan como `testimonials.3f2a…-…`, de 49 caracteres. La columna es `text`, así que no hay límite que apretar.
- Si algún día una clave de colección acabara en una URL pública, conviene revisar esta decisión — no por seguridad, sino por lo fea que quedaría.

---

## ADR-409 — La columna `active` de `users` (resuelve #94)

**Contexto.** `SPEC.md` §5.3 lista `deactivateUser` entre las server actions, con `LAST_ADMIN` como error asociado. La tabla `users` de §4 no tiene ninguna columna donde apoyarlo.

**Decisión.** Se añade `active boolean not null default true`, con el mismo criterio que ADR-301 usó para `password_version`: §4 describe el modelo, no lo cierra, y una acción que la propia spec exige necesita dónde apoyarse.

Las alternativas se descartan por lo que cuestan:

- **Borrar la fila** destruye el rastro y confunde dos operaciones que en cualquier panel son distintas. Quien pulsa "desactivar" no espera "eliminar".
- **Reutilizar `locked_until` con una fecha lejana** mezcla el bloqueo por intentos fallidos (§7.1), que se levanta solo, con una desactivación, que no. Mirando la fila nadie sabría cuál de las dos es.

**Consecuencias, y son la parte que importa** — sin ellas la desactivación es un cartel en la puerta en vez de una cerradura:

- `authenticate` rechaza a un usuario inactivo **verificando igualmente contra el señuelo**. Responder antes sin gastar el tiempo de Argon2 haría que un intento contra una cuenta desactivada respondiera mucho más rápido, y eso convierte "¿existe y está activa esta cuenta?" en algo que se mide con un cronómetro.
- `deactivateUser` incrementa `password_version`, que expulsa las sesiones abiertas (ADR-301). Sin eso, la persona a la que acabas de desactivar sigue trabajando siete días.
- `isSessionStillValid` comprueba `active` además de la versión. Es redundante con lo anterior y está a propósito: la primera cerradura vive en otra action y podría dejar de estar.
- La cuenta de administradores para `LAST_ADMIN` mira solo los **activos**. Contar a un administrador que no puede entrar sería contar a alguien que no administra nada, y dejaría degradar al único que sí puede.

---

## ADR-410 — Los ajustes `site` y `seo`, y en qué se diferencian del contenido

**Contexto.** `SPEC.md` §4 define la tabla `settings` con las claves `'seo' | 'site' | 'setup_completed'`, y §5.3 da a `updateSettings` la entrada `{ key: 'seo'|'site', value }` con un "valida por schema" que no concreta cuál. No hay ningún esquema declarado para esos valores, así que hay que fijarlo.

Y hay una ambigüedad que se nota enseguida: **`cms.config.ts` ya tiene un singleton llamado `seo`**. Dos cosas con el mismo nombre y distinto comportamiento es la clase de detalle que se resuelve mal si no se nombra.

**Decisión.** Son cosas distintas y se tratan como tales:

- El **singleton `seo`** es contenido. Lo edita quien escribe, pasa por borrador y publicación, y tiene historial.
- El **ajuste `seo`** son los valores por defecto del sitio, que se aplican donde el contenido no dice nada. Los toca un administrador, tienen efecto inmediato y no se publican: no son texto de una página, son configuración.

Los esquemas, declarados en `cms/actions/settings.actions.ts` y `strict()`:

| Clave  | Campos                                                                                       |
| ------ | -------------------------------------------------------------------------------------------- |
| `site` | `siteName` (obligatorio, 1–120)                                                              |
| `seo`  | `defaultTitle` (≤60), `defaultDescription` (≤160), `ogImageUrl` (≤2048), los tres opcionales |

**Consecuencias.**

- Un solo tag de caché, `settings`, para las dos claves: se leen en el layout, así que cualquier cambio afecta a todas las páginas y separar por clave no ahorraría nada.
- `readSettings` cae a los valores por defecto si lo guardado ya no encaja con su esquema, con el mismo criterio que ADR-404: un ajuste que dejó de encajar no puede tumbar el sitio entero.
- `site.siteName` toma su valor por defecto de `cms.config.ts`, así que un despliegue recién hecho renderiza sin que nadie haya guardado nada.
- `ogImageUrl` no se valida con `z.url()`: ahí caben rutas internas además de absolutas, y el criterio de qué destino es aceptable ya está en `isSafeLink`. Dos validaciones del mismo concepto acabarían discrepando.
