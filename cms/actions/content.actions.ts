'use server';

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import appConfig from '@/cms.config';
import type { AnyField, ObjectSchema } from '@/cms/core/config';
import { sanitizeRichText } from '@/cms/core/richtext';
import { buildObjectSchema } from '@/cms/core/schema-gen';
import { contentTag } from '@/cms/core/content';
import { contentEntries, getDb, revisions } from '@/cms/db';
import type { ActionFieldError } from './pipeline';
import { defineAction, fail, failFields, fieldsFromZod, ok } from './pipeline';

/**
 * Server Actions de contenido (SPEC §5.3).
 *
 * Todas se construyen con `defineAction`, que es lo que garantiza el orden del pipeline y el
 * chequeo de rol en el servidor. Hay un test que falla si aparece aquí una función exportada
 * que no pase por él (T-75-6).
 */

/**
 * El esquema del objeto que corresponde a una fila, a partir de su `type`.
 *
 * Se resuelve desde la fila y no desde el input: si viniera del cliente, bastaría con pedir
 * el guardado de un testimonio declarando `type: 'hero'` para validarlo con otro esquema.
 */
function schemaFor(type: string): ObjectSchema | null {
  const singleton = (appConfig.singletons as Record<string, ObjectSchema | undefined>)[type];
  if (singleton !== undefined) return singleton;

  const collection = (
    appConfig.collections as Record<string, { schema: ObjectSchema } | undefined>
  )[type];
  return collection?.schema ?? null;
}

/**
 * Limpia los campos de richtext antes de validar (SPEC §5.3, "sanitiza richtext").
 *
 * Limpiar y no rechazar es deliberado, y el motivo está en `sanitizeRichText`: con el
 * autosave de §8, rechazar significa fallar en bucle cada dos segundos mientras el editor
 * sigue escribiendo sin saber que no se guarda nada.
 */
function sanitizeRichTextFields(
  schema: ObjectSchema,
  data: Record<string, unknown>
): Record<string, unknown> {
  const salida: Record<string, unknown> = { ...data };

  for (const [name, field] of Object.entries(schema.fields) as [string, AnyField][]) {
    if (field.kind !== 'richtext') continue;

    const valor = salida[name];
    // **Solo se sanea lo que ya es un objeto.** `sanitizeRichText` devuelve un documento
    // vacío ante cualquier otra cosa, que es lo correcto para ella, pero encadenado con la
    // validación abre una vía de borrado silencioso: un `body: null` o un `body: "texto"`
    // —un estado sin inicializar en el editor, una respuesta a medias— se convertiría en un
    // documento vacío, pasaría el esquema laxo y **se guardaría encima del contenido que
    // había**, cada dos segundos, hasta no dejar nada que recuperar.
    //
    // Dejándolo pasar, lo rechaza la validación, que es donde tiene que morir.
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) continue;

    salida[name] = sanitizeRichText(valor);
  }

  return salida;
}

const saveDraftInput = z.object({
  key: z.string().min(1).max(200),
  data: z.record(z.unknown()),
  // El `version` que el panel tiene en la mano. Entero y no negativo: cualquier otra cosa es
  // un cliente roto, y aceptarla haría que el bloqueo optimista comparase contra basura.
  version: z.number().int().min(0),
});

