# 08 — Vista previa en vivo de una web que vive fuera

> Escrita **antes** del código. Los casos de la sección 6 son la definición de "hecho".
>
> Esta fase **cambia la premisa del producto**. Antes de leerla conviene leer [#176](https://github.com/KthArg/uno-cms/issues/176), que es donde está escrita la contradicción con `SPEC.md` §0, y el ADR que la resuelve.

## 1. Qué se pide, y qué se decidió al acotarlo

Alimentar con este CMS una web que no vive en este repositorio, **conservando la vista previa en vivo**: escribir en el panel y ver la web de verdad cambiando al lado.

Tres decisiones tomadas antes de diseñar nada:

| Pregunta                                         | Respuesta                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| ¿Se puede modificar el código de la web destino? | **Sí.** Añade un cliente nuestro                                                       |
| ¿Un CMS por web, o uno para varias?              | **Uno por web.** Sigue siendo 1:1; lo único que cambia es que la web puede estar fuera |
| ¿Dónde corren?                                   | **Los tres casos**: ambos desplegados, ambos en local, o mezclados                     |

La segunda es la que mantiene esto acotado. **No hay multi-tenant**: ni modelo de contenido por sitio, ni permisos por sitio, ni aislamiento. `§4` y `§7` de `SPEC.md` no se tocan.

## 2. El límite que no es nuestro

Una web que no sabe que existimos **no puede** enseñar contenido sin publicar. Renderiza lo suyo, desde su fuente. Para enseñar un borrador tiene que pedírnoslo.

Por eso este diseño **exige que la web colabore**, y por eso la primera pregunta de arriba era la que decidía la arquitectura entera. La alternativa —un proxy que pide el HTML de la web y sustituye los textos— se descarta en el ADR: acierta con lo que sirve el servidor, falla con todo lo que se pinte en el cliente, y no hay forma de que quien mira sepa en cuál de los dos casos está. Una vista previa que a veces miente es peor que no tenerla.

## 3. Fuera de alcance

- **Multi-sitio.** Un despliegue sigue sirviendo a una web.
- **El proxy con sustitución de HTML.** Descartado con su motivo en el ADR.
- **Publicar hacia fuera.** El aviso a la web destino cuando se publica —un webhook— es otro problema y otra fase. Hoy `publish` solo invalida nuestra caché, y la web remota se entera cuando vuelva a pedirlo.
- **Los ajustes por API.** El nombre del sitio y el SEO por defecto siguen sin endpoint público. Si la web remota los necesita, es una fase aparte.
- **Apagar la landing de este repositorio.** Sigue existiendo y sirviéndose. Quien use una web remota tendrá una landing propia sin usar; quitarla es otra decisión.

## 4. Contratos

### 4.1 Cómo se enciende, y por qué por entorno y no por ajuste

Dos variables de entorno:

```
PREVIEW_URL=https://mi-web.com          # a dónde apunta el iframe
PREVIEW_ORIGINS=https://mi-web.com      # quién puede leer borradores (lista por comas)
```

**Sin `PREVIEW_ORIGINS`, nada de esta fase existe**: la vista previa sigue siendo la de hoy, ningún borrador sale, y la ruta nueva responde 404. Es la misma forma que el almacén local de ADR-700 — una funcionalidad que se apaga entera, no una que se degrada.

**Por entorno y no por ajuste editable en el panel**, y esto es una decisión de seguridad, no de comodidad: esta lista decide **quién puede leer contenido sin publicar**. Un ajuste en la base de datos lo puede cambiar cualquiera con una sesión de administrador — o cualquiera que consiga una. Una variable de entorno solo la cambia quien despliega.

Que sean dos variables y no una es a propósito: `PREVIEW_URL` puede llevar ruta (`https://mi-web.com/es/`) y el origen no. Derivar una de la otra funcionaría hasta el primer caso raro.

### 4.2 El token: propósito nuevo y vida corta

El token de vista previa de hoy dura **dos horas** (`TOKEN_TTL.preview`, §6.1) y nunca sale de nuestro origen. El de la vista previa remota **viaja a un tercero**, aparece en la barra de direcciones de esa web y acaba en su historial y probablemente en los registros de su servidor.

Así que no se reutiliza: **propósito nuevo `preview-remoto`, con TTL de 15 minutos**.

Dos propiedades, las dos gratis porque `verifyToken` ya comprueba el propósito:

- Un token remoto **no sirve** contra `/preview`, ni al revés.
- Cuando se filtre —y un token que viaja a un tercero se filtra— caduca en minutos, no en horas.

**La renovación hay que construirla, no darla por hecha.** Escribí esta sección diciendo que "el panel lo renueva mientras la pestaña está abierta" como si fuera una consecuencia, y no lo es: con quince minutos y sin renovación, la vista previa se cae a mitad de una sesión de edición larga — un fallo peor que el que se quería evitar, porque aparece justo cuando alguien lleva rato trabajando.

Así que es parte del contrato:

- El panel pide un token nuevo **antes** de que caduque el que tiene, sin recargar el iframe.
- Si la renovación falla, la vista previa **lo dice** y ofrece recargar. No se queda enseñando contenido viejo como si estuviera vivo, que es la forma silenciosa de mentir.

Sus casos son T-R-19 y T-R-20.

### 4.3 Leer borradores desde fuera

`GET /api/preview/contenido?token=…`

Devuelve exactamente lo que hoy calcula `previewContentConObjetivo(key)`: **el borrador de la clave que autoriza el token, y lo publicado de todo lo demás** (ADR-501). Ni una clave más.

| Situación                             | Respuesta                         |
| ------------------------------------- | --------------------------------- |
| `PREVIEW_ORIGINS` sin definir         | **404**                           |
| `Origin` fuera de la lista            | **404**, y sin cabecera CORS      |
| Token ausente, caducado o mal firmado | **404**                           |
| Correcto                              | 200 con `{ contenido, objetivo }` |

Cabeceras en el caso correcto:

- `Access-Control-Allow-Origin: <el origen pedido>` — **nunca `*`**, y solo si estaba en la lista.
- `Vary: Origin`, porque la respuesta depende de él y una caché intermedia sin esto serviría la de otro.
- `Cache-Control: no-store`. Son borradores.

**404 y no 403 en todos los rechazos**, por lo mismo que el resto del proyecto: un 403 confirma que la ruta existe y que solo falta la credencial.

### 4.4 La CSP deja de estar clavada a `'self'`

Hoy es `default-src 'self'` sin `frame-src`, así que hereda `'self'` y no se puede empotrar nada externo. Se añade `frame-src 'self' <PREVIEW_ORIGINS>`.

**Solo `frame-src`.** `connect-src`, `script-src` y los demás se quedan como están: la web remota nos pide datos a nosotros, no al revés.

### 4.5 Los mensajes en vivo

Hoy los dos extremos están clavados al mismo origen, con el motivo escrito en el código: el emisor manda con origen explícito «nunca `*`», y el receptor descarta lo que no venga de `window.location.origin`.

Eso **no se relaja, se parametriza**:

- El panel manda a `new URL(PREVIEW_URL).origin`. Sigue siendo un origen explícito; ahora se lee de la configuración en vez de estar fijo.
- El cliente en la web remota comprueba que el mensaje viene del origen del CMS, que conoce porque de ahí ha sacado los datos.

En ningún momento aparece un `*` en ninguno de los dos lados. Si `PREVIEW_URL` no está, el panel sigue mandando a su propio origen.

### 4.6 El cliente que va en la web remota

Un módulo pequeño, y **solo se carga en vista previa**:

```js
if (new URLSearchParams(location.search).has('unocms_preview')) {
  const { conectar } = await import('https://mi-cms.com/preview-cliente.js');
  conectar((contenido) => {
    /* tu web decide qué hacer */
  });
}
```

Tres cosas que fija este contrato:

1. **Los visitantes de la web en producción no descargan nada nuestro.** El `import()` solo ocurre con el parámetro puesto, que solo pone el panel.
2. **No re-renderizamos la web de nadie.** El cliente entrega el contenido y avisa cuando cambia; qué hacer con él lo decide esa web. Cualquier otra cosa sería adivinar su arquitectura.
3. **Es JavaScript a secas.** Se ofrece además un hook para React, pero el contrato base no supone framework.

**Lo que hace falta del lado de la web destino, y conviene saberlo antes de integrar**: si tiene su propia CSP —y debería—, su `script-src` tiene que permitir el origen del CMS, y su `connect-src` también, porque el cliente pide los borradores por `fetch`. No podemos comprobarlo desde aquí ni arreglarlo por ellos; lo que sí podemos es que salga en la documentación en vez de en su consola.

## 5. Lo que NO cambia, y hay que comprobarlo

Es la mitad del trabajo de esta fase:

- **`GET /api/content/:key` sigue sirviendo solo lo publicado.** Es la ruta pública de siempre y no se le añade CORS ni borradores. Los borradores salen **únicamente** por la ruta nueva, con token y con origen.
- **`/preview` sigue existiendo** para quien tenga la web en este repositorio.
- **Sin `PREVIEW_ORIGINS`, el comportamiento es idéntico al de hoy**, incluida la CSP.

## 6. Casos de prueba — la definición de "hecho"

### 6.1 El interruptor

| ID    | Caso                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| T-R-1 | Sin `PREVIEW_ORIGINS`, la ruta de borradores responde 404                            |
| T-R-2 | Sin `PREVIEW_ORIGINS`, la CSP es **byte a byte** la de hoy                           |
| T-R-3 | Con la variable, `frame-src` lleva esos orígenes y **ninguna otra directiva cambia** |

### 6.2 Quién puede leer borradores

| ID    | Caso                                                                              |
| ----- | --------------------------------------------------------------------------------- |
| T-R-4 | Un `Origin` que no está en la lista → 404 y **sin** `Access-Control-Allow-Origin` |
| T-R-5 | Un origen de la lista → 200, con ese origen exacto en la cabecera y nunca `*`     |
| T-R-6 | La respuesta lleva `Vary: Origin` y `Cache-Control: no-store`                     |
| T-R-7 | Un origen que **contiene** a uno permitido (`https://mi-web.com.malo.io`) → 404   |
| T-R-8 | Solo sale el borrador de la clave del token; el resto viene publicado (ADR-501)   |

T-R-7 es el que importa de este bloque: comparar orígenes con `includes` o `startsWith` es el fallo clásico, y es indistinguible del correcto salvo con este caso delante.

### 6.3 El token

| ID     | Caso                                                                           |
| ------ | ------------------------------------------------------------------------------ |
| T-R-9  | Un token de propósito `preview` **no** vale en la ruta remota                  |
| T-R-10 | Un token remoto **no** vale en `/preview`                                      |
| T-R-11 | Caducado, mal firmado y ausente responden **igual**                            |
| T-R-12 | Un token remoto recién emitido **caduca** al pasar su TTL, con el reloj fijado |

T-R-12 decía antes "el TTL es de minutos, no de horas", que es comprobar una constante contra un rango: pasaría con cualquier número entre uno y cincuenta y nueve, y no ejercita una sola línea de `verifyToken`. Con el reloj fijado se comprueba lo que importa —que caduca— en vez de cómo está escrito.

### 6.3b La renovación

| ID     | Caso                                                                                |
| ------ | ----------------------------------------------------------------------------------- |
| T-R-19 | Con la pestaña abierta, el token se renueva antes de caducar y el iframe no recarga |
| T-R-20 | Si la renovación falla, se dice y se ofrece recargar; no se sigue como si nada      |

### 6.4 Que no se rompa lo de siempre

| ID     | Caso                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| T-R-13 | `GET /api/content/:key` sigue sin devolver borradores, con la fase encendida |
| T-R-14 | `GET /api/content/:key` sigue sin cabeceras CORS                             |
| T-R-15 | `/preview` sigue funcionando igual para una web de este repositorio          |

### 6.5 Los mensajes

| ID     | Caso                                                                  |
| ------ | --------------------------------------------------------------------- |
| T-R-16 | Con `PREVIEW_URL`, el panel manda al origen de esa URL, nunca a `*`   |
| T-R-17 | Sin ella, manda a su propio origen, como hoy                          |
| T-R-18 | El cliente remoto descarta un mensaje que no venga del origen del CMS |

## 7. En qué piezas se corta

| Pieza                             | Issue                                                | Casos                     |
| --------------------------------- | ---------------------------------------------------- | ------------------------- |
| El interruptor y la CSP           | [#177](https://github.com/KthArg/uno-cms/issues/177) | T-R-1 … T-R-3             |
| El propósito de token propio      | [#178](https://github.com/KthArg/uno-cms/issues/178) | T-R-9 … T-R-12            |
| La ruta que sirve borradores      | [#179](https://github.com/KthArg/uno-cms/issues/179) | T-R-4 … T-R-8, T-R-13, 14 |
| El iframe remoto y los mensajes   | [#180](https://github.com/KthArg/uno-cms/issues/180) | T-R-15 … T-R-17           |
| El cliente para la web de destino | [#181](https://github.com/KthArg/uno-cms/issues/181) | T-R-18                    |

En ese orden, y no es arbitrario: **#177 es el interruptor**, así que hasta que exista, cada pieza siguiente se construye ya apagada por defecto. Lo contrario —construir la ruta de borradores primero y ponerle el interruptor después— deja una ventana en la que existe un endpoint que sirve contenido sin publicar y nada lo apaga.

## 8. Lo que exige ADR

1. **Derogar parcialmente ADR-001** y la frase de §0 "no es headless multi-sitio". Con su límite: 1 CMS = 1 web sigue en pie.
2. **Que los borradores salgan de la aplicación.** Es la propiedad de seguridad más fuerte que tiene hoy el proyecto y deja de ser cierta. Hay que escribir a cambio de qué, y con qué se acota.
3. **Descartar el proxy con sustitución de HTML**, con el motivo.
