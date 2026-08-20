# Pendientes

Todo lo que se ha aplazado, con su motivo y **su issue**. Nada de lo que hay aquí vive solo en
un comentario de código o en una conversación de un PR.

## Por qué existe este documento

Un proyecto que avanza por hitos aplaza cosas continuamente, y casi siempre con razón. El
problema no es aplazar: es que lo aplazado se disuelva. Una limitación explicada con detalle
dentro de una función es invisible desde fuera; una decisión tomada en la revisión de un PR
deja de existir en cuanto ese PR se mergea.

Este registro le da un sitio único a cada cosa, y hay un test —
`tests/unit/pendientes.test.ts` — que **falla si aparece en el código una nota de algo
aplazado sin un issue al que apuntar**. Sin ese test, el documento se quedaría atrás en dos
semanas.

## Cómo se escribe una nota aplazada

En el código, citando el issue:

```ts
// PENDIENTE(#117): sin medir. La estructura de §8 se cumple, pero un presupuesto sin
// medición es una hipótesis.
```

El test acepta `PENDIENTE`, `TODO` y `FIXME`, y exige el `#N` en la misma línea. Si no hay
issue, es que la decisión no está tomada — y entonces lo que falta no es un comentario, es
abrir el issue.

---

## Deuda viva

Ordenada por cuándo se resuelve. Lo que está en un hito ya planificado no se repite aquí salvo
que sea una limitación conocida y no una función por construir.

### En M4 (el hito actual)

