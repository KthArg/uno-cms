# 02 — Autenticación y seguridad base (M2)

> Documento de fase derivado de `SPEC.md`. Fuente de verdad: `SPEC.md`.
> Secciones cubiertas: §7 completa (amenazas, cabeceras, bootstrap, variables), ADR-004
> (Auth.js + Argon2id), §5.3 (`createPreviewToken`, `changePassword`), §11.3.
>
> Es el hito donde las mitigaciones de `SPEC.md` §7.1 dejan de ser una tabla y pasan a ser
> código. Cada fila de esa tabla debe acabar con **al menos un test que la ejercite**, o con
> una razón escrita de por qué no es automatizable.

---

## 1. Alcance

| Issue | Entrega                                                                               |
| ----- | ------------------------------------------------------------------------------------- |
| #54   | Este documento                                                                        |
| #55   | `cms/security/tokens.ts`: HMAC firmado con expiración                                 |
| #56   | `cms/auth/passwords.ts`: Argon2id y política de contraseñas                           |
| #57   | `cms/security/ratelimit.ts`: límite por ventana con degradación documentada           |
| #58   | `cms/security/audit.ts`: registro de auditoría con retención                          |
| #59   | `cms/auth/index.ts`: Auth.js credentials, lockout incremental, invalidación de sesión |
| #60   | `middleware.ts`: guard de `/admin`, cabeceras y CSP con nonce                         |
| #61   | `/setup`: bootstrap del primer administrador, de un solo uso                          |

Orden: **#54 → #55 → #56 → #57 → #58 → #59 → #60 → #61**. Los cuatro módulos de
`cms/security` y `cms/auth` no dependen entre sí; #59 los consume; #60 y #61 dependen de #59.

## 2. Fuera de alcance de M2

- 2FA TOTP → `SPEC.md` §10.1, issue `post-mvp`. La columna `totp_secret` ya existe.
- Reset de contraseña por correo → §10.2. En el MVP, `inviteUser` genera un token que el
  administrador comparte a mano, y eso es de **M3** (es una action).
- Las actions de contenido y su pipeline → **M3**.
- Cualquier interfaz: la página de login y la de `/setup` son lo mínimo para que el flujo
  funcione, sin diseño. El panel es **M4**.
- Uploads y su allowlist de MIME → **M4**, con la biblioteca de medios.

## 3. Contratos

### 3.1 Contraseñas (ADR-004)

**Argon2id** con los parámetros que recomienda OWASP para el perfil de memoria moderada:
`m = 19456` KiB (19 MiB), `t = 2`, `p = 1`. Se fijan en una constante única y se documentan;
subirlos más tarde es fácil, bajarlos debe requerir un ADR.

Política de `changePassword` (§5.3): **mínimo 12 caracteres** y rechazo contra una lista de
contraseñas comunes. Sin exigencias de composición (mayúsculas, símbolos): las guías
actuales las desaconsejan porque empujan a patrones predecibles, y la spec no las pide.

La lista de contraseñas comunes se embebe en el repositorio, no se descarga: una comprobación
de seguridad que depende de la red falla abierta el día que la red falla.

### 3.2 Tokens firmados (`cms/security/tokens.ts`)

Un solo módulo para los tres usos de `SPEC.md`: preview (§5.3, 2 h), setup (§7.3) y reset
(§5.3, 24 h). Firma HMAC-SHA256 con `APP_SECRET`.

Contrato:

- El token lleva **propósito** (`purpose`) además de datos y expiración. Un token de preview
  no puede valer como token de reset aunque ambos estén bien firmados: sin el propósito
  dentro de la firma, cualquier confusión de rutas se convierte en escalada.
- Verificación en **tiempo constante** (`timingSafeEqual`). Comparar firmas con `===` filtra
  información por el tiempo de respuesta.
- Expiración comprobada **después** de la firma, nunca antes: comprobarla antes revelaría si
  un token manipulado tenía una fecha válida.
