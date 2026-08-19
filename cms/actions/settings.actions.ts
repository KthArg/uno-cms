'use server';

import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { SETTINGS_SCHEMAS, SETTINGS_TAG } from '@/cms/core/settings';
import { getDb, settings } from '@/cms/db';
import { signToken } from '@/cms/security/tokens';
import { defineAction, failFields, fieldsFromZod, ok } from './pipeline';

/**
 * Ajustes del sitio y token de vista previa (SPEC §5.3).
 *
 * Los esquemas y la lectura viven en `cms/core/settings.ts`: aquí solo hay mutaciones, que es
 * lo que `cms/actions` debe contener (T-75-6).
 */

export const updateSettings = defineAction({
  name: 'settings.update',
  // Solo `admin` (SPEC §5.3). No es contenido: cambia cómo se comporta el sitio entero.
  role: 'admin',
  bucket: 'admin',
  input: z.object({
    key: z.enum(['site', 'seo']),
    value: z.record(z.unknown()),
  }),
  targetType: 'settings',
  targetId: (input) => input.key,
  handler: async (input) => {
    const parsed = SETTINGS_SCHEMAS[input.key].safeParse(input.value);
    if (!parsed.success) return failFields(fieldsFromZod(parsed.error));

    const valor = parsed.data as Record<string, unknown>;

    await getDb()
      .insert(settings)
      .values({ key: input.key, value: valor })
      // Un `insert ... on conflict do update` y no un `update`: la fila puede no existir
      // todavía, y comprobar antes para decidir sería dos operaciones donde cabe una.
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: valor, updatedAt: new Date() },
      });

    // Después de escribir. Los ajustes se leen en el layout, así que esto afecta a todas las
    // páginas.
    revalidateTag(SETTINGS_TAG);

    return ok({ key: input.key });
  },
});

export const createPreviewToken = defineAction({
  name: 'content.createPreviewToken',
  role: 'editor',
  bucket: 'preview',
  input: z.object({ key: z.string().min(1).max(200) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input) => {
    // La clave va **dentro** del token firmado, no como parámetro aparte de la URL. Un token
    // sin clave dentro serviría para cualquier entrada, y el enlace compartible de §6.1 se
    // convertiría en una llave maestra de la vista previa.
    const token = signToken('preview', { key: input.key });

    return ok({ token, expiresInSeconds: 2 * 60 * 60 });
  },
  // El token es una credencial: en la auditoría queda qué entrada se previsualizó, no con qué
  // llave.
  auditMeta: () => ({}),
});
