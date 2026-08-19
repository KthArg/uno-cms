import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { asc, eq } from 'drizzle-orm';
import appConfig from '@/cms.config';
import { contentEntries, getDb } from '@/cms/db';
import type { AnyField, ObjectSchema } from './config';
import { buildObjectSchema } from './schema-gen';
import type { CollectionItem, CollectionKey, Content, Draft, SingletonKey } from './types';

/**
 * Lectura de contenido para la landing pública (SPEC §5.2).
 *
 * Dos decisiones gobiernan este módulo, y las dos están en `docs/DECISIONS.md`:
 *
 * - **ADR-404: leer no lanza nunca.** El esquema estricto es la puerta de *publicación*, no
 *   la de *lectura*. Aplicarlo aquí, como sugiere la letra de §5.2, deja la landing en 500
 *   hasta la primera publicación —`hero.title` es requerido y no tiene default— y la vuelve
 *   a tumbar el día que alguien añada un campo requerido a `cms.config.ts` con contenido ya
 *   publicado. Aquí se resuelve campo a campo y siempre sale algo renderizable.
 * - **ADR-405: el caché se prueba donde existe.** `unstable_cache` necesita el contexto de
 *   petición de Next, así que la lógica vive en `readContent`/`readCollection`, que no saben
 *   nada de caché y se prueban contra Postgres, y `getContent`/`getCollection` son
 *   envoltorios finos.
 */

/** El tag de invalidación de una clave de contenido (SPEC §5.2, §5.3). */
export function contentTag(key: string): string {
  return `content:${key}`;
}

/**
 * El valor vacío de un campo, para cuando es requerido y no hay nada que poner.
 *
 * No es un valor "por si acaso": es lo que hace cierto el tipo `Content<K>`, que promete que
 * un campo requerido siempre trae valor. `SPEC.md` §5.1 usa esta misma palabra —"valores
 * vacíos/default"— al describir el estado inicial de un singleton.
 */
function emptyValue(field: AnyField): unknown {
  switch (field.kind) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'richtext':
      return { type: 'doc', content: [] };
    case 'image':
      // Los componentes deben tratar `url === ''` como "no hay imagen": un `<img src="">`
      // provoca una segunda petición a la propia página. Anotado en ADR-404 para M5.
      return { mediaId: '', url: '', alt: '' };
    case 'select':
      // La primera opción y no `''`: un select vacío no es un valor válido de su propio
      // esquema, y devolverlo haría que el dato leído no pasara la validación que sí pasa
      // todo lo demás.
      return field.options[0]?.value ?? '';
    default:
      return '';
  }
}

/**
 * Resuelve un objeto de contenido a partir de lo publicado, sin lanzar (ADR-404).
 *
 * Campo a campo y no bloque a bloque, que es la parte que importa: si la config gana un
 * campo requerido, la sección sigue mostrando todo lo que sí estaba publicado en vez de
 * quedarse en blanco entera.
 */
function resolveObject(
  schema: ObjectSchema,
  published: unknown,
  contexto: string
): Record<string, unknown> {
  const source: Record<string, unknown> =
    typeof published === 'object' && published !== null && !Array.isArray(published)
      ? (published as Record<string, unknown>)
      : {};

  const resolved: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(schema.fields)) {
    const raw = source[name];

    if (raw !== undefined) {
      // Se valida con el esquema **laxo** del campo: comprueba el tipo, no la presencia.
      const parsed = buildObjectSchema(
        { kind: 'object', fields: { [name]: field } },
        'draft'
      ).safeParse({ [name]: raw });

      if (parsed.success) {
        resolved[name] = (parsed.data as Record<string, unknown>)[name];
        continue;
      }

      // Sustituir en silencio dejaría una landing mostrando defaults sin que nadie supiera
      // por qué. Esto casi siempre significa que `cms.config.ts` cambió después de publicar.
      console.error(
        `[content:${contexto}] el campo '${name}' publicado ya no pasa su esquema; se usa el valor por defecto`,
        parsed.error.issues
      );
    }

    if (field.hasDefault) {
      resolved[name] = field.defaultValue;
      continue;
    }

    if (field.required) resolved[name] = emptyValue(field);
    // Un opcional sin valor se omite: el tipo inferido ya lo declara como ausente.
  }

  return resolved;
}