- Un token expirado, mal firmado, de otro propósito o malformado producen **el mismo
  resultado**: inválido, sin distinguir el motivo hacia fuera (§7.1, "Enumeración").

### 3.3 Rate limit (`cms/security/ratelimit.ts`)

`SPEC.md` §5.3: login limitado a **5 intentos por 15 minutos por IP + email**.

`SPEC.md` §2 permite Upstash con **fallback en memoria** y exige que la degradación esté
documentada. Aquí está: sin `KV_REST_API_URL`, el contador vive en el proceso. En serverless
cada instancia tiene el suyo, así que el límite efectivo se multiplica por el número de
instancias vivas. Para una landing con un puñado de editores es suficiente; para un objetivo
con atacante decidido, no. **El lockout de §3.4 no depende del rate limit y sí es
persistente**, y es la defensa que de verdad sostiene el caso.

### 3.4 Lockout incremental (§7.1)

"5 fallos → 15 min, exponencial". Contrato: a partir del quinto fallo consecutivo, el bloqueo
es de `15 × 2^(n−5)` minutos, con tope de 24 h. Vive en la base de datos (`failed_logins`,
`locked_until`), así que sobrevive a reinicios y es común a todas las instancias.

Un login correcto reinicia el contador. Un intento durante el bloqueo **no lo alarga**: si lo
alargara, cualquiera podría dejar fuera a un usuario legítimo indefinidamente conociendo solo
su correo.

### 3.5 Sesión

Cookie `httpOnly; Secure; SameSite=Lax`, JWT firmado con `AUTH_SECRET`, 7 días (§7.1).

**Invalidación al cambiar contraseña**: el JWT lleva un claim `pwdV` que se compara con un
contador de la fila del usuario. Cambiar la contraseña lo incrementa y todas las sesiones
abiertas dejan de valer. Requiere **una columna nueva**, y por tanto una migración: `SPEC.md`
§4 no la contempla, así que va con ADR.

### 3.6 Cabeceras y CSP (§7.2)

Las de la spec, literales. Dos precisiones que la spec no da:

1. **El nonce se genera por petición en el middleware** y viaja a la página por una cabecera
   de petición. `'strict-dynamic'` hace que los scripts cargados por un script con nonce
   hereden la confianza, que es lo que Next necesita.
2. **`X-Robots-Tag: noindex` solo en `/admin`, `/preview`, `/api` y `/setup`**, como dice la
   spec. En la landing sería un error que costaría el posicionamiento del sitio.

En desarrollo, Next requiere `'unsafe-eval'` para su recarga en caliente. La CSP de
desarrollo lo incluye y la de producción **no**, y esa diferencia se comprueba con un test.

### 3.7 Bootstrap seguro (§7.3)

1. Sin usuarios en la base de datos, toda ruta redirige a `/setup`.
2. `/setup` exige el `SETUP_TOKEN` de las variables de entorno. Con token válido crea el
   primer administrador y escribe `settings.setup_completed = true`.
3. A partir de ahí `/setup` devuelve **404** aunque el token siga definido.
4. Nunca existen credenciales por defecto.

Contrato adicional: la creación del primer administrador y la escritura de
`setup_completed` van en **la misma transacción**. Si se crea el usuario y falla la marca,
`/setup` seguiría abierto con un administrador ya existente, que es el peor de los dos
estados posibles.

La comparación del `SETUP_TOKEN` es en tiempo constante y el token exige al menos 32
caracteres: uno corto convertiría todo el bootstrap en adivinable.

## 4. Casos de prueba — la definición de "hecho"

### 4.1 Tokens (#55)