export const saveDraft = defineAction({
  name: 'content.saveDraft',
  role: 'editor',
  bucket: 'saveDraft',
  input: saveDraftInput,
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input, session) => {
    const db = getDb();

    const [row] = await db
      .select({ type: contentEntries.type })
      .from(contentEntries)
      .where(eq(contentEntries.key, input.key))
      .limit(1);

    if (row === undefined) return fail('NOT_FOUND');

    const schema = schemaFor(row.type);
    // El `type` sale de la base de datos, así que esto solo ocurre si `cms.config.ts` perdió
    // una sección que todavía tiene filas. Es un fallo de configuración, no del editor.
    if (schema === null) {
      return fail(
        'NOT_FOUND',
        'Esta sección ya no existe en la configuración del sitio. Avisa a quien lo administra.'
      );
    }

    const saneado = sanitizeRichTextFields(schema, input.data);

    // Esquema **laxo**: un borrador a medias tiene que poder guardarse, que es la razón de
    // que exista (SPEC §5.1). La puerta estricta es `publish`.
    const parsed = buildObjectSchema(schema, 'draft').safeParse(saneado);
    if (!parsed.success) return failFields(fieldsFromZod(parsed.error));

    // El bloqueo optimista, en la propia condición del UPDATE: comprobar la versión antes y
    // escribir después deja una ventana entre las dos operaciones por la que cabe otro
    // guardado, y el conflicto que se quiere detectar pasaría desapercibido.
    const updated = await db
      .update(contentEntries)
      .set({
        draft: parsed.data as Record<string, unknown>,
        version: sql`${contentEntries.version} + 1`,
        draftUpdatedAt: new Date(),
        updatedBy: session.userId,
        // Siempre `changed`, incluso si nunca se publicó. `publishAll` itera justamente las
        // entradas en `changed` (SPEC §5.3), así que dejar en `draft` una sección recién
        // rellenada haría que "publicar todo" la saltara — y el editor vería que su primera
        // sección no se publica sin ningún error que lo explique. Que nunca se haya publicado
        // se sabe por `published IS NULL`, que ya está en la fila.
        status: 'changed',
      })
      .where(and(eq(contentEntries.key, input.key), eq(contentEntries.version, input.version)))
      .returning({ version: contentEntries.version });

    const fila = updated[0];
    if (fila === undefined) return fail('VERSION_CONFLICT');

    // Se devuelve el **nuevo** `version` para que el panel siga guardando sin recargar.
    // Devolver el viejo invitaría a que el cliente lo incrementara por su cuenta, que es
    // exactamente cómo se rompe un bloqueo optimista (spec de fase §3.4).
    return ok({ version: fila.version });
  },
});

// ── Publicación ──────────────────────────────────────────────────────────────────────────

/** SPEC §4: "Retención: máximo 20 revisiones por entrada". */
const MAX_REVISIONS = 20;

/**
 * Cuántas entradas publica como mucho un `publishAll`.
 *
 * El bucle hace una transacción por entrada, en secuencia, dentro de una Server Action. Con
 * tres singletons no pasa nada; con una colección de doscientos elementos modificados, choca
 * con el límite de duración de la función en un despliegue serverless. Y lo que se pierde al
 * chocar no es la publicación —lo escrito está confirmado— sino **el informe**: la petición
 * muere y el editor no sabe qué pasó con su sitio.
 *
 * El tope se **reporta** en `remaining`. Un límite silencioso sería peor que no tenerlo:
 * leer `published: [...]` sin más da a entender que ya está todo.
 */
const MAX_PUBLISH_ALL = 100;

/**
 * El nombre visible de una sección, para los avisos de validación (SPEC §9, ADR-406).
 *
 * Si falta la etiqueta se usa la clave. Es feo a propósito: se ve en el mensaje y se corrige
 * añadiendo la etiqueta, en vez de quedarse en un valor inventado que parece correcto.
 */
function sectionLabel(type: string, schema: ObjectSchema): string {
  const collection = (appConfig.collections as Record<string, { label?: string } | undefined>)[
    type
  ];
  return schema.label ?? collection?.label ?? type;
}

/**
 * Traduce los problemas del esquema estricto al mensaje de SPEC §9: "Falta el Título
 * principal en Portada".
 *
 * Lo que M1 dejó a medias era esto: el esquema ya produce "Completa «Título principal» antes
 * de publicar", pero sin decir **en qué sección**, y al publicar todo el editor recibe una
 * lista de campos sin saber dónde están.
 */
