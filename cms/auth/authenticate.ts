import 'server-only';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb, users, type UserRow } from '@/cms/db';
import { audit } from '@/cms/security/audit';
import { getLoginRateLimiter, loginRateLimitKey } from '@/cms/security/ratelimit';
import { isLocked, LOCKOUT_BASE_MINUTES, LOCKOUT_MAX_MINUTES, LOCKOUT_THRESHOLD } from './lockout';
import { MAX_PASSWORD_LENGTH, verifyDecoy, verifyPassword } from './passwords';

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
 *
 * ## Lo que la auditoría sí distingue, y conviene saberlo
 *
 * `audit_log` registra `login.locked` y `login.ratelimited`, que **solo existen para cuentas
 * reales**: un correo inexistente nunca produce `login.locked`. O sea que la tabla de
 * auditoría distingue lo que el formulario se esfuerza en no distinguir.
 *
 * No es un fallo —quien lee esa tabla es el administrador, que ya puede consultar `users`
 * directamente— pero **sí es una restricción sobre quién puede verla**: si M4 expone un
 * panel de auditoría, no puede quedar al alcance del rol `editor` ni de nadie sin sesión.
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

/** El estado del contador tal como queda después de reservar un intento. */
export interface IntentoReservado {
  readonly failedLogins: number;
  readonly lockedUntil: Date | null;
}

/**
 * Reserva un intento de contraseña contra una cuenta **antes** de verificarlo (ADR-1301).
 *
 * ## Por qué antes y no después
 *
 * Antes se leía la fila, se verificaba con Argon2 —decenas de milisegundos— y se escribía el
 * contador calculado a partir de lo leído. Con veinte intentos a la vez, los veinte leían el
 * mismo valor y los veinte escribían ese valor más uno: la ráfaga costaba **un** fallo. Y una
 * escritura vieja podía quitar un bloqueo que otra acababa de poner.
 *
 * Ahora cada intento suma uno, y pone el bloqueo si con eso llega al umbral, **en una sola
 * sentencia condicionada a que la cuenta no esté bloqueada**. Postgres serializa las
 * escrituras sobre la misma fila y vuelve a evaluar el `WHERE` con la fila ya cambiada, así que
 * el quinto intento pone el bloqueo y el sexto no consigue fila: no llega a verificar nada.
 * Una ráfaga prueba como mucho `LOCKOUT_THRESHOLD` contraseñas, igual que si llegaran de una
 * en una.
 *
 * El cálculo es el de `nextFailureState`, escrito en SQL. Un test compara los dos.
 *
 * Devuelve `null` si la cuenta está bloqueada en ese instante: el intento no cuenta ni alarga
 * nada, como siempre.
 */
export async function reservarIntento(userId: string, now: Date): Promise<IntentoReservado | null> {
  // En el `SET`, la columna vale lo que valía **antes** del `UPDATE`: las tres expresiones ven
  // el mismo contador viejo, que es lo que hace falta.
  const siguiente = sql`${users.failedLogins} + 1`;
  // `power` devuelve `double precision`, y `make_interval(mins => …)` solo acepta enteros: así
  // estaba escrito y fallaba en cada intento. Multiplicar un intervalo por un `double` sí vale, y
  // los valores son siempre enteros (15·2^k, con tope en 1440).
  const minutos = sql`least(${LOCKOUT_BASE_MINUTES} * power(2, least(${siguiente} - ${LOCKOUT_THRESHOLD}, 20)), ${LOCKOUT_MAX_MINUTES})`;

  const [fila] = await getDb()
    .update(users)
    .set({
      failedLogins: siguiente,
      lockedUntil: sql`case when ${siguiente} >= ${LOCKOUT_THRESHOLD}
        then ${now.toISOString()}::timestamptz + ${minutos} * interval '1 minute'
        else null end`,
      updatedAt: now,
    })
    .where(and(eq(users.id, userId), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))
    .returning({ failedLogins: users.failedLogins, lockedUntil: users.lockedUntil });

  return fila ?? null;
}