| ID     | Caso                                                | Verificación                                  |
| ------ | --------------------------------------------------- | --------------------------------------------- |
| T-55-1 | Un token válido se verifica y devuelve su carga     | ida y vuelta                                  |
| T-55-2 | Firma manipulada → inválido                         | cambiar un byte del payload                   |
| T-55-3 | Token de otro propósito → inválido                  | firmar como `preview`, verificar como `setup` |
| T-55-4 | Token expirado → inválido                           | expiración en el pasado                       |
| T-55-5 | Token con otro `APP_SECRET` → inválido              |                                               |
| T-55-6 | Basura, cadena vacía, `null` → inválido, sin lanzar |                                               |
| T-55-7 | Todos los fallos devuelven el mismo resultado       | sin distinguir el motivo hacia fuera          |

### 4.2 Contraseñas (#56)

| ID     | Caso                                                           | Verificación                           |
| ------ | -------------------------------------------------------------- | -------------------------------------- |
| T-56-1 | `hash` y `verify` hacen ida y vuelta                           |                                        |
| T-56-2 | Dos hashes de la misma contraseña difieren                     | la sal es aleatoria                    |
| T-56-3 | El hash declara `argon2id` y los parámetros fijados            | inspección de la cadena                |
| T-56-4 | `verify` con contraseña incorrecta → `false`, sin lanzar       |                                        |
| T-56-5 | `verify` con un hash corrupto → `false`, **sin lanzar**        | un `throw` aquí sería un canal lateral |
| T-56-6 | Menos de 12 caracteres → rechazada                             |                                        |
| T-56-7 | Contraseña de la lista de comunes → rechazada aunque sea larga | `contraseña123456`                     |
| T-56-8 | Una contraseña larga y no común → aceptada                     |                                        |

### 4.3 Rate limit (#57)

| ID     | Caso                                  | Verificación                                |
| ------ | ------------------------------------- | ------------------------------------------- |
| T-57-1 | 5 intentos pasan, el sexto no         |                                             |
| T-57-2 | La ventana expira y vuelve a permitir | reloj inyectado, no `sleep`                 |
| T-57-3 | Claves distintas no se interfieren    | IP+email distintos                          |
| T-57-4 | Sin Upstash usa memoria y lo dice     | la degradación es observable, no silenciosa |

### 4.4 Auditoría (#58)

| ID     | Caso                                                 | Verificación                                                              |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| T-58-1 | Un evento queda registrado con actor, acción y fecha | integración                                                               |
| T-58-2 | El correo del actor sobrevive al borrado del usuario | ya cubierto por el esquema; se ejercita desde `audit()`                   |
| T-58-3 | **La IP se trunca**                                  | `192.168.1.37` → `192.168.1.0`; IPv6 al /64                               |
| T-58-4 | Nunca se registra una contraseña ni un token         | test que audita un intento de login y afirma que la carga no los contiene |
| T-58-5 | Los registros de más de 90 días se podan             | reloj inyectado                                                           |
| T-58-6 | Un fallo al auditar **no tumba la operación**        | la auditoría no puede impedir que alguien inicie sesión                   |

### 4.5 Autenticación (#59)

| ID      | Caso                                                                               | Verificación                                             |
| ------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| T-59-1  | Credenciales correctas → sesión con rol                                            | integración                                              |
| T-59-2  | Contraseña incorrecta → sin sesión, mensaje genérico                               |                                                          |
| T-59-3  | Usuario inexistente → **mismo mensaje y comportamiento** que contraseña incorrecta | §7.1, "Enumeración"                                      |
| T-59-4  | Usuario inexistente → se verifica igualmente un hash señuelo                       | si no, el tiempo de respuesta revela si el correo existe |
| T-59-5  | 5 fallos → cuenta bloqueada 15 min                                                 |                                                          |
| T-59-6  | El bloqueo es exponencial a partir del quinto                                      | 10 fallos → mucho más de 15 min                          |
| T-59-7  | Un intento durante el bloqueo no lo alarga                                         | si no, cualquiera puede dejar fuera a un usuario         |
| T-59-8  | Un login correcto reinicia el contador                                             |                                                          |
| T-59-9  | El email no distingue mayúsculas                                                   | ADR-201                                                  |
| T-59-10 | Cambiar la contraseña invalida las sesiones abiertas                               | claim `pwdV`                                             |