function publishFieldErrors(
  error: z.ZodError,
  schema: ObjectSchema,
  seccion: string
): ActionFieldError[] {
  return fieldsFromZod(error).map((field) => {
    const definicion = schema.fields[field.path];
    const etiqueta = definicion?.label ?? field.path;
    return { path: field.path, message: `Falta ${etiqueta} en ${seccion}.` };
  });
}

/**
 * Serialización estable: las claves en orden, recursivamente.
 *
 * `JSON.stringify` conserva el orden de inserción, así que dos objetos con el mismo contenido
 * y las claves en distinto orden darían cadenas distintas. Comparar así diría "ha cambiado"
 * cada vez que un formulario mandara los campos en otro orden, y publicaría revisiones
 * idénticas que se comerían el presupuesto de 20 de SPEC §4.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  if (typeof value === 'object' && value !== null) {
    const entradas = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

type PublishOutcome =
  | { readonly ok: true; readonly cambio: boolean }
  | {
      readonly ok: false;
      readonly code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'VALIDATION_FAILED' | 'INTERNAL';
      readonly fields?: ActionFieldError[];
    };

/**
 * Publica **una** entrada, cada una en su propia transacción.
 *
 * Está separada de la action porque `publishAll` la reutiliza tal cual: ADR-401 dice que la
 * publicación masiva es todo-o-nada **por entrada** y no global, así que un campo olvidado en
 * una sección que a nadie le urge no puede bloquear el resto.
 */
async function publishEntry(
  db: ReturnType<typeof getDb>,
  key: string,
  expectedVersion: number | null,
  actorId: string
): Promise<PublishOutcome> {
  return db.transaction(async (tx) => {
    // `FOR UPDATE`, que SPEC §4 exige por nombre. Sin el bloqueo, dos publicaciones
    // simultáneas de la misma entrada leerían el mismo estado anterior y escribirían **dos
    // revisiones idénticas**, perdiendo uno de los dos estados del historial.
    const [row] = await tx
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, key))
      .limit(1)
      .for('update');

    if (row === undefined) return { ok: false, code: 'NOT_FOUND' };

    if (expectedVersion !== null && row.version !== expectedVersion) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }

    const schema = schemaFor(row.type);
    if (schema === null) return { ok: false, code: 'NOT_FOUND' };

    // Esquema **estricto**: esta es la puerta de publicación, y el único sitio donde exigir
    // los campos requeridos tiene sentido, porque aquí sí hay alguien a quien pedírselos.
    const parsed = buildObjectSchema(schema, 'strict').safeParse(row.draft);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        fields: publishFieldErrors(parsed.error, schema, sectionLabel(row.type, schema)),
      };
    }

    const entrante = parsed.data as Record<string, unknown>;

    // Publicar algo idéntico a lo ya publicado no genera revisión ni toca la fila (T-78-7).
    // Sin esto, `saveDraft` marca `changed` en cada guardado —también al escribir una letra y
    // borrarla—, y "publicar todo" iría creando revisiones iguales que se comen el
    // presupuesto de 20.
    if (row.published !== null && stableStringify(row.published) === stableStringify(entrante)) {
      // Sí se corrige el `status`: la fila decía "con cambios" y no los tenía.
      if (row.status !== 'published') {
        await tx
          .update(contentEntries)
          .set({ status: 'published' })
          .where(eq(contentEntries.key, key));
      }
      return { ok: true, cambio: false };
    }

    if (row.published !== null) {
      // **Lo que se sustituye, no lo que entra** (ADR-402): una revisión sirve para volver
      // atrás, y "atrás" es lo que había. Guardando lo entrante, la revisión más reciente
      // sería idéntica a lo publicado actual y no serviría para nada.
      await tx.insert(revisions).values({
        entryKey: key,
        data: row.published,
        publishedBy: actorId,
      });

      // La poda, en la MISMA transacción (SPEC §4, criterio de #78): si falla, no se publica.
      // Fuera de ella, el día que fallara la tabla crecería sin límite y nadie se enteraría,
      // porque la publicación habría ido bien.
      const sobrantes = await tx
        .select({ id: revisions.id })
        .from(revisions)
        .where(eq(revisions.entryKey, key))
        .orderBy(desc(revisions.publishedAt), desc(revisions.id))
        .offset(MAX_REVISIONS);

      if (sobrantes.length > 0) {
        await tx.delete(revisions).where(
          inArray(
            revisions.id,
            sobrantes.map((r) => r.id)
          )
        );
      }
    }

    await tx
      .update(contentEntries)
      .set({
        published: entrante,
        status: 'published',
        publishedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(contentEntries.key, key));

    return { ok: true, cambio: true };
  });
}

