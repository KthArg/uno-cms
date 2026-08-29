/**
 * La forma que tiene el nombre con el que se guarda una imagen (issue #199, ADR-704).
 *
 * ## Por qué está en `cms/` y no dentro de la frontera `server-only`
 *
 * El mismo motivo que `cms/routes.ts`: **hace falta en los dos lados**. El navegador lo genera
 * —es el único que puede, porque `@vercel/blob` deja el nombre en manos de quien sube— y el
 * servidor lo comprueba antes de emitir el token. Lo que la frontera protege son credenciales,
 * consultas y sesiones; aquí no hay ninguna de las tres.
 *
 * ## Y por qué el cliente propone y el servidor dispone
 *
 * Porque el SDK no admite otra cosa. `onBeforeGenerateToken` puede devolver `allowedContentTypes`,
 * `maximumSizeInBytes`, `addRandomSuffix`… pero **no `pathname`**. La ruta lo devolvía igualmente
 * y el SDK lo descartaba en silencio: el nombre real era el del fichero del usuario, con espacios
 * y todo, y dos subidas del mismo fichero chocaban.
 *
 * Que el cliente proponga solo es aceptable si el servidor puede rechazar, y eso es lo que hace
 * `esPathnameGenerado`. La diferencia con lo que había no es quién escribe la cadena: es que
 * ahora **hay alguien comprobándola**.
 */

/** La extensión que le toca a cada tipo aceptado. */
const EXTENSIONES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/**
 * La forma exacta, y nada más que ella.
 *
 * `media/AAAA-MM/<uuid>.<extensión>`. El UUID va con su formato completo —cinco grupos, guiones
 * en su sitio— y no como «algo hexadecimal»: una comprobación laxa aceptaría un nombre elegido a
 * mano que se le pareciera, y entonces esto volvería a no comprobar nada.
 */
const FORMA =
  /^media\/\d{4}-(?:0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|avif|gif)$/;

/**
 * Un nombre nuevo para una imagen de este tipo.
 *
 * El UUID es lo que hace imposible la colisión, que es el fallo con el que se descubrió todo
 * esto: sin él, subir dos veces el mismo fichero rebota con «this blob already exists».
 *
 * La carpeta por mes no es organización por gusto: un listado de miles de objetos en una sola
 * carpeta es incómodo de mirar el día que haya que mirarlo.
 */
export function generarPathname(contentType: string): string {
  const extension = EXTENSIONES[contentType] ?? 'bin';
  const ahora = new Date();
  const carpeta = `${String(ahora.getUTCFullYear())}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;

  return `media/${carpeta}/${crypto.randomUUID()}.${extension}`;
}

/**
 * Si un nombre es de los nuestros **y le corresponde a ese tipo**.
 *
 * Las dos cosas, y la segunda importa tanto como la primera: un `.png` declarado como
 * `image/webp` pasaría la forma y dejaría en el almacén un objeto cuyo nombre miente sobre su
 * contenido. Lo que se sirve después lo decide la extensión en más sitios de los que uno recuerda.
 */
export function esPathnameGenerado(pathname: unknown, contentType: unknown): boolean {
  if (typeof pathname !== 'string' || typeof contentType !== 'string') return false;
  if (!FORMA.test(pathname)) return false;

  const esperada = EXTENSIONES[contentType];

  return esperada !== undefined && pathname.endsWith(`.${esperada}`);
}
