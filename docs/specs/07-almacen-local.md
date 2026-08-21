# 07 — Un almacén de imágenes en disco, solo para desarrollo

> Escrita **antes** del código, como las seis anteriores. Los casos de la sección 5 son la
> definición de "hecho": si uno no se puede escribir, el diseño está mal y se cambia el diseño.

## 1. De dónde sale esto

Probando el CMS en local, al elegir una foto:

```
Vercel Blob: Failed to retrieve the client token
```

Se arreglaron los dos síntomas —el mensaje en el editor (#164) y la fuga por la respuesta de la
ruta (#165)— y ninguno de los dos arreglaba el problema: **sin cuenta de Vercel no se puede subir
una imagen**, y subir imágenes es la mitad de lo que hace el CMS de una landing.

Quien clona el repositorio hoy puede escribir textos, crear colecciones, publicar, invitar gente
y cambiar ajustes. Lo único que no puede probar es el camino que más miedo da: el que acepta
ficheros de fuera.

`SPEC.md` §0 pide auto-hospedable. Un producto que exige darse de alta en un proveedor **para
verlo funcionar** no lo es del todo.

## 2. Qué se construye, y dónde está la raya

Un segundo almacén que guarda en el disco de quien desarrolla y sirve los ficheros desde el
propio servidor.

**Se activa solo si se cumplen las dos cosas**:

1. No hay `BLOB_READ_WRITE_TOKEN`, y
2. `NODE_ENV` **no** es `production`.

La segunda no es cinturón y tirantes: es la condición que hace que esto sea aceptable. El disco
de una función serverless es efímero y no se comparte entre instancias, así que un almacén en
disco en producción **pierde imágenes en silencio** — el peor fallo posible, porque el panel
diría "subida" y la landing enseñaría un hueco semanas después.

En producción sin token no cambia nada: la subida falla y lo dice, que es lo correcto.

## 3. Fuera de alcance

- **No es un adaptador de almacenamiento genérico.** No hay interfaz, ni registro de proveedores,
  ni ajuste para elegir. Son dos caminos y una condición, porque son dos casos y no un eje de
  extensión. Cuando aparezca el tercero se generaliza con tres ejemplos delante, no con uno
  imaginado.
- **No se toca ADR-005** para el camino de Vercel: la subida directa desde el navegador se queda
  exactamente como está, incluido que el fichero no pase por nuestro servidor.
- **No hay migración entre almacenes.** Lo subido en local vive en local.

## 4. Contratos

### 4.1 Quién decide, y con qué reglas

`decidirSubida()` de `cms/security/uploads.ts` **no se toca y no se duplica**. Las dos rutas la
llaman. Todo lo que ya está probado ahí —allowlist, límite, SVG rechazado, nombre generado— vale
igual para el camino local sin escribir un solo test de esas reglas.

El nombre lo sigue generando `generarPathname()`: `media/AAAA-MM/<uuid>.<ext>`. Como la ruta se
**construye** y no se recibe, no hay nada que sanear: el recorrido de directorios no es que esté
mitigado, es que no tiene por dónde entrar. Los casos de 5.3 lo fijan igualmente, porque una
propiedad que solo existe en la cabeza de quien la escribió desaparece en el siguiente cambio.

### 4.2 Lo que el camino local hace **mejor** que el de Vercel, y por qué no arregla nada

Vercel Blob decide antes de que el fichero exista, así que el tamaño lo **declara el cliente**
(está en `docs/PENDIENTES.md` como deuda aceptada). En el camino local el fichero llega entero al
servidor, así que el límite se comprueba **sobre los bytes recibidos**.

> **Corregido al implementar.** Esta sección me hizo escribir una segunda comprobación del
> tamaño "sobre los bytes reales", creyendo que la primera miraba un número declarado. No lo
> mira: `request.formData()` reconstruye el fichero desde el cuerpo, así que `fichero.size` **es**
> lo recibido. La segunda no hacía nada, la mutación lo demostró, y está fuera.

Hay que escribirlo para que nadie lea el código local y concluya que la deuda ya no existe: el
camino de producción sigue siendo el de Vercel y sigue confiando en un número declarado.

### 4.3 Subir

`POST /api/media/local`, con el fichero en un `FormData`.

| Situación                         | Respuesta                              |
| --------------------------------- | -------------------------------------- |
| Sin sesión                        | 401, igual que `/api/media/upload`     |
| El almacén local no está activo   | **404**                                |
| Rechazo de `decidirSubida`        | 400 con el mensaje nuestro, en español |
| Los bytes recibidos pasan el tope | 400 con el mensaje de "pesa demasiado" |
| Aceptado                          | 200 con la fila creada, y auditado     |

El 404 cuando no está activo es a propósito: en un despliegue de verdad esta ruta **no debe
parecer que existe**. Un 403 confirmaría que hay ahí un endpoint de escritura.

### 4.4 Servir

`GET /api/media/local/<ruta>`, público — las imágenes salen en la landing, que la ve cualquiera.
Es el mismo acceso que el `access: 'public'` de Blob.

La ruta pedida se valida contra la **forma exacta** que genera `generarPathname()` antes de tocar
el disco. No se normaliza ni se sanea: lo que no encaja, 404.

El `Content-Type` sale de la extensión ya validada, nunca de nada que venga en la petición.

### 4.5 Qué cambia en el navegador

`MediaPicker` recibe un `almacenLocal: boolean` por props, por el mismo camino que ya recibe
`tiposAceptados` y `tamanoMaximoBytes`. Con él, un `fetch` normal; sin él, `upload()` de la
librería como hasta ahora.

Se pasa por props y no por una variable `NEXT_PUBLIC_`: la decisión es del servidor, y una
variable pública sería una segunda fuente de verdad capaz de contradecirla.

**El manejo de errores no se bifurca.** El `catch` y `mensajeDeSubida()` son los mismos, así que
el trabajo de #164 y #165 cubre los dos caminos sin repetirse.

## 5. Casos de prueba — la definición de "hecho"

### 5.1 La condición de activación

| ID    | Caso                                                             |
| ----- | ---------------------------------------------------------------- |
| T-A-1 | Con `BLOB_READ_WRITE_TOKEN`, el almacén local **no** está activo |
| T-A-2 | Sin token y con `NODE_ENV=production`, **no** está activo        |
| T-A-3 | Sin token y en desarrollo, está activo                           |
| T-A-4 | Un token de cadena vacía cuenta como "no hay token"              |

T-A-2 es el que importa. Si alguna vez se pone rojo, lo que hay debajo es un despliegue que
acepta ficheros y los tira.

### 5.2 La ruta de subida

| ID     | Caso                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| T-A-5  | Sin sesión → 401, sin escribir nada en disco                                  |
| T-A-6  | Con el almacén inactivo → 404                                                 |
| T-A-7  | Un SVG → 400 y el mensaje en español; no se escribe nada                      |
| T-A-8  | Un fichero por encima del tope → 400 **medido sobre los bytes recibidos**     |
| T-A-9  | Un PNG válido → 200, fichero en disco, fila en `media` y entrada de auditoría |
| T-A-10 | Dos subidas del mismo nombre original no se pisan                             |

### 5.3 La ruta que sirve

| ID     | Caso                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| T-A-11 | `../../.env`, con y sin codificar, → 404 y ninguna lectura fuera del directorio |
| T-A-12 | Una ruta con la forma correcta que no existe → 404                              |
| T-A-13 | Lo subido en T-A-9 se descarga con su `Content-Type`                            |

**Añadidos al implementar, y por qué** — los dos salieron de mutar el código, no de releerlo:

| ID      | Caso                                                                      |
| ------- | ------------------------------------------------------------------------- |
| T-A-11b | Un fichero **fuera** del directorio y con extensión de imagen → 404       |
| T-A-13b | Lo que genera la ruta que sube encaja con la forma que exige la que sirve |

T-A-11b existe porque **T-A-1 … T-A-11 no probaban lo que dicen**: con la forma de la ruta
mutada a `^media/.+$` —o sea, con la defensa quitada— los cinco casos seguían verdes. Lo que los
mataba era la comprobación de la extensión, porque todos acababan en `.env` o en `.local`. El
test acertaba por casualidad.

T-A-13b ata las dos escrituras de la misma forma —`generarPathname()` y el regex de la ruta que
sirve— que nada en el compilador relaciona.

### 5.3b Borrar (añadido al implementar)

| ID      | Caso                                                                        |
| ------- | --------------------------------------------------------------------------- |
| T-A-17  | Borrar una imagen local quita el fichero y la fila, y **no** llama a Vercel |
| T-A-17b | Si el fichero ya no está, la fila se borra igual                            |

Faltaba en esta spec, y por tanto faltaba en el código: había escrito la subida y no el borrado.
`deleteMedia` llamaba a `del()` de Vercel sin mirar dónde estaba el fichero, así que una imagen
local devolvía `INTERNAL` y **la fila se quedaba para siempre**, visible en la biblioteca y sin
forma de quitarla. Salió al releer el diff, no de ningún test.

Se decide por **dónde está el fichero** —el prefijo de su URL— y no por qué almacén está activo:
quien conecta un almacén de Vercel después de haber probado en local conserva filas que apuntan
al disco.

### 5.4 El editor

| ID     | Caso                                                                   |
| ------ | ---------------------------------------------------------------------- |
| T-A-14 | Con `almacenLocal`, la subida **no** llama a `upload()` de la librería |
| T-A-15 | Sin él, se llama exactamente igual que hoy                             |
| T-A-16 | Un fallo del camino local enseña el mismo mensaje que el de Vercel     |

## 6. Lo que exige ADR

Que exista un segundo almacén se aparta de `SPEC.md` §2, que nombra Vercel Blob y solo ese. La
decisión, su límite y qué la revertiría van a `docs/DECISIONS.md` antes de mezclar.
