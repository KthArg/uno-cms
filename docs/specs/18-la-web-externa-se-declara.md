# 18 — La web externa se declara en el código, y la raíz lleva al panel o a `/setup`

> Escrita **antes** del código. Los casos de la sección 6 son la definición de "hecho".
>
> Continúa la [spec 14](14-la-raiz-lleva-al-panel.md) y enmienda dos cosas suyas: **qué** decide
> que la web vive fuera (§2 de allí) y **qué** pasa en la raíz de un sitio sin configurar cuando
> la web vive fuera (§3 de allí). La decisión está en ADR-1200.

## 1. Qué está mal hoy

Se vio en el primer despliegue de verdad de un CMS para una web de fuera (Boka Verde): al entrar
al dominio del panel salía **la landing de ejemplo** con el contenido real dentro, en vez del
panel. Es justo lo que la spec 14 existe para impedir, y no lo impedía.

El motivo es de diseño. Desde la spec 14, «la web vive fuera» es `urlDeVistaPreviaRemota() !==
null`: `PREVIEW_URL` escrita **y** su origen dentro de `PREVIEW_ORIGINS`. Son las variables de la
**vista previa**, y `docs/SETUP.md` las presenta como lo que son: opcionales, «puedes dejarlo para
más adelante sin miedo». Así que la raíz del panel depende de una funcionalidad opcional, y falla
en silencio en los tres casos corrientes:

- No se han puesto todavía, porque la guía dice que no hace falta.
- Se pusieron con el dominio provisional (`*.vercel.app`) y la web cambió al suyo.
- `PREVIEW_URL` se escribió y `PREVIEW_ORIGINS` no, o al revés: el estado incoherente de la spec
  08 §4.1, que se trata como «no configurada».

En los tres, lo que sale es una web que no es la de nadie, en una dirección que su dueño no eligió.

Y hay un segundo hueco. Con el sitio **sin configurar**, la raíz enseña «Este sitio todavía no
está listo» con un enlace a `/setup`. La spec 14 §3 lo prefirió a redirigir para no dejar a nadie
sin puerta de entrada. Con la web fuera, esa pantalla es un paso de más: en este dominio no hay
otra cosa que hacer más que configurar el panel.

## 2. Qué decide que la web vive fuera

**Lo declara `cms.config.ts`**, con un campo nuevo:

```ts
export default defineConfig({
  siteName: 'Boka Verde',
  webExterna: true,
  // …
});
```

O **la condición de la spec 14**, como hasta ahora. Las dos valen, y basta con una:

```
webExterna() = appConfig.webExterna || laWebViveFuera()
```

Por qué en el código y no en otra variable de entorno:

- **Es un hecho del proyecto, no del despliegue.** Quien monta UnoCMS para una web de fuera lo
  sabe al escribir `cms.config.ts`, y no cambia de un despliegue a otro.
- **No es un secreto ni un permiso.** Decide a dónde va quien escribe la raíz, no quién puede leer
  borradores. Lo que sí es un permiso —`PREVIEW_ORIGINS`— **sigue en el entorno** por el motivo
  que da la spec 08: solo lo cambia quien despliega.
- **Una variable más es un olvido más**, y el fallo de §1 es un olvido.

Por qué se conserva la condición antigua en el «o»: un despliegue que hoy redirige porque tiene la
vista previa bien puesta y no ha declarado nada **no cambia** al actualizar.

### Lo que se pierde, dicho

La spec 14 §2 pedía que la raíz y el iframe del panel usaran **la misma** condición, para que no
existiera un estado con la raíz redirigiendo y el iframe apuntando a casa. Con la declaración, ese
estado existe: `webExterna: true` sin variables de vista previa. Se acepta porque el estado
contrario —la raíz sirviendo la landing de ejemplo con el contenido real— es peor, y porque el
iframe apuntando a casa es lo que ya hace **hoy** cualquier despliegue sin vista previa remota: el
panel enseña la landing de ejemplo como vista previa, que es incómodo pero no publica nada.

## 3. Qué hace la raíz

| Sitio configurado | Web fuera | `/` (y `/<idioma>`)                       |
| ----------------- | --------- | ----------------------------------------- |
| no                | no        | «Este sitio todavía no está listo», igual |
| no                | **sí**    | **307 a `/setup`**                        |
| sí                | sí        | 307 a `/admin`, igual                     |
| sí                | no        | la landing, igual                         |

El orden de la spec 14 §3 se mantiene —primero el sitio sin configurar— y cambia lo que se hace
dentro de esa rama cuando la web vive fuera. El motivo que tenía la spec 14 para no redirigir era
no dejar a nadie sin camino a `/setup`; redirigiendo **a** `/setup` ese motivo se cumple solo.

Temporal (307) por lo mismo que la spec 14 §4: depende de un estado que cambia. Una vez completado
el setup, `/setup` responde 404 y la raíz pasa a llevar a `/admin`; un 308 cacheado mandaría al
navegador a una página que ya no existe.

## 4. El sitemap

Usa `webExterna()` en vez de `laWebViveFuera()`. Con la web fuera, sin entradas, por el mismo
motivo que la spec 14 §5.

## 5. `defineConfig`

- `webExterna` es opcional y vale `false` si no se declara: un sitio que no declara nada sigue
  exactamente como estaba.
- En el objeto que devuelve `defineConfig` está **siempre**, como `idiomas`.
- Si se declara con algo que no es un booleano (`'true'`, `1`) desde JavaScript o con un `as`,
  `defineConfig` lanza nombrando el campo. Tomar `'false'` como verdadero sería el peor fallo
  posible de este campo.

## 6. Casos de prueba

- **T-18-1** — Con `webExterna: true` y **sin** variables de vista previa, `webExterna()` es
  verdadero.
- **T-18-2** — Sin declarar y sin variables, es falso.
- **T-18-3** — Sin declarar y con la vista previa remota coherente, es verdadero: lo que ya
  redirigía sigue redirigiendo.
- **T-18-4** — Con el sitio sin configurar y la web fuera, la landing redirige a `/setup`.
- **T-18-5** — Con el sitio sin configurar y la web en casa, la landing enseña la pantalla de
  «todavía no está listo» y no redirige.
- **T-18-6** — Con el sitio configurado y la web fuera, redirige a `/admin`.
- **T-18-7** — Con el sitio configurado y la web en casa, no redirige.
- **T-18-8** — `defineConfig` sin `webExterna` devuelve `false`; con `true`, `true`.
- **T-18-9** — `defineConfig` con un `webExterna` que no es booleano lanza nombrando el campo.
- **T-18-10** — El sitemap usa `webExterna()`, y el corte va antes de construir la lista.

T-18-4 a T-18-7 llaman a la landing de verdad con el estado simulado, no leen su código fuente:
lo que se prueba es a dónde va cada caso, y eso no lo dice el orden de dos cadenas en un fichero.

## 7. Lo que este hito no hace

- **No toca la vista previa remota** ni `PREVIEW_ORIGINS`: quién puede leer borradores sigue
  saliendo del entorno.
- **No toca el middleware.** La decisión depende de la base de datos (¿está configurado?), y el
  middleware corre en el edge, sin ella. Lo mismo que la spec 14 §3.
- **No lo ejercita el e2e**, por la limitación que ya aceptaron las specs 08 y 14: la suite arranca
  un solo servidor, con la web en casa.
