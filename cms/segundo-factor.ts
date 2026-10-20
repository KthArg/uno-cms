import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * La verificación en dos pasos, en piezas puras (spec 20).
 *
 * ## Por qué está en `cms/` y no dentro de la frontera `server-only`
 *
 * El mismo motivo que `cms/routes.ts`: hace falta en más de un sitio que no es Next. El servidor
 * genera y comprueba códigos; la suite e2e y la de humo tienen que **calcular** el código de una
 * cuenta de prueba para poder entrar, y Playwright no carga un módulo marcado `server-only`.
 *
 * No es esquivar la frontera: aquí no hay ningún secreto ni ninguna consulta, solo algoritmos. El
 * secreto de cada cuenta vive en la base, cifrado, y la clave sale de `APP_SECRET`, que solo
 * conoce el servidor. Nadie del navegador importa esto, y si lo hiciera fallaría al compilar:
 * `node:crypto` no existe allí.
 *
 * ## Lo que no hay aquí: ninguna dependencia
 *
 * TOTP son veinte líneas sobre HMAC-SHA1 (RFC 6238 sobre RFC 4226), y el cifrado es AES-GCM de
 * `node:crypto`. Una librería para esto sería superficie de suministro a cambio de nada que no
 * pruebe T-V-1 con los vectores del propio RFC.
 */

/** Pasos de 30 s, seis cifras, SHA-1: lo que entienden todas las apps de autenticación. */
const PERIODO_S = 30;
const CIFRAS = 6;

/** Cuántos pasos de reloj se toleran a cada lado: un móvil que va medio minuto adelantado. */
const VENTANA = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function aBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

function deBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caracter of limpio) {
    const indice = BASE32.indexOf(caracter);
    if (indice === -1) throw new Error('El secreto no está en base32.');
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Un secreto nuevo: 20 bytes al azar (160 bits, lo que recomienda RFC 4226), en base32. */
export function generarSecreto(): string {
  return aBase32(randomBytes(20));
}

/** El paso de 30 s en el que cae un instante. */
export function pasoDe(instante: Date): number {
  return Math.floor(instante.getTime() / 1000 / PERIODO_S);
}

function codigoDelPaso(clave: Buffer, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac('sha1', clave).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1]! & 0x0f;
  const numero = hmac.readUInt32BE(desplazamiento) & 0x7fffffff;
  return String(numero % 10 ** CIFRAS).padStart(CIFRAS, '0');
}

/** El código de un secreto en un instante. Lo usan los tests para entrar como una app lo haría. */
export function codigoTotp(secreto: string, instante: Date = new Date()): string {
  return codigoDelPaso(deBase32(secreto), pasoDe(instante));
}

/**
 * Si un código vale ahora, y **en qué paso**: quien llama guarda el paso para no aceptar el mismo
 * código dos veces (T-V-5). `null` si no vale en ninguno de la ventana.
 *
 * La comparación es en tiempo constante, aunque un código de seis cifras que caduca en treinta
 * segundos no se adivina midiendo: no cuesta nada y quita la pregunta.
 */
export function verificarTotp(
  secreto: string,
  codigo: string,
  instante: Date = new Date()
): number | null {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;

  const clave = deBase32(secreto);
  const central = pasoDe(instante);
  for (let desfase = -VENTANA; desfase <= VENTANA; desfase += 1) {
    const esperado = Buffer.from(codigoDelPaso(clave, central + desfase));
    if (timingSafeEqual(esperado, Buffer.from(limpio))) return central + desfase;
  }
  return null;
}

/** El enlace que leen las apps de autenticación, y que va dentro del QR. */
export function uriOtpauth(secreto: string, cuenta: string, emisor = 'UnoCMS'): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const parametros = new URLSearchParams({
    secret: secreto,
    issuer: emisor,
    algorithm: 'SHA1',
    digits: String(CIFRAS),
    period: String(PERIODO_S),
  });
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`;
}

// ── El secreto, cifrado en la base (ADR-004) ────────────────────────────────────────────────

const VERSION_DEL_CIFRADO = 'v1';

/**
 * La clave de cifrado, derivada de `APP_SECRET` con HKDF y un propósito propio: así `APP_SECRET`
 * no se usa directamente como clave de AES, y la clave de los secretos de 2FA no sirve para nada
 * más aunque se filtrara.
 */
function claveDeCifrado(appSecret: string): Buffer {
  if (appSecret.length < 32) {
    throw new Error('APP_SECRET debe tener al menos 32 caracteres; ver .env.example.');
  }
  return Buffer.from(hkdfSync('sha256', appSecret, 'uno-cms', 'totp-secret-v1', 32));
}

/** `v1.<iv>.<etiqueta>.<cifrado>`, en base64url. El IV es nuevo cada vez. */
export function cifrarSecreto(secreto: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveDeCifrado(appSecret), iv);
  const cifrado = Buffer.concat([cifrador.update(secreto, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return [VERSION_DEL_CIFRADO, iv, etiqueta, cifrado]
    .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
    .join('.');
}

/**
 * Lo contrario, y **falla en vez de devolver basura** (T-V-2): GCM comprueba la etiqueta, así que
 * un byte cambiado o un `APP_SECRET` distinto lanzan. Quien llama trata eso como «no hay 2FA que
 * se pueda comprobar», que deja fuera y no dentro.
 */
export function descifrarSecreto(guardado: string, appSecret: string): string {
  const [version, iv, etiqueta, cifrado] = guardado.split('.');
  if (version !== VERSION_DEL_CIFRADO || !iv || !etiqueta || !cifrado) {
    throw new Error('Secreto de 2FA con un formato que no se reconoce.');
  }
  const descifrador = createDecipheriv(
    'aes-256-gcm',
    claveDeCifrado(appSecret),
    Buffer.from(iv, 'base64url')
  );
  descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
  return Buffer.concat([
    descifrador.update(Buffer.from(cifrado, 'base64url')),
    descifrador.final(),
  ]).toString('utf8');
}

// ── Códigos de recuperación ─────────────────────────────────────────────────────────────────

/** Sin 0/O ni 1/I/L: se copian a mano de un papel. 31 símbolos, 10 por código: ~50 bits. */
const ALFABETO_DE_RECUPERACION = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Diez códigos `XXXXX-XXXXX`, distintos entre sí. */
export function generarCodigosDeRecuperacion(cuantos = 10): string[] {
  const codigos = new Set<string>();
  while (codigos.size < cuantos) {
    const bytes = randomBytes(10);
    let codigo = '';
    for (const byte of bytes) {
      // 248 es el mayor múltiplo de 31 que cabe en un byte: por encima se descarta el byte entero
      // para no sesgar el reparto, y se vuelve a empezar este código.
      if (byte >= 248) break;
      codigo += ALFABETO_DE_RECUPERACION[byte % 31];
    }
    if (codigo.length === 10) codigos.add(`${codigo.slice(0, 5)}-${codigo.slice(5)}`);
  }
  return [...codigos];
}

/** Lo que se guarda: SHA-256 del código normalizado, sin mayúsculas ni guion que importen. */
export function huellaDeRecuperacion(codigo: string): string {
  const normalizado = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return createHash('sha256').update(normalizado).digest('hex');
}

/** Si lo escrito tiene forma de código de recuperación y no de código de la app. */
export function pareceDeRecuperacion(codigo: string): boolean {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '').length === 10;
}
