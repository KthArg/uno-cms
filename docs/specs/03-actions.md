# 03 — API de contenido: server actions (M3)

> Documento de fase derivado de `SPEC.md`. Fuente de verdad: `SPEC.md`.
> Secciones cubiertas: §5.2 (lectura cacheada), §5.3 (contrato completo de mutación),
> §7.1 (escalada de privilegios, la fila que M2 dejó abierta), §11.3 y §11.4.
>
> Es el hito donde el CMS pasa a **escribir**. Todo lo anterior era infraestructura; a
> partir de aquí, un fallo pierde o corrompe contenido de alguien.

---

## 1. Alcance

| Issue | Entrega                                                                                    |
| ----- | ------------------------------------------------------------------------------------------ |
| #74   | Este documento                                                                             |
| #75   | El pipeline común: `requireSession`, `requireRole`, envoltorio de action, códigos de error |
| #76   | Lectura cacheada: `getContent`, `getCollection`, `getDraft` (§5.2)                         |
| #77   | `saveDraft` con bloqueo optimista y sanitización                                           |
| #78   | `publish`, `publishAll`, revisiones con poda a 20                                          |
| #79   | `revertDraft`, `restoreRevision`                                                           |
| #80   | Colecciones: `createItem`, `deleteItem`, `reorderItems`                                    |
| #81   | Usuarios: `inviteUser`, `updateUserRole`, `deactivateUser`, `changePassword`               |
| #82   | `updateSettings`, `createPreviewToken`, `GET /api/content/:key`                            |
| #83   | Activar el umbral de cobertura (§11.4) y cerrar el hito                                    |

Orden: **#74 → #75 → #76 → #77 → #78 → #79 → #80 → #81 → #82 → #83**. Todo depende de #75.

## 2. Fuera de alcance de M3

- **Media**: `getUploadToken`, `finalizeUpload`, `updateMediaAlt`, `deleteMedia` y su
  `MEDIA_IN_USE` → **M4**, con la biblioteca. Van juntos porque el guard de "media en uso"
  no se puede probar de verdad sin medios que estén en uso.
- Cualquier interfaz → **M4**.
- El envío del token de invitación por correo → `SPEC.md` §10.2, `post-mvp`. En el MVP el
  administrador lo comparte a mano.
- La vista previa en sí → **M5**. Aquí solo se emite el token (`createPreviewToken`).

## 3. Contratos

### 3.1 El pipeline (§5.3)

`SPEC.md` fija el orden y no es negociable:

```
requireSession(role) → rateLimit(bucket, actorId) → zodValidate(input)
  → lógica en transacción → audit() → revalidateTag() si aplica
```

Cada paso está antes que el siguiente por un motivo:

- **La sesión primero.** Cualquier trabajo hecho antes de saber quién llama es trabajo que
  un anónimo puede provocar.
- **El límite antes de validar.** Validar con Zod cuesta CPU; si no, el límite se salta
  enviando payloads caros y malformados.
- **La validación antes de la transacción.** Abrir una transacción para descubrir que el
  input no vale mantiene una conexión ocupada sin motivo.
- **La auditoría después de la lógica** y **fuera** de su transacción: si el registro
  fallara dentro, tumbaría la operación que intenta registrar (ya resuelto en M2).
- **`revalidateTag` al final.** Invalidar el caché antes de que el dato esté escrito sirve
  una versión vieja como si fuera nueva.

#### Cuotas por bucket

`SPEC.md` escribe el paso como `rateLimit(bucket, actorId)`: la cuota va **por usuario
autenticado**, no por IP. Aquí quien llama ya ha pasado sesión y rol, así que esto no
defiende de un atacante — defiende de un editor legítimo que dispara demasiadas
operaciones, y de que un error en el panel entre en bucle.

Las cuotas no las da la spec y hay que fijarlas, porque **la de login es inservible aquí**:

