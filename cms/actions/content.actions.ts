'use server';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import appConfig from '@/cms.config';
import type { AnyField, ObjectSchema } from '@/cms/core/config';
import { sanitizeRichText } from '@/cms/core/richtext';
import { buildObjectSchema } from '@/cms/core/schema-gen';
import { contentEntries, getDb } from '@/cms/db';
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
    if (salida[name] === undefined) continue;
    salida[name] = sanitizeRichText(salida[name]);
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