| Qué                                                      | Por qué se aplazó                                                                                                                                           | Issue                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| La pantalla de una colección                             | El dashboard **ya enlaza** a `/admin/collections/[key]` y las actions existen desde M3. Encontrado auditando lo aplazado: ningún issue la construía         | [#111](https://github.com/KthArg/uno-cms/issues/111) |
| Nada impide llamar a código de cliente desde el servidor | Ha pasado dos veces en M4, y las dos con `typecheck`, `lint` y `build` en verde. Hace falta la frontera al revés que `server-only`                          | [#125](https://github.com/KthArg/uno-cms/issues/125) |
| Las rutas de `/api` no tienen inventario de acceso       | Los guards de #70 cubren `/admin`; una ruta bajo `/api` se protege sola y nada dice cuáles deben ser públicas. Se cierra con la primera ruta de API privada | [#104](https://github.com/KthArg/uno-cms/issues/104) |

### En M5

| Qué                                                              | Por qué se aplazó                                                                                                                                                                                      | Issue                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| La invalidación de caché no está verificada de extremo a extremo | Se comprueba que `publish` llama a `revalidateTag` con el tag correcto; que la landing **cambie** necesita un servidor (ADR-405)                                                                       | [#116](https://github.com/KthArg/uno-cms/issues/116)                                                     |
| Nadie consume el token de vista previa                           | `createPreviewToken` emite llaves para una puerta que no está construida                                                                                                                               | [#114](https://github.com/KthArg/uno-cms/issues/114)                                                     |
| ADR-107 no está verificado                                       | Afirma que no existe ningún punto donde inyectar markup, y no hay renderizador de texto rico todavía                                                                                                   | [#113](https://github.com/KthArg/uno-cms/issues/113), [#19](https://github.com/KthArg/uno-cms/issues/19) |
| Los ajustes no los lee nadie                                     | `readSettings` y su tag existen y están probados; el layout que los use llega con la landing                                                                                                           | [#112](https://github.com/KthArg/uno-cms/issues/112)                                                     |
| El guard de `/setup` vuelve dinámica la landing                  | §7.3 y §8 se contradicen; cuatro salidas evaluadas en el issue                                                                                                                                         | [#71](https://github.com/KthArg/uno-cms/issues/71)                                                       |
| El selector de móvil y escritorio de la vista previa             | Lo dibuja el diagrama de §6.1 y no aparece en ningún otro sitio de la spec ni en los criterios de los issues. Lo que resuelve es una anchura de iframe; la vista previa en vivo funciona entera sin él | [#138](https://github.com/KthArg/uno-cms/issues/138)                                                     |

### En M6

| Qué                                                          | Por qué se aplazó                                                                                                                                                                                                  | Issue                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| El driver de producción nunca ha hablado con Neon            | Los 190 tests de integración corren contra Postgres local con `node-postgres`: lo verificado es el SQL, no el driver                                                                                               | [#43](https://github.com/KthArg/uno-cms/issues/43)   |
| El límite de peticiones es **por instancia**                 | Sin backend distribuido, en un despliegue con varias instancias el límite efectivo se multiplica. El bloqueo de cuenta sí es global                                                                                | [#65](https://github.com/KthArg/uno-cms/issues/65)   |
| `publishAll` tiene un tope de 100 por llamada                | El bucle vive en una Server Action y en serverless hay límite de duración. Se reporta en `remaining`, no se trunca en silencio                                                                                     | [#119](https://github.com/KthArg/uno-cms/issues/119) |
| La pantalla de una colección no pagina ni avisa de los topes | `reorderItems` acepta 500 y `publishAll` publica 100 por llamada. Con listas de una landing —cinco o diez— sobra; construir paginación para un problema que no existe es peor. Se notará porque el tope se alcance | [#119](https://github.com/KthArg/uno-cms/issues/119) |
| Los presupuestos de §8 no se miden                           | Se cumple la estructura; una estructura correcta sin medición es una hipótesis                                                                                                                                     | [#117](https://github.com/KthArg/uno-cms/issues/117) |
| `emitUpdate: false` no está verificado                       | El tipo de Tiptap documenta que el valor por defecto es `true`, pero poniéndolo a `true` el evento tampoco se emite: la mutación sobrevive                                                                         | [#121](https://github.com/KthArg/uno-cms/issues/121) |
| La posición del cursor del editor no se prueba               | jsdom no maqueta: todo lo tecleado entra al principio del documento, con y sin el código que se quería probar                                                                                                      | [#121](https://github.com/KthArg/uno-cms/issues/121) |
| Falta la documentación para quien despliega                  | `SETUP.md`, `DEVELOPER.md` y `SECURITY.md`                                                                                                                                                                         | [#118](https://github.com/KthArg/uno-cms/issues/118) |
| La revisión de seguridad transversal                         | Es la primera vez que se puede hacer con el sistema entero construido                                                                                                                                              | [#120](https://github.com/KthArg/uno-cms/issues/120) |

---

## Deuda aceptada

Cosas que **no** se van a arreglar, con la decisión escrita. Están aquí para que nadie las
redescubra como si fueran un hallazgo.

| Qué                                                                       | Por qué se acepta                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dos creaciones simultáneas en una colección pueden empatar en `sortOrder` | Cubrirlo exige un bloqueo consultivo o `SERIALIZABLE`. El daño es que dos elementos creados en el mismo milisegundo salgan en el orden del desempate por clave; el orden sigue siendo **determinista** y el editor los arrastra. Probé el `FOR UPDATE` que parecía arreglarlo y **no arregla nada**: bloquea filas existentes y no protege de una fila que otra transacción inserta                                                               |
| `revertDraft` no lleva `version`                                          | La entrada la fija `SPEC.md` §5.3 y la operación es destructiva por definición. Lo que falta no es un chequeo en la action, es la confirmación en la interfaz — que sí está planificada                                                                                                                                                                                                                                                           |
| `trustHost: true` en Auth.js                                              | `SPEC.md` §0 pide auto-hospedable, así que hay que confiar en el `Host`. Las mitigaciones están en ADR de M2 y en `.env.example`; lo que queda vivo se cierra definiendo `AUTH_URL` en el despliegue                                                                                                                                                                                                                                              |
| Las claves de colección son UUID y no nanoid                              | `SPEC.md` §5.3 dice nanoid; la propiedad que hace falta la da `crypto.randomUUID()` sin una dependencia de tiempo de ejecución (ADR-408). La cadena no la lee nadie                                                                                                                                                                                                                                                                               |
| El tamaño de las imágenes se guarda como 0                                | El callback de subida completada de Blob no trae el tamaño del fichero. Es un dato de presentación: un cero visible es mejor que un número declarado por el cliente que parece medido                                                                                                                                                                                                                                                             | —   |
| El límite de tamaño lo declara el cliente                                 | La decisión ocurre antes de que el fichero exista, porque ADR-005 evita que pase por nuestro servidor. El suelo real es el límite por fichero de Vercel Blob; el nuestro adelanta el rechazo y lo explica en español                                                                                                                                                                                                                              | —   |
| La condición de concurrencia del canje de invitación no tiene test propio | `redeemInvitation` condiciona su `update` a la versión leída al comprobar el enlace, para que dos canjes solapados no se pisen. No se puede forzar el solapamiento desde fuera sin abrir una costura en el módulo solo para el test. Lo que sí está probado es el contrato —de dos canjes a la vez gana uno y la cuenta acaba con una sola contraseña—, que es lo que se promete hacia fuera                                                      |
| La lista de personas no pagina                                            | Mismo caso que las colecciones: `SPEC.md` describe el equipo de una landing, que son unas pocas cuentas. Paginar ahora sería resolver un problema que este producto no tiene                                                                                                                                                                                                                                                                      |
| «Todavía no ha entrado» se deduce de `password_version`                   | No hay columna de último acceso —`SPEC.md` §4 no la contempla— y añadirla obligaría a escribir en la base de datos en cada acceso. Quien canjea su invitación y nunca llega a entrar aparece como que sí. El dato es una ayuda para saber a quién falta mandarle su enlace, no un registro de actividad                                                                                                                                           |
| La suite e2e corre con un solo worker en CI y en paralelo en local        | Es la asimetría al revés de la habitual: una carrera entre ficheros aparece en la máquina de quien desarrolla y **no** en CI. Se acepta porque el runner tiene dos núcleos y darle cuatro navegadores lo haría más lento y más inestable, no más estricto. La contrapartida es que la ejecución local es la exigente, y eso hay que saberlo: si la suite falla en local y pasa en CI, el sospechoso es el estado compartido, no la máquina (#134) |
| El editor guarda al pasar de un campo a otro                              | SPEC §8 habla del "blur del formulario" y el `onBlur` del contenedor salta también al tabular entre campos. Guardar de más es el lado correcto en el que equivocarse; la alternativa —comparar `relatedTarget`— es más código y más frágil por una escritura barata                                                                                                                                                                               |

---

## Contradicciones de la spec ya resueltas

Cada una con su ADR. Se listan porque quien lea `SPEC.md` de cero se va a topar con ellas.

| Contradicción                                                                           | Resolución                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| §5.2 aplica el esquema estricto a valores vacíos, y §5.1 pide "valores vacíos/default"  | ADR-404: leer no lanza nunca y resuelve campo a campo |
| §9 exige el nombre de la sección en los avisos; §5.1 no le da nombre a ningún singleton | ADR-406: `s.object` acepta etiqueta                   |
| §5.3 pide `deactivateUser`; §4 no tiene dónde guardarlo                                 | ADR-409: columna `active`, con sus tres consecuencias |
| ADR-002 fija un driver HTTP; §4 exige transacciones                                     | ADR-200: driver WebSocket                             |
| §6.3 pide sanear richtext; §7.1 lo prohíbe en cliente                                   | ADR-107 y #19, pendiente de verificación en M5        |
