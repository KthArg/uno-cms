# M6 — Endurecimiento, rendimiento y release

Derivado de `SPEC.md` §7 (seguridad completa), §8 (presupuestos de rendimiento), §9 (experiencia
del usuario no técnico) y §11 (criterios de aceptación del MVP).

Este documento fija el alcance, los contratos y los casos de prueba **antes** de escribir
código. Los tests salen de la tabla de casos, no de la implementación.

---

## 1. Alcance

| Issue | Entrega                                                                 |
| ----- | ----------------------------------------------------------------------- |
| #149  | Este documento                                                          |
| #146  | `sitemap.ts` que excluye lo que el middleware marca como no indexable   |
| #121  | Por qué `emitUpdate: false` no se puede verificar, y qué vigila el test |
| #119  | El tope de `publishAll`: resolverlo o cerrarlo con la decisión escrita  |
| #117  | Lighthouse CI con los presupuestos de §8, bloqueantes                   |
| #120  | Revisión de seguridad transversal, con evidencia por fila               |
| #65   | El limitador distribuido: implementarlo o cerrarlo como limitación      |
| #118  | Documentación, Deploy Button y `v0.1.0`                                 |

Orden: **#149 → #146 → #121 → #119 → #117 → #120 → #118**.

Los dos primeros son pequeños y cierran cabos sueltos de hitos anteriores. #119 y #117 pueden
cambiar código, así que van antes de la revisión. **#120 va penúltimo a propósito**: una
revisión de seguridad hecha antes del último cambio de código no revisa lo que se publica.
#118 cierra.

### Qué tiene de distinto este hito

Es el único cuyo trabajo consiste sobre todo en **comprobar lo que ya está**, no en añadir. Eso
tiene un riesgo propio: sin un criterio escrito de antemano, "endurecer" se convierte en tocar
cosas hasta que parezcan más seguras, y "medir" en apuntar el número que salga.

Por eso este documento fija, para cada cosa que hay que comprobar, **qué herramienta, contra qué
contenido y con qué umbral**. Un presupuesto sin umbral bloqueante no es un presupuesto: es una
observación.

## 2. Fuera de alcance de M6

- **Todo `SPEC.md` §10**: 2FA, reset por correo, publicación programada, campos anidados y
  `reference`, i18n, diff visual entre revisiones, exportar/importar y extraer `cms/` como
  paquete. Cada uno tiene su issue `post-mvp` **sin código**.
- **Optimizar lo que la medida no señale.** Si Lighthouse pasa los umbrales, no se toca nada
  "por si acaso": optimizar sin una medida que lo pida es cambiar código a ciegas.
- **Rediseñar el panel.** §9 pide que se entienda, no que sea bonito, y eso ya tiene sus tests.
- **Corregir lo que la revisión de seguridad encuentre y no sea explotable.** Se escribe en
  `docs/SECURITY.md` como limitación conocida, con su motivo; arreglarlo sin evaluar el coste
  al final del proyecto es cómo se rompe un release.

## 3. Contratos

### 3.1 Qué significa "medido" (§8, issue #117)

`SPEC.md` §8 fija cuatro presupuestos. Para cada uno, cómo se comprueba:

| Presupuesto                 | Herramienta                           | Umbral bloqueante |
| --------------------------- | ------------------------------------- | ----------------- |
| Performance de la landing   | Lighthouse CI contra el build servido | **≥ 90**          |
| Accesibilidad de la landing | Lighthouse CI                         | **≥ 95**          |
| LCP en 4G simulado          | Lighthouse CI, perfil móvil           | **< 2,5 s**       |
| JS de cliente en la landing | Tamaño de los chunks del build, en gz | **≤ 60 KB**       |

Tres decisiones que la spec no fija y hay que fijar:

1. **Se mide contra contenido de ejemplo, no contra una landing vacía.** Una página sin texto ni
   imágenes saca 100 en todo y no dice nada. El contenido del seed es el mínimo honesto.
2. **El fallo dice qué presupuesto se pasó y por cuánto.** Un job en rojo que solo dice
   "Lighthouse failed" se ignora a la tercera vez.
3. **Los 60 KB se cuentan sobre el JS que descarga la landing**, no sobre el total del build.
   El panel vive en otro grupo de rutas justamente para que no cuente, y confundirlos haría el
   presupuesto imposible de cumplir y sin sentido.

### 3.2 Cómo se cierra la tabla de amenazas (§7.1, issue #120)

**Cada fila apunta a un test, con su identificador.** No a un módulo, no a un ADR, no a una
frase. Un ADR explica una decisión; lo que demuestra que la decisión sigue viva es un test que
se ejecuta.

Las filas que no puedan cerrarse así se marcan como **limitación conocida** en
`docs/SECURITY.md`, con tres cosas: qué no está cubierto, por qué, y qué lo mitiga mientras
tanto. Omitirlas sería peor que no tener el documento — un modelo de amenazas incompleto que
parece completo es una promesa falsa.

### 3.3 Qué se hace con lo que no se implementa (#65)

`SPEC.md` §2 contempla Upstash "**(opcional)** con fallback in-memory". El fallback está
implementado, medido y avisa de sí mismo al arrancar (ADR-303).

El contrato de este hito: **o se implementa con tests que lo ejerciten, o se cierra con la
decisión escrita**. Lo que no se hace es dejarlo abierto: un issue de seguridad sin resolver al
cerrar el MVP es una promesa de que alguien lo mirará.

### 3.4 El tope de `publishAll` (#119)

Publica como mucho 100 entradas por llamada porque el bucle corre dentro de una Server Action y
en serverless la función tiene un límite de duración. Al agotarse **no se pierde lo publicado**
—cada entrada va en su transacción— pero sí el informe.