export const publish = defineAction({
  name: 'content.publish',
  role: 'editor',
  bucket: 'publish',
  input: z.object({ key: z.string().min(1).max(200), version: z.number().int().min(0) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input, session) => {
    const result = await publishEntry(getDb(), input.key, input.version, session.userId);

    if (!result.ok) {
      if (result.code === 'VALIDATION_FAILED') return failFields(result.fields ?? []);
      return fail(result.code);
    }

    // **Fuera de la transacción y después de escribir** (SPEC §5.3). Invalidar antes de que el
    // dato esté confirmado repuebla el caché con el estado viejo, y el editor ve que su
    // publicación no aparece sin ningún error que lo explique.
    revalidateTag(contentTag(input.key));

    return ok({ key: input.key, changed: result.cambio });
  },
  // Sin esto, el rastro de una publicación no distingue entre publicar de verdad y no hacer
  // nada porque no había cambios (ADR-407).
  auditMeta: (output) => ({ changed: output.changed }),
});

export const publishAll = defineAction({
  name: 'content.publishAll',
  role: 'editor',
  bucket: 'publish',
  input: z.object({}),
  targetType: 'content',
  handler: async (_input, session) => {
    const db = getDb();

    // Una cuenta aparte, y no `limit(tope + 1)` mirando cuántas volvieron. Esa versión decía
    // "queda 1" hubiera 1 o hubiera mil, porque nunca traía más de una de sobra — un número
    // que parece exacto y no lo es, que es peor que no darlo.
    const [total] = await db
      .select({ n: count() })
      .from(contentEntries)
      .where(eq(contentEntries.status, 'changed'));

    const tanda = await db
      .select({ key: contentEntries.key })
      .from(contentEntries)
      .where(eq(contentEntries.status, 'changed'))
      .orderBy(asc(contentEntries.key))
      .limit(MAX_PUBLISH_ALL);

    // Lo que no se llega a intentar. Las que se intentan y fallan van en `failed`, que es
    // distinto: ahí sí hay algo que el editor tiene que arreglar.
    const restantes = Math.max(0, (total?.n ?? 0) - tanda.length);

    const publicadas: string[] = [];
    const fallidas: { key: string; code: string; fields?: ActionFieldError[] }[] = [];

    for (const { key } of tanda) {
      // Una transacción **por entrada** (ADR-401). Con una global, un `seo.description` a
      // medias bloquearía la publicación de todo lo demás, y el editor tendría que arreglar
      // algo que no estaba tocando para publicar lo que sí acaba de escribir.
      //
      // El precio es un estado mixto —unas secciones publicadas y otras no—, pero es visible
      // en el panel (SPEC §9: tarjeta por sección con su estado), así que no es un estado
      // oculto.
      //
      // `null` como versión esperada: aquí no hay un `version` que el editor tenga en la mano,
      // se publica lo que haya.
      // El `try` no es defensivo por costumbre: sin él, un fallo de base de datos en **una**
      // entrada —un deadlock, la conexión que se cae— sale del bucle y el envoltorio lo
      // convierte en INTERNAL. Las entradas ya publicadas seguirían escritas y confirmadas,
      // pero el editor recibiría un error genérico y ninguna lista: justo el todo-o-nada
      // global que ADR-401 descarta, colándose por la puerta de las excepciones en vez de por
      // la de la validación.
      let result: PublishOutcome;
      try {
        result = await publishEntry(db, key, null, session.userId);
      } catch (error) {
        console.error(`[content.publishAll] '${key}' lanzó`, error);
        result = { ok: false, code: 'INTERNAL' };
      }

      if (result.ok) {
        publicadas.push(key);
        revalidateTag(contentTag(key));
      } else {
        fallidas.push({
          key,
          code: result.code,
          ...(result.fields === undefined ? {} : { fields: result.fields }),
        });
      }
    }

    // El resultado por clave es obligatorio, no informativo: sin él el editor no sabe qué se
    // publicó y qué se quedó fuera (ADR-401).
    return ok({ published: publicadas, failed: fallidas, remaining: restantes });
  },
  auditMeta: (output) => ({
    published: output.published,
    failed: output.failed.map((f) => f.key),
    remaining: output.remaining,
  }),
});

/**
 * Se queda solo con los campos que **hoy** encajan con el esquema, descartando el resto.
 *
 * Es la aplicación de ADR-404 a la operación inversa: allí, un contenido que dejó de encajar
 * con `cms.config.ts` no puede romper la lectura; aquí, no puede colarse de vuelta al
 * borrador.
 *
 * El caso: alguien quita o renombra un campo en la config y después el editor restaura una
 * revisión anterior al cambio. Sin este filtro, el borrador queda con campos que el
 * formulario —generado desde la config— **no pinta**, y al publicar el esquema estricto los
 * rechaza por desconocidos. El editor se queda encerrado: no puede publicar y no puede
 * arreglar lo que se lo impide, porque no lo ve.
 *
 * Descartar tiene coste —pierde un valor viejo— pero es un valor que de todas formas ya no
 * podía editar. Queda en el log del servidor, porque hacerlo en silencio deja un contenido
 * incompleto sin explicación.
 */
function pickValidFields(
  schema: ObjectSchema,
  data: unknown,
  contexto: string
): Record<string, unknown> {
  const source: Record<string, unknown> =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const salida: Record<string, unknown> = {};
  const descartados: string[] = [];

  for (const [name, field] of Object.entries(schema.fields) as [string, AnyField][]) {
    const valor = source[name];
    if (valor === undefined) continue;

    // Campo a campo y con el esquema laxo: comprueba el tipo, no la presencia. Validar el
    // objeto entero descartaría todo por un solo campo estropeado.
    const parsed = buildObjectSchema(
      { kind: 'object', fields: { [name]: field } },
      'draft'
    ).safeParse({ [name]: valor });

    if (parsed.success) {
      salida[name] = (parsed.data as Record<string, unknown>)[name];
    } else {
      descartados.push(name);
    }
  }

  // Las claves que ya no están en la config ni se miran, y también cuentan como descartadas.
  const desconocidas = Object.keys(source).filter((name) => !(name in schema.fields));

  if (descartados.length > 0 || desconocidas.length > 0) {
    console.error(
      `[content:${contexto}] al restaurar se descartan campos que ya no encajan con cms.config.ts:`,
      [...descartados, ...desconocidas]
    );
  }

  return salida;
}

// ── Deshacer ─────────────────────────────────────────────────────────────────────────────

export const revertDraft = defineAction({
  name: 'content.revertDraft',
  role: 'editor',
  bucket: 'saveDraft',
  input: z.object({ key: z.string().min(1).max(200) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input, session) => {
    const db = getDb();

    return db.transaction(async (tx) => {
      // `FOR UPDATE` por el mismo motivo que en `publish`: entre leer lo publicado y
      // escribirlo en el borrador cabe otra publicación, y el editor se quedaría con un
      // borrador que no es ninguno de los dos estados.
      const [row] = await tx
        .select()
        .from(contentEntries)
        .where(eq(contentEntries.key, input.key))
        .limit(1)
        .for('update');

      if (row === undefined) return fail('NOT_FOUND');

      // Descartar los cambios exige tener algo a lo que volver. Sin publicar, no lo hay, y
      // vaciar el borrador sería destruir lo único que existe.
      if (row.published === null) return fail('NEVER_PUBLISHED');

      const [actualizada] = await tx
        .update(contentEntries)
        .set({
          // ADR-404 aplicado a la escritura: lo publicado puede ser anterior a un cambio de
          // `cms.config.ts`, y devolverlo tal cual al borrador dejaría al editor con campos
          // que su formulario no pinta y que el publicado rechaza.
          draft: pickValidFields(
            schemaFor(row.type) ?? { kind: 'object', fields: {} },
            row.published,
            input.key
          ),
          // Borrador y publicado vuelven a coincidir, que es la definición de `published`
          // en SPEC §4.
          status: 'published',
          // La versión sube igual: para el bloqueo optimista esto **es** una escritura, y no
          // subirla dejaría que un guardado en curso con la versión vieja pisara el
          // descarte sin detectar el conflicto.
          version: sql`${contentEntries.version} + 1`,
          draftUpdatedAt: new Date(),
          updatedBy: session.userId,
        })
        .where(eq(contentEntries.key, input.key))
        .returning({ version: contentEntries.version });

      return ok({ version: actualizada!.version });
    });
  },
});

export const restoreRevision = defineAction({
  name: 'content.restoreRevision',
  role: 'editor',
  bucket: 'saveDraft',
  input: z.object({
    key: z.string().min(1).max(200),
    revisionId: z.string().uuid(),
  }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input, session) => {
    const db = getDb();

    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(contentEntries)
        .where(eq(contentEntries.key, input.key))
        .limit(1)
        .for('update');

      if (row === undefined) return fail('NOT_FOUND');

      // **La revisión se busca por id Y por clave.** Buscarla solo por id dejaría restaurar
      // el contenido de una sección dentro de otra: los identificadores son adivinables por
      // fuerza bruta y el editor tiene permiso para tocar todo el contenido, así que el
      // resultado no sería un escalado de privilegios, pero sí un destrozo silencioso —el
      // texto del hero apareciendo dentro de un testimonio— que nadie sabría explicar.
      const [revision] = await tx
        .select({ data: revisions.data })
        .from(revisions)
        .where(and(eq(revisions.id, input.revisionId), eq(revisions.entryKey, input.key)))
        .limit(1);

      if (revision === undefined) return fail('NOT_FOUND');

      const [actualizada] = await tx
        .update(contentEntries)
        .set({
          // **Al borrador, no a lo publicado** (SPEC §9: "historial con Restaurar que lleva
          // a borrador, nunca publica directo"). Volver atrás sigue siendo una acción
          // deliberada de dos pasos: restaurar y luego publicar. Publicar directamente
          // convertiría un clic exploratorio en el historial en un cambio del sitio público.
          draft: pickValidFields(
            schemaFor(row.type) ?? { kind: 'object', fields: {} },
            revision.data,
            input.key
          ),
          status: 'changed',
          version: sql`${contentEntries.version} + 1`,
          draftUpdatedAt: new Date(),
          updatedBy: session.userId,
        })
        .where(eq(contentEntries.key, input.key))
        .returning({ version: contentEntries.version });

      return ok({ version: actualizada!.version });
    });
  },
});

