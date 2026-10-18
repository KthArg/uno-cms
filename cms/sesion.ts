/**
 * La vida de una sesión, en un sitio que puedan leer el middleware y `cms/auth` (spec 19).
 *
 * ## Por qué fuera de `cms/auth`
 *
 * El middleware corre en edge y no puede importar `cms/auth`, que arrastra Argon2 y Postgres
 * (lo explica `middleware.ts`). Así que tenía su propia configuración de Auth.js, **sin
 * `maxAge`**, y Auth.js pone entonces el suyo: treinta días. Como el middleware reemite la cookie
 * en cada petición, era el suyo el que mandaba, y SPEC §7.1 —siete días— no se cumplía en
 * ninguna. Lo mismo que `cms/routes.ts`: dos sitios que no pueden discrepar leen una constante.
 *
 * No hay aquí nada que el navegador no sepa: un número y dos comprobaciones.
 */

/** SPEC §7.1: sesión de 7 días. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** La longitud mínima de `AUTH_SECRET`, la misma que se exige a `APP_SECRET` (SPEC §7.3). */
export const AUTH_SECRET_MIN_LENGTH = 32;

/**
 * Si una sesión ha pasado su vida **absoluta** (T-S-8).
 *
 * El `maxAge` de la cookie es una caducidad por inactividad: cada petición la renueva, así que
 * una sesión que se usa a diario no caduca nunca. `authTime` se fija al entrar y no se mueve,
 * y es lo que pone el tope.
 *
 * Sin `authTime` —un token emitido antes de que existiera— **cuenta como caducada**: no se
 * puede saber cuándo se entró, y suponerlo sería inventarse el dato. Cuesta volver a entrar una
 * vez.
 */
export function sesionCaducada(authTime: unknown, ahoraEnSegundos: number): boolean {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return true;
  return ahoraEnSegundos - authTime > SESSION_MAX_AGE_SECONDS;
}

/**
 * Si un `AUTH_SECRET` sirve para firmar sesiones (T-S-10).
 *
 * Auth.js solo exige que exista. Con `AUTH_SECRET=secret`, quien adivine la clave fuera de línea
 * se fabrica una sesión con `role: admin`; `.env.example` pedía 32 caracteres y nadie lo
 * comprobaba.
 */
export function secretoDeSesionValido(secreto: string | undefined): boolean {
  return secreto !== undefined && secreto.length >= AUTH_SECRET_MIN_LENGTH;
}