| Bucket                           | Cuota       | Por qué                                                                                                                                                                                                                                                                        |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `saveDraft`                      | 240 / 5 min | El autosave de §8 guarda cada 2 s tras el último tecleo. Un editor escribiendo un párrafo largo genera decenas de guardados por minuto; con la cuota del login (5 por 15 min) el CMS dejaría de guardar a los diez segundos, y el editor lo viviría como pérdida de su trabajo |
| `publish`, `publishAll`          | 30 / 5 min  | Publicar es deliberado y poco frecuente                                                                                                                                                                                                                                        |
| Escrituras de usuarios y ajustes | 20 / 5 min  | Operaciones de administración, aún menos frecuentes                                                                                                                                                                                                                            |
| `createPreviewToken`             | 60 / 5 min  | Uno por apertura de editor, más reintentos                                                                                                                                                                                                                                     |

El caso peligroso no es el ataque: es poner una cuota estricta a `saveDraft` "por
seguridad" y convertir una protección en un fallo de producto.

### 3.2 El contrato de errores

Todas las actions devuelven `{ ok: true, data }` o `{ ok: false, code, message }`. **Nunca
lanzan** hacia el cliente: una excepción no capturada en una Server Action se convierte en
un error genérico de Next que el panel no puede explicar al editor.

Códigos, y qué se puede decir con cada uno:

| Código              | Cuándo                                               | Qué revela                                         |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `UNAUTHORIZED`      | Sin sesión                                           | Nada                                               |
| `FORBIDDEN`         | Sesión válida, rol insuficiente                      | Que la operación existe. Aceptable: ya está dentro |
| `NOT_FOUND`         | La clave no existe **o** no tiene permiso sobre ella | Deliberadamente ambiguo (§7.1, "Enumeración")      |
| `RATE_LIMITED`      | Demasiadas operaciones                               | Nada                                               |
| `VALIDATION_FAILED` | Zod, con la lista de campos                          | Solo campos del propio contenido                   |
| `VERSION_CONFLICT`  | Otro editor guardó antes                             | Que hay otro editor. Es el punto                   |
| `NEVER_PUBLISHED`   | `revertDraft` sin nada publicado                     | Nada sensible                                      |
| `LAST_ADMIN`        | Quedarse sin administradores                         | Nada sensible                                      |
| `CONFLICT`          | Choque de estado no cubierto arriba                  | Nada                                               |
| `INTERNAL`          | Cualquier excepción no prevista                      | **Nada**: el detalle va al log, no a la respuesta  |

`message` va en **español llano**, dirigido al editor (§9): "Otra persona guardó cambios
mientras editabas", no "optimistic lock violation on content_entries".

### 3.3 Roles (§7.1, la fila abierta de M2)

La mitigación que pide §7.1 es literal: **"chequeo de rol en cada action (server), no solo
en UI"**. El contrato:

- `requireRole('admin')` se ejecuta **dentro** de la action, no en el componente que la
  llama. Un componente puede esconder un botón; eso no impide invocar la action.
- El rol se lee de la sesión del servidor, **nunca** de un parámetro de entrada.
- **Toda action nueva sin comprobación de rol es un fallo de revisión**, y hay un test que
  recorre el módulo de actions y exige que cada export pase por el envoltorio del pipeline.
  Sin ese test, la fila de §7.1 se cierra hoy y se reabre sola con la primera action de M4.

### 3.4 Bloqueo optimista (§5.3)

`saveDraft` hace `UPDATE ... WHERE key = $key AND version = $version`. Si afecta a cero
filas, otro editor guardó antes → `VERSION_CONFLICT`.

Detalle que la spec no da y hay que fijar: **el `version` que devuelve una operación con
éxito es el nuevo**, para que el panel pueda seguir guardando sin recargar. Devolver el
viejo obligaría a un viaje extra y, peor, invitaría a que el cliente lo incremente por su
cuenta —que es exactamente cómo se rompe un bloqueo optimista—.

### 3.5 Publicación (§5.3, §4)

En una transacción, y en este orden:

1. `SELECT ... FOR UPDATE` sobre la fila (`SPEC.md` §4 lo exige por nombre).
2. Validar el draft con el esquema **estricto**. Si falla → `VALIDATION_FAILED` con la lista
   de campos, usando la etiqueta que ve el editor y **el nombre de la sección**, que es lo
   que M1 dejó a medias (§9: "Falta el Título principal en Portada").