Mismo contrato que #65: se resuelve o se cierra con la decisión escrita, y lo que se elija sigue
siendo **todo-o-nada por entrada** (ADR-401) y sigue diciendo qué se quedó fuera.

## 4. Casos de prueba — la definición de "hecho"

### 4.1 Sitemap (#146)

| ID    | Caso                                                          | Verificación |
| ----- | ------------------------------------------------------------- | ------------ |
| T-L-1 | El sitemap incluye la landing                                 | e2e          |
| T-L-2 | **No** incluye ninguna ruta que el middleware marca `noindex` | estructural  |
| T-L-3 | La lista de rutas no indexables es **una sola**, compartida   | estructural  |

### 4.2 Presupuestos (#117)

| ID    | Caso                                                                 | Verificación      |
| ----- | -------------------------------------------------------------------- | ----------------- |
| T-M-1 | Performance ≥ 90 y accesibilidad ≥ 95 sobre la landing con contenido | Lighthouse CI     |
| T-M-2 | LCP < 2,5 s en 4G simulado                                           | Lighthouse CI     |
| T-M-3 | JS de cliente de la landing ≤ 60 KB gz                               | tamaño del build  |
| T-M-4 | Pasarse de un presupuesto **rompe CI** y dice cuál y por cuánto      | comprobado a mano |

### 4.3 Seguridad transversal (#120)

| ID    | Caso                                                           | Verificación |
| ----- | -------------------------------------------------------------- | ------------ |
| T-N-1 | Las cabeceras de §7.2 sobre **todas** las clases de ruta       | e2e          |
| T-N-2 | Ninguna exención `// isomorphic:` emite JavaScript             | ya existe    |
| T-N-3 | Ninguna lista que deba ser única ha vuelto a duplicarse        | estructural  |
| T-N-4 | `pnpm audit --audit-level=high` limpio                         | CI           |
| T-N-5 | Cada fila de §7.1 apunta a un test que existe **y se ejecuta** | estructural  |

**T-N-3 no es lo que pedía el issue #120, y conviene decirlo.** Aquel pedía repasar "las copias
amarradas por test (ADR-411, protocolos de enlace)". Esa copia **ya no existe**: ADR-500 la
eliminó al sacar `isSafeLink` de la frontera, y una implementación no puede divergir de sí
misma. El issue se escribió antes.

Lo que queda por vigilar es lo contrario: que no **reaparezca** una copia sin amarrar. Hoy hay
dos listas que tienen que ser únicas —las rutas públicas del panel (#106) y las no indexables
(#146)— y las dos se comparten en vez de copiarse. El caso comprueba eso.

**T-N-5 merece explicación**, porque es el caso que sostiene el resto: la tabla de amenazas vive
en un documento, y un documento no se ejecuta. El test lee la tabla, extrae los identificadores
que cita y comprueba que **cada uno existe en la suite**. Sin él, la tabla se queda desfasada en
el primer test que alguien renombre, y seguirá pareciendo completa.

### 4.4 Release (#118)

| ID    | Caso                                                                 | Verificación    |
| ----- | -------------------------------------------------------------------- | --------------- |
| T-O-1 | Un despliegue limpio siguiendo `SETUP.md` termina en landing + panel | a mano, una vez |
| T-O-2 | Los seis criterios de §11, cada uno con dónde se verifica            | `PROGRESS.md`   |
| T-O-3 | `DEVELOPER.md` describe el camino completo sin pasos implícitos      | revisión        |

---

## 5. Definition of Done de M6 — los seis criterios de `SPEC.md` §11

| #   | Criterio                                                       | Cómo se verifica                                                   |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Deploy limpio termina en landing pública y admin protegido     | A mano, una vez, siguiendo `SETUP.md` sin saltarse pasos (T-O-1)   |
| 2   | Un no técnico edita, ve la preview, publica y revierte         | El e2e del recorrido completo (T-F-2) y el de vista previa (T-J-1) |
| 3   | Toda mutación rechaza sin sesión y con rol insuficiente        | Integración: el envoltorio y T-75-6, que impide saltárselo         |
| 4   | Suite verde en CI, con cobertura ≥ 80 % en `core` y `security` | El propio CI, que ya la exige                                      |
| 5   | Sin findings high/critical; CSP verificada; zod en cada action | T-N-4, T-N-1 y los tests de payloads malformados de M3             |
| 6   | Un dev externo monta el CMS sobre una landing nueva en < 1 h   | `DEVELOPER.md` (T-O-3). **Ver la nota de abajo**                   |

**El criterio 6 no se puede verificar honestamente desde dentro.** Dice "validado con el
proyecto de ejemplo incluido", y el proyecto de ejemplo lo he escrito yo: que yo pueda seguir mi
propia guía no demuestra nada sobre una hora de alguien que no la escribió.

Lo que sí se puede afirmar, y es lo que se afirmará: que la guía cubre **todos** los pasos, sin
ninguno implícito, y que el camino que describe es el que existe. Lo demás se marca como no
verificado en `docs/PROGRESS.md` en vez de darlo por bueno.

---

## 6. Decisiones que exigirán ADR

- **Qué se hace con el tope de `publishAll`** (#119). Las salidas están enumeradas en el issue;
  la decisión, sea cual sea —incluido dejarlo— va escrita.
- **Qué se hace con el limitador distribuido** (#65). Igual: implementarlo o cerrarlo, con el
  motivo y con lo que lo mitiga.
- **Cualquier cambio que salga de una medida de Lighthouse.** Si hay que tocar el render de la
  landing para cumplir un presupuesto, ese cambio tiene un motivo medible y conviene que quede
  con su número al lado — o dentro de un año nadie sabrá por qué está.
