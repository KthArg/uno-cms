import type { MetadataRoute } from 'next';
import { direccionDelSitio } from '@/cms/auth/panel';

/**
 * El sitemap (SPEC §7.2, issue #146).
 *
 * ## Qué lleva, que es poco a propósito
 *
 * Una sola dirección: la landing. Este CMS está acoplado 1:1 a **una** página (SPEC §0), así que
 * no hay más rutas públicas que anunciar. Cuando alguien adapte el CMS a un proyecto con varias,
 * este fichero es donde se añaden.
 *
 * ## Y qué no lleva, que es lo importante
 *
 * Nada bajo los prefijos que el middleware marca como no indexables, y la lista es **la misma**
 * (`cms/routes.ts`). No es simetría por elegancia: `X-Robots-Tag` le dice al buscador que no
 * indexe **después de haber ido a mirar**. Un sitemap que anuncia `/preview` invita a ir, y basta
 * con que un enlace de vista previa siga vivo para que lo que se sirva ahí sea contenido sin
 * publicar de alguien.
 *
 * Con dos listas, añadir un prefijo al middleware y olvidarlo aquí deja ese agujero y en verde.
 * Por eso hay un test que recorre este fichero y lo compara con la lista compartida.
 *
 * ## Dinámico, y por qué
 *
 * La dirección del sitio sale de `AUTH_URL` o, en su defecto, de la cabecera `Host`. En un
 * producto auto-hospedable el dominio no se conoce en tiempo de construcción, y un sitemap con
 * URL de otro sitio es peor que no tenerlo.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitio = await direccionDelSitio();

  return [
    {
      url: `${sitio}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
