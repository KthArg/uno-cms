import 'server-only';

/**
 * Lockout incremental (SPEC §7.1: "5 fallos → 15 min, exponencial").
 *
 * La aritmética vive aparte del acceso a la base de datos para poder ejercitarla con
 * muchos casos y sin coste. Es la defensa que de verdad para la fuerza bruta: a diferencia
 * del rate limit de `cms/security/ratelimit.ts`, esto vive en una fila de la base de datos,
 * así que es común a todas las instancias, sobrevive a los reinicios y no se diluye cuando
 * la plataforma escala.
 */

/** A partir de cuántos fallos consecutivos empieza el bloqueo. */
export const LOCKOUT_THRESHOLD = 5;

/** Duración del primer bloqueo. */
export const LOCKOUT_BASE_MINUTES = 15;

/**
 * Tope del bloqueo.
 *
 * Sin tope, el crecimiento exponencial deja la cuenta inutilizable durante años tras unas
 * decenas de fallos, y eso convierte la defensa en el ataque: bastaría con teclear mal
 * cuarenta veces contra el correo de otro. Un día es tiempo de sobra para que un ataque
 * automatizado deje de ser rentable y para que la persona legítima pida ayuda.
 */
export const LOCKOUT_MAX_MINUTES = 24 * 60;

/**
 * Minutos de bloqueo tras `failedLogins` fallos consecutivos.
 *
 * Devuelve 0 por debajo del umbral: los primeros errores son de dedos, no de ataque.
 */
export function lockoutMinutes(failedLogins: number): number {
  if (failedLogins < LOCKOUT_THRESHOLD) return 0;

  const exponent = failedLogins - LOCKOUT_THRESHOLD;

  // Se acota el exponente antes de elevar: con `failedLogins` grande, `2 ** exponent`
  // desborda a Infinity y `Math.min` devolvería el tope igualmente, pero por accidente.
  if (exponent > 20) return LOCKOUT_MAX_MINUTES;

  return Math.min(LOCKOUT_BASE_MINUTES * 2 ** exponent, LOCKOUT_MAX_MINUTES);
}

/** Si la cuenta está bloqueada en este instante. */
export function isLocked(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return lockedUntil != null && lockedUntil.getTime() > now.getTime();
}

/**
 * Estado de la cuenta tras un intento fallido.
 *
 * **Un intento durante el bloqueo no cuenta y no alarga nada.** Si lo alargara, cualquiera
 * podría mantener fuera a un usuario legítimo indefinidamente sabiendo solo su correo: le
 * bastaría con reintentar cada pocos minutos. La defensa se convertiría en el ataque.
 */
export function nextFailureState(
  current: { failedLogins: number; lockedUntil: Date | null },
  now: Date = new Date()
): { failedLogins: number; lockedUntil: Date | null } {
  if (isLocked(current.lockedUntil, now)) return current;

  const failedLogins = current.failedLogins + 1;
  const minutes = lockoutMinutes(failedLogins);

  return {
    failedLogins,
    lockedUntil: minutes === 0 ? null : new Date(now.getTime() + minutes * 60 * 1000),
  };
}
