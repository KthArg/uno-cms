/**
 * Lo **publicado**, pedido al CMS desde el servidor de esta web (issue #195), y **cacheado hasta
 * que el CMS avise** (issue #287).
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
 *
 * ## Y por qué el `?v=`
 *
 * `GET /api/content/:key` responde con `s-maxage=60`, y eso lo sirve la CDN que hay delante del
 * CMS. Pedir sin más justo después de recibir un aviso puede devolver la copia de hasta un
 * minuto antes, y entonces el aviso parece no servir para nada.
 *
 * Una query distinta es una entrada de caché distinta, así que `?v=<ts del aviso>` la esquiva.
 * La ruta ignora el parámetro (ADR-1004, casos T-A-28 y T-A-29): la respuesta es la misma.
 */

/** Las claves de `cms.config.ts`. Los singletons vienen en `data`; las colecciones, en `items`. */
const SINGLETONS = ['hero', 'about', 'seo'];
const COLECCIONES = ['testimonials', 'faqs'];

/** Todas, con lo único que las diferencia al leerlas. */
const TODAS = [
  ...SINGLETONS.map((clave) => ({ clave, esColeccion: false })),
  ...COLECCIONES.map((clave) => ({ clave, esColeccion: true })),
];

function baseDe(cmsUrl) {
  if (typeof cmsUrl !== 'string' || cmsUrl.trim() === '') {
    throw new Error(
      'Falta CMS_URL: esta web no sabe a qué CMS pedirle el contenido. ' +
        'Ponla en las variables de entorno, con protocolo y sin barra final.'
    );
  }

  return cmsUrl.replace(/\/+$/, '');
}

/**
 * Pide una clave. `undefined` si el CMS no la da: quien llama decide qué hacer con eso.
 *
 * `v` va codificado aunque hoy sea siempre un número. Construir una dirección metiendo un valor
 * sin codificar es el hábito que un día se lleva por delante otra cosa, y aquí sale gratis.
 */
async function pedirClave(base, clave, esColeccion, buscar, v) {
  const sufijo = v === undefined ? '' : `?v=${encodeURIComponent(String(v))}`;
  const respuesta = await buscar(`${base}/api/content/${clave}${sufijo}`);

  if (!respuesta.ok) return undefined;

  const cuerpo = await respuesta.json();
  return esColeccion ? cuerpo.items : cuerpo.data;
}

/**
 * Compone el contenido publicado del CMS, **pidiéndolo todo**.
 *
 * `buscar` se puede sustituir para probar esto sin red. No es una concesión al test: es lo que
 * permite comprobar **a qué direcciones se llama**, que es justo lo que este módulo decide.
 *
 * Una clave que falle no tumba la página: se queda fuera y el resto se pinta. Una sección
 * ausente se ve; una página en blanco por un 500 del CMS, también, y además no dice nada.
 */
export async function pedirPublicado(cmsUrl, buscar = fetch) {
  const base = baseDe(cmsUrl);
  const contenido = {};

  await Promise.all(
    TODAS.map(async ({ clave, esColeccion }) => {
      const valor = await pedirClave(base, clave, esColeccion, buscar);
      if (valor !== undefined) contenido[clave] = valor;
    })
  );

  return contenido;
}

/**
 * Lo mismo, pero **sirviéndose del almacén y pidiendo solo lo que hace falta** (#287).
 *
 * Esta es la función que usa la página, y la que contesta a lo que se pedía: sin aviso no sale
 * ni una petición al CMS; con aviso, salen exactamente las de las claves que el aviso nombró.
 *
 * ## Qué pasa si el CMS no contesta
 *
 * Se sirve la copia vieja, si la hay. Es distinto de lo que hace `pedirPublicado` —allí la
 * sección se queda fuera— y es mejor: la clave estaba marcada como pendiente porque cambió, así
 * que enseñar lo anterior es enseñar algo desactualizado, mientras que dejarla fuera es enseñar
 * la página rota. Y sigue marcada como pendiente, así que se reintentará en la siguiente visita.
 */
export async function contenidoParaLaPagina(cmsUrl, almacen, buscar = fetch) {
  const base = baseDe(cmsUrl);
  const contenido = {};

  await Promise.all(
    TODAS.map(async ({ clave, esColeccion }) => {
      if (almacen.sirveDeAqui(clave)) {
        contenido[clave] = almacen.leer(clave);
        return;
      }

      // La versión se lee **antes** de pedir y se lleva hasta el guardado. Si llega un aviso
      // mientras la petición está en el aire, `guardar` lo nota por aquí y no borra la marca de
      // pendiente con un dato que ya nació viejo. Ver `almacen.guardar`.
      const vAlPedir = almacen.versionDe(clave);
      const valor = await pedirClave(base, clave, esColeccion, buscar, vAlPedir);

      if (valor === undefined) {
        const vieja = almacen.leer(clave);
        if (vieja !== undefined) contenido[clave] = vieja;
        return;
      }

      almacen.guardar(clave, valor, vAlPedir);
      contenido[clave] = valor;
    })
  );

  return contenido;
}
