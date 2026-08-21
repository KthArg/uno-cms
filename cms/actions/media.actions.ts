'use server';

import { del } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, media } from '@/cms/db';
import { defineAction, fail, ok } from './pipeline';
import { borrarDelDisco, esImagenLocal } from '@/cms/security/almacen-local';

/**
 * Las actions de la biblioteca de imágenes (SPEC §5.3, ADR-005).
 *
 * La subida no está aquí: es una ruta, porque el navegador sube directamente a Vercel Blob y
 * lo que se emite es un token. Aquí está lo que sí es una mutación nuestra — borrar y describir.
 */

export const deleteMedia = defineAction({
  name: 'media.delete',
  // `admin` y no `editor`. Borrar una imagen no es editar contenido: es quitar un fichero que
  // puede estar usado en secciones que quien borra no está mirando, y no hay deshacer.
  role: 'admin',
  bucket: 'admin',
  input: z.object({ id: z.string().uuid() }),
  targetType: 'media',
  targetId: (input) => input.id,
  handler: async (input) => {
    const db = getDb();

    const [fila] = await db
      .select({ id: media.id, url: media.url, pathname: media.pathname })
      .from(media)
      .where(eq(media.id, input.id))
      .limit(1);

    if (fila === undefined) return fail('NOT_FOUND');

    // **Primero el fichero, después la fila.**
    //
    // Al revés, un fallo al borrar en Blob dejaría un fichero que nadie puede volver a
    // encontrar: la fila con su `pathname` era la única forma de saber que existía. Se paga
    // almacenamiento invisible para siempre.
    //
    // En este orden, un fallo deja la fila apuntando a un fichero que sigue ahí — visible en
    // la biblioteca, y se vuelve a intentar. Un residuo que se ve es recuperable; uno que no,
    // no.
    try {
      // **Se decide por dónde está el fichero, no por qué almacén está activo.** Quien conecta
      // un almacén de Vercel después de haber probado en local sigue teniendo filas que apuntan
      // al disco: preguntarle al entorno las mandaría a borrar en Vercel, donde no están, y
      // esas imágenes se quedarían en la biblioteca sin forma de quitarlas.
      if (esImagenLocal(fila.url)) await borrarDelDisco(fila.pathname);
      else await del(fila.url);
    } catch (error) {
      console.error(`[media] no se ha podido borrar ${fila.pathname} en el almacén`, error);
      return fail(
        'INTERNAL',
        'No se ha podido eliminar la imagen del almacén. Vuelve a intentarlo.'
      );
    }

    await db.delete(media).where(eq(media.id, input.id));

    return ok({ id: input.id, pathname: fila.pathname });
  },
  auditMeta: (output) => ({ pathname: output.pathname }),
});

export const updateMediaAlt = defineAction({
  name: 'media.updateAlt',
  role: 'editor',
  bucket: 'saveDraft',
  input: z.object({ id: z.string().uuid(), alt: z.string().trim().max(300) }),
  targetType: 'media',
  targetId: (input) => input.id,
  handler: async (input) => {
    const actualizadas = await getDb()
      .update(media)
      .set({ alt: input.alt })
      .where(eq(media.id, input.id))
      .returning({ id: media.id });

    if (actualizadas.length === 0) return fail('NOT_FOUND');

    return ok({ id: input.id });
  },
});
