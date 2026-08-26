'use server';

import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import appConfig from '@/cms.config';
import { SETTINGS_SCHEMAS, SETTINGS_TAG } from '@/cms/core/settings';
import { getDb, settings } from '@/cms/db';
import { TOKEN_TTL, signToken } from '@/cms/security/tokens';
import { urlDeVistaPreviaRemota } from '@/cms/vista-previa-remota';
import { defineAction, fail, failFields, fieldsFromZod, ok } from './pipeline';

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

/**
 * Si la clave existe en `cms.config.ts`.
 *
 * Un token firmado es una afirmación, y sin esto diría "esta clave es previsualizable" sin
 * haberlo comprobado — dejando el problema a la ruta de vista previa, que se encontraría tokens
 * nuestros con claves arbitrarias dentro. Aquí es una comprobación; allí sería acordarse.
 *
 * Está fuera de las dos actions que la usan porque son dos: la de `/preview` y la remota. Con una
 * copia en cada una, añadir un tipo de clave y arreglar solo la primera dejaría la otra emitiendo
 * tokens para claves que no existen, y en verde.
 */
function claveConocida(key: string): boolean {
  return (
    Object.hasOwn(appConfig.singletons, key) ||
    Object.hasOwn(appConfig.collections, key) ||
    // Los elementos de colección son `coleccion.id`: se valida la parte de la colección.
    Object.hasOwn(appConfig.collections, key.split('.')[0] ?? '')
  );
}

export const createPreviewToken = defineAction({
  name: 'content.createPreviewToken',
  role: 'editor',
  bucket: 'preview',
  input: z.object({ key: z.string().min(1).max(200) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input) => {
    if (!claveConocida(input.key)) return fail('NOT_FOUND');

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

/**
 * El token que viaja a la web de destino (spec 08 §4.2, ADR-701).
 *
 * ## Por qué es una action aparte y no un parámetro de la de arriba
 *
 * Porque lo que emite **no es lo mismo**: dura quince minutos en vez de dos horas y sale de
 * nuestro origen. Con un `remoto: true` en la de al lado, la auditoría diría "se creó un token de
 * vista previa" para los dos casos, y el que importa revisar cuando algo huela mal es este.
 *
 * Lo que sí se comparte es `claveConocida`, que es la parte que no puede divergir.
 *
 * ## Y por qué responde `NOT_FOUND` si la fase está apagada
 *
 * Sin `PREVIEW_ORIGINS` —o con una `PREVIEW_URL` cuyo origen no esté en la lista— esta action no
 * tiene nada que emitir, y emitirlo igualmente sería crear una credencial que no abre nada y
 * animar a la pantalla a enseñar un iframe que la CSP va a bloquear. Es el mismo criterio que la
 * ruta: la fase se apaga entera.
 */
export const crearTokenDeVistaPreviaRemota = defineAction({
  name: 'content.crearTokenDeVistaPreviaRemota',
  role: 'editor',
  bucket: 'preview',
  input: z.object({ key: z.string().min(1).max(200) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input) => {
    if (urlDeVistaPreviaRemota() === null) return fail('NOT_FOUND');
    if (!claveConocida(input.key)) return fail('NOT_FOUND');

    const token = signToken('preview-remoto', { key: input.key });

    // La vida se manda con el token porque quien renueva la necesita, y la necesita **medida
    // desde ahora**: el panel cuenta lo transcurrido, no compara contra una hora absoluta
    // (`cms/preview/renovacion.ts`).
    return ok({ token, expiresInSeconds: TOKEN_TTL['preview-remoto'] });
  },
  // El token es una credencial: en la auditoría queda qué entrada se previsualizó, no con qué
  // llave.
  auditMeta: () => ({}),
});
