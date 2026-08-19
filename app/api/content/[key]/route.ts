import appConfig from '@/cms.config';
import { readCollection, readContent } from '@/cms/core/content';
import type { CollectionKey, SingletonKey } from '@/cms/core/types';

/**
 * `GET /api/content/:key` (SPEC §5.3): el contenido **publicado** de una entrada.
 *
 * Es una ruta **pública y sin sesión**, y de ahí sale todo lo demás:
 *
 * - **Solo publicado.** Filtrar un borrador aquí es publicar sin querer, y sin que nadie
 *   pulse nada. Por eso llama a `readContent`/`readCollection`, que leen la columna
 *   `published`, y no a `getDraft`.
 * - **Solo claves declaradas en `cms.config.ts`.** No se acepta una clave cualquiera para
 *   consultarla contra la base de datos: eso convertiría la ruta en un lector genérico de la
 *   tabla `content_entries`, incluidos los elementos de colección sin publicar, que existen
 *   como filas aunque no se vean.
 * - **404 igual para lo inexistente que para lo no declarado.** Distinguirlos diría a quien
 *   pregunta qué claves existen en la configuración.
 */
export const runtime = 'nodejs';

/** SPEC §5.3, criterio de #82. En segundos. */
const S_MAXAGE = 60;
const STALE_WHILE_REVALIDATE = 300;

function isSingleton(key: string): key is SingletonKey {
  return Object.hasOwn(appConfig.singletons, key);
}

function isCollection(key: string): key is CollectionKey {
  return Object.hasOwn(appConfig.collections, key);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> }
): Promise<Response> {
  const { key } = await context.params;

  const headers = {
    'Cache-Control': `public, s-maxage=${S_MAXAGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
  };

  if (isSingleton(key)) {
    return Response.json({ key, data: await readContent(key) }, { headers });
  }

  if (isCollection(key)) {
    return Response.json({ key, items: await readCollection(key) }, { headers });
  }

  // Sin cabecera de caché: una respuesta de "no existe" cacheada durante un minuto haría que
  // una clave recién añadida a la configuración pareciera seguir sin existir.
  return Response.json({ error: 'not_found' }, { status: 404 });
}
