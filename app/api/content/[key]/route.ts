import appConfig from '@/cms.config';
import { getCollection, getContent } from '@/cms/core/content';
import { idiomaDeCodigo, idiomaPorDefecto } from '@/cms/core/idiomas';
import type { CollectionKey, SingletonKey } from '@/cms/core/types';

/**
 * `GET /api/content/:key` (SPEC §5.3): el contenido **publicado** de una entrada.
 *
 * Es una ruta **pública y sin sesión**, y de ahí sale todo lo demás:
 *
 * - **Solo publicado.** Filtrar un borrador aquí es publicar sin querer, y sin que nadie
 *   pulse nada. Por eso llama a `getContent`/`getCollection`, que leen la columna
 *   `published` (por la caché de datos), y no a `getDraft`.
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
  request: Request,
  context: { params: Promise<{ key: string }> }
): Promise<Response> {
  const { key } = await context.params;

  const headers = {
    'Cache-Control': `public, s-maxage=${S_MAXAGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
  };

  if (!isSingleton(key) && !isCollection(key)) {
    // Sin cabecera de caché: una respuesta de "no existe" cacheada durante un minuto haría que
    // una clave recién añadida a la configuración pareciera seguir sin existir.
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // El idioma (spec 17 §5.5). Se mira **después** de la clave para que una clave inexistente
  // responda el mismo 404 de siempre, con idioma o sin él: lo contrario diría qué claves existen
  // a quien pruebe con un idioma inventado.
  //
  // Y es un 400, no un 404: la clave existe, lo que está mal es la pregunta. Sin caché, por lo
  // mismo que el 404: declarar el idioma mañana no puede tardar un minuto en notarse.
  const pedido = new URL(request.url).searchParams.get('idioma') ?? undefined;
  const idioma = pedido ?? idiomaPorDefecto().codigo;
  if (idiomaDeCodigo(idioma) === null) {
    return Response.json({ error: 'idioma_desconocido' }, { status: 400 });
  }

  // `idioma` va siempre en la respuesta, también cuando no se pidió: quien la lee no tiene por
  // qué saber cuál es el de por defecto para saber qué le han dado.
  // Por la caché de datos, la misma que usa la landing y que invalida `publish` (T-S-20). Leía
  // directamente de la base, y la única caché era la de la CDN, que distingue cada query string:
  // `?r=<aleatorio>` en bucle era una consulta por petición, sin sesión y sin límite. El `?v=`
  // del aviso (ADR-1004) sigue funcionando igual: publicar invalida el tag antes de avisar.
  if (isSingleton(key)) {
    return Response.json({ key, idioma, data: await getContent(key, idioma) }, { headers });
  }

  if (isCollection(key)) {
    return Response.json({ key, idioma, items: await getCollection(key, idioma) }, { headers });
  }

  // Sin cabecera de caché: una respuesta de "no existe" cacheada durante un minuto haría que
  // una clave recién añadida a la configuración pareciera seguir sin existir.
  return Response.json({ error: 'not_found' }, { status: 404 });
}