// ── Colecciones ──────────────────────────────────────────────────────────────────────────

/**
 * El identificador de un elemento de colección.
 *
 * `SPEC.md` §5.3 escribe `key = collection + '.' + nanoid`. Se usa `crypto.randomUUID()` en
 * su lugar (ADR-408): la propiedad que hace falta —un identificador imposible de adivinar y
 * sin colisiones— la da igual, y viene en la plataforma. Añadir una dependencia para acortar
 * una cadena que nadie lee sería pagar una superficie de suministro por estética.
 */
function newItemKey(collection: string): string {
  return `${collection}.${crypto.randomUUID()}`;
}

/** La definición de una colección declarada en `cms.config.ts`, o `null` si no existe. */
function collectionDefinition(name: string): { schema: ObjectSchema } | null {
  const declared = (appConfig.collections as Record<string, { schema: ObjectSchema } | undefined>)[
    name
  ];
  return declared ?? null;
}

const collectionInput = z.object({ collection: z.string().min(1).max(100) });

export const createItem = defineAction({
  name: 'content.createItem',
  role: 'editor',
  bucket: 'saveDraft',
  input: collectionInput,
  targetType: 'content',
  handler: async (input, session) => {
    const definition = collectionDefinition(input.collection);
    // La colección tiene que estar declarada en la config. Sin esta comprobación, se podrían
    // crear filas de un `type` que ningún formulario sabe editar ni ninguna vista mostrar:
    // basura invisible que solo se ve mirando la tabla.
    if (definition === null) return fail('NOT_FOUND');

    const db = getDb();

    return db.transaction(async (tx) => {
      // El siguiente hueco al final.
      //
      // **Dos creaciones simultáneas pueden empatar en la misma posición.** Lo digo en vez de
      // insinuar que está cubierto: estar dentro de una transacción no impide que dos
      // lecturas vean el mismo máximo, y un `SELECT ... FOR UPDATE` sobre la última fila
      // tampoco lo arregla —bloquea filas existentes, no protege de una fila que otra
      // transacción **inserta**, que es justo el caso—. Lo comprobé escribiendo el bloqueo y
      // viendo que el test seguía dando lo mismo.
      //
      // PENDIENTE(#122): nada que arreglar aquí; queda como deuda aceptada en
      // docs/PENDIENTES.md. Cubrirlo de verdad exige un bloqueo consultivo o el nivel
      // `SERIALIZABLE`. No sale a cuenta: el daño de un empate es que dos elementos creados
      // en el mismo milisegundo salgan en el orden que decida el desempate por clave en vez
      // de por creación. El orden sigue siendo **determinista** —hay un test que lo fija— y
      // el editor los arrastra. Poner maquinaria de concurrencia para eso sería pagar
      // complejidad permanente por un detalle cosmético.
      const [ultimo] = await tx
        .select({ max: sql<number | null>`max(${contentEntries.sortOrder})` })
        .from(contentEntries)
        .where(eq(contentEntries.type, input.collection));

      // El borrador inicial es el resultado de aplicar los `default` sobre un objeto vacío,
      // con el esquema laxo, que es el que admite ausencias. Mismo criterio que el seed de
      // singletons (SPEC §5.1).
      const inicial = buildObjectSchema(definition.schema, 'draft').safeParse({});
      if (!inicial.success) {
        // Solo se llega aquí si un `default` de `cms.config.ts` no pasa su propio esquema. Es
        // un fallo del desarrollador y tiene que verse, no enterrarse en un borrador vacío.
        throw new Error(
          `Los valores por defecto de '${input.collection}' no pasan su propio esquema laxo. ` +
            `Revisa cms.config.ts. Detalle: ${inicial.error.message}`
        );
      }

      const key = newItemKey(input.collection);

      const [creada] = await tx
        .insert(contentEntries)
        .values({
          key,
          type: input.collection,
          draft: inicial.data as Record<string, unknown>,
          published: null,
          status: 'draft',
          sortOrder: (ultimo?.max ?? -1) + 1,
          version: 0,
          updatedBy: session.userId,
        })
        .returning({ key: contentEntries.key, sortOrder: contentEntries.sortOrder });

      return ok({ key: creada!.key, sortOrder: creada!.sortOrder });
    });
  },
  auditMeta: (output) => ({ key: output.key }),
});

