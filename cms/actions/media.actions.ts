'use server';

import { del } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, media } from '@/cms/db';
import { esPathnameGenerado } from '@/cms/nombres-de-subida';
import { nombreLegible } from '@/cms/security/uploads';
import { defineAction, fail, ok } from './pipeline';
import { borrarDelDisco, esImagenLocal } from '@/cms/security/almacen-local';

/**
 * Las actions de la biblioteca de imágenes (SPEC §5.3, ADR-005).
 *
 * La subida no está aquí: es una ruta, porque el navegador sube directamente a Vercel Blob y
 * lo que se emite es un token. Aquí está lo que sí es una mutación nuestra — registrar lo que
 * ya se subió, borrar y describir.
 */

/** El único sitio del que puede venir una imagen nuestra. */
const ALMACEN = '.public.blob.vercel-storage.com';

/**
 * Deja constancia de una imagen que **ya está subida** (issue #205, ADR-705).
 *
 * ## Por qué hace falta si Vercel ya avisa
 *
 * Porque avisa **tarde y sin garantía**. Medido en el despliegue: el cliente refrescaba la
 * pantalla un segundo antes de que llegara el aviso, así que la imagen no aparecía hasta que
 * alguien volvía a pedir la página más tarde.
 *
 * Y lo de debajo es peor que un refresco a destiempo: ese aviso era **el único** que escribía la
 * fila. Si no llega —una red que no controlamos, los reintentos de un tercero—, la imagen se
 * queda en el almacén y el CMS no se entera nunca. Ocupa, se ha cobrado, y no existe para nadie.
 *
 * Con esto, quien sube escribe la fila en cuanto termina, y el aviso de Vercel pasa a ser una red
 * de seguridad: el `onConflictDoNothing` sobre `pathname` hace que el segundo en llegar no haga
 * nada.
 *
 * ## Y por eso comprueba lo que le llega
 *
 * Mover una escritura al cliente solo vale si el servidor no se fía de él. Es la misma lección de
 * #199 y en el mismo camino: sin estas dos comprobaciones, cualquiera con sesión mete en la
 * biblioteca una fila que apunta a donde quiera.
 */
export const registrarImagen = defineAction({
  name: 'media.register',
  // `editor`: subir una imagen es parte de editar contenido. Borrarla no, y por eso `deleteMedia`
  // pide `admin`.
  role: 'editor',
  bucket: 'admin',
  input: z.object({
    url: z.string().url().max(500),
    pathname: z.string().max(300),
    filename: z.string().max(200),
    mimeType: z.string().max(100),
  }),
  targetType: 'media',
  targetId: (input) => input.pathname,
  handler: async (input) => {
    // El nombre tiene que ser de los que genera el CMS **y coherente con el tipo**, y esa
    // segunda mitad es también la comprobación del tipo: `esPathnameGenerado` solo conoce las
    // extensiones de los tipos que aceptamos, así que un `image/svg+xml` no tiene ninguna
    // extensión que le corresponda y cae aquí.
    //
    // Aquí había además un `TIPOS_PERMITIDOS.includes(…)`. **No comprobaba nada**: ninguna
    // mutación lo mataba porque no existe entrada que lo alcance. Lo que lo sostiene es que las
    // dos listas coincidan, y eso lo fija un caso de `tests/unit/nombres-de-subida.test.ts` —
    // que es donde se enteraría quien añada un tipo a una lista y no a la otra.
    if (!esPathnameGenerado(input.pathname, input.mimeType)) return fail('VALIDATION_FAILED');

    // Y la dirección tiene que ser de **nuestro** almacén. Se compara el host ya analizado y por
    // sufijo de dominio, no con `includes`: `https://malo.io/?x=.public.blob.vercel-storage.com`
    // pasaría cualquier comprobación sobre la cadena entera.
    let host: string;
    try {
      const url = new URL(input.url);
      if (url.protocol !== 'https:') return fail('VALIDATION_FAILED');
      host = url.host;
    } catch {
      return fail('VALIDATION_FAILED');
    }

    if (!host.endsWith(ALMACEN)) return fail('VALIDATION_FAILED');
    // La dirección tiene que llevar dentro el nombre que se acaba de comprobar; si no, se estaría
    // guardando un nombre válido apuntando a otro fichero.
    if (!input.url.endsWith(`/${input.pathname}`)) return fail('VALIDATION_FAILED');

    await getDb()
      .insert(media)
      .values({
        url: input.url,
        pathname: input.pathname,
        // Una etiqueta para la biblioteca, no una ruta: solo se le quitan los caracteres de
        // control, que romperían el listado. Lo que decide dónde vive el fichero es `pathname`,
        // y ese va comprobado arriba.
        filename: nombreLegible(input.filename),
        mimeType: input.mimeType,
        sizeBytes: 0,
        alt: '',
      })
      // Idempotente a propósito: el aviso de Vercel escribe lo mismo, y el segundo en llegar no
      // debe hacer nada ni fallar.
      .onConflictDoNothing({ target: media.pathname });

    return ok({ pathname: input.pathname });
  },
});

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
