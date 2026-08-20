# Poner en marcha tu web

Esta guía te lleva de cero a tener tu web publicada y tu panel para editarla. **Sin abrir una
terminal y sin saber programar.**

> **Faltan las capturas.** La guía describe cada pantalla con palabras y está completa, pero
> `SPEC.md` §9 pide imágenes y todavía no las tiene. Van en el issue #157. Si algún paso no se
> entiende sin ver la pantalla, eso es un fallo de esta guía y merece un issue.

## Antes de empezar

Necesitas dos cuentas, las dos gratuitas:

- **GitHub** — donde vivirá tu copia del proyecto.
- **Vercel** — donde se publicará tu web. Puedes crearla entrando con GitHub.

Coste: **nada** en el nivel gratuito de las dos, para una web con el tráfico de una landing.

Tiempo: unos quince minutos. La mayor parte es esperar a que las cosas se creen solas.

## 1. Copia el proyecto y despliégalo

Pulsa este botón. Está también en la portada del repositorio.

[![Desplegar con Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKthArg%2Funo-cms&project-name=mi-web&repository-name=mi-web&env=AUTH_SECRET%2CAPP_SECRET%2CSETUP_TOKEN&envDescription=Tres%20contrase%C3%B1as%20largas%20y%20distintas%20entre%20s%C3%AD&envLink=https%3A%2F%2Fgithub.com%2FKthArg%2Funo-cms%2Fblob%2Fmain%2Fdocs%2FSETUP.md%233-los-tres-c%C3%B3digos-secretos)

Vercel te pedirá:

1. **Un nombre para tu repositorio.** Es el nombre de tu copia en GitHub. Pon el de tu proyecto.
2. **Tres códigos secretos**, que es el paso siguiente.

Todavía no pulses «Deploy»: rellena primero los tres códigos.

## 2. Los tres códigos secretos

Son contraseñas largas que no tienes que recordar: se escriben una vez y se olvidan.

| Nombre        | Para qué sirve                                                  |
| ------------- | --------------------------------------------------------------- |
| `AUTH_SECRET` | Firma tu sesión, para que nadie pueda falsificar que ha entrado |
| `APP_SECRET`  | Firma los enlaces de invitación y de vista previa               |
| `SETUP_TOKEN` | El código de un solo uso con el que crearás tu cuenta           |

**Cómo sacarlos sin una terminal:** usa el generador de contraseñas de tu navegador o de tu
gestor de contraseñas —Chrome, Firefox, Safari y 1Password lo llevan— y pide una de **32
caracteres o más**. Necesitas tres, **distintos entre sí**.

Es mejor consejo que mandarte a una página web que genere el secreto por ti: una contraseña que
ha pasado por el servidor de otro ya no es solo tuya.

Guarda el `SETUP_TOKEN` a mano un momento: lo vas a usar en el paso 5 y después lo borrarás.

> **Por qué hay que hacer esto.** Este proyecto no tiene usuario ni contraseña por defecto,
> nunca. Un CMS que se despliega con `admin/admin` está abierto desde el primer segundo, y el
> primero en encontrarlo se queda con la web. El precio de no tenerlo es este paso.

## 3. Conecta la base de datos y el almacén de imágenes

Pulsa **Deploy**. El primer despliegue **va a fallar**, y es lo normal: todavía no hay base de
datos. No lo cierres.

En tu proyecto de Vercel, entra en la pestaña **Storage** y crea dos cosas:

- **Una base de datos Postgres** (Vercel te ofrecerá Neon). Es donde se guarda lo que escribas.
- **Un Blob store**. Es donde se guardan las imágenes que subas.

Las dos, al crearlas desde ahí, **añaden sus códigos al proyecto solas**. No tienes que copiar
nada.

Si te pregunta por un plan, el gratuito sirve.

Cuando las dos estén, vuelve a **Deployments** y pulsa **Redeploy** en el último.

## 4. Espera a que se publique

Vercel construye el proyecto. Tarda un par de minutos.

Cuando termine te dará una dirección del tipo `mi-web.vercel.app`. Ábrela: verás una página que
dice **«Este sitio todavía no está listo»**. Es lo esperado — todavía no hay nadie que la
administre.

## 5. Crea tu cuenta

Pulsa **«Configurar el sitio»**, o entra en `tu-web.vercel.app/setup`.

Te pedirá:

- El **código de instalación**: el `SETUP_TOKEN` del paso 2.
- Tu **correo**, tu **nombre** y la **contraseña** con la que entrarás a partir de ahora.

La contraseña necesita al menos 12 caracteres. Una frase que recuerdes vale más que algo corto
y raro.

Esto se hace **una sola vez**. Después, `/setup` deja de existir.

## 6. Borra el código de instalación

En Vercel: **Settings → Environment Variables**, busca `SETUP_TOKEN` y bórralo. Luego
**Deployments → … → Redeploy**.

No es opcional aunque la web funcione sin hacerlo: un código que ya no hace falta es una llave
de más rondando por ahí.

## 7. Tu primer cambio

Entra en `tu-web.vercel.app/admin` con el correo y la contraseña del paso 5.

Verás tus secciones y el estado de cada una. Entra en **Portada**:

1. **Cambia el título.** No hay botón de guardar: se guarda solo, y arriba pone «Guardado ✓».
2. **Mira la vista previa** de la derecha. Cambia mientras escribes — eso es tu web, no una
   aproximación.
3. **Pulsa «Publicar cambios».** Ahora sí lo ve todo el mundo.
4. Abre tu web en otra pestaña: el cambio está.

Lo que escribes y no publicas **no lo ve nadie**. Puedes dejar algo a medias y volver mañana.

Y si te arrepientes: **«Ver versiones anteriores»** guarda cada publicación. Volver a una de
ellas la deja como borrador — tu web no cambia hasta que la publiques.

## Si algo sale mal

**La web dice «Este sitio todavía no está listo» después de crear mi cuenta.**
Recarga. Si sigue, entra en `/admin`: si puedes entrar, la cuenta está creada y lo que falla es
que la página se quedó guardada un momento; se arregla sola en unos segundos.

**No me deja entrar y sé que la contraseña es buena.**
Tras cinco intentos fallidos la cuenta se bloquea quince minutos. Espera y vuelve.

**«No hemos podido subir la imagen».**
El límite son 10 MB por imagen y solo se aceptan JPG, PNG, WebP, AVIF y GIF. Los SVG se
rechazan a propósito: pueden llevar código dentro.

**Publiqué y mi web no cambia.**
Espera unos segundos y recarga sin caché. Si sigue igual, mira que la sección diga «Publicado» y
no «Con cambios» en el panel.

**Perdí el código de instalación antes de crear mi cuenta.**
Ponlo otra vez en Vercel (Settings → Environment Variables), vuelve a desplegar, y repite el
paso 5.

**Quiero que otra persona pueda editar.**
En **Personas → Invitar**. Te dará un enlace que tienes que mandarle tú: no se envía ningún
correo. Caduca en 24 horas y sirve una vez.

## Lo que necesitas saber y nadie te dirá después

- **Tu web es tuya.** Está en tu cuenta de GitHub y en tu cuenta de Vercel. Nadie más tiene
  acceso, y no hay ningún servicio central del que dependas.
- **Los fallos de seguridad de tu instalación son tuyos**, no del proyecto. Está explicado en
  [`SECURITY.md`](SECURITY.md).
- **Para cambiar el diseño o añadir secciones nuevas** hace falta alguien que programe: eso está
  en [`DEVELOPER.md`](DEVELOPER.md).
