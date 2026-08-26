import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tokens firmados con HMAC-SHA256 y `APP_SECRET` (SPEC §5.3, §6.2, §7.3).
 *
 * Un solo módulo para los tres usos del proyecto —vista previa, bootstrap y reinicio de
 * contraseña— porque el error que se comete al tener tres implementaciones es siempre el
 * mismo: una de ellas se queda sin la comparación en tiempo constante, o sin comprobar la
 * expiración, y nadie se entera hasta que alguien la mira con calma.
 *
 * Formato: `base64url(payload) + '.' + base64url(firma)`. No es un JWT a propósito. Un JWT
 * trae un campo `alg` que el verificador debe ignorar —el ataque de `alg: none` existe
 * porque muchos no lo ignoran— y una superficie de opciones que aquí no hace falta. Con un
 * solo algoritmo fijado en el código no hay nada que negociar.
 *
 * ## Contrato de errores, que el consumidor DEBE conocer
 *
 * `verifyToken` distingue dos situaciones y las trata distinto:
 *
 * - **Token inválido** (mal firmado, caducado, de otro propósito, basura): devuelve
 *   `{ ok: false }`. Es el caso normal y se maneja mostrando un 404.
 * - **`APP_SECRET` ausente o de menos de 32 caracteres: LANZA.** No es un token inválido,
 *   es un despliegue roto, y devolverlo como "inválido" dejaría la vista previa, el
 *   bootstrap y el reinicio de contraseña sin funcionar los tres a la vez sin un solo
 *   mensaje que lo explicara.
 *
 * **Quien llame a esto desde una ruta pública —`/preview` es la que importa— tiene que
 * capturar esa excepción y responder 404**, no dejarla subir. Un 500 con traza en una ruta
 * pública revela que la ruta existe y que algo interno falla, y en una plataforma compartida
 * la traza acaba en logs que no controlamos.
 */

export type TokenPurpose = 'preview' | 'preview-remoto' | 'setup' | 'password-reset';

/** Duraciones de SPEC §5.3 y §6.1, en segundos. */
export const TOKEN_TTL: Record<TokenPurpose, number> = {
  preview: 2 * 60 * 60, // §6.1: 2 h
  /**
   * Quince minutos, contra las dos horas del de al lado (spec 08 §4.2, ADR-701).
   *
   * ## Por qué es un propósito nuevo y no el mismo con otra duración
   *
   * Porque **este viaja a un tercero**. Aparece en la barra de direcciones de una web que no
   * es nuestra, y de ahí pasa a su historial y con toda probabilidad a los registros de su
   * servidor. El de `preview` no sale nunca de nuestro origen.
   *
   * Separarlos da dos propiedades sin escribir una línea, porque `verifyToken` ya compara el
   * propósito: un token remoto **no vale** en `/preview`, y uno de `/preview` no vale en la
   * ruta remota. Con una sola duración compartida, filtrar el enlace que se le manda a la web
   * de destino entregaría también la vista previa de este CMS.
   *
   * ## Y por qué quince minutos y no dos horas
   *
   * Porque un token que viaja a un tercero **se filtra** — no es una hipótesis, es el modo
   * normal de fallo de algo que acaba escrito en un historial ajeno. Lo que se elige aquí no
   * es si pasa, es cuánto dura el daño cuando pase.
   *
   * Quince minutos solo son aceptables porque se renueva: ver `cms/preview/renovacion.ts`,
   * que decide cuándo pedir el siguiente. Sin esa parte, esta constante sería un fallo peor
   * que el que evita — la vista previa se caería a mitad de una sesión de edición larga, o
   * sea justo cuando alguien lleva rato trabajando.
   */
  'preview-remoto': 15 * 60,
  setup: 60 * 60, // §7.3: el bootstrap es de un solo uso; una hora sobra
  'password-reset': 24 * 60 * 60, // §5.3: 24 h
};

interface TokenPayload {
  /** El propósito viaja DENTRO de la firma. Ver `verifyToken`. */
  readonly purpose: TokenPurpose;
  readonly data: Readonly<Record<string, string>>;
  /** Instante de expiración, en segundos desde la época. */
  readonly exp: number;
}

