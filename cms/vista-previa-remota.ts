/**
 * El interruptor de la vista previa de una web que vive fuera (spec 08 §4.1, ADR-701).
 *
 * ## Por qué está en `cms/` y no dentro de la frontera `server-only`
 *
 * El mismo motivo que `cms/routes.ts`: **el middleware corre en el runtime edge**, donde un
 * módulo marcado `server-only` no se carga, y la CSP se construye ahí. Lo que la frontera
 * protege son credenciales, consultas y sesiones; aquí no hay ninguna de las tres. Lo que hay
 * es una lista de orígenes que además **se anuncia en la propia cabecera CSP** de cada
 * respuesta: no es un secreto ni puede serlo.
 *
 * Lo que sí decide esta lista es **quién puede leer contenido sin publicar**, y por eso viene
 * de una variable de entorno y no de un ajuste del panel: un ajuste en la base de datos lo
 * cambia cualquiera con una sesión de administrador —o cualquiera que consiga una—, y una
 * variable de entorno solo la cambia quien despliega.
 *
 * ## Se apaga entera, no se degrada
 *
 * Sin `PREVIEW_ORIGINS` no hay nada de esta fase: la ruta de borradores responde 404 y la CSP
 * es byte a byte la de antes. Es la misma forma del almacén local de ADR-700, y por el mismo
 * motivo: una funcionalidad a medias es más difícil de razonar que una apagada.
 *
 * ## Y una lista mal escrita apaga la lista entera
 *
 * Si una sola entrada no es un origen válido, **no se descarta esa y se siguen usando las
 * demás**: se descarta todo. La alternativa —quedarse con lo que se entienda— deja un estado
 * a medias en el que la mitad de la configuración funciona y la otra mitad no dice nada, que
 * es justo la clase de fallo que nadie encuentra. Al apagarse entera se nota al primer
 * intento: la vista previa no va, y el 404 lo dice.
 */

/** Los únicos protocolos que puede tener un origen aquí. */
const PROTOCOLOS = new Set(['http:', 'https:']);

/**
 * Si un valor es **exactamente** un origen: protocolo, host y puerto, y nada más.
 *
 * `https://mi-web.com/es` no vale, y no se recorta a su origen en silencio: recortarlo
 * ampliaría el permiso a más de lo que quien lo escribió puso por escrito. Que sea el sitio
 * entero o nada tiene que decirlo el despliegue, no nosotros.
 *
 * `https://mi-web.com/` sí vale: la barra final es lo que devuelve cualquier navegador al
 * copiar la dirección de la raíz, y no amplía nada.
 */
function esOrigen(url: URL): boolean {
  if (!PROTOCOLOS.has(url.protocol)) return false;
  // Credenciales en la URL: nunca son parte de un origen, y su presencia delata que lo
  // escrito no es lo que se cree.
  if (url.username !== '' || url.password !== '') return false;
  if (url.search !== '' || url.hash !== '') return false;

  // El punto y coma separa directivas en una CSP, y `URL` **lo deja pasar dentro del host**:
  // `https://a;b.com` se acepta como origen y su `origin` conserva el punto y coma. Comprobado
  // en Node, no supuesto.
  //
  // Lo que impide no es una inyección: para añadir una directiva de verdad haría falta un
  // espacio, y ahí `URL` lanza. Lo que impide es que un error de tecleo se convierta en un
  // permiso **más ancho y en silencio**: el navegador leería `frame-src 'self' https://a` y
  // descartaría el resto como una directiva desconocida, sin decir nada a nadie.
  if (/[;\s]/.test(url.origin)) return false;

  // Se mira `pathname` y no el texto escrito. La primera versión comparaba contra el texto y
  // rechazaba `https://MI-WEB.com:443`, que es un origen perfectamente válido escrito de otra
  // forma: `URL` ya lo había normalizado y los caracteres sobrantes parecían una ruta. Lo
  // cazó el test de normalización.
  //
  // Para http y https, `URL` deja `pathname` en `/` cuando no hay ruta, así que esto distingue
  // `https://mi-web.com` de `https://mi-web.com/es` sin depender de cómo se escribiera.
  return url.pathname === '/';
}

/**
 * Los orígenes que pueden leer borradores, ya normalizados y sin repetidos.
 *
 * Vacío significa **apagado**, y es el único estado que hace falta comprobar: no hay una
 * bandera aparte que pueda discrepar de la lista.
 *
 * Recibe el valor en vez de leer `process.env` por dentro para que se pueda probar sin tocar
 * el entorno del proceso, y para que la referencia a la variable sea estática —el middleware
 * la necesita así.
 */
export function origenesDeVistaPreviaRemota(
  valor: string | undefined = process.env.PREVIEW_ORIGINS
): readonly string[] {
  const escritos = (valor ?? '')
    .split(',')
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== '');

  if (escritos.length === 0) return [];

  const origenes = new Set<string>();

  for (const escrito of escritos) {
    let url: URL;
    try {
      url = new URL(escrito);
    } catch {
      return [];
    }

    if (!esOrigen(url)) return [];

    // `URL` normaliza el host a minúsculas y quita el puerto por defecto. Guardamos esa forma
    // porque es contra la que se compararán las cabeceras `Origin`, que llegan igual de
    // normalizadas desde el navegador.
    origenes.add(url.origin);
  }

  return [...origenes];
}

