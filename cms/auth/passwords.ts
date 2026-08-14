import 'server-only';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { isCommonPassword } from './common-passwords';

/**
 * Hash y política de contraseñas (SPEC ADR-004, §5.3).
 */

/**
 * Parámetros de Argon2id (ADR-300).
 *
 * Perfil de memoria moderada de OWASP. Se elige sobre los perfiles mayores por un motivo
 * concreto del destino: esto corre en una función serverless con límite de memoria, y un
 * `hash` que lo agote convierte el login en un error 500 — una denegación de servicio
 * autoinfligida en el peor momento posible.
 *
 * Subirlos más adelante no invalida los hashes existentes: la cadena de Argon2 lleva sus
 * propios parámetros dentro, así que los antiguos se siguen verificando. **Bajarlos exige
 * un ADR nuevo.**
 */

/**
 * `Algorithm.Argon2id` de `@node-rs/argon2`, escrito como literal.
 *
 * El paquete lo declara como `const enum` ambiente, y `isolatedModules` —que exige TS
 * estricto de SPEC §2— prohíbe leerlos: no hay fichero del que importar el valor en tiempo
 * de ejecución. Vitest transpila cada fichero por separado y no se entera; `tsc` y
 * `next build` sí, y por eso este error apareció en el build y no en los tests.
 *
 * Un literal desnudo se quedaría desactualizado en silencio si el paquete renumerase, así
 * que hay un test que compara este valor con el del paquete en tiempo de ejecución.
 */
const ARGON2ID = 2;

export const ARGON2_PARAMETERS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB, o sea 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** SPEC §5.3: "≥ 12 chars". */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Tope de longitud. No es una restricción de política, es una defensa: Argon2 procesa lo
 * que se le dé, y una contraseña de un megabyte es una forma barata de consumir CPU y
 * memoria del servidor por petición. 1024 caracteres está muy por encima de cualquier
 * contraseña legítima, incluidas las generadas por gestores.
 */
export const MAX_PASSWORD_LENGTH = 1024;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_PARAMETERS);
}

/**
 * Verifica una contraseña contra su hash.
 *
 * **Devuelve `false` ante un hash corrupto; no lanza.** Un `throw` aquí distinguiría "el
 * hash de la base de datos está roto" de "la contraseña es incorrecta" por el
 * comportamiento observable, y eso es un canal lateral: quien vea un 500 en vez de un
 * "credenciales inválidas" sabe que ha dado con una cuenta real cuyo registro está dañado.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Hash señuelo para el caso de usuario inexistente (SPEC §7.1, "Enumeración").
 *
 * Cuando el correo no existe, `signIn` verifica **este** hash en lugar de no verificar
 * nada. Sin ello, el login responde en microsegundos para un correo desconocido y en
 * decenas de milisegundos para uno real, y esa diferencia convierte el formulario en un
 * comprobador de cuentas.
 *
 * Está precalculado y embebido, no generado al importar el módulo: generarlo costaría 19
 * MiB y una verificación de Argon2 en cada arranque en frío de la función, y el valor no
 * es secreto —solo tiene que ser un hash válido con los mismos parámetros—.
 */
export const DECOY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Ds64D2sXL4Iv8TFgiOHr0g$f5USGsIEQO6NjKh/VEPR3T8n1z/etZE2l3l0OEzV3+o';

/**
 * Consume el mismo tiempo que una verificación real, para el caso de usuario inexistente.
 * Siempre devuelve `false`; su valor está en lo que tarda, no en lo que responde.
 */
export async function verifyDecoy(password: string): Promise<false> {
  await verifyPassword(DECOY_HASH, password);
  return false;
}

export type PolicyResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Política de SPEC §5.3, sin exigencias de composición (ADR-302).
 *
 * A diferencia de los errores de autenticación, aquí el motivo **sí** se devuelve: quien
 * está eligiendo su propia contraseña necesita saber por qué se le rechaza, y no hay nada
 * que enumerar. El mensaje va en español llano porque lo lee el usuario final (SPEC §9).
 */
export function checkPasswordPolicy(password: unknown): PolicyResult {
  if (typeof password !== 'string') {
    return { ok: false, reason: 'La contraseña no es válida.' };
  }

  // Se cuentan puntos de código, no unidades de UTF-16: con `.length`, una contraseña de
  // doce emojis contaría veinticuatro y pasaría un mínimo que no cumple.
  const length = [...password].length;

  if (length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (isCommonPassword(password)) {
    return {
      ok: false,
      reason: 'Esa contraseña aparece en listas públicas. Elige otra.',
    };
  }

  return { ok: true };
}
