import 'server-only';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Esquema de base de datos (SPEC §4). Tres desviaciones respecto al fragmento de la spec,
 * todas documentadas:
 *
 * 1. La spec usa `sql` sin importarlo; aquí se importa (spec de fase §3.4).
 * 2. La spec menciona `citext` de forma redundante con el índice único sobre
 *    `lower(email)`; se usa solo el índice (ADR-201).
 * 3. **Se añaden restricciones `CHECK` que la spec no contempla** (ADR-203, issue #48),
 *    porque el `enum` de `text()` en Drizzle es solo de TypeScript y sin ellas la base de
 *    datos no garantiza los estados que ADR-003 promete que garantiza.
 *
 * El contenido NO se modela como tablas por tipo (ADR-003): son documentos JSONB validados
 * contra los esquemas Zod que genera `cms/core/schema-gen.ts`. La base de datos garantiza
 * integridad estructural —claves, estados, versiones—; Zod garantiza la semántica.
 */

/**
 * Los valores de los estados, en una sola constante por columna (ADR-203, issue #48).
 *
 * El `enum` de `text()` en Drizzle es **solo de TypeScript**: no genera ni tipo enum de
 * Postgres ni restricción, así que la columna queda como `text` a secas y acepta cualquier
 * cosa. Eso contradice la promesa de ADR-003 de que la base de datos garantiza los estados,
 * y en el caso de `role` deja sin defensa en profundidad justo la columna que decide quién
 * puede hacer qué (SPEC §7.1, "Escalada de privilegios").
 *
 * La solución es mantener `text(..., { enum })` para el tipo y añadir un `CHECK` para la
 * garantía.
 *
 * La lista de valores acaba escrita dos veces: una en el `enum` de TypeScript y otra en el
 * literal SQL del `CHECK`. Derivarla programáticamente exigiría `sql.raw`, que este
 * proyecto prohíbe por regla de lint (SPEC §7.1), y saltarse esa regla para ahorrar una
 * duplicación de dos palabras sería un mal cambio. La divergencia entre ambas la detecta un
 * test de integración que compara el `CHECK` real de Postgres con estas constantes.
 */
export const USER_ROLES = ['admin', 'editor'] as const;
export const CONTENT_STATUSES = ['draft', 'published', 'changed'] as const;

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(), // argon2id (ADR-004)
    role: text('role', { enum: USER_ROLES }).notNull().default('editor'),
    totpSecret: text('totp_secret'), // reservado v1.1, cifrado at-rest con APP_SECRET
    /**
     * Contador para invalidar sesiones al cambiar la contraseña (ADR-301, SPEC §7.1
     * "Robo de sesión", claim `pwdV`).
     *
     * No está en SPEC §4: un JWT es autónomo por definición, así que sin un contador contra
     * el que comparar, cambiar la contraseña —lo que hace cualquiera al sospechar que le han
     * entrado— no expulsa a nadie hasta que la sesión caduque sola, siete días después.
     */
    passwordVersion: integer('password_version').notNull().default(0),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // ADR-201: unicidad sin distinguir mayúsculas por índice funcional, no por `citext`. En
    // un despliegue auto-hospedado no controlamos qué extensiones hay instaladas.
    uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
    // ADR-203: la garantía de verdad. Sin esto, un rol inventado por cualquier ruta de
    // escritura entraría en la tabla y se comportaría como el `else` de cada comprobación.
    check('users_role_check', sql`${t.role} in ('admin', 'editor')`),
  ]
);

export const contentEntries = pgTable(
  'content_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(), // 'home', 'testimonials.item-abc'
    type: text('type').notNull(), // nombre del schema en cms.config.ts
    draft: jsonb('draft').notNull(), // estado editable (validado con el esquema laxo)
    published: jsonb('published'), // null = nunca publicado
    // 'published' = draft === published; 'changed' = hay draft sin publicar
    status: text('status', { enum: CONTENT_STATUSES }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    draftUpdatedAt: timestamp('draft_updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // `set null` y no `cascade`: borrar a un editor no puede llevarse por delante el
    // contenido que escribió.
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(0), // optimistic locking (SPEC §5.3)
  },
  (t) => [
    uniqueIndex('content_key_idx').on(t.key),
    index('content_type_idx').on(t.type),
    check('content_status_check', sql`${t.status} in ('draft', 'published', 'changed')`),
  ]
);

/** Retención: máximo 20 revisiones por entrada, podadas en el mismo tx de `publish`. */
export const revisions = pgTable(
  'revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryKey: text('entry_key').notNull(),
    data: jsonb('data').notNull(), // snapshot de lo publicado
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (t) => [index('revisions_key_idx').on(t.entryKey, t.publishedAt)]
);

export const media = pgTable(
  'media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    url: text('url').notNull(),
    pathname: text('pathname').notNull(), // para borrar en Blob
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    alt: text('alt').notNull().default(''),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('media_pathname_idx').on(t.pathname)]
);

/** Retención: 90 días, con poda perezosa al escribir. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    // Desnormalizado a propósito: el registro tiene que sobrevivir al borrado del usuario.
    // Por eso tampoco lleva clave foránea.
    actorEmail: text('actor_email'),
    action: text('action').notNull(), // 'login.success', 'content.publish', …
    targetType: text('target_type'), // 'content' | 'media' | 'user' | 'settings'
    targetId: text('target_id'),
    meta: jsonb('meta'), // diff resumido, ip truncada, user-agent
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_created_idx').on(t.createdAt)]
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(), // 'seo', 'site', 'setup_completed'
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  users,
  contentEntries,
  revisions,
  media,
  auditLog,
  settings,
};

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ContentEntryRow = typeof contentEntries.$inferSelect;
export type NewContentEntryRow = typeof contentEntries.$inferInsert;
export type RevisionRow = typeof revisions.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
