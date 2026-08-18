import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb, users, type UserRow } from '@/cms/db';
import { audit } from '@/cms/security/audit';
import { getLoginRateLimiter, loginRateLimitKey } from '@/cms/security/ratelimit';
import { isLocked, nextFailureState } from './lockout';
import { verifyDecoy, verifyPassword } from './passwords';

/**
 * El núcleo de la autenticación (SPEC ADR-004, §7.1).
 *
 * Vive aparte de la configuración de Auth.js a propósito: esto es lo que hay que poder
 * ejercitar contra una base de datos real —lockout, enumeración, contadores—, y Auth.js es
 * el pegamento que lo conecta con las cookies. Mezclarlos haría que probar el lockout
 * exigiera levantar media librería.
 *
 * ## La regla de oro de esta función
 *
 * **Hacia fuera, todos los fallos son iguales.** Contraseña incorrecta, correo inexistente,
 * cuenta bloqueada y límite de intentos superado devuelven exactamente lo mismo. SPEC §7.1
 * lo pide dos veces —"mensaje único (credenciales inválidas)" y "mensajes de error
 * genéricos"— y el motivo es que cualquier diferencia convierte el formulario de login en
 * un comprobador de cuentas ajenas.
 *
 * Eso incluye **el tiempo**: por eso el caso de correo inexistente verifica un hash señuelo
 * en vez de responder de inmediato.
 */

export interface AuthenticateInput {
  readonly email: string;
  readonly password: string;
  /** Para el límite por IP+correo y para la auditoría. */
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'editor';
  readonly passwordVersion: number;
}

export type AuthenticateResult =
  { readonly ok: true; readonly user: AuthenticatedUser } | { readonly ok: false };

/** Ver la nota de arriba: un único resultado para todos los fallos, sin motivo. */
const FAILED: AuthenticateResult = { ok: false };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findByEmail(email: string): Promise<UserRow | undefined> {
  // Comparación por `lower(email)`, que es el índice único de ADR-201. Buscar por igualdad
  // directa no fallaría: simplemente no encontraría al usuario, que es un fallo silencioso.
  const rows = await getDb()
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  return rows[0];
}

export async function authenticate(
  input: AuthenticateInput,
  options: { readonly now?: () => Date } = {}
): Promise<AuthenticateResult> {
  const now = options.now?.() ?? new Date();
  const email = normalizeEmail(input.email);
  const ip = input.ip ?? 'desconocida';

  const limiter = getLoginRateLimiter();
  const limitKey = loginRateLimitKey(ip, email);

  if (!limiter.check(limitKey).allowed) {
    await audit({
      action: 'login.ratelimited',
      actorEmail: email,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return FAILED;
  }

  const user = await findByEmail(email);

  if (user === undefined) {
    // Verificar el señuelo cuesta lo mismo que verificar una contraseña real. Sin esto, el
    // login responde en microsegundos para un correo desconocido y en decenas de
    // milisegundos para uno real, y esa diferencia es un comprobador de cuentas.
    await verifyDecoy(input.password);
    await audit({
      action: 'login.fail',
      actorEmail: email,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { motivo: 'usuario-inexistente' },
    });
    return FAILED;
  }

  if (isLocked(user.lockedUntil, now)) {
    // No se verifica la contraseña ni se toca el contador: un intento durante el bloqueo no
    // lo alarga (ver `nextFailureState`).
    await audit({
      action: 'login.locked',
      actorId: user.id,
      actorEmail: user.email,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return FAILED;
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  if (!passwordOk) {
    const next = nextFailureState(
      { failedLogins: user.failedLogins, lockedUntil: user.lockedUntil },
      now
    );

    await getDb()
      .update(users)
      .set({ failedLogins: next.failedLogins, lockedUntil: next.lockedUntil, updatedAt: now })
      .where(eq(users.id, user.id));

    await audit({
      action: 'login.fail',
      actorId: user.id,
      actorEmail: user.email,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { intentosFallidos: next.failedLogins, bloqueada: next.lockedUntil !== null },
    });

    return FAILED;
  }

  // Un acierto reinicia el contador: los fallos que cuentan son los **consecutivos**.
  if (user.failedLogins !== 0 || user.lockedUntil !== null) {
    await getDb()
      .update(users)
      .set({ failedLogins: 0, lockedUntil: null, updatedAt: now })
      .where(eq(users.id, user.id));
  }

  limiter.reset(limitKey);

  await audit({
    action: 'login.success',
    actorId: user.id,
    actorEmail: user.email,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      passwordVersion: user.passwordVersion,
    },
  };
}

/**
 * Si una sesión sigue siendo válida (ADR-301, SPEC §7.1 "Robo de sesión").
 *
 * Se llama en cada petición autenticada, con el claim `pwdV` del JWT. Dos casos, ambos
 * declarados de forma explícita porque el spec de fase §3.5 obliga a ello:
 *
 * - **La versión no coincide** → inválida. Alguien cambió la contraseña.
 * - **La fila no existe** → inválida. Es el escenario de "he echado a alguien y sigue
 *   dentro": una cuenta borrada con un JWT todavía vigente. Se decide aquí y no se deja al
 *   resultado de comparar `undefined` con un número, porque acertar por accidente no es
 *   tener la protección.
 */
export async function isSessionStillValid(
  userId: string,
  passwordVersion: number
): Promise<boolean> {
  const rows = await getDb()
    .select({ passwordVersion: users.passwordVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return false;

  return row.passwordVersion === passwordVersion;
}

/**
 * Incrementa la versión de contraseña, invalidando todas las sesiones abiertas.
 *
 * Lo llamará `changePassword` en M3. Se expone aquí, junto a su comprobación, para que
 * ambas caras de la invalidación vivan en el mismo fichero: separarlas es como una acaba
 * cambiando sin la otra.
 */
export async function invalidateSessions(userId: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ passwordVersion: sql`${users.passwordVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
