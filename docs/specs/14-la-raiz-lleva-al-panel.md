# 14 — Con la web fuera, la raíz lleva al panel

> Escrita **antes** del código. Los casos de la sección 6 son la definición de "hecho".
>
> Origen: [#248](https://github.com/KthArg/uno-cms/issues/248). Continúa la
> [spec 08](08-vista-previa-remota.md) y no la deroga: usa su misma configuración y su misma
> función de decisión.

## 1. Qué está mal hoy

Desde ADR-701 la web que alimenta este CMS puede vivir fuera. Cuando así se configura, la landing
de este repositorio deja de ser la web de nadie — es la de ejemplo, con los cuatro componentes de
`components/site/` — y sin embargo **sigue sirviéndose en `/`**, que es justo la dirección que
alguien escribe para entrar a administrar su sitio.

El resultado es un despliegue con dos webs en línea: la de verdad, y una copia de la de ejemplo
**con el contenido real dentro**, en el dominio del panel. No es solo confuso: es contenido
publicado en una dirección que su dueño no eligió y que un buscador puede encontrar.

## 2. Qué significa exactamente «la web vive fuera»

**La misma condición que ya decide a dónde apunta el iframe del panel**, ni una más: que
`urlDeVistaPreviaRemota()` devuelva algo. O sea las dos cosas a la vez —`PREVIEW_URL` escrita
**y** su origen dentro de `PREVIEW_ORIGINS`— porque así lo comprueba esa función desde la spec 08
§4.1.

Que sea la misma y no una nueva es la decisión, no un detalle de implementación. Con dos
condiciones distintas existiría un estado en el que **la raíz redirige y el iframe apunta a
casa**, o al revés: la mitad de la aplicación creyendo que la web está fuera y la otra mitad que
no. Aquí hay una sola respuesta y de ella salen las dos cosas.

El caso concreto que eso cubre es la configuración incoherente —`PREVIEW_URL` puesta y su origen
fuera de la lista—, que la spec 08 ya resuelve tratándola como **no configurada**: la CSP
bloquearía ese iframe, así que aceptar la variable daría una vista previa en blanco. En ese
estado la landing local sigue siendo lo que hay, y por tanto no se redirige.

## 3. Dónde va, y por qué no en el middleware

**En la página**, después de comprobar que el sitio está configurado.

El middleware sería el sitio natural —ahí viven el guard de `/admin` y las cabeceras— y **no
puede**: corre en el runtime edge, donde no hay base de datos, y esta decisión depende de una
consulta.

De la que depende es de `isSiteConfigured()`, y el motivo es el caso T-248-4. Hoy **nada redirige
a `/setup`**: la única forma de descubrir esa dirección en un despliegue recién hecho es la propia
landing, que enseña «Este sitio todavía no está listo» con su enlace. Un redirect por delante de
esa comprobación deja un despliegue nuevo sin puerta de entrada — habría que conocer `/setup` de
memoria.

Así que el orden es: **primero el sitio sin configurar, después la web de fuera.**

## 4. Temporal, no permanente

`redirect()` de Next emite un 307. Es lo correcto aquí y conviene decir por qué no un 308: esto
depende de una variable de entorno que quien despliega puede quitar, y un 308 se queda **cacheado
en el navegador** de cada visitante mucho después de haberla quitado. El coste de equivocarse en
ese sentido lo paga alguien que ya no puede ver su propia web y no sabe por qué.

## 5. El sitemap

Si la web vive fuera, el sitemap deja de anunciar `/`. Anunciarla sería invitar al buscador a una
dirección que redirige al panel, y el panel es `noindex` por SPEC §7.2.

El sitemap se queda entonces **sin ninguna entrada**, y eso es lo correcto: este despliegue no
sirve contenido público en ese modo. Un sitemap vacío es una respuesta honesta; uno que apunta a
una redirección no.

## 6. Casos de prueba

- **T-248-1** — Sin `PREVIEW_URL`, `laWebViveFuera()` es falso y `/` sirve la landing como hoy.
- **T-248-2** — Con `PREVIEW_URL` y su origen en `PREVIEW_ORIGINS`, es verdadero.
- **T-248-3** — Con `PREVIEW_URL` cuyo origen **no** está en la lista, es falso: es el estado
  incoherente de la spec 08 §4.1, y ahí la web de fuera no está configurada de verdad.
- **T-248-4** — La landing consulta primero si el sitio está configurado y **solo después**
  redirige. Sin eso, un despliegue nuevo con la web fuera se queda sin camino a `/setup`.
- **T-248-5** — La landing usa `laWebViveFuera` y no una condición propia, para que no puedan
  discrepar con el iframe del panel.
- **T-248-6** — Con la web fuera, el sitemap no anuncia `/`.
- **T-248-7** — Sin la web fuera, el sitemap sigue anunciando `/` exactamente como hoy.

## 7. Lo que este hito no hace

- **No toca el middleware**, ni las cabeceras, ni el guard de `/admin`.
- **No apaga la landing**: el código sigue ahí y vuelve solo en cuanto se quitan las variables. Lo
  que cambia es a dónde va quien pide `/`.
- **No lo ejercita ningún test de e2e**, y es la limitación que la spec 08 ya aceptó: la suite
  arranca **un** servidor con la fase remota apagada a mano (`playwright.config.ts`), justo para
  que los casos de la vista previa local sigan valiendo. Lo que cubre esta fase son los unitarios
  y la prueba a mano con una web de verdad, igual que el resto de ADR-701.
