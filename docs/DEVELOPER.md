# Guía del desarrollador

> **Estado: completo.** Incluye los tres pasos para montar UnoCMS sobre una landing nueva.
>
> La meta de `SPEC.md` §11.6 es que un desarrollador externo lo consiga en **menos de una
> hora**, y ahí hay algo que decir: esa meta **no la puedo verificar yo**. Escribí la guía y
> escribí el proyecto de ejemplo, así que conozco cada paso implícito porque los puse. Lo que
> sí afirmo es que la guía no se salta ninguno. Está anotado en `PROGRESS.md`.

## Levantar el proyecto en local

Requisitos: **Node ≥ 22** (el repositorio usa 24, ver `.nvmrc`) y **pnpm 10**.

```sh
git clone https://github.com/KthArg/uno-cms.git
cd uno-cms
pnpm install
cp .env.example .env.local   # y rellénalo; ver los comentarios del propio fichero
pnpm dev                     # http://localhost:3000
```

Necesitas además un Postgres. Con Docker:

```sh
docker run -d --name unocms-db -p 5432:5432   -e POSTGRES_USER=unocms -e POSTGRES_PASSWORD=unocms -e POSTGRES_DB=unocms postgres:16
pnpm db:migrate
```

La primera vez, entra en `/setup` con el `SETUP_TOKEN` que hayas puesto en `.env.local` para
crear tu cuenta. No hay usuario por defecto, nunca (§7.3).

### Las imágenes, sin cuenta de Vercel

No hace falta ninguna. Si dejas `BLOB_READ_WRITE_TOKEN` vacío, las subidas se guardan en
`.uploads/` —ignorado por git— y el panel funciona entero (ADR-700).

Dos cosas que conviene saber:

- **Se apaga solo en cuanto pones un token**, y **nunca se enciende en producción**. Un almacén
  en disco desplegado en serverless aceptaría el fichero y lo perdería, que es peor que fallar.
- **Lo que subas en local no existe en un despliegue.** Las filas apuntan a `/api/media/local/…`,
  una ruta que allí no responde. Son tus imágenes de prueba, no un almacén que se migre.

## Comandos

| Comando                             | Qué hace                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Servidor de desarrollo. `PORT=3100 pnpm dev` si el 3000 está ocupado                                                                                         |
| `pnpm build`                        | Build de producción. **También es el guard de seguridad** de la frontera servidor/cliente: falla si algo de `cms/{core,db,auth,security}` alcanza el cliente |
| `pnpm typecheck`                    | `next typegen` y luego `tsc --noEmit`                                                                                                                        |
| `pnpm lint`                         | ESLint con `--max-warnings=0`                                                                                                                                |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                                                                                     |
| `pnpm test:unit`                    | Vitest, proyecto `unit`, con tests de tipos                                                                                                                  |
| `pnpm test:integration`             | Vitest contra Postgres. **Sin `DATABASE_URL` se salta con aviso**, no falla                                                                                  |
| `pnpm test:e2e`                     | Playwright contra el build de producción. Antes: `pnpm exec playwright install chromium`                                                                     |
| `pnpm test:coverage`                | Cobertura. El umbral de SPEC §11.4 solo se aplica con `COVERAGE_ENFORCE=1`                                                                                   |

## Antes de subir una rama

`ci` ejecuta seis comprobaciones y cualquiera de ellas bloquea el merge. Ejecutarlas en
local cuesta menos que esperar al pipeline:

```sh
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build
DATABASE_URL=postgres://unocms:unocms@localhost:5432/unocms_test pnpm test:integration
pnpm test:e2e
```

`pnpm typecheck` es el que más fácil se olvida, porque `pnpm test:unit` también comprueba
tipos — **pero solo los de los ficheros de test**. Un error de tipos en `cms/` pasa los
tests unitarios y rompe CI.

## Cómo trabaja este repositorio

- **`SPEC.md` manda.** Ante ambigüedad, gana la spec. Cuando la spec calla, se decide y se
  escribe un ADR en [`DECISIONS.md`](DECISIONS.md). Cuando la spec **se contradice**, se
  abre un issue `spec-question` y no se resuelve en silencio.
- **Un documento de fase por hito** en [`specs/`](specs/), con los casos de prueba que
  definen "hecho" **antes** de escribir el código.