3. Copiar el estado publicado anterior a `revisions`. **Se guarda lo que se va a sustituir,
   no lo que entra**: una revisión sirve para volver atrás, y "atrás" es lo que había.
4. Podar a 20 revisiones por entrada, en la misma transacción.
5. `published = draft`, `status = 'published'`, `published_at = now()`.
6. Fuera de la transacción: `revalidateTag('content:' + key)`.

`publishAll` itera las entradas con `status = 'changed'` y es **todo-o-nada por entrada**,
no global: si una falla la validación, las demás se publican igualmente y se devuelve el
resultado por clave. Publicar solo si todo vale dejaría el sitio bloqueado por un campo
olvidado en una sección que a nadie le urge.

### 3.6 Lectura cacheada (§5.2)

`getContent` y `getCollection` usan `unstable_cache` con tag `content:<key>`, y devuelven
**solo contenido publicado**. `getDraft` no se cachea: por definición cambia cada pocos
segundos mientras alguien edita.

Un singleton sin fila o sin publicar devuelve los **valores por defecto** de la config, no
un error: una landing recién desplegada tiene que renderizar aunque nadie haya publicado
nada.

### 3.7 `LAST_ADMIN` (§5.3)

No se puede dejar el sistema sin ningún administrador. Si ocurriera, el resultado es un
sitio sin nadie que pueda administrarlo y **sin forma de arreglarlo desde la interfaz**.

La comprobación va dentro de la transacción que hace el cambio, pero **eso solo no basta, y
conviene decirlo porque suena suficiente**: con el nivel de aislamiento por defecto de
Postgres (`READ COMMITTED`), dos transacciones concurrentes pueden contar dos
administradores cada una y degradar cada una al suyo. Ninguna vería a la otra, y el sistema
acabaría sin administradores habiendo pasado las dos comprobaciones.

Contrato, por tanto: **la cuenta de administradores se hace con `SELECT ... FOR UPDATE`
sobre las filas de rol `admin`**, dentro de la misma transacción que el cambio. El bloqueo
serializa las dos operaciones y la segunda ve el resultado de la primera.

Aplica a `updateUserRole` (degradar al último admin) y a `deactivateUser` (desactivarlo).
El caso se prueba con **dos operaciones concurrentes**, no secuenciales: un test secuencial
pasa igual con la implementación ingenua.

## 4. Casos de prueba — la definición de "hecho"

### 4.1 Pipeline (#75)

| ID     | Caso                                                          | Verificación                                              |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------- |
| T-75-1 | Sin sesión → `UNAUTHORIZED` y **sin escritura**               | Integración; se comprueba la tabla                        |
| T-75-2 | Rol insuficiente → `FORBIDDEN` y sin escritura                |                                                           |
| T-75-3 | Input inválido → `VALIDATION_FAILED`                          |                                                           |
| T-75-4 | Una excepción interna → `INTERNAL` **sin filtrar el mensaje** | Se afirma que la respuesta no contiene el texto del error |
| T-75-5 | Cada operación queda auditada con actor y acción              |                                                           |
| T-75-6 | **Toda action exportada pasa por el envoltorio**              | Test que recorre el módulo; falla al añadir una suelta    |

### 4.2 Lectura (#76)

| ID     | Caso                                                           | Verificación |
| ------ | -------------------------------------------------------------- | ------------ |
| T-76-1 | `getContent` devuelve lo **publicado**, no el borrador         |              |
| T-76-2 | Sin publicar → valores por defecto, no error                   |              |
| T-76-3 | `getCollection` ordena por `sortOrder` y omite lo no publicado |              |
| T-76-4 | Publicar invalida el tag                                       |              |

### 4.3 `saveDraft` (#77)

| ID     | Caso                                                              | Verificación                      |
| ------ | ----------------------------------------------------------------- | --------------------------------- |
| T-77-1 | Guarda y devuelve el **nuevo** `version`                          |                                   |
| T-77-2 | `version` viejo → `VERSION_CONFLICT` **y el contenido no cambia** |                                   |
| T-77-3 | Dos guardados concurrentes: uno gana, el otro obtiene conflicto   | Dos promesas a la vez             |
| T-77-4 | El richtext se sanea al guardar                                   | `javascript:` en una marca `link` |
| T-77-5 | Guardar no publica                                                | `published` intacto               |

