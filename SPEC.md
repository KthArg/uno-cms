# SPEC — "UnoCMS": CMS acoplado 1:1 a una landing, auto-hospedable en Vercel

**Versión:** 1.0 · **Estado:** Aprobado para MVP · **Audiencia:** desarrollador que lo implementa (no el usuario final)

---

## 0. Resumen ejecutivo

UnoCMS es un CMS embebido dentro del mismo proyecto Next.js que sirve la landing page. No es headless multi-sitio: **un despliegue = una landing = un CMS**.

> **Enmienda — ADR-701 (issue #176).** La frase "no es headless" deja de ser cierta: la landing puede vivir **fuera** de este proyecto y consumir el contenido por API, conservando la vista previa en vivo si incluye el cliente de `docs/specs/08-vista-previa-remota.md`. Lo que **sigue en pie es la otra mitad**: un despliegue sirve a una web. No hay multi-tenant, y §4 y §7 no cambian.
>
> Se enmienda aquí en vez de dejar que el código contradiga al documento en silencio. El razonamiento original —que el acoplamiento hace trivial la vista previa— **sigue siendo correcto** para una web que pueda vivir en el repositorio, y esa sigue siendo la opción recomendada.
 El desarrollador define el modelo de contenido en código (`cms.config.ts`); el CMS genera automáticamente el panel de administración, la validación, el versionado y la vista previa en vivo. El usuario final (principiante en IT) solo ve un panel simple: edita textos/imágenes, ve la página real actualizándose en tiempo real dentro del panel, y publica con un botón.

**Principios rectores (en orden):**

1. **Seguridad primero.** Todo input se valida y sanitiza; toda mutación exige sesión + verificación de origen; secretos nunca llegan al cliente.
2. **Optimización.** La landing pública se sirve estática (ISR con revalidación por tag); el runtime del CMS no penaliza al visitante. Cero JS del CMS en la ruta pública en producción.
3. **Facilidad de uso.** Para el editor: cero jerga técnica, autosave, preview instantánea, publicar/deshacer. Para el desarrollador: un solo archivo de configuración, componentes tipados, `npx create` y deploy en Vercel en < 15 minutos.

---

## 1. Decisiones de arquitectura (ADRs resumidos)

### ADR-001 — Monolito Next.js (landing + admin en un solo proyecto)

**Decisión:** Un único proyecto Next.js 15 (App Router) desplegado como **un** proyecto de Vercel. La landing vive en `app/(site)/`, el panel en `app/admin/`, la API en `app/api/`.

**Opciones consideradas:**

| Opción | Complejidad | Costo | Preview en vivo | Mantenimiento por 1 persona |
|---|---|---|---|---|
| A. Monolito Next.js (elegida) | Baja | 1 proyecto Vercel (free tier viable) | Trivial (mismos componentes) | Excelente |
| B. Monorepo: admin app + site app | Media | 2 proyectos Vercel | Requiere iframe cross-origin + CORS | Buena |
| C. CMS headless separado (estilo Strapi real) | Alta | Strapi no corre bien en serverless Vercel | Compleja | Mala |

**Justificación:** el requisito "la preview implementa la página dentro del mismo CMS" se resuelve de forma nativa si el admin puede renderizar los mismos componentes React de la landing. Además elimina CORS, duplica cero infraestructura y respeta el requisito 1 CMS = 1 landing.

**Consecuencias:** el bundle del repo contiene ambos mundos; se mitiga con code-splitting por route group (Next lo hace solo) y `import 'server-only'` en el núcleo del CMS.

### ADR-002 — Base de datos: Postgres serverless (Neon vía integración Vercel) + Drizzle ORM

- Neon tiene integración nativa en el Marketplace de Vercel: el usuario la agrega con 2 clics y las env vars se inyectan solas (`DATABASE_URL`). Free tier suficiente para una landing.
- Driver: `@neondatabase/serverless` (HTTP, apto para edge/serverless, sin pool que agotar).
- Drizzle ORM: tipado end-to-end, migraciones SQL versionadas en el repo (`drizzle-kit`), cero codegen mágico.
- Alternativa documentada (no MVP): Turso/libSQL con el mismo esquema, detrás de una interfaz `db/` para no acoplar.

### ADR-003 — Contenido como JSONB validado por esquema en código

El contenido NO se modela como tablas por tipo (eso obligaría a migraciones cada vez que el dev cambia un campo). Se modela como **documentos JSONB** validados contra esquemas Zod generados desde `cms.config.ts`. La BD garantiza integridad estructural (claves, estados, versiones); Zod garantiza integridad semántica (tipos de campo, longitudes, requeridos). Trade-off aceptado: no hay queries relacionales sobre campos de contenido — irrelevante para una landing (se lee el documento completo).

### ADR-004 — Auth: Auth.js v5 (credentials) + Argon2id, sin proveedor externo

- Un CMS auto-hospedado por un principiante no puede depender de configurar OAuth de Google. Login con email + contraseña.
- Hash con `@node-rs/argon2` (Argon2id). Sesión JWT en cookie `httpOnly; Secure; SameSite=Lax`, expiración 7 días con rotación.
- Bootstrap del primer admin vía `SETUP_TOKEN` de un solo uso (ver §7.3), nunca con credenciales por defecto.
- 2FA TOTP: post-MVP (hito v1.1), el esquema ya reserva las columnas.

> **Enmienda — ADR-900 (issue #233).** Se admite **un** proveedor externo, Google, con tres
> condiciones que son la decisión y no matices de ella:
>
> 1. **Es opcional y se apaga entero.** Sin `AUTH_GOOGLE_ID` **y** `AUTH_GOOGLE_SECRET`, el
>    proveedor no entra en la configuración de Auth.js. El motivo de este ADR —que nadie
>    **dependa** de configurar OAuth— queda intacto: quien no las define tiene el mismo producto
>    que tenía.
> 2. **El acceso por correo y contraseña no se retira nunca**, ni con Google configurado. Es el
>    único camino que no depende de un tercero.
> 3. **Google autentica, no autoriza.** El correo tiene que corresponder a una fila de `users` que
>    ya exista y esté activa; no se crea ninguna cuenta. Sin esto, §7.3 —"nunca existen
>    credenciales por defecto"— dejaría de ser cierto.
>
> El detalle está en [`docs/specs/13-acceso-con-google.md`](docs/specs/13-acceso-con-google.md);
> el bloqueo por intentos fallidos y el mensaje de rechazo se deciden en ADR-901 y ADR-902.

### ADR-005 — Media: Vercel Blob

Uploads directos desde el navegador con URL firmada de un solo uso (`@vercel/blob/client` + handler `onBeforeGenerateToken` que valida sesión, MIME y tamaño). Metadatos en tabla `media`. Optimización de imágenes delegada a `next/image` (el CMS no re-procesa).

### ADR-006 — Preview en vivo: iframe same-origin + `postMessage` + ContentProvider

La preview NO guarda nada en BD. El panel renderiza la landing real en un `<iframe src="/preview?token=...">`; cada tecleo del editor envía el estado del formulario por `postMessage`; dentro del iframe, un `PreviewProvider` sobreescribe el contenido que los componentes leen por contexto. Latencia percibida: < 50 ms (un re-render de React, cero red). Detalle completo en §6.

### ADR-007 — Publicación: copia draft→published + `revalidateTag`

La landing pública lee **solo** contenido `published` con `unstable_cache`/`fetch` etiquetado por tag (`content:<key>`). Publicar = transacción que copia el draft, crea revisión y llama `revalidateTag`. El visitante siempre recibe HTML estático/ISR; nunca toca la BD en el hot path si el caché está caliente.

---

## 2. Stack definitivo

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Actions) | Node runtime para rutas del CMS |
| Lenguaje | TypeScript estricto (`strict: true`, `noUncheckedIndexedAccess`) | |
| BD | Postgres (Neon) + Drizzle ORM + drizzle-kit | Migraciones commiteadas |
| Auth | Auth.js v5 credentials + @node-rs/argon2 | |
| Validación | Zod v3 (fuente única: generado desde `cms.config.ts`) | |
| Media | @vercel/blob | |
| Rich text | Tiptap (editor) → JSON ProseMirror en BD → render con sanitización | `rehype-sanitize` sobre el HTML derivado |
| UI admin | Tailwind CSS 4 + Radix primitives (sin lib pesada) | |
| Rate limit | @upstash/ratelimit + Vercel KV (opcional) con fallback in-memory | Degradación documentada |
| Tests | Vitest (unit/integration) + Playwright (e2e) | |
| CI | GitHub Actions | lint, typecheck, test, build |
| Calidad | ESLint (config next + security), Prettier, Husky + lint-staged | |

---

## 3. Estructura del repositorio

```
uno-cms/
├─ cms.config.ts                  # ← ÚNICO archivo que el dev edita para modelar contenido
├─ app/
│  ├─ (site)/                     # LANDING PÚBLICA
│  │  ├─ layout.tsx
│  │  ├─ page.tsx                 # compone secciones leyendo contenido published
│  │  └─ opengraph-image.tsx
│  ├─ preview/                    # Render de la landing en modo preview (dentro del iframe)
│  │  └─ page.tsx                 # valida token firmado, monta <PreviewProvider>
│  ├─ admin/                      # PANEL CMS (protegido por middleware)
│  │  ├─ layout.tsx               # shell: sidebar, header, guard de sesión
│  │  ├─ page.tsx                 # dashboard (estado de publicación, últimos cambios)
│  │  ├─ content/[key]/page.tsx   # editor de una entrada (form autogenerado + preview)
│  │  ├─ media/page.tsx           # biblioteca de medios
│  │  ├─ users/page.tsx           # gestión de usuarios (solo rol admin)
│  │  ├─ settings/page.tsx        # SEO global, dominio, favicon
│  │  ├─ history/[key]/page.tsx   # revisiones + restaurar
│  │  └─ login/page.tsx
│  ├─ setup/page.tsx              # onboarding: crear primer admin (solo si no hay usuarios)
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     ├─ content/[key]/route.ts   # GET published (público, cacheado) — para casos edge
│     ├─ media/upload/route.ts    # token firmado de Vercel Blob
│     └─ health/route.ts
├─ cms/                           # NÚCLEO DEL CMS (agnóstico del proyecto, extraíble a paquete)
│  ├─ core/
│  │  ├─ config.ts                # defineConfig, tipos de campo, inferencia TS
│  │  ├─ schema-gen.ts            # cms.config.ts → esquemas Zod (draft y strict)
│  │  └─ content.ts               # getContent / getDraft / saveDraft / publish / revert
│  ├─ db/
│  │  ├─ index.ts                 # cliente drizzle
│  │  ├─ schema.ts                # tablas (ver §4)
│  │  └─ migrations/              # SQL generado por drizzle-kit
│  ├─ auth/
│  │  ├─ index.ts                 # config Auth.js, callbacks, roles
│  │  └─ passwords.ts             # argon2 hash/verify, política de contraseñas
│  ├─ security/
│  │  ├─ ratelimit.ts
│  │  ├─ sanitize.ts              # richtext → HTML seguro
│  │  ├─ tokens.ts                # HMAC para preview/setup tokens
│  │  └─ audit.ts
│  ├─ actions/                    # Server Actions ('use server') — la API real del panel
│  │  ├─ content.actions.ts
│  │  ├─ media.actions.ts
│  │  ├─ users.actions.ts
│  │  └─ settings.actions.ts
│  ├─ ui/                         # componentes del panel
│  │  ├─ fields/                  # un componente por tipo de campo (autogeneración de forms)
│  │  ├─ EditorShell.tsx          # split view: form | iframe preview
│  │  ├─ PreviewFrame.tsx         # maneja postMessage, throttle, reconexión
│  │  └─ ...
│  └─ preview/
│     ├─ PreviewProvider.tsx      # contexto que sobreescribe contenido en el iframe
│     └─ useContent.ts            # hook que consumen los componentes de la landing
├─ components/site/               # secciones de la landing del proyecto (Hero, Features, …)
├─ middleware.ts                  # guard /admin, headers de seguridad, nonce CSP
├─ drizzle.config.ts
├─ .env.example
└─ docs/
   ├─ SETUP.md                    # guía para el usuario final (no técnica)
   ├─ DEVELOPER.md                # cómo adaptar el CMS a otro proyecto
   └─ SECURITY.md                 # modelo de amenazas, reporte de vulnerabilidades
```

---

## 4. Esquema de base de datos (Drizzle / SQL)

```ts
// cms/db/schema.ts
import { pgTable, text, jsonb, timestamp, boolean, integer, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),                      // citext en migración; unique lower(email)
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),        // argon2id
  role: text('role', { enum: ['admin', 'editor'] }).notNull().default('editor'),
  totpSecret: text('totp_secret'),                      // reservado v1.1 (cifrado at-rest con APP_SECRET)
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)]);

export const contentEntries = pgTable('content_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull(),                           // p.ej. 'home', 'testimonials.item-abc'
  type: text('type').notNull(),                         // nombre del schema en cms.config.ts
  draft: jsonb('draft').notNull(),                      // estado editable (validado laxo)
  published: jsonb('published'),                        // null = nunca publicado
  status: text('status', { enum: ['draft', 'published', 'changed'] }).notNull().default('draft'),
  // 'published' = draft === published; 'changed' = hay draft sin publicar
  sortOrder: integer('sort_order').notNull().default(0),// para collections ordenables
  draftUpdatedAt: timestamp('draft_updated_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(0),     // optimistic locking (ver §5.3)
}, (t) => [
  uniqueIndex('content_key_idx').on(t.key),
  index('content_type_idx').on(t.type),
]);

export const revisions = pgTable('revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryKey: text('entry_key').notNull(),
  data: jsonb('data').notNull(),                        // snapshot de lo publicado
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  note: text('note'),
}, (t) => [index('revisions_key_idx').on(t.entryKey, t.publishedAt)]);
// Retención: máx. 20 revisiones por entry (poda en el mismo tx de publish)

export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull(),                           // URL de Vercel Blob
  pathname: text('pathname').notNull(),                 // para delete en Blob
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  alt: text('alt').notNull().default(''),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('media_pathname_idx').on(t.pathname)]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id'),
  actorEmail: text('actor_email'),                      // desnormalizado: sobrevive al borrado del user
  action: text('action').notNull(),                     // 'login.success','login.fail','content.publish', ...
  targetType: text('target_type'),                      // 'content' | 'media' | 'user' | 'settings'
  targetId: text('target_id'),
  meta: jsonb('meta'),                                  // diff resumido, ip truncada, user-agent
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_created_idx').on(t.createdAt)]);
// Retención: 90 días (job de poda perezoso al escribir)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),                        // 'seo', 'site', 'setup_completed'
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Notas de integridad: todas las mutaciones de contenido corren en transacción; `publish` y `revert` usan `SELECT ... FOR UPDATE` sobre la fila del entry para serializar publicaciones concurrentes.

---

## 5. Modelo de contenido y API

### 5.1 `cms.config.ts` — el contrato del desarrollador

```ts
import { defineConfig, s } from '@/cms/core/config';

export default defineConfig({
  siteName: 'Mi Empresa',
  // SINGLETONS: exactamente una instancia (secciones fijas de la landing)
  singletons: {
    hero: s.object({
      title:    s.text({ label: 'Título principal', max: 120, required: true }),
      subtitle: s.text({ label: 'Subtítulo', max: 300, multiline: true }),
      ctaLabel: s.text({ label: 'Texto del botón', max: 40 }),
      ctaHref:  s.link({ label: 'Enlace del botón' }),         // valida URL http(s), mailto, tel, o ruta /
      image:    s.image({ label: 'Imagen de fondo' }),          // { mediaId, url, alt, width, height }
    }),
    about: s.object({
      heading: s.text({ label: 'Encabezado', required: true }),
      body:    s.richtext({ label: 'Contenido' }),              // JSON ProseMirror, marcas permitidas acotadas
      visible: s.boolean({ label: 'Mostrar sección', default: true }),
    }),
    seo: s.object({
      title:       s.text({ label: 'Título SEO', max: 60 }),
      description: s.text({ label: 'Descripción SEO', max: 160, multiline: true }),
      ogImage:     s.image({ label: 'Imagen para redes' }),
    }),
  },
  // COLLECTIONS: N instancias ordenables (listas repetibles)
  collections: {
    testimonials: {
      label: 'Testimonios',
      titleField: 'author',                                     // qué mostrar en la lista del admin
      schema: s.object({
        author: s.text({ label: 'Nombre', required: true, max: 80 }),
        quote:  s.text({ label: 'Testimonio', required: true, max: 500, multiline: true }),
        avatar: s.image({ label: 'Foto' }),
        rating: s.number({ label: 'Estrellas', min: 1, max: 5, integer: true }),
      }),
    },
    faqs: {
      label: 'Preguntas frecuentes',
      titleField: 'question',
      schema: s.object({
        question: s.text({ label: 'Pregunta', required: true }),
        answer:   s.richtext({ label: 'Respuesta', required: true }),
      }),
    },
  },
});
```

**Tipos de campo del MVP:** `text` (con `multiline`), `richtext`, `number`, `boolean`, `select`, `link`, `image`, `color`. Post-MVP: `object` anidado, `list` inline, `reference`, `date`.

De este archivo se derivan automáticamente:
- Los formularios del admin (mapa tipo→componente en `cms/ui/fields/`).
- Dos esquemas Zod por tipo: **laxo** (para guardar drafts incompletos: todo opcional salvo tipo correcto) y **estricto** (requerido para publicar).
- Los tipos TypeScript que consumen los componentes de la landing: `Content<'hero'>`.
- El seed inicial: al arrancar, cada singleton sin fila en BD se crea con valores vacíos/default.

### 5.2 Lectura de contenido (landing pública)

```ts
// cms/core/content.ts (server-only)
export const getContent = cache(async <K extends SingletonKey>(key: K): Promise<Content<K>> => {
  return unstable_cache(
    async () => {
      const row = await db.query.contentEntries.findFirst({ where: eq(contentEntries.key, key) });
      return strictSchema(key).parse(row?.published ?? defaults(key));
    },
    ['content', key],
    { tags: [`content:${key}`] }
  )();
});

export const getCollection = async <K extends CollectionKey>(key: K): Promise<CollectionItem<K>[]> => { /* ídem, tag content:<key>, ordenado por sortOrder, solo items con published */ };
```

Los componentes de la landing **no** llaman esto directamente: usan `useContent()` (ver §6.3) para que el mismo componente funcione en producción y en preview.

### 5.3 API de mutación (Server Actions) — contrato completo

Todas las actions comparten un pipeline obligatorio, en este orden:
`requireSession(role)` → `rateLimit(bucket, actorId)` → `zodValidate(input)` → lógica en transacción → `audit()` → `revalidateTag()` si aplica. Los errores se devuelven como `{ ok: false, code, message }` con mensajes genéricos (sin filtrar existencia de recursos ni detalles internos).

| Action | Rol | Input (Zod) | Efecto | Errores relevantes |
|---|---|---|---|---|
| `saveDraft` | editor | `{ key, data, version }` | Valida con schema **laxo**, sanitiza richtext, `UPDATE ... WHERE version = $version` (optimistic lock), `version+1`, `status='changed'` | `VERSION_CONFLICT` si otro editor guardó antes (el UI ofrece recargar/mergear) |
| `publish` | editor | `{ key, version }` | Tx: lock fila → valida draft con schema **estricto** → snapshot a `revisions` (+poda >20) → `published = draft`, `status='published'` → `revalidateTag('content:'+key)` | `VALIDATION_FAILED` con lista de campos por completar |
| `publishAll` | editor | `{}` | Igual, iterando entries con `status='changed'`; todo-o-nada por entry, reporta resultado por key | |
| `revertDraft` | editor | `{ key }` | `draft = published`, `status='published'` | `NEVER_PUBLISHED` |
| `restoreRevision` | editor | `{ key, revisionId }` | Copia snapshot → `draft`, `status='changed'` (no publica) | |
| `createItem` | editor | `{ collection }` | Inserta entry `type=collection`, `key=collection+'.'+nanoid`, draft con defaults, `sortOrder` al final | |
| `deleteItem` | editor | `{ key }` | Soft-flow: exige confirmación en UI; borra entry y sus revisiones | |
| `reorderItems` | editor | `{ collection, orderedKeys[] }` | Tx: reasigna `sortOrder`, revalida tag de la colección | |
| `getUploadToken` | editor | (route handler, no action) | Valida sesión, MIME ∈ allowlist (`image/jpeg,png,webp,avif,gif,svg→rechazado`), tamaño ≤ 10 MB → token Blob | SVG se rechaza en MVP (vector XSS) |
| `finalizeUpload` | editor | `{ url, pathname, filename, mimeType, sizeBytes, width, height }` | Verifica que el blob existe y pertenece al store propio, inserta en `media` | |
| `updateMediaAlt` / `deleteMedia` | editor | ... | Delete: bloquea si el media está referenciado en algún draft/published (búsqueda JSONB) | `MEDIA_IN_USE` |
| `inviteUser` | admin | `{ email, name, role }` | Crea user con password aleatoria + token de reset de un solo uso (24 h) que el admin comparte manualmente (sin email en MVP) | |
| `updateUserRole` / `deactivateUser` | admin | ... | No permite quitarse a sí mismo el rol admin si es el único | `LAST_ADMIN` |
| `changePassword` | self | `{ current, next }` | Verifica actual, política: ≥ 12 chars, chequeo contra lista de comunes, re-hash | |
| `updateSettings` | admin | `{ key: 'seo'\|'site', value }` | Valida por schema, revalida tags globales | |
| `createPreviewToken` | editor | `{ key }` | Token HMAC (`APP_SECRET`) con `{key, exp: now+2h}` para el iframe / link compartible | |

**Rutas HTTP públicas (mínimas):**

- `GET /api/content/:key` → JSON del contenido published, `Cache-Control: s-maxage=60, stale-while-revalidate=300`. Existe solo como escape hatch (p. ej. consumo desde un script externo); la landing no la usa.
- `GET /api/health` → `{ ok, dbLatencyMs }` sin datos sensibles.
- `POST /api/auth/*` → Auth.js. Login con rate limit 5/15 min por IP+email y lockout incremental (`failedLogins`/`lockedUntil`).

---

## 6. Vista previa en vivo (feature central)

### 6.1 Flujo

```
┌─ /admin/content/hero ───────────────────────────────────────────┐
│  ┌─ Form (cliente) ─────────┐   ┌─ <iframe /preview?token=…> ─┐ │
│  │ title: [Mi empresa_]     │   │  LANDING REAL renderizada    │ │
│  │ subtitle: [...]          │──▶│  <PreviewProvider>           │ │
│  │  (onChange → throttle    │pM │    overrides['hero'] = {...} │ │
│  │   150ms → postMessage)   │   │  scroll-to-section, resalte  │ │
│  └──────────────────────────┘   └──────────────────────────────┘ │
│  [Guardar borrador]  [Publicar]  [Móvil ▾ | Escritorio]          │
└──────────────────────────────────────────────────────────────────┘
```

1. Al abrir el editor, el servidor crea un `previewToken` (HMAC, 2 h) y renderiza `EditorShell` con el iframe apuntando a `/preview?token=...`.
2. `/preview/page.tsx` (server) valida el token; si es válido, carga **drafts** de todo el contenido y monta la landing envuelta en `<PreviewProvider initial={drafts}>`. Token inválido/expirado → 404 sin detalle.
3. En cada cambio del formulario, `PreviewFrame` envía `{ type: 'cms:update', key, data, seq }` con `iframe.contentWindow.postMessage(msg, window.location.origin)` — **origin explícito, nunca `*`**, con throttle de 150 ms y descarte de mensajes fuera de orden (`seq`).
4. El `PreviewProvider` escucha `message`, **verifica `event.origin === location.origin` y valida el payload con el schema laxo** antes de aplicar el override en estado React. Los componentes se re-renderizan al instante. Nada toca la red ni la BD.
5. Mensajes inversos (`cms:ready`, `cms:section-visible`) permiten al panel saber que el iframe cargó y auto-scrollear a la sección editada (cada sección de la landing expone `data-cms-key`).

### 6.2 Seguridad de la preview

- La ruta `/preview` exige token firmado con expiración; además el middleware añade `X-Robots-Tag: noindex` y excluye la ruta del sitemap.
- CSP con `frame-ancestors 'self'` global: nadie puede embeber ni la landing ni la preview en un sitio ajeno (anti-clickjacking); el iframe del admin es same-origin, así que funciona.
- El listener de `postMessage` ignora cualquier mensaje cuyo `origin` difiera o cuyo payload no pase Zod. El contenido de preview jamás se persiste desde el iframe.

### 6.3 Contrato con los componentes de la landing (lado desarrollador)

```tsx
// components/site/Hero.tsx — mismo componente en producción y preview
'use client';                    // solo las secciones que consumen useContent
import { useContent } from '@/cms/preview/useContent';

export function Hero() {
  const hero = useContent('hero');       // prod: valor serializado desde el server (estático)
                                         // preview: valor reactivo con overrides
  return (
    <section data-cms-key="hero">
      <h1>{hero.title}</h1>
      <p>{hero.subtitle}</p>
      {hero.ctaLabel && <a href={hero.ctaHref}>{hero.ctaLabel}</a>}
    </section>
  );
}
```

En producción, `app/(site)/page.tsx` (server component) hace `getContent('hero')` y pasa los datos por un `<StaticContentProvider value={...}>`; `useContent` lee de ese contexto — el resultado es HTML estático, sin fetch en cliente. En `/preview`, el mismo hook lee del `PreviewProvider` reactivo. **Adaptar el CMS a otro proyecto = escribir `cms.config.ts` + secciones que usen `useContent` + componer `page.tsx`.** Eso es todo; está documentado paso a paso en `docs/DEVELOPER.md`.

Para `richtext`, se provee `<RichText value={...} />` que convierte el JSON ProseMirror a HTML **pasando siempre por `sanitize.ts`** (allowlist: p, strong, em, a[href http/https/mailto], ul, ol, li, h2-h4, blockquote; estilos y clases stripped).

---

## 7. Seguridad (modelo completo)

### 7.1 Superficie y amenazas

| Amenaza | Mitigación |
|---|---|
| Fuerza bruta en login | Rate limit por IP+email, lockout incremental (5 fallos → 15 min, exponencial), Argon2id con parámetros OWASP, respuesta en tiempo constante y mensaje único ("credenciales inválidas") |
| XSS vía contenido (richtext, alt, URLs) | Sanitización server-side en save Y en render; React escapa por defecto; prohibido `dangerouslySetInnerHTML` fuera de `<RichText>`; `link` valida protocolo (bloquea `javascript:`); SVG upload rechazado |
| CSRF | Server Actions verifican Origin/Host nativamente; además middleware rechaza mutaciones cuyo `Origin` no coincida con el host; cookies `SameSite=Lax` |
| Clickjacking | CSP `frame-ancestors 'self'` |
| Inyección SQL | Drizzle parametriza todo; prohibido `sql.raw` con input de usuario (regla ESLint) |
| Escalada de privilegios | Chequeo de rol en cada action (server), no solo en UI; `LAST_ADMIN` guard |
| Robo de sesión | Cookies `httpOnly Secure SameSite=Lax`, JWT firmado con `AUTH_SECRET`, expiración 7 d, invalidación al cambiar contraseña (claim `pwdV`) |
| Abuso de uploads | Sesión requerida para token, allowlist MIME + sniff de magic bytes en `finalizeUpload`, límite 10 MB, pathname namespaced |
| Enumeración | Mensajes de error genéricos en auth y recursos (404 uniforme) |
| Acceso por proveedor externo | Opcional y apagado por omisión (ADR-900); se exige `email_verified`; el correo debe corresponder a una cuenta **ya existente y activa** — el proveedor nunca crea cuentas ni decide roles; la identidad de la sesión se toma de `users`, nunca del perfil |
| Secretos en cliente | `import 'server-only'` en `cms/core`, `cms/db`, `cms/auth`, `cms/security`; CI falla si un bundle de cliente importa esos módulos |
| Dependencias | Dependabot + `pnpm audit` en CI (falla en high/critical) |

### 7.2 Headers (middleware, todas las rutas)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.public.blob.vercel-storage.com;
  connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Robots-Tag: noindex           # solo en /admin, /preview, /api, /setup
```


> **Enmienda — ADR-703 (issue #197).** `connect-src` pasa a ser `'self' https://vercel.com`.
>
> ADR-005 manda el fichero de la subida **del navegador a Vercel Blob directamente**, y con
> `'self'` a secas el navegador bloqueaba esa conexión: la subida se quedaba colgada sin un solo
> error. Las dos decisiones eran incompatibles desde M4 y no se vio hasta el primer despliegue.
>
> Es **un origen concreto**, no un comodín, y ninguna otra directiva cambia.

### 7.3 Bootstrap seguro (primer arranque)

1. El deploy exige `APP_SECRET` y `AUTH_SECRET` (≥ 32 bytes; `.env.example` explica cómo generarlos y el README de Vercel Deploy Button los marca requeridos).
2. Sin usuarios en BD, toda ruta redirige a `/setup`, que exige el `SETUP_TOKEN` (env var definida por quien despliega). Con token válido se crea el primer admin y se escribe `settings.setup_completed = true`; a partir de ahí `/setup` devuelve 404 aunque el token siga en las env.
3. Nunca existen credenciales por defecto.

### 7.4 Env vars

```
DATABASE_URL=            # inyectada por integración Neon
AUTH_SECRET=             # openssl rand -base64 32
APP_SECRET=              # firma de preview/setup/reset tokens
SETUP_TOKEN=             # solo para el primer arranque
BLOB_READ_WRITE_TOKEN=   # inyectada por integración Vercel Blob
KV_REST_API_URL=/TOKEN=  # opcional (rate limit distribuido); sin esto, fallback in-memory
AUTH_GOOGLE_ID=/SECRET=  # opcional (ADR-900); hacen falta las dos o Google se queda apagado
```

> **Enmienda — ADR-701 (issue #177).** Dos variables más, las dos **opcionales** y las dos del
> lado de la vista previa de una web que vive fuera:
>
> ```
> PREVIEW_ORIGINS=         # opcional; orígenes que pueden leer borradores, separados por comas
> PREVIEW_URL=             # opcional; a dónde apunta el iframe de la vista previa
> ```
>
> Se listan aquí porque esta sección es el inventario de lo que hay que definir al desplegar, y
> una variable que decide **quién puede leer contenido sin publicar** no puede estar solo en la
> spec de su fase. Sin `PREVIEW_ORIGINS` el comportamiento es exactamente el de antes de esta
> enmienda: la ruta de borradores responde 404 y la CSP de §7.2 no cambia ni un carácter.
>
> Que sean variables de entorno y no ajustes del panel es la decisión, no el detalle: un ajuste
> en la base de datos lo cambia cualquiera con una sesión de administrador.

---

## 8. Optimización y rendimiento

- **Ruta pública:** server components + ISR por tags. Presupuesto: LCP < 2.5 s en 4G, JS de cliente en la landing ≤ 60 KB gz (solo hidratación de secciones interactivas; secciones puramente textuales pueden ser server components leyendo el contexto estático vía props si el dev lo prefiere — documentado).
- **Admin:** route group separado ⇒ el visitante jamás descarga código del panel. Tiptap se carga con `dynamic(() => import(...))` solo en campos richtext.
- **BD:** una query por render de landing y por entry en admin; índices en `key`/`type`; `unstable_cache` colapsa lecturas repetidas dentro del mismo render.
- **Autosave:** debounce 2 s tras el último tecleo + guardado al blur del formulario; indicador "Guardado ✓ / Guardando…"; el borrador nunca se pierde (localStorage como red de seguridad ante fallo de red, con reconciliación por `version`).
- **Imágenes:** `next/image` con `remotePatterns` limitado al dominio de Blob; el editor exige `alt` (campo obligatorio en `s.image` salvo `decorative: true`).
- Presupuestos verificados en CI (Lighthouse CI contra el build de la landing con contenido seed: performance ≥ 90, a11y ≥ 95).

---

## 9. Experiencia del usuario final (no técnico)

- Vocabulario del panel: "Guardar borrador", "Publicar cambios", "Deshacer cambios", "Volver a una versión anterior". Cero palabras como slug, schema, cache.
- Dashboard: tarjeta por sección con estado (Publicado / Cambios sin publicar) + botón "Publicar todo".
- Editor: split view descrito en §6, toggle móvil/escritorio para el iframe, avisos claros de validación al publicar ("Falta el Título principal en Portada").
- Confirmaciones destructivas con texto explícito; historial con "Restaurar" que lleva a borrador, nunca publica directo.
- `docs/SETUP.md`: guía con capturas para desplegar con el Deploy Button de Vercel (fork → botón → agregar integraciones Neon y Blob → definir 3 secretos → abrir `/setup`). Meta: 15 minutos sin tocar una terminal.

---

## 10. Fuera de alcance del MVP (backlog priorizado)

1. 2FA TOTP · 2. Reset de contraseña por email (requiere proveedor SMTP) · 3. Programación de publicaciones · 4. Campos `object`/`list` anidados y `reference` · 5. i18n de contenido · 6. Diff visual entre revisiones · 7. Export/import JSON del contenido · 8. Extracción de `cms/` como paquete npm.

---

## 11. Criterios de aceptación del MVP (Definition of Done global)

1. Deploy limpio en Vercel siguiendo `docs/SETUP.md` termina en una landing pública funcional y un admin protegido.
2. Un usuario sin conocimientos técnicos puede: iniciar sesión, editar el hero viendo la preview en vivo, publicar, ver el cambio en la página pública en < 60 s, y revertir a la versión anterior.
3. Todas las mutaciones rechazan requests sin sesión y con rol insuficiente (probado por tests de integración).
4. Suite completa verde en CI: lint, typecheck, unit (≥ 80 % en `cms/core`, `cms/security`), integración de actions contra Postgres efímero, e2e Playwright del flujo crítico (login → editar → preview refleja el cambio → publicar → landing actualizada).
5. Sin findings high/critical en `pnpm audit`; CSP activa verificada por test e2e; `zod` valida cada action (verificado por test que envía payloads malformados).
6. `docs/DEVELOPER.md` permite a un dev externo montar el CMS sobre una landing nueva en < 1 hora (validado con el proyecto de ejemplo incluido).
