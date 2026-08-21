import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DIRECTORIO_LOCAL, usarAlmacenLocal } from '@/cms/security/almacen-local';

/**
 * `GET /api/media/local/<ruta>` — sirve lo que guardó el almacén local (spec 07 §4.4).
 *
 * ## Es pública, y tiene que serlo
 *
 * Las imágenes salen en la landing, que la ve cualquiera. Es el mismo acceso que el
 * `access: 'public'` con el que se suben a Blob; exigir sesión aquí dejaría la web sin fotos
 * para todo el mundo menos para quien las subió.
 *
 * ## La única parte peligrosa de todo esto
 *
 * Es el sitio donde una cadena que llega de fuera se convierte en una lectura de disco. Todo lo
 * demás del almacén local trabaja con rutas que generamos nosotros.
 *
 * **No se sanea la ruta recibida.** Sanear es un juego que se pierde tarde o temprano: hay
 * `..`, `%2e%2e`, `%252e`, barras invertidas, bytes nulos, y cada año alguien encuentra una
 * codificación más. Lo que se hace es lo contrario: se compara contra la **forma exacta** que
 * produce `generarPathname()`, y lo que no encaja no llega al disco.
 *
 * Esa forma no admite `.`, ni `..`, ni barras de más, ni nada fuera de `[0-9a-f-]`. No hace
 * falta enumerar los ataques porque no se está filtrando lo malo: se está exigiendo lo bueno.
 *
 * ## El `Content-Type` no se pregunta, se deduce
 *
 * Sale de la extensión que ya pasó la allowlist al subir. Nada de lo que venga en la petición
 * influye en cómo se sirve el fichero — que es lo que convierte a un almacén de imágenes en un
 * almacén de HTML ejecutable en nuestro origen.
 */
export const runtime = 'nodejs';

/**
 * La forma exacta de `generarPathname()`: `media/AAAA-MM/<uuid>.<ext>`.
 *
 * Si aquella cambia, esta tiene que cambiar con ella, y el test T-A-13 —que sube de verdad y
 * descarga lo subido— es lo que hace que no se pueda olvidar: se pondría rojo.
 */
const FORMA = /^media\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$/;

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ruta: string[] }> }
): Promise<Response> {
  if (!usarAlmacenLocal()) return new Response(null, { status: 404 });

  const { ruta } = await params;
  const pedida = ruta.join('/');

  if (!FORMA.test(pedida)) return new Response(null, { status: 404 });

  const extension = pedida.split('.').pop() ?? '';
  const tipo = TIPOS[extension];
  if (tipo === undefined) return new Response(null, { status: 404 });

  try {
    // La ruta no es literal y el plugin avisa. Se silencia **después** de `FORMA.test()`, que
    // es la línea que hace esto seguro: lo que llega aquí encaja con la forma exacta que genera
    // `generarPathname()` y no admite `.`, ni `..`, ni nada fuera de `[0-9a-f-]`. Moverlo por
    // encima de esa comprobación lo convertiría en una lectura arbitraria de disco.
    //
    // T-A-11b lo fija con un fichero de fuera del directorio y con extensión de imagen, que es
    // el caso que la comprobación de la extensión no cubre. Lo descubrí porque los cinco casos
    // que tenía antes pasaban con la forma mutada a `^media/.+$`.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const contenido = await readFile(join(process.cwd(), DIRECTORIO_LOCAL, pedida));

    return new Response(new Uint8Array(contenido), {
      headers: {
        'Content-Type': tipo,
        // Sin `nosniff`, un navegador puede decidir por su cuenta que esto es otra cosa
        // mirando los primeros bytes. La cabecera global ya lo pone; repetirla aquí es barato
        // y esta ruta es exactamente donde importa.
        'X-Content-Type-Options': 'nosniff',
        // Es contenido de desarrollo y puede cambiar debajo. Sin esto, cambiar una imagen y
        // recargar enseñaría la anterior, que parecería un fallo de la subida.
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    // Un fichero que no está es un 404, no un 500: la ruta tenía la forma correcta y
    // simplemente no existe. Y no se distingue de "existe pero no se puede leer" a propósito.
    return new Response(null, { status: 404 });
  }
}