export const deleteItem = defineAction({
  name: 'content.deleteItem',
  role: 'editor',
  bucket: 'admin',
  input: z.object({ key: z.string().min(1).max(200) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input) => {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ type: contentEntries.type })
        .from(contentEntries)
        .where(eq(contentEntries.key, input.key))
        .limit(1)
        .for('update');

      if (row === undefined) return fail('NOT_FOUND');

      // **Solo elementos de colección.** Un singleton no se borra: es una sección fija de la
      // landing, y sin su fila la lectura devolvería valores vacíos para siempre sin que
      // nadie pudiera recrearla desde el panel.
      if (collectionDefinition(row.type) === null) {
        return fail(
          'CONFLICT',
          'Esta sección es fija y no se puede eliminar. Puedes vaciar su contenido.'
        );
      }

      // Las revisiones se borran **en la misma transacción**. `revisions.entryKey` es texto
      // sin clave foránea, así que nadie las arrastra solas: quedarían apuntando a una
      // entrada que ya no existe, invisibles desde el panel —que las lista por entrada— y
      // sin forma de volver a verlas ni de borrarlas. Contenido fantasma creciendo en la
      // base de datos.
      await tx.delete(revisions).where(eq(revisions.entryKey, input.key));
      await tx.delete(contentEntries).where(eq(contentEntries.key, input.key));

      return ok({ key: input.key, collection: row.type });
    });

    // Fuera de la transacción y solo si se borró: el elemento podía estar publicado, así que
    // la landing tiene que dejar de mostrarlo. Invalidar antes del commit repoblaría el caché
    // con el elemento todavía presente.
    if (result.ok) revalidateTag(contentTag(result.data.collection));

    return result;
  },
});