/** Si la vista previa remota está encendida. */
export function vistaPreviaRemotaActiva(valor?: string | undefined): boolean {
  return origenesDeVistaPreviaRemota(valor).length > 0;
}

/**
 * A dónde apunta el iframe de la vista previa, o `null` si no hay que apuntarlo fuera.
 *
 * Es una variable distinta de `PREVIEW_ORIGINS` a propósito (spec 08 §4.1): esta puede llevar
 * ruta —`https://mi-web.com/es/`— y un origen no puede. Derivar una de la otra funcionaría
 * hasta el primer caso raro.
 *
 * ## Por qué su origen tiene que estar en la lista
 *
 * Porque si no lo está, **nuestra propia CSP bloquea el iframe**: `frame-src` se construye con
 * `PREVIEW_ORIGINS`. Aceptarla igualmente daría una vista previa en blanco con un error en la
 * consola del navegador y nada en ningún sitio que conectara las dos cosas. Devolviendo `null`
 * el panel se queda con la vista previa de siempre, que es un estado comprensible.
 */
export function urlDeVistaPreviaRemota(
  valorUrl: string | undefined = process.env.PREVIEW_URL,
  valorOrigenes?: string | undefined
): string | null {
  // No hay un corte aparte por «la lista está vacía», y la primera versión lo tenía. Sobra: si
  // la lista está vacía, la comprobación de más abajo no puede encontrar el origen en ella y
  // devuelve `null` igual. Escrito parecía el interruptor y no lo era — quitarlo no ponía en
  // rojo ni un test, que es como se descubrió.
  const origenes = origenesDeVistaPreviaRemota(valorOrigenes);

  const escrita = (valorUrl ?? '').trim();
  if (escrita === '') return null;

  let url: URL;
  try {
    url = new URL(escrita);
  } catch {
    return null;
  }

  if (!PROTOCOLOS.has(url.protocol)) return null;
  if (!origenes.includes(url.origin)) return null;

  return url.href;
}

/**
 * Si el `Origin` que pide puede leer borradores, devolviendo **el que se pidió** o `null`.
 *
 * Devuelve el pedido y no el de la lista a propósito, aunque en el caso correcto sean la misma
 * cadena: lo que va en `Access-Control-Allow-Origin` tiene que ser el origen de **esta**
 * petición. Devolver "el de la lista" invitaría a que algún día alguien devolviera el primero,
 * o todos, o un `*`.
 *
 * ## La comparación es de pertenencia a una lista, y esa es toda la pieza
 *
 * `origenes.includes(pedido)` compara cadenas enteras. Lo que **no** se hace, y es el fallo
 * clásico, es preguntar si el origen pedido *contiene* a uno permitido:
 *
 * ```ts
 * origenes.some((permitido) => pedido.includes(permitido)); // ← https://mi-web.com.malo.io
 * ```
 *
 * Esa versión es indistinguible de esta salvo con T-R-7 delante: acierta con todos los casos
 * razonables y regala el permiso a cualquier dominio que se registre poniendo el nuestro
 * delante del suyo.
 *
 * ## Y no se normaliza lo que llega
 *
 * El `Origin` de un navegador viene ya en su forma canónica —minúsculas, sin puerto por
 * defecto, sin barra final—, que es contra la que se guarda la lista. Aceptar además otras
 * escrituras solo ampliaría el permiso a clientes que no son navegadores, y quien no es un
 * navegador puede escribir el origen exacto de todas formas.
 */
export function origenPermitido(
  pedido: string | null | undefined,
  origenes: readonly string[] = origenesDeVistaPreviaRemota()
): string | null {
  if (pedido === null || pedido === undefined || pedido === '') return null;

  // **Y aquí no hay un corte por «la lista está vacía», que es el interruptor de la fase.**
  //
  // Lo escribí dos veces —aquí y en la ruta— y las dos sobraban: una lista vacía no autoriza a
  // nadie porque `includes` sobre cero elementos es falso, y quitar ambas líneas dejaba los
  // cuarenta y tres casos en verde. Es la segunda vez que escribo ese mismo corte de más en
  // esta fase; la primera fue en `urlDeVistaPreviaRemota` (#178).
  //
  // El interruptor **es** la lista, y esa es una propiedad mejor que una comprobación aparte:
  // no hay dos sitios que puedan discrepar sobre si la fase está encendida.
  //
  // Lo que sí vigila un test es la forma realista de romperlo, que no es quitar una línea sino
  // añadir una: `origenes.length === 0 || origenes.includes(pedido)`, o sea «sin configurar,
  // deja pasar a todo el mundo». Ese cambio pone T-R-1 en rojo.
  return origenes.includes(pedido) ? pedido : null;
}