### 4.4 Publicación (#78)

| ID     | Caso                                                                                   | Verificación                 |
| ------ | -------------------------------------------------------------------------------------- | ---------------------------- |
| T-78-1 | Publica y `revalidateTag` se llama con `content:<key>`                                 | Espía                        |
| T-78-2 | Requerido vacío → `VALIDATION_FAILED` con el nombre visible del campo **y la sección** |                              |
| T-78-3 | La revisión guarda **lo sustituido**, no lo nuevo                                      |                              |
| T-78-4 | Se podan las revisiones por encima de 20                                               | 25 publicaciones → 20 filas  |
| T-78-5 | Si falla la poda, no se publica                                                        | Todo en la misma transacción |
| T-78-6 | `publishAll` publica lo válido y reporta lo que no                                     |                              |

### 4.5 Deshacer (#79)

| ID     | Caso                                                  | Verificación                     |
| ------ | ----------------------------------------------------- | -------------------------------- |
| T-79-1 | `revertDraft` deja el borrador igual que lo publicado |                                  |
| T-79-2 | Sin nada publicado → `NEVER_PUBLISHED`                |                                  |
| T-79-3 | `restoreRevision` va al **borrador**, no publica      | §9: "Restaurar lleva a borrador" |
| T-79-4 | Restaurar una revisión de otra entrada → `NOT_FOUND`  |                                  |

### 4.6 Colecciones (#80)

| ID     | Caso                                                              | Verificación |
| ------ | ----------------------------------------------------------------- | ------------ |
| T-80-1 | `createItem` genera `coleccion.id` y `sortOrder` al final         |              |
| T-80-2 | `deleteItem` borra la entrada **y sus revisiones**                |              |
| T-80-3 | `reorderItems` reasigna en transacción                            |              |
| T-80-4 | Reordenar con claves de otra colección → `NOT_FOUND`, sin cambios |              |

### 4.7 Usuarios (#81)

| ID     | Caso                                                                                                         | Verificación |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------------ |
| T-81-1 | Solo `admin` puede invitar, cambiar rol y desactivar                                                         |              |
| T-81-2 | **`LAST_ADMIN`**: degradar al último admin falla                                                             |              |
| T-81-3 | **`LAST_ADMIN`**: desactivar al último admin falla                                                           |              |
| T-81-4 | Con dos admins, degradar a uno funciona                                                                      |              |
| T-81-5 | `changePassword` verifica la actual y aplica la política                                                     |              |
| T-81-6 | `changePassword` **invalida las sesiones** (`pwdV`)                                                          | ADR-301      |
| T-81-7 | `inviteUser` no devuelve la contraseña generada en claro… salvo el token de un solo uso, que es su propósito |              |

### 4.8 Ajustes y token de preview (#82)

| ID     | Caso                                                             | Verificación |
| ------ | ---------------------------------------------------------------- | ------------ |
| T-82-1 | `updateSettings` solo para `admin`                               |              |
| T-82-2 | `createPreviewToken` emite un token válido de 2 h para esa clave |              |
| T-82-3 | `GET /api/content/:key` devuelve publicado con `Cache-Control`   |              |
| T-82-4 | Esa ruta **no** expone borradores                                |              |

## 5. Definition of Done de M3

1. Todas las actions de §5.3 salvo las de media, con el pipeline completo.
2. **Cobertura ≥ 80 % en `cms/core` y `cms/security`**, aplicada en CI (`COVERAGE_ENFORCE=1`).
3. Todos los códigos de error del contrato ejercitados por al menos un test.
4. **La fila de escalada de privilegios de §7.1 queda cerrada**, con el test que impide
   añadir una action sin comprobación de rol.
5. `docs/PROGRESS.md` cierra M3.

## 6. Decisiones que exigen ADR

- **ADR-400** — Forma del resultado de las actions y catálogo de códigos.
- **ADR-401** — `publishAll` es todo-o-nada por entrada, no global.
- **ADR-402** — La revisión guarda el estado sustituido, no el entrante.
