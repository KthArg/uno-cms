import 'server-only';
import { desc } from 'drizzle-orm';
import { getDb, media } from '@/cms/db';

/**
 * La lectura de la biblioteca de imágenes.
 *
 * Vive en `cms/core` y no junto a las actions por lo que enseñó el PR #97: **leer no es
 * mutar**, y el test T-75-6 exige que todo lo exportado desde `cms/actions` pase por el
 * envoltorio. La misma separación que hay entre `cms/core/content.ts` y `content.actions.ts`.
 */

/**
 * Cuántas imágenes trae la biblioteca.
 *
 * Con tope y sin paginación: una landing tiene decenas de imágenes, no miles, y una lista sin
 * tope es una consulta que crece sin que nadie la mire. Cuando haga falta paginar se notará
 * porque el tope se alcanza — que es mejor señal que una lentitud difusa.
 */
export const MAXIMO_EN_BIBLIOTECA = 200;

export interface ImagenDeBiblioteca {
  readonly id: string;
  readonly url: string;
  readonly filename: string;
  readonly alt: string;
  readonly mimeType: string;
}

export async function listMedia(): Promise<ImagenDeBiblioteca[]> {
  const filas = await getDb()
    .select({
      id: media.id,
      url: media.url,
      filename: media.filename,
      alt: media.alt,
      mimeType: media.mimeType,
    })
    .from(media)
    // La más reciente primero: quien abre la biblioteca casi siempre busca lo que acaba de
    // subir.
    .orderBy(desc(media.createdAt))
    .limit(MAXIMO_EN_BIBLIOTECA);

  return filas;
}
