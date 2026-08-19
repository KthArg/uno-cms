# M4 — Panel de administración

Derivado de `SPEC.md` §3 (estructura), §5.3 (actions de media), §7.1 (abuso de uploads), §8
(rendimiento del admin y autosave) y §9 (experiencia del usuario no técnico).

Este documento fija el alcance, los contratos y los casos de prueba **antes** de escribir
código. Los tests salen de la tabla de casos, no de la implementación.

---

## 1. Alcance

El panel completo, con una regla que lo gobierna todo: **el editor de esta landing no es
técnico**. `SPEC.md` §9 lo dice sin rodeos —"cero palabras como slug, schema, cache"— y no es
una nota de estilo, es el criterio con el que se decide cada pantalla.

1. **Shell del panel** (#): barra lateral, cabecera, navegación. `/admin/*` completo.
2. **Dashboard** (§9): tarjeta por sección con su estado y botón "Publicar todo".
3. **Generador de formularios**: un componente por tipo de campo (§3, `cms/ui/fields/`), y el
   formulario de una entrada construido desde `cms.config.ts`.
4. **Editor con autosave** (§8): debounce de 2 s tras el último tecleo, guardado al perder el
   foco, indicador de estado y **red de seguridad en `localStorage`** con reconciliación por
   `version`.
5. **Media**: `media.actions.ts`, `POST /api/media/upload` con token firmado de Vercel Blob
   (ADR-005) y biblioteca en `/admin/media`. Aquí se cierra la fila **abuso de uploads** de
   §7.1.
6. **Historial** `/admin/history/[key]` con "Restaurar", que lleva a borrador y nunca publica.
7. **Usuarios** `/admin/users`, solo para rol `admin`, sobre las actions de M3.
8. **Ajustes** `/admin/settings`.
9. **Establecer contraseña con token** (#95): la ruta que canjea la invitación de
   `inviteUser`, que hoy no se puede canjear.
10. **Confirmaciones destructivas** (#92) y **a11y básica**.

### Definition of Done

Un e2e que recorra **login → editar → guardar → publicar → historial → restaurar** contra un
servidor real.

---

## 2. Fuera de alcance de M4

- **La vista previa en vivo** (§6): iframe, `postMessage`, `PreviewProvider`, `PreviewFrame`.
  Es M5 entera. El editor de M4 tiene el formulario y el botón de publicar; el hueco donde irá
  el iframe queda visible y anotado, no simulado.
- **Las secciones de la landing** (`components/site/`) y `useContent`: M5.
- **Lighthouse CI y los presupuestos de §8**: M6. Aquí se cumple la parte estructural —el
  panel en su propio grupo de rutas, Tiptap cargado con `dynamic`— pero no se mide.
- Todo lo de §10.

---

## 3. Contratos

### 3.1 El vocabulario (§9)

No es cosmética: es un contrato verificable. En toda la interfaz del panel están **prohibidas**
estas palabras: `slug`, `schema`, `cache`, `token`, `JSON`, `payload`, `commit`, `deploy`,
`draft` (en inglés), `key`. Hay un test que recorre los componentes del panel y falla si
aparecen.

El vocabulario aceptado, de §9: "Guardar borrador", "Publicar cambios", "Deshacer cambios",
"Volver a una versión anterior".

La razón de fijarlo con un test y no con buena voluntad: la jerga se cuela de una en una, cada
vez con una excusa razonable, y nadie la quita después.

### 3.2 El formulario se genera, no se escribe

Un componente por tipo de campo (`text`, `richtext`, `number`, `boolean`, `select`, `link`,
`image`, `color`), y el formulario de una entrada se construye recorriendo su `ObjectSchema`.

Consecuencia que hay que respetar: **añadir un campo a `cms.config.ts` no debe requerir tocar
el panel**. Hay un test que lo comprueba montando el formulario de un esquema inventado con
los ocho tipos.

Cada campo muestra su `label` —nunca su clave técnica— y el error de validación que devuelva
la action, ya traducido por el pipeline de M3.

### 3.3 Autosave (§8)

```
tecleo → debounce 2 s → saveDraft(key, data, version)
blur del formulario → saveDraft inmediato
```

Contrato:

- El indicador tiene tres estados visibles: "Guardando…", "Guardado ✓" y el error.
- **La respuesta trae el `version` nuevo** (M3, spec de fase §3.4) y el formulario lo adopta,
  para poder encadenar guardados sin recargar.
- **`VERSION_CONFLICT` no se traga.** El editor tiene que enterarse de que otra persona guardó,
  y la interfaz ofrece recargar. Un autosave que reintenta en silencio pisaría el trabajo ajeno.
- **`localStorage` como red de seguridad**, no como caché: se escribe el borrador local en cada
  cambio y se borra al confirmar el guardado. Al abrir el editor, si hay un borrador local
  **más nuevo que el `version` del servidor**, se ofrece recuperarlo — no se aplica solo.

La reconciliación por `version` es la parte delicada: aplicar el borrador local sin preguntar
convertiría una pestaña olvidada en una máquina de resucitar texto viejo.

### 3.4 Media y la fila de "abuso de uploads" (§7.1)

`SPEC.md` §5.3 no detalla las actions de media más allá del nombre. Contrato de esta fase:

| Regla              | Valor                                                              | Por qué                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos permitidos   | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif` | Allowlist, nunca denylist. `image/svg+xml` **queda fuera**: un SVG es un documento que ejecuta scripts                                                                                        |
| Tamaño máximo      | 10 MB                                                              | Lo fija `SPEC.md` §5.3. La primera versión de este documento puso 5 MB con un argumento de rendimiento, sin marcarlo como desviación; el argumento es una preferencia, no un fallo de la spec |
| Quién sube         | Rol `editor`                                                       | Es contenido                                                                                                                                                                                  |
| Dónde se decide    | **En el servidor, al emitir el token de subida**                   | El cliente no decide nada: el `accept` del input es comodidad, no una defensa                                                                                                                 |
| Nombre del fichero | Generado, nunca el del usuario                                     | Un nombre controlado por quien sube es una vía de sobrescritura y de rutas raras                                                                                                              |
| `alt`              | Obligatorio salvo `decorative: true`                               | §8, y ya lo exige el esquema de M1                                                                                                                                                            |

**El SVG fuera de la lista lo decide ya `SPEC.md` §5.3**, que lo dice con todas las letras:
"SVG se rechaza en MVP (vector XSS)". Así que no hace falta ADR para eso — la primera versión
de este documento decía que sí, y era pasarse de decisor sobre algo ya decidido.

Lo que sí es decisión de implementación, y va escrita donde se implementa: **la allowlist se
aplica en el servidor, al emitir el token**. El `accept` del formulario viaja en el cliente,
así que es comodidad para quien sube, no una defensa.

### 3.5 Los dos guards de `/admin` (#70)

Hoy hay dos: el middleware (edge, solo firma) y el layout del panel (Node, autoritativo). El
issue #70 pide un test que impida que diverjan — que una ruta nueva quede cubierta por uno y
no por el otro.

### 3.6 Accesibilidad básica

Lo mínimo verificable, y solo lo que se puede afirmar con un test:

- Todo campo de formulario tiene su `label` asociada.
- El foco es visible y el orden de tabulación sigue el orden visual.
- Los estados del autosave se anuncian en una región `aria-live`.
- Los diálogos de confirmación atrapan el foco y se cierran con `Escape`.

---

## 4. Casos de prueba — la definición de "hecho"

### 4.1 Shell y dashboard

| ID    | Caso                                                            | Verificación                              |
| ----- | --------------------------------------------------------------- | ----------------------------------------- |
| T-A-1 | El dashboard lista una tarjeta por sección con su estado        |                                           |
| T-A-2 | "Publicar todo" publica lo válido y **dice qué se quedó fuera** | Sobre el resultado de `publishAll`        |
| T-A-3 | Un editor no ve la sección de usuarios                          | Rol `editor`; y la ruta también le cierra |
| T-A-4 | **Ninguna palabra de jerga en la interfaz del panel**           | Test que recorre los componentes          |

### 4.2 Formularios generados

| ID    | Caso                                                              | Verificación                          |
| ----- | ----------------------------------------------------------------- | ------------------------------------- |
| T-B-1 | Los ocho tipos de campo se renderizan desde un esquema            | Esquema inventado, no `cms.config.ts` |
| T-B-2 | Cada campo muestra su etiqueta, no su clave técnica               |                                       |
| T-B-3 | Añadir un campo al esquema lo hace aparecer sin tocar el panel    | Es el contrato de §5.1                |
| T-B-4 | Los errores de campo que devuelve la action se pintan en su campo | Por la ruta que devuelve el pipeline  |
| T-B-5 | Cada campo tiene su `label` asociada                              | a11y                                  |

### 4.3 Editor y autosave

| ID    | Caso                                                                 | Verificación                                |
| ----- | -------------------------------------------------------------------- | ------------------------------------------- |
| T-C-1 | Tras 2 s sin teclear se guarda, y el indicador pasa por "Guardando…" |                                             |
| T-C-2 | El `version` nuevo se adopta y el siguiente guardado no da conflicto | Dos guardados seguidos                      |
| T-C-3 | **`VERSION_CONFLICT` se muestra y se ofrece recargar**               | No se reintenta en silencio                 |
| T-C-4 | Al perder el foco se guarda sin esperar al debounce                  |                                             |
| T-C-5 | Un borrador local más nuevo se **ofrece**, no se aplica solo         | La pestaña olvidada no resucita texto viejo |
| T-C-6 | El borrador local se borra al confirmar el guardado                  | Si no, reaparecería para siempre            |
| T-C-7 | Los estados se anuncian en `aria-live`                               | a11y                                        |

### 4.4 Media (#, y la fila de §7.1)

| ID    | Caso                                                    | Verificación                                |
| ----- | ------------------------------------------------------- | ------------------------------------------- |
| T-D-1 | Un tipo fuera de la lista se rechaza **en el servidor** | Con `Content-Type` falsificado              |
| T-D-2 | **`image/svg+xml` se rechaza**                          | Es el caso que la gente espera que funcione |
| T-D-3 | Un fichero por encima de 5 MB se rechaza                |                                             |
| T-D-4 | Sin sesión no se emite ningún token de subida           |                                             |
| T-D-5 | El nombre guardado no es el del usuario                 | Se prueba con `../../etc/passwd`            |
| T-D-6 | Borrar un medio borra también el fichero en Blob        | Si no, se paga almacenamiento invisible     |

### 4.5 Historial, usuarios y ajustes

| ID    | Caso                                                          | Verificación              |
| ----- | ------------------------------------------------------------- | ------------------------- |
| T-E-1 | El historial lista las revisiones de esa entrada, no de otras |                           |
| T-E-2 | "Restaurar" lleva a borrador y **no publica**                 | Sobre la tabla            |
| T-E-3 | La confirmación dice **qué** se va a perder                   | #92                       |
| T-E-4 | `/admin/users` responde 404 o redirige para un `editor`       | El guard, no solo el menú |
| T-E-5 | La invitación se puede canjear y la contraseña queda puesta   | #95                       |
| T-E-6 | El token de invitación no vale dos veces                      | #95                       |

### 4.6 Guards

| ID    | Caso                                                                         | Verificación |
| ----- | ---------------------------------------------------------------------------- | ------------ |
| T-F-1 | **Toda ruta bajo `/admin` está cubierta por los dos guards**                 | #70          |
| T-F-2 | El e2e completo: login → editar → guardar → publicar → historial → restaurar | DoD de M4    |

---

## 5. Definition of Done de M4

1. El e2e del recorrido completo, en verde contra un servidor real.
2. La fila **abuso de uploads** de §7.1 cerrada, con su ADR sobre el SVG.
3. Ninguna palabra de jerga en el panel, comprobado automáticamente.
4. Los dos guards de `/admin` con el test que impide que diverjan (#70).
5. `docs/PROGRESS.md` cierra M4.

---

## 6. Decisiones que exigen ADR

- Por qué la allowlist se aplica en el servidor y no en el `accept` del formulario. (El SVG
  fuera de la lista no necesita ADR: lo decide `SPEC.md` §5.3.)
- **`localStorage` como red de seguridad del autosave**: qué se guarda, cuándo se borra y por
  qué se ofrece en vez de aplicarse.
- **Tiptap como editor de texto rico**, cargado con `dynamic` (§8), y qué extensiones se
  habilitan — que tienen que ser exactamente las de la allowlist de §6.3, o el editor
  produciría documentos que el saneador de M3 recorta.
