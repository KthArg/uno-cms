import 'server-only';
import { MENSAJES_DE_SUBIDA, type MotivoDeRechazo } from '@/cms/mensajes-de-subida';

/**
 * Las reglas de qué se puede subir (SPEC §5.3, §7.1 "abuso de uploads").
 *
 * ## Por qué esto vive aparte del proveedor
 *
 * Vercel Blob necesita un token real para funcionar, así que un test que pase por su cliente
 * no se puede ejecutar en CI. Si la decisión de aceptar o rechazar viviera dentro del manejador
 * de la ruta, **la parte de seguridad sería justo la que no se prueba**.
 *
 * Aquí no hay red ni proveedor: entra lo que dice el navegador y sale una decisión. Eso se
 * prueba con todos los casos hostiles que haga falta, y la ruta se limita a obedecer.
 *
 * ## Allowlist, nunca denylist
 *
 * Enumerar lo prohibido deja fuera lo que no se te ocurrió, y en formatos de imagen lo que no
 * se te ocurre aparece cada año. Enumerar lo permitido deja fuera lo nuevo hasta que alguien
 * lo mire, que es el lado correcto en el que equivocarse.
 */

/**
 * Los tipos que se aceptan.
 *
 * **`image/svg+xml` no está**, y lo decide `SPEC.md` §5.3 con todas las letras: "SVG se rechaza
 * en MVP (vector XSS)". Es el formato que todo el mundo espera poder subir a un CMS y el único
 * candidato que es **un documento con scripts dentro**, no una imagen: un SVG servido desde
 * nuestro dominio puede ejecutar JavaScript con nuestro origen.
 */
export const TIPOS_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

/** SPEC §5.3: "tamaño ≤ 10 MB". */
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Las extensiones que corresponden a cada tipo aceptado. */
const EXTENSIONES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

// El tipo vive con los mensajes: son la misma decisión, y tenerlo aquí obligaría a mantener dos
// listas de motivos en dos ficheros.
export type { MotivoDeRechazo };

export type DecisionDeSubida =
  | { readonly ok: true; readonly pathname: string; readonly contentType: string }
  | { readonly ok: false; readonly motivo: MotivoDeRechazo; readonly mensaje: string };

/** Lo que el editor lee cuando se le rechaza algo. En español llano (SPEC §9). */
// Los mensajes viven en `cms/mensajes-de-subida.ts`, fuera de la frontera: el navegador los
// necesita para distinguir un rechazo nuestro del texto de la librería de subidas, que llega en
// inglés por el mismo canal.
const MENSAJES = MENSAJES_DE_SUBIDA;

/**
 * El nombre con el que se guarda, **generado siempre**.
 *
 * Nunca el del usuario, y no por estética. Un nombre que llega de fuera es una vía de
 * sobrescritura —dos personas suben `logo.png` y la segunda pisa la primera— y de rutas raras:
 * `../`, barras, caracteres de control, nombres larguísimos. Aquí no se sanea el nombre
 * recibido, que es un juego que se pierde tarde o temprano: **se descarta y se genera uno**.
 *
 * Lo único que se conserva del original es la extensión, y tampoco esa: se deriva del tipo que
 * ya ha pasado la allowlist, así que un `.php` en el nombre no llega a ninguna parte.
 */
export function generarPathname(contentType: string): string {
  const extension = EXTENSIONES[contentType] ?? 'bin';
  const ahora = new Date();
  const carpeta = `${String(ahora.getUTCFullYear())}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;

  return `media/${carpeta}/${crypto.randomUUID()}.${extension}`;
}

/**
 * Decide si una subida se acepta, **en el servidor**.
 *
 * El `accept` del formulario y cualquier comprobación del navegador son comodidad para quien
 * sube: viajan en el cliente y se cambian con la consola abierta. Esta función es la que
 * decide, y corre al emitir el token — antes de que exista ningún fichero en ninguna parte.
 */
export function decidirSubida(entrada: {
  contentType: unknown;
  sizeBytes: unknown;
  filename?: unknown;
}): DecisionDeSubida {
  const { contentType, sizeBytes, filename } = entrada;

  if (typeof contentType !== 'string') {
    return { ok: false, motivo: 'tipo-no-permitido', mensaje: MENSAJES['tipo-no-permitido'] };
  }

  // Se compara con el tipo **normalizado**: un `Content-Type` puede traer parámetros
  // (`image/png; charset=binary`) y mayúsculas, y una comparación literal contra la lista
  // dejaría pasar o rechazaría por la forma en vez de por el contenido.
  const tipo = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(tipo)) {
    return { ok: false, motivo: 'tipo-no-permitido', mensaje: MENSAJES['tipo-no-permitido'] };
  }

  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, motivo: 'demasiado-grande', mensaje: MENSAJES['demasiado-grande'] };
  }

  if (sizeBytes > TAMANO_MAXIMO_BYTES) {
    return { ok: false, motivo: 'demasiado-grande', mensaje: MENSAJES['demasiado-grande'] };
  }

  // El nombre recibido solo se mira para saber si llegó algo; no se usa para nada más.
  if (filename !== undefined && typeof filename !== 'string') {
    return { ok: false, motivo: 'nombre-invalido', mensaje: MENSAJES['nombre-invalido'] };
  }

  return { ok: true, pathname: generarPathname(tipo), contentType: tipo };
}

/**
 * Un nombre legible para enseñar en la biblioteca.
 *
 * Se guarda aparte del `pathname` y **no se usa nunca para escribir**: es una etiqueta. Se
 * recorta y se le quitan los caracteres de control, porque acaba pintándose en una lista y un
 * nombre de doscientos caracteres con saltos de línea dentro rompe la pantalla de quien mira.
 */
export function nombreLegible(filename: unknown): string {
  if (typeof filename !== 'string') return 'imagen';

  let limpio = '';
  for (const caracter of filename) {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (codigo <= 0x1f || codigo === 0x7f) continue;
    limpio += caracter;
  }

  const recortado = limpio.trim().slice(0, 120);
  return recortado === '' ? 'imagen' : recortado;
}
