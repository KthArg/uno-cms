/**
 * Lo **publicado**, pedido al CMS desde el servidor de esta web (issue #195).
 *
 * ## Por qué desde el servidor y no desde el navegador
 *
 * Porque `GET /api/content/:key` **no manda cabeceras CORS**, y es deliberado (T-R-14): es la
 * ruta pública de siempre y no se le añadió nada al abrir la vista previa remota. Así que el
 * navegador de quien visita esta web no puede leer esa respuesta — lo intenta y recibe un
 * `Failed to fetch` sin más explicación.
 *
 * Lo desconcertante, si no se sabe, es que **la vista previa sí funciona desde el navegador**:
 * esa otra ruta sí manda CORS, con el origen exacto y un token. O sea que lo complicado va y lo
 * sencillo no. Por eso está escrito aquí y en `docs/DEVELOPER.md`, y no solo en un comentario.
 */

/** Las claves de `cms.config.ts`. Los singletons vienen en `data`; las colecciones, en `items`. */
const SINGLETONS = ['hero', 'about', 'seo'];
const COLECCIONES = ['testimonials', 'faqs'];

/**
 * Compone el contenido publicado del CMS.
 *
 * `buscar` se puede sustituir para probar esto sin red. No es una concesión al test: es lo que
 * permite comprobar **a qué direcciones se llama**, que es justo lo que este módulo decide.
 *
 * Una clave que falle no tumba la página: se queda fuera y el resto se pinta. Una sección
 * ausente se ve; una página en blanco por un 500 del CMS, también, y además no dice nada.
 */
export async function pedirPublicado(cmsUrl, buscar = fetch) {
  if (typeof cmsUrl !== 'string' || cmsUrl.trim() === '') {
    throw new Error(
      'Falta CMS_URL: esta web no sabe a qué CMS pedirle el contenido. ' +
        'Ponla en las variables de entorno, con protocolo y sin barra final.'
    );
  }

  const base = cmsUrl.replace(/\/+$/, '');
  const contenido = {};

  await Promise.all([
    ...SINGLETONS.map(async (clave) => {
      const respuesta = await buscar(`${base}/api/content/${clave}`);
      if (!respuesta.ok) return;

      contenido[clave] = (await respuesta.json()).data;
    }),
    ...COLECCIONES.map(async (clave) => {
      const respuesta = await buscar(`${base}/api/content/${clave}`);
      if (!respuesta.ok) return;

      contenido[clave] = (await respuesta.json()).items;
    }),
  ]);

  return contenido;
}
