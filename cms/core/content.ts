import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { asc, eq } from 'drizzle-orm';
import appConfig from '@/cms.config';
import { contentEntries, getDb } from '@/cms/db';
import type { AnyField, ObjectSchema } from './config';
import { buildObjectSchema } from './schema-gen';
import { ensureSingletonRow } from './seed';
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

/**
 * La misma lectura, pero para la vista previa: un elemento —o todos— en **borrador**.
 *
 * Vive aquí y no en un módulo aparte porque necesita `resolveObject` y la forma de las filas,
 * que son de este módulo. Sacarla fuera obligaría a exportar las dos cosas solo para eso.
 *
 * `itemKey` acota qué se sustituye (ADR-501):
 *
 * - Con la clave de un elemento, solo ese sale en borrador y el resto como está publicado.
 * - Con `null` —un token de la colección entera— salen todos en borrador.
 *
 * Un elemento **sin publicar** solo aparece si es el que autoriza el token. Es lo que permite
 * previsualizar algo recién creado; incluir los demás enseñaría borradores que ese token no
 * autoriza, que es justo lo que ADR-501 evita.
 */
export async function readCollectionForPreview<K extends CollectionKey>(
  key: K,
  itemKey: string | null
): Promise<CollectionItem<K>[]> {
  const schema: ObjectSchema = appConfig.collections[key].schema;

  const rows = await getDb()
    .select({
      id: contentEntries.id,
      key: contentEntries.key,
      draft: contentEntries.draft,
      published: contentEntries.published,
    })
    .from(contentEntries)
    .where(eq(contentEntries.type, key))
    .orderBy(asc(contentEntries.sortOrder), asc(contentEntries.key));

  return rows
    .map((row) => {
      const enBorrador = itemKey === null || row.key === itemKey;
      const valor = enBorrador ? row.draft : row.published;

      // Lo publicado puede ser `null` —nunca se publicó— y entonces el elemento no sale, salvo
      // que sea el que se está previsualizando.
      if (valor === null) return null;

      return resolveObject(schema, valor, `${key}/${row.id}`);
    })
    .filter((item): item is NonNullable<typeof item> => item !== null) as CollectionItem<K>[];
}

/** Ídem que `getContent`: caché entre peticiones y deduplicación dentro de una. */
export const getCollection = cache(
  <K extends CollectionKey>(key: K): Promise<CollectionItem<K>[]> =>
    unstable_cache(() => readCollection(key), ['collection', key], {
      tags: [contentTag(key)],
    })()
);

// ── Resumen para el panel ────────────────────────────────────────────────────────────────

/** El estado de una sección tal como lo ve el editor (SPEC §9). */
export type SectionState = 'publicado' | 'con-cambios' | 'sin-publicar';

export interface SectionSummary {
  readonly key: string;
  /** Lo que ve el editor. Nunca la clave técnica. */
  readonly nombre: string;
  readonly tipo: 'singleton' | 'coleccion';
  readonly estado: SectionState;
  /** Solo en listas. */
  readonly elementos?: number;
}

function estadoDeFila(fila: { published: unknown; status: string }): SectionState {
  // `published IS NULL` manda sobre el `status`. Una sección que nunca se publicó y tiene
  // `changed` —que es lo que deja `saveDraft`— no tiene "cambios sin publicar": no tiene
  // versión pública ninguna, y decir lo contrario sugiere que hay algo ahí fuera que difiere.
  if (fila.published === null) return 'sin-publicar';
  return fila.status === 'published' ? 'publicado' : 'con-cambios';
}

/**
 * El estado de todas las secciones, para el dashboard (SPEC §9).
 *
 * Una sola consulta para toda la tabla y el resto en memoria: son unas pocas decenas de filas
 * y el panel es una pantalla que se abre entera. Una consulta por sección serían diez viajes
 * a la base de datos para pintar diez tarjetas.
 */