export const reorderItems = defineAction({
  name: 'content.reorderItems',
  role: 'editor',
  bucket: 'saveDraft',
  input: z.object({
    collection: z.string().min(1).max(100),
    orderedKeys: z.array(z.string().min(1).max(200)).max(500),
  }),
  targetType: 'content',
  targetId: (input) => input.collection,
  handler: async (input) => {
    if (collectionDefinition(input.collection) === null) return fail('NOT_FOUND');

    // Claves repetidas dejarían elementos sin posición asignada y otros con dos. Se rechaza
    // antes de tocar nada.
    if (new Set(input.orderedKeys).size !== input.orderedKeys.length) {
      return fail('CONFLICT', 'La lista trae elementos repetidos. Vuelve a cargar la página.');
    }

    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const actuales = await tx
        .select({ key: contentEntries.key })
        .from(contentEntries)
        .where(eq(contentEntries.type, input.collection))
        .for('update');

      const existentes = new Set(actuales.map((row) => row.key));

      // Una clave que no es de esta colección: se rechaza entero y no se toca nada. Aceptar
      // las buenas e ignorar las malas dejaría el orden a medias sin decirlo.
      if (input.orderedKeys.some((key) => !existentes.has(key))) return fail('NOT_FOUND');

      // Y la lista tiene que estar **completa**. Si falta alguna —porque otra persona creó un
      // elemento mientras esta arrastraba— reasignar solo las enviadas dejaría a la nueva
      // empatada con otra, y el orden de un empate lo decide el desempate por clave, que es
      // aleatorio para el editor.
      if (input.orderedKeys.length !== actuales.length) {
        return fail(
          'CONFLICT',
          'La lista ha cambiado mientras la reordenabas. Vuelve a cargar la página.'
        );
      }

      for (const [posicion, key] of input.orderedKeys.entries()) {
        await tx
          .update(contentEntries)
          .set({ sortOrder: posicion })
          .where(eq(contentEntries.key, key));
      }

      return ok({ collection: input.collection, count: input.orderedKeys.length });
    });

    // SPEC §5.3: "revalida el tag de la colección". Fuera de la transacción y solo si salió
    // bien, como en `publish`.
    if (result.ok) revalidateTag(contentTag(input.collection));

    return result;
  },
});