/** Un acierto: los fallos que cuentan son los **consecutivos**. */
export async function olvidarFallos(userId: string, now: Date): Promise<void> {
  await getDb()
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null, updatedAt: now })
    .where(eq(users.id, userId));
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

  // `peek` y no `check`: se consulta sin consumir, y la cuota se gasta más abajo **solo si
  // el intento falla**. Un acierto no debe gastar presupuesto de nadie: la clave es
  // IP + correo, así que en una red compartida —una oficina, un NAT de operador— cinco
  // errores de tecleo dejarían fuera a un compañero durante quince minutos.
  if (!limiter.peek(limitKey).allowed) {
    await audit({
      action: 'login.ratelimited',
      actorEmail: email,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return FAILED;
  }

  // Más larga que cualquier contraseña que se pueda elegir: no puede ser la buena, y no se le
  // da a Argon2 tal cual (T-S-5). Se responde **antes** de buscar la cuenta, así que no dice
  // nada de si existe, y pagando el señuelo con un recorte, para que tampoco lo diga el reloj.
  if (input.password.length > MAX_PASSWORD_LENGTH) {
    limiter.check(limitKey);
    await verifyDecoy(input.password.slice(0, MAX_PASSWORD_LENGTH));
    await audit({
      action: 'login.fail',
      actorEmail: email,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { motivo: 'contrasena-demasiado-larga' },
    });
    return FAILED;
  }

  const user = await findByEmail(email);

  if (user === undefined) {
    limiter.check(limitKey);
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
    limiter.check(limitKey);
    // No se verifica la contraseña ni se toca el contador: un intento durante el bloqueo no
    // lo alarga (ver `nextFailureState`). **Pero se paga el señuelo** (T-S-4): sin él, una
    // cuenta bloqueada respondía en microsegundos y una inexistente en lo que tarda Argon2, y
    // bloquear un correo a propósito bastaba para saber si existía.
    await verifyDecoy(input.password);
    await audit({
      action: 'login.locked',
      actorId: user.id,
      actorEmail: user.email,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return FAILED;
  }

  // Una cuenta desactivada se comprueba **después** del bloqueo y **antes** de la
  // contraseña, y se verifica igualmente contra el señuelo. Responder aquí sin gastar el
  // tiempo de Argon2 haría que un intento contra una cuenta desactivada respondiera mucho
  // más rápido que uno contra una activa, y eso convierte "¿existe y está activa esta
  // cuenta?" en algo que se mide con un cronómetro (SPEC §7.1, enumeración).
  if (!user.active) {
    limiter.check(limitKey);
    await verifyDecoy(input.password);
    await audit({
      action: 'login.fail',
      actorId: user.id,
      actorEmail: user.email,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { motivo: 'cuenta-desactivada' },
    });
    return FAILED;
  }

  // El intento se reserva **antes** de verificar (ADR-1301). Si no hay fila, otro intento
  // concurrente acaba de bloquear la cuenta: este se trata como uno durante el bloqueo.
  const reserva = await reservarIntento(user.id, now);

  if (reserva === null) {
    limiter.check(limitKey);
    await verifyDecoy(input.password);
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
    limiter.check(limitKey);

    await audit({
      action: 'login.fail',
      actorId: user.id,
      actorEmail: user.email,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { intentosFallidos: reserva.failedLogins, bloqueada: reserva.lockedUntil !== null },
    });

    return FAILED;
  }

  await olvidarFallos(user.id, now);

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
    .select({ passwordVersion: users.passwordVersion, active: users.active })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return false;

  // Desactivar tiene que echar a quien ya está dentro. `deactivateUser` incrementa además
  // `password_version`, así que la comparación de abajo bastaría; esto es la segunda
  // cerradura, y está porque la primera vive en otra action y podría dejar de hacerlo.
  if (!row.active) return false;

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