export async function listSections(): Promise<SectionSummary[]> {
  const filas = await getDb()
    .select({
      key: contentEntries.key,
      type: contentEntries.type,
      published: contentEntries.published,
      status: contentEntries.status,
    })
    .from(contentEntries);

  const porClave = new Map(filas.map((fila) => [fila.key, fila]));
  const resumen: SectionSummary[] = [];

  for (const [key, schema] of Object.entries(appConfig.singletons) as [string, ObjectSchema][]) {
    const fila = porClave.get(key);
    resumen.push({
      key,
      nombre: schema.label ?? key,
      tipo: 'singleton',
      // Sin fila es lo mismo que sin publicar: la sección existe en la configuración y la
      // landing la está enseñando con valores vacíos.
      estado: fila === undefined ? 'sin-publicar' : estadoDeFila(fila),
    });
  }

  for (const [key, definicion] of Object.entries(appConfig.collections) as [
    string,
    { label: string },
  ][]) {
    const elementos = filas.filter((fila) => fila.type === key);
    const estados = elementos.map(estadoDeFila);

    resumen.push({
      key,
      nombre: definicion.label,
      tipo: 'coleccion',
      // Una lista está "publicada" solo si **todos** sus elementos lo están. Con uno a medias,
      // lo que el visitante ve no es lo que el editor tiene, y eso es lo que la tarjeta avisa.
      //
      // La lista vacía va primero a propósito: `[].every(...)` es `true`, así que sin este
      // caso una colección sin elementos saldría como "Publicado" — diciéndole al editor que
      // todo está en su sitio cuando lo que hay es nada. Lo encontró su propio test.
      estado:
        elementos.length === 0
          ? 'sin-publicar'
          : estados.every((estado) => estado === 'publicado')
            ? 'publicado'
            : estados.some((estado) => estado === 'publicado')
              ? 'con-cambios'
              : 'sin-publicar',
      elementos: elementos.length,
    });
  }

  return resumen;
}

/**
 * Lo que necesita la pantalla del editor: el borrador, su versión y su estado.
 *
 * Una sola consulta y no tres llamadas sueltas, porque **el `version` tiene que venir del
 * mismo instante que el borrador**. Leerlos por separado abre una ventana en la que otra
 * persona guarda entre las dos consultas: el editor abriría la pantalla con el texto de antes
 * y la versión de después, y su primer guardado pisaría el trabajo ajeno **sin detectar el
 * conflicto** — que es exactamente lo que el bloqueo optimista existe para impedir.
 */
export interface EntryForEditor {
  readonly key: string;
  readonly type: string;
  readonly draft: Record<string, unknown>;
  readonly version: number;
  readonly estado: SectionState;
}

export async function readEntryForEditor(key: string): Promise<EntryForEditor | null> {
  // Un singleton declarado en la configuración **existe** aunque no tenga fila: la fila es un
  // detalle de implementación que se crea la primera vez que hace falta. Ver
  // `ensureSingletonRow`, y el fallo que documenta.
  await ensureSingletonRow(key);

  const [row] = await getDb()
    .select({
      key: contentEntries.key,
      type: contentEntries.type,
      draft: contentEntries.draft,
      published: contentEntries.published,
      status: contentEntries.status,
      version: contentEntries.version,
    })
    .from(contentEntries)
    .where(eq(contentEntries.key, key))
    .limit(1);

  if (row === undefined) return null;

  const schema = schemaForType(row.type);
  if (schema === null) return null;

  const parsed = buildObjectSchema(schema, 'draft').safeParse(row.draft ?? {});

  return {
    key: row.key,
    type: row.type,
    // Mismo criterio que `getDraft`: un borrador que no pasa ni el esquema laxo no puede
    // tumbar el panel. Se abre vacío, que es recuperable, en vez de con una pantalla de error,
    // que no lo es.
    draft: parsed.success ? (parsed.data as Record<string, unknown>) : {},
    version: row.version,
    estado: estadoDeFila(row),
  };
}

/** El esquema de un `type`, sea singleton o colección. */
export function schemaForType(type: string): ObjectSchema | null {
  const singleton = (appConfig.singletons as Record<string, ObjectSchema | undefined>)[type];
  if (singleton !== undefined) return singleton;

  const coleccion = (appConfig.collections as Record<string, { schema: ObjectSchema } | undefined>)[
    type
  ];
  return coleccion?.schema ?? null;
}