### 4.6 Middleware (#60)

| ID     | Caso                                                                                      | Verificación               |
| ------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| T-60-1 | `/admin` sin sesión → redirección a login, **sin filtrar contenido**                      | e2e                        |
| T-60-2 | Todas las cabeceras de §7.2 presentes en la landing                                       | e2e sobre respuesta real   |
| T-60-3 | La CSP lleva nonce y `frame-ancestors 'self'`                                             |                            |
| T-60-4 | El nonce cambia en cada petición                                                          | dos peticiones, dos nonces |
| T-60-5 | `X-Robots-Tag: noindex` en `/admin`, `/preview`, `/api`, `/setup`, y **NO** en la landing |                            |
| T-60-6 | La CSP de producción **no** lleva `'unsafe-eval'`                                         |                            |
| T-60-7 | Una mutación con `Origin` ajeno se rechaza                                                | §7.1, CSRF                 |

### 4.7 Setup (#61)

| ID     | Caso                                                            | Verificación                                                        |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| T-61-1 | Sin usuarios, cualquier ruta lleva a `/setup`                   |                                                                     |
| T-61-2 | Sin `SETUP_TOKEN` en el entorno, `/setup` no crea nada          |                                                                     |
| T-61-3 | Token incorrecto → rechazo genérico                             |                                                                     |
| T-61-4 | Token correcto → primer administrador creado con rol `admin`    |                                                                     |
| T-61-5 | **Segundo uso → 404**, aunque el token siga en el entorno       |                                                                     |
| T-61-6 | Usuario y `setup_completed` se escriben en la misma transacción | forzar fallo tras crear el usuario y comprobar que no queda usuario |
| T-61-7 | La contraseña del primer administrador pasa la política         |                                                                     |

## 5. Cobertura de la tabla de amenazas (§7.1)

DoD del hito: cada fila tiene un test o una razón escrita. Se rellena al cerrar M2 y se
copia a `docs/SECURITY.md` en M6.

| Amenaza                 | Dónde se cubre                                                  |
| ----------------------- | --------------------------------------------------------------- |
| Fuerza bruta en login   | T-59-4 a T-59-8, T-57-1                                         |
| XSS vía contenido       | Ya cubierto en M1 (links, richtext, atributos)                  |
| CSRF                    | T-60-7                                                          |
| Clickjacking            | T-60-3                                                          |
| Inyección SQL           | Regla de lint (M0) + Drizzle (M1)                               |
| Escalada de privilegios | `CHECK` de `role` (M1) + guard de rol; las actions llegan en M3 |
| Robo de sesión          | T-59-10, cookies (T-60-2)                                       |
| Abuso de uploads        | **M4**                                                          |
| Enumeración             | T-59-3, T-55-7, T-61-3                                          |
| Secretos en cliente     | Frontera `server-only` (M0/M1)                                  |
| Dependencias            | `pnpm audit` en CI (M0)                                         |

## 6. Definition of Done de M2

1. Imposible acceder a `/admin` sin sesión, demostrado con e2e.
2. Cada amenaza automatizable de §7.1 tiene al menos un test que la ejercita.
3. Todos los casos de §4 pasan; ninguno se da por bueno estando en rojo.
4. `docs/PROGRESS.md` cierra M2 con qué funciona, qué es frágil y qué probar a mano.

## 7. Decisiones que exigen ADR

- **ADR-300** — Parámetros de Argon2id y por qué esos.
- **ADR-301** — Columna `password_version` para invalidar sesiones: `SPEC.md` §4 no la
  contempla y hace falta para el claim `pwdV` de §7.1.
- **ADR-302** — Política de contraseñas sin exigencias de composición.
- **ADR-303** — Degradación del rate limit sin Upstash, y por qué el lockout es la defensa
  que sostiene el caso.