// ── Singletons ───────────────────────────────────────────────────────────────────────────

/**
 * La lectura de verdad, sin caché. Es la que se prueba (ADR-405).
 *
 * Devuelve **solo contenido publicado**: el borrador no se asoma nunca a la landing, que es
 * la razón de que exista la columna `published` separada (SPEC §4).
 */
export async function readContent<K extends SingletonKey>(key: K): Promise<Content<K>> {
  const schema: ObjectSchema = appConfig.singletons[key];

  const [row] = await getDb()
    .select({ published: contentEntries.published })
    .from(contentEntries)
    .where(eq(contentEntries.key, key))
    .limit(1);

  return resolveObject(schema, row?.published, key) as Content<K>;
}

/**
 * Lo que usa la landing. **Dos cachés, y hacen cosas distintas** (SPEC §5.2):
 *
 * - `unstable_cache` guarda entre peticiones y lo invalida `publish` por el tag
 *   `content:<key>`.
 * - `cache` de React deduplica dentro de **una misma** petición. La landing de §6.3 renderiza
 *   varias secciones y más de un componente lee la misma clave en el mismo render; sin esto,
 *   el primer render tras publicar —que es justo cuando alguien está mirando— haría una
 *   consulta por componente en lugar de una.
 */
export const getContent = cache(<K extends SingletonKey>(key: K): Promise<Content<K>> =>
  unstable_cache(() => readContent(key), ['content', key], {
    tags: [contentTag(key)],
  })()
);

/**
 * El borrador, para el panel y la vista previa.
 *
 * **No se cachea, a propósito**: cambia cada pocos segundos mientras alguien edita, y un
 * caché aquí haría que el editor viese su propio texto con retraso — que es la forma más
 * rápida de que deje de fiarse del CMS.
 */
export async function getDraft<K extends SingletonKey>(key: K): Promise<Draft<K>> {
  const schema: ObjectSchema = appConfig.singletons[key];

  const [row] = await getDb()
    .select({ draft: contentEntries.draft })
    .from(contentEntries)
    .where(eq(contentEntries.key, key))
    .limit(1);

  const parsed = buildObjectSchema(schema, 'draft').safeParse(row?.draft ?? {});
  // Un borrador que no pasa ni el esquema laxo tampoco puede tumbar el panel: se devuelve
  // vacío y el editor vuelve a rellenarlo, que es mejor que una pantalla de error.
  if (!parsed.success) {
    console.error(`[content:${key}] el borrador no pasa el esquema laxo`, parsed.error.issues);
    return {} as Draft<K>;
  }

  return parsed.data as Draft<K>;
}

// ── Colecciones ──────────────────────────────────────────────────────────────────────────

/**
 * Los elementos **publicados** de una colección, en el orden que fijó el editor.
 *
 * Ordena por `sortOrder` en SQL y no en memoria: el orden es parte del contenido, y dejarlo
 * al orden de llegada de Postgres —que no garantiza ninguno sin `ORDER BY`— haría que la
 * landing barajara los testimonios entre despliegues.
 */
export async function readCollection<K extends CollectionKey>(
  key: K
): Promise<CollectionItem<K>[]> {
  const schema: ObjectSchema = appConfig.collections[key].schema;

  const rows = await getDb()
    .select({ id: contentEntries.id, published: contentEntries.published })
    .from(contentEntries)
    .where(eq(contentEntries.type, key))
    // Desempate por `key`, que es único: dos elementos con el mismo `sortOrder` deben salir
    // siempre en el mismo orden. Sin desempate, Postgres no promete ninguno y la landing
    // barajaría los testimonios entre despliegues.
    .orderBy(asc(contentEntries.sortOrder), asc(contentEntries.key));

  return rows
    .filter((row) => row.published !== null)
    .map((row) => resolveObject(schema, row.published, `${key}/${row.id}`)) as CollectionItem<K>[];
}

/** Ídem que `getContent`: caché entre peticiones y deduplicación dentro de una. */
export const getCollection = cache(
  <K extends CollectionKey>(key: K): Promise<CollectionItem<K>[]> =>
    unstable_cache(() => readCollection(key), ['collection', key], {
      tags: [contentTag(key)],
    })()
);