export type VerifyResult<T = Record<string, string>> =
  { readonly ok: true; readonly data: T } | { readonly ok: false };

/**
 * Un único resultado para todos los fallos: firma inválida, propósito equivocado, expirado
 * o basura. Sin código de error ni motivo.
 *
 * SPEC §7.1, "Enumeración": distinguir "expirado" de "mal firmado" le dice a quien prueba
 * tokens que iba por buen camino. A quien tiene un token legítimo caducado, el motivo se lo
 * da el flujo que lo usa —"este enlace de vista previa ya no vale, abre el editor otra
 * vez"—, no esta función.
 */
const INVALID: VerifyResult = { ok: false };

function appSecret(): string {
  const secret = process.env['APP_SECRET'];

  if (secret === undefined || secret.length < 32) {
    // Falla al firmar y al verificar, no en silencio. Un `APP_SECRET` ausente o corto
    // convierte todos los tokens del sistema en adivinables, así que es preferible que el
    // despliegue no arranque a que arranque sin protección (SPEC §7.3).
    throw new Error(
      'APP_SECRET debe existir y tener al menos 32 caracteres. Genéralo con ' +
        '`openssl rand -base64 32`; ver .env.example.'
    );
  }

  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', appSecret()).update(encodedPayload).digest('base64url');
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function signToken(
  purpose: TokenPurpose,
  data: Record<string, string>,
  ttlSeconds: number = TOKEN_TTL[purpose]
): string {
  const payload: TokenPayload = { purpose, data, exp: nowInSeconds() + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return `${encoded}.${sign(encoded)}`;
}

/**
 * El orden de las comprobaciones importa y es este a propósito:
 *
 * 1. **Firma primero**, en tiempo constante. Todo lo demás son datos que solo tienen sentido
 *    si el token es nuestro; leerlos antes de saberlo es procesar entrada no confiable.
 * 2. **Propósito después.** Un token de vista previa está tan bien firmado como uno de
 *    bootstrap: lo único que los distingue es este campo, y por eso va dentro de la firma.
 *    Sin esta comprobación, quien tenga un enlace de preview tiene un token de setup.
 * 3. **Expiración al final.** Comprobarla antes de la firma respondería más rápido a un
 *    token manipulado con fecha caducada que a uno con fecha válida, y eso es un canal que
 *    permite tantear el formato.
 */
export function verifyToken(purpose: TokenPurpose, token: unknown): VerifyResult {
  if (typeof token !== 'string' || token === '') return INVALID;

  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return INVALID;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);

  // `sign` va FUERA del try. Si está dentro, un `APP_SECRET` ausente o corto se convierte
  // en "token inválido" en vez de en un error: la vista previa, el bootstrap y el reinicio
  // de contraseña dejarían de funcionar los tres a la vez, sin un solo mensaje que explique
  // por qué. Fallar cerrado está bien; fallar cerrado y mudo ante una configuración rota, no.
  const expected = Buffer.from(sign(encodedPayload), 'base64url');

  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature, 'base64url');
  } catch {
    return INVALID;
  }

  // `timingSafeEqual` lanza si las longitudes difieren, y esa comparación de longitudes es
  // en sí misma información. Se comprueba antes y se devuelve el mismo resultado que
  // cualquier otro fallo: una firma de longitud distinta ya no es nuestra.
  if (expected.length !== provided.length) return INVALID;
  if (!timingSafeEqual(expected, provided)) return INVALID;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return INVALID;
  }

  // Aunque la firma sea válida, el contenido puede no tener la forma esperada: la firma
  // garantiza origen, no estructura.
  if (
    payload === null ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number' ||
    typeof payload.data !== 'object' ||
    payload.data === null
  ) {
    return INVALID;
  }

  if (payload.purpose !== purpose) return INVALID;
  if (payload.exp <= nowInSeconds()) return INVALID;

  return { ok: true, data: payload.data };
}
