import type { MetadataRoute } from 'next';
import { direccionDelSitio } from '@/cms/auth/panel';
import { hayVariosIdiomas, idiomaPorDefecto, idiomas } from '@/cms/core/idiomas';
import { laWebViveFuera } from '@/cms/vista-previa-remota';

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
  /**
   * Con la web fuera (ADR-701, spec 14), este despliegue **no sirve contenido público**: `/`
   * lleva al panel, que es `noindex` por SPEC §7.2.
   *
   * Anunciarla igualmente sería invitar al buscador a una redirección hacia una página que le
   * pedimos no indexar — el mismo error, en pequeño, que este fichero existe para no cometer con
   * `/preview`. Un sitemap vacío es una respuesta honesta; uno que apunta a una redirección no.
   */
  if (laWebViveFuera()) return [];

  const sitio = await direccionDelSitio();

  // Una URL por idioma (spec 17 §5.6): `/` para el de por defecto y `/<codigo>` para los demás.
  // Cada una lleva **todas** las alternativas, también la suya, que es lo que pide `hreflang`:
  // sin la propia, un buscador puede tomar la página como huérfana de su grupo.
  const urlDe = (codigo: string): string =>
    codigo === idiomaPorDefecto().codigo ? `${sitio}/` : `${sitio}/${codigo}`;

  const alternativas = Object.fromEntries(idiomas().map(({ codigo }) => [codigo, urlDe(codigo)]));

  return idiomas().map(({ codigo }) => ({
    url: urlDe(codigo),
    changeFrequency: 'weekly' as const,
    priority: codigo === idiomaPorDefecto().codigo ? 1 : 0.9,
    // Con un solo idioma no hay grupo que describir, y el sitemap queda como era.
    ...(hayVariosIdiomas() ? { alternates: { languages: alternativas } } : {}),
  }));
}