- **Una rama por issue, un PR por rama.** `main` está protegida: sin `ci` en verde no entra
  nada, ni siendo dueño del repositorio.
- **Cada PR lleva una auto-revisión escrita** con hallazgos reales y sus correcciones. No
  es teatro: en M0, 8 de 9 PR cambiaron por ella. Los límites de esta práctica están en
  ADR-104.

## Reglas de seguridad que el linter hace cumplir

No son recomendaciones; rompen el build (SPEC §7.1):

- **`dangerouslySetInnerHTML` está prohibido en todo el proyecto**, sin allowlist. El
  richtext se renderiza como elementos de React desde una allowlist de nodos, así que nunca
  se construye una cadena de HTML (ADR-107, issue #19).
- **`sql.raw` está prohibido.** Drizzle parametriza con `sql` etiquetado. ESLint no puede
  distinguir una constante de la entrada del usuario, así que se prohíbe entero.
- **`cms/core`, `cms/db`, `cms/auth` y `cms/security` importan `server-only`** en su primera
  línea. La excepción `// isomorphic: <motivo>` existe, exige motivo escrito, y `cms/preview`
  es el único árbol exento por diseño (ADR-106).

## Montar UnoCMS sobre una landing nueva

Son **tres pasos** y ninguno toca `cms/`. Si en algún momento necesitas modificar algo de ahí
dentro para que tu landing funcione, eso es un fallo de este contrato — abre un issue.

### 1. Describe tu contenido en `cms.config.ts`

Es el único fichero que se edita para modelar el contenido. De aquí salen **solos** los
formularios del panel, la validación, los tipos que consumen tus componentes y el estado
inicial.

```ts
export default defineConfig({
  siteName: 'Mi empresa',

  // Secciones fijas: exactamente una de cada.
  singletons: {
    hero: s.object(
      {
        title: s.text({ label: 'Título principal', max: 120, required: true }),
        subtitle: s.text({ label: 'Subtítulo', max: 300, multiline: true }),
        image: s.image({ label: 'Imagen de fondo' }),
      },
      // El nombre que ve quien edita. Sin él, los avisos dirían "en hero".
      { label: 'Portada' }
    ),
  },

  // Listas ordenables: N elementos.
  collections: {
    testimonials: {
      label: 'Testimonios',
      titleField: 'author', // qué se enseña en la lista del panel
      schema: s.object({
        author: s.text({ label: 'Nombre', required: true }),
        quote: s.text({ label: 'Testimonio', required: true, multiline: true }),
      }),
    },
  },
});
```

Los tipos de campo son `s.text`, `s.richtext`, `s.number`, `s.boolean`, `s.select`, `s.link`,
`s.image`, `s.color` y `s.object`.

**Cambiar un campo aquí no exige migración.** El contenido vive como JSONB validado por
esquema (ADR-003), y lo que se guardó con un esquema anterior se lee tolerando lo que ya no
encaja en vez de tumbar el sitio (ADR-404).

### 2. Escribe tus secciones con `useContent`

```tsx
'use client';

import { useContent } from '@/cms/preview/useContent';

export function Hero() {
  const hero = useContent('hero');

  if (!hero.title) return null; // una instalación recién desplegada no tiene contenido

  return (
    <section data-cms-key="hero">
      <h1>{hero.title}</h1>
      {hero.subtitle && <p>{hero.subtitle}</p>}
    </section>
  );
}
```

Tres cosas que no son opcionales:

- **`data-cms-key`** con la clave de la sección. Es lo que permite a la vista previa
  desplazarse a lo que se está editando; sin él, una landing larga se abre siempre por arriba.
- **`'use client'`** si consumes el contexto. No es porque el componente pida datos —no pide
  ninguno— sino porque lee de React. El contenido ya viaja dentro del árbol que manda el
  servidor.
- **Tolerar el contenido vacío.** El primer día no hay nada publicado, y la página tiene que
  renderizarse igual.

Para una colección, `useCollection('testimonials')` devuelve la lista en su orden. Para un
campo `richtext`, `<RichText value={…} className="…" />` — que emite elementos de React y
**nunca** una cadena de HTML (ADR-107), y al que le pones tú las clases, porque el estilo es de
tu proyecto.

**El mismo componente sirve en producción y en la vista previa.** No sabe en cuál está, y esa
es toda la gracia: en producción lee valores serializados por el servidor y en `/preview` lee
un contexto que se actualiza mientras alguien teclea.

### 3. Compón tu página

```tsx
import { getCollection, getContent } from '@/cms/core/content';
import { StaticContentProvider } from '@/cms/preview/ContentContext';

export const dynamic = 'force-dynamic'; // ver ADR-502

export default async function Landing() {
  const [hero, testimonials] = await Promise.all([
    getContent('hero'),
    getCollection('testimonials'),
  ]);

  return (
    <StaticContentProvider value={{ hero, testimonials }}>
      <main>
        <Hero />
        <Testimonials />
      </main>
    </StaticContentProvider>
  );
}
```

Las lecturas van por `getContent` y `getCollection`, que llevan caché con el tag que invalida
`publish`. **El visitante no consulta la base de datos** cuando el caché está caliente (§8).

Y si añades secciones, acuérdate de `app/preview/page.tsx`: monta las mismas, con el proveedor
de vista previa. Es el único sitio donde la lista de secciones aparece dos veces.

### Lo que obtienes sin escribir nada más

Panel con autoguardado, publicación con bloqueo optimista, historial con "volver a una versión
anterior", biblioteca de imágenes, gestión de personas con invitaciones, ajustes del sitio y la
vista previa en vivo.

## Alimentar una web que vive fuera de este repositorio

Esto es ADR-701 y su spec es [`docs/specs/08-vista-previa-remota.md`](specs/08-vista-previa-remota.md).
Sigue siendo **un CMS por web**: lo único que cambia es que la web puede estar en otro sitio.

**No es la opción recomendada si puedes evitarla.** Con la landing en este repositorio, la vista
previa funciona sin que nadie configure nada y sin que ningún borrador salga de la aplicación.
Todo lo de abajo existe porque a veces no se puede.

### 1. Dos variables de entorno en el CMS

```sh
PREVIEW_ORIGINS=https://mi-web.com     # quién puede leer borradores; orígenes exactos, por comas
PREVIEW_URL=https://mi-web.com/es/     # a dónde apunta el iframe del panel; esta sí puede llevar ruta
```

**Sin `PREVIEW_ORIGINS` no existe nada de esto**: la ruta de borradores responde 404, la CSP no
cambia y el panel sigue enseñando la vista previa de siempre.

Tres cosas que ahorran un rato:

- Son **orígenes**, no direcciones: protocolo, host y puerto, sin ruta. `https://mi-web.com/es`
  no vale.
- Si una sola entrada está mal escrita, **se descarta la lista entera** y la fase queda apagada.
  Es a propósito: media configuración funcionando y la otra media callada es peor.
- El origen de `PREVIEW_URL` tiene que estar en `PREVIEW_ORIGINS`. Si no, se ignora — nuestra
  propia CSP bloquearía el iframe y verías una vista previa en blanco sin más pista que la
  consola.

### 2. Un cliente en tu web

```js
if (new URLSearchParams(location.search).has('unocms_preview')) {
  const { conectar } = await import('https://mi-cms.com/preview-cliente.js');

  conectar(
    (contenido) => {
      // Tu web decide qué hacer. `contenido` trae el borrador de la sección que se está
      // editando y lo publicado de todo lo demás, con la misma forma que devuelve tu API.
      pintar(contenido);
    },
    {
      alFallar: (motivo) => {
        // 'sin-token' | 'sin-acceso' | 'sin-red'. Genérico a propósito: el CMS responde 404 a
        // todo lo que rechaza y no dice por qué, así que aquí tampoco se adivina.
        console.warn('vista previa no disponible:', motivo);
      },
    }
  );
}
```

Lo que fija este contrato:

1. **Quien visite tu web en producción no descarga nada nuestro.** El `import()` solo ocurre con
   el parámetro puesto, y ese parámetro solo lo pone el panel.
2. **No repintamos tu web.** Te entregamos el contenido y te avisamos cuando cambia; qué hacer
   con eso lo decides tú. Cualquier otra cosa sería adivinar tu arquitectura.
3. **Es JavaScript a secas.** No hay que instalar nada ni usar ningún framework.

`conectar` devuelve una función para desconectar, por si desmontas la vista.

### 3. Lo publicado se pide desde tu servidor, no desde el navegador

**Esto es lo que más tiempo hace perder, y es contraintuitivo.**

`GET /api/content/:key` —la ruta de lo publicado— **no manda cabeceras CORS**, y es deliberado:
es la ruta pública de siempre y al abrir la vista previa remota no se le añadió nada. Así que un
`fetch` a esa ruta desde el navegador de quien visita tu web **falla**, con un `Failed to fetch`
que no explica nada.

Lo desconcertante es que **la vista previa sí funciona desde el navegador**: esa otra ruta sí
manda CORS, con tu origen exacto y un token. O sea que **lo complicado va y lo sencillo no**.

Qué significa para ti, según cómo esté hecha tu web:

| Cómo está hecha                                                                     | ¿Funciona?                                |
| ----------------------------------------------------------------------------------- | ----------------------------------------- |
| Next, Astro, Nuxt, Remix, WordPress, Hugo… — el contenido lo pide **su servidor**   | **Sí, sin tocar nada.** Es la mayoría     |
| Una SPA o un HTML estático que pide el contenido **desde el navegador** con `fetch` | **No.** El navegador bloquea la respuesta |

Si estás en el segundo caso, la salida es pequeña: que tu web tenga un punto propio —una función
serverless, una ruta de tu backend— que pida el contenido y se lo pase a tu JavaScript.

Hay un ejemplo completo y desplegable en [`examples/web-remota/`](../examples/web-remota/), con
tests que lo sostienen.

### 4. Lo que tienes que tocar en TU configuración, y es lo que más falla

Si tu web tiene su propia CSP —y debería—, el navegador va a bloquear esto y el mensaje aparecerá
en tu consola, no en la nuestra:

```
script-src  ... https://mi-cms.com    # para poder importar el cliente
connect-src ... https://mi-cms.com    # para poder pedir los borradores
```

No podemos comprobarlo desde aquí ni arreglarlo por ti. Lo que sí podemos es que salga escrito
antes de que te pase.

### Lo que NO se lleva la web remota

- **Los ajustes del sitio y el SEO por defecto.** Siguen sin endpoint público.
- **El aviso al publicar.** Hoy `publish` solo invalida nuestra caché; tu web se entera cuando
  vuelva a pedir. Un webhook es otra fase.
- **La landing de este repositorio**, que sigue existiendo y sirviéndose aunque no la uses.

### Qué esperar de la vista previa remota, con sus límites

- El token dura **quince minutos** y el panel lo renueva solo mientras la pestaña esté abierta.
  Si la renovación falla, el panel lo dice y ofrece recargar; no se queda enseñando contenido
  viejo como si estuviera al día.
- Si navegas **dentro** del iframe a otra página de tu web, el parámetro `unocms_preview` no
  viaja solo: esa página ya no será una vista previa. Propágalo tú si lo necesitas.
- **El caso «CMS desplegado, web en local» no está verificado**: empotrar `http://localhost`
  desde una página `https` tiene reglas propias del navegador que nadie ha comprobado todavía.
  Está anotado en [`PENDIENTES.md`](PENDIENTES.md).

### Y con React

No hay hook, y es deliberado: sería azúcar sobre estas seis líneas y habría que probarlo con un
consumidor que todavía no existe.

```jsx
useEffect(() => {
  if (!new URLSearchParams(location.search).has('unocms_preview')) return;

  let desconectar;
  void import('https://mi-cms.com/preview-cliente.js').then(({ conectar }) => {
    desconectar = conectar(setContenido);
  });

  return () => desconectar?.();
}, []);
```

## Añadir un tipo de campo nuevo

Se toca `cms/core/config.ts` (el constructor y su tipo), `cms/core/schema-gen.ts` (cómo se
valida, laxo y estricto) y `cms/ui/fields/` (cómo se edita). El `switch` del formulario es
exhaustivo a propósito: si olvidas el componente, **no compila**.

## Modelo de datos

Dos tablas para el contenido: `content_entries` —con `draft` y `published` separados, que es
lo que permite escribir a medias sin que lo vea nadie— y `revisions`, con un máximo de veinte
por entrada. Las migraciones se generan con `pnpm db:generate` y se aplican con `pnpm db:migrate`.

Cambiar `cms.config.ts` **no** genera migraciones: el contenido es JSONB.
