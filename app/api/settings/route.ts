import { readSettings } from '@/cms/core/settings';

/**
 * `GET /api/settings`: los ajustes del sitio, para una web que vive fuera (spec 16 §5.7, #284).
 *
 * ## Por qué existe
 *
 * Porque el aviso al publicar manda `settings.updated`, y hasta ahora la web de destino **no
 * podía pedir los ajustes**: `docs/DEVELOPER.md` decía «siguen sin endpoint público». Un aviso de
 * algo que quien lo recibe no puede consultar es un aviso vacío — le dice «esto cambió» y le deja
 * sin forma de saber qué. O se abre la ruta, o el evento no debería existir.
 *
 * ## Lo que sale, y sobre todo lo que no
 *
 * Salen `site` y `seo`. **Nunca `setup_completed`**, y no es por limpieza: ese ajuste dice si el
 * bootstrap sigue abierto, y `/setup` responde 404 después de completarse **precisamente para no
 * decirlo**. Sacarlo por una ruta pública anularía esa protección desde la ruta de al lado.
 *
 * La tabla `settings` de `SPEC.md` §4 tiene tres claves y esta ruta expone dos, **nombradas una a
 * una**. Que la lista sea explícita y no «todo lo que haya en la tabla» es la diferencia entre una
 * ruta que se puede razonar y una que filtra la siguiente clave que alguien añada sin acordarse
 * de esto.
 *
 * ## Y lo que se hereda de `/api/content/:key` a propósito
 *
 * - **Pública y sin sesión**, porque la pide el servidor de otra web.
 * - **Sin cabeceras CORS.** No se le añaden, igual que a la de contenido (T-R-14): se pide desde
 *   un servidor, no desde el navegador de quien visita.
 * - **La misma cabecera de caché.** Los ajustes cambian sin publicar, así que un minuto de caché
 *   es lo que separa «cambiar el nombre del sitio» de «que se vea». Se acepta porque es el mismo
 *   trato que el contenido y porque el aviso `settings.updated` es lo que avisa de verdad; y
 *   quien lo reciba puede esquivar la copia vieja con `?v=`, igual que en la otra ruta.
 */
export const runtime = 'nodejs';

/** Los mismos números que `/api/content/[key]`, y por el mismo motivo (SPEC §5.3). */
const S_MAXAGE = 60;
const STALE_WHILE_REVALIDATE = 300;

export async function GET(): Promise<Response> {
  // Los dos, y en paralelo: son dos lecturas independientes de la misma tabla.
  const [site, seo] = await Promise.all([readSettings('site'), readSettings('seo')]);

  return Response.json(
    { site, seo },
    {
      headers: {
        'Cache-Control': `public, s-maxage=${S_MAXAGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      },
    }
  );
}
