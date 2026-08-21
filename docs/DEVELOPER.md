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

## Añadir un tipo de campo nuevo

Se toca `cms/core/config.ts` (el constructor y su tipo), `cms/core/schema-gen.ts` (cómo se
valida, laxo y estricto) y `cms/ui/fields/` (cómo se edita). El `switch` del formulario es
exhaustivo a propósito: si olvidas el componente, **no compila**.

## Modelo de datos

Dos tablas para el contenido: `content_entries` —con `draft` y `published` separados, que es
lo que permite escribir a medias sin que lo vea nadie— y `revisions`, con un máximo de veinte
por entrada. Las migraciones se generan con `pnpm db:generate` y se aplican con `pnpm db:migrate`.

Cambiar `cms.config.ts` **no** genera migraciones: el contenido es JSONB.
