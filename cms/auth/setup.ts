import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb, settings, users } from '@/cms/db';
import { audit } from '@/cms/security/audit';
import { createRateLimiter } from '@/cms/security/ratelimit';
import { checkPasswordPolicy, hashPassword } from './passwords';

/**
 * Bootstrap del primer administrador (SPEC §7.3).
 *
 * "Nunca existen credenciales por defecto" es el requisito que ordena todo lo demás: no hay
 * usuario inicial, no hay contraseña impresa en la documentación, y la única forma de crear
 * la primera cuenta es demostrar que se controla el entorno del despliegue.
 */

/** Clave de `settings` que marca el bootstrap como hecho (SPEC §4). */
export const SETUP_COMPLETED_KEY = 'setup_completed';

/**
 * Longitud mínima del token.
 *
 * Uno corto convertiría todo el bootstrap en adivinable: quien acierte crea la cuenta de
 * administrador de un sitio que todavía no tiene dueño.
 */
export const MIN_SETUP_TOKEN_LENGTH = 32;

/**
 * Memorización de solo un sentido: una vez completado, el bootstrap **no se descompleta**.
 *
 * Por eso solo se cachea el `true`. Cachear el `false` haría que un despliegue recién
 * configurado siguiera creyéndose sin configurar hasta reiniciar, y eso deja `/setup`
 * abierto más tiempo del debido.
 *
 * El efecto práctico: una consulta por arranque en frío mientras el bootstrap está
 * pendiente —cuando no hay tráfico— y ninguna después.
 */
let completedCache = false;

export async function isSetupCompleted(): Promise<boolean> {
  if (completedCache) return true;

  const rows = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(sql`${settings.key} = ${SETUP_COMPLETED_KEY}`)
    .limit(1);

  if (rows.length > 0) {
    completedCache = true;
    return true;
  }

  // Si hubiera usuarios pero faltara la marca, el bootstrap está de hecho hecho: crear un
  // segundo "primer administrador" sería una toma de control. Se cubre por si una versión
  // anterior o una restauración parcial dejó la base en ese estado.
  const [{ total } = { total: 0 }] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(users);

  if (total > 0) {
    completedCache = true;
    return true;
  }

  return false;
}

/**
 * Solo para tests: el bootstrap se completa una vez por proceso, no una vez por test, y el
 * limitador de intentos también es estado de módulo.
 *
 * Ambos se reinician juntos porque olvidar el segundo produce un fallo desconcertante: los
 * primeros tests pasan y a partir de cierto punto todos responden "no disponible" sin que
 * nada en el test lo explique.
 */
export function resetSetupCacheForTests(): void {
  completedCache = false;
  setupLimiter.reset('setup:desconocida');
}

/** Solo para tests: libera la cuota de una IP concreta. */
export function resetSetupLimiterForTests(ip: string): void {
  setupLimiter.reset(`setup:${ip}`);
}

/**
 * Comparación del token en tiempo constante.
 *
 * Con `===`, el tiempo de respuesta filtra cuántos caracteres iniciales se han acertado, y
 * eso convierte adivinar 32 caracteres en adivinarlos de uno en uno.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  // `timingSafeEqual` lanza si las longitudes difieren, y comparar longitudes ya es
  // información. Se responde igual que ante cualquier otro fallo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Límite de intentos del bootstrap.
 *
 * Más estricto que el del login —10 por hora frente a 5 por 15 minutos— porque aquí no hay
 * nadie que pueda equivocarse mucho: quien despliega tiene el token delante, en las
 * variables de entorno que acaba de escribir. Un editor puede teclear mal su contraseña
 * cinco veces; nadie teclea mal el código de instalación diez.
 *
 * No usarlo habría sido dejar sin protección la única puerta a una cuenta de administrador
 * sobre un sitio sin dueño, teniendo el limitador ya construido y probado.
 */
const setupLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

export type SetupResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: 'no-disponible' | 'token' | 'password' };

export interface SetupInput {
  readonly token: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly ip?: string;
}

/**
 * Crea el primer administrador (SPEC §7.3).
 *
 * ## Los dos motivos que sí se distinguen, y por qué
 *
 * A diferencia del login, aquí `token` y `password` devuelven motivos separados. No hay nada
 * que enumerar —no existe ninguna cuenta todavía— y quien está desplegando necesita saber
 * si se equivocó de token o si su contraseña es débil. `no-disponible` sí es genérico: es lo
 * que se convierte en 404.
 *
 * ## La transacción
 *
 * El usuario y la marca `setup_completed` se escriben **juntos**. Si se creara el usuario y
 * fallara la marca, `/setup` quedaría abierto **con un administrador ya existente**: quien
 * conociera el token podría crear un segundo administrador sobre un sitio con dueño. Es el
 * peor de los dos estados posibles, y es el único que la transacción impide.
 */
export async function completeSetup(input: SetupInput): Promise<SetupResult> {
  if (await isSetupCompleted()) return { ok: false, reason: 'no-disponible' };

  if (!setupLimiter.check(`setup:${input.ip ?? 'desconocida'}`).allowed) {
    await audit({
      action: 'setup.rejected',
      ip: input.ip,
      meta: { motivo: 'demasiados-intentos' },
    });
    return { ok: false, reason: 'no-disponible' };
  }

  // **La política de contraseña se comprueba ANTES que el token, y el orden importa.**
  //
  // Al revés, recibir `password` en vez de `token` confirmaría que el código de instalación
  // era el bueno: quien probara tokens al azar enviaría una contraseña deliberadamente mala
  // y usaría la respuesta como oráculo para saber cuándo ha acertado, sin llegar a crear la
  // cuenta. Comprobando primero la contraseña, una mala responde igual con token correcto
  // que con token incorrecto.
  //
  // Quien despliega no nota diferencia: si su contraseña no vale, se lo dicen igual.
  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) return { ok: false, reason: 'password' };

  const expected = process.env['SETUP_TOKEN'];

  // Sin token en el entorno, o con uno demasiado corto, no se crea nada. Un despliegue sin
  // `SETUP_TOKEN` no es un despliegue con bootstrap abierto: es un despliegue que todavía
  // no está listo para configurarse.
  if (expected === undefined || expected.length < MIN_SETUP_TOKEN_LENGTH) {
    await audit({ action: 'setup.rejected', ip: input.ip, meta: { motivo: 'sin-token-valido' } });
    return { ok: false, reason: 'no-disponible' };
  }

  if (!tokenMatches(input.token, expected)) {
    await audit({ action: 'setup.rejected', ip: input.ip, meta: { motivo: 'token-incorrecto' } });
    return { ok: false, reason: 'token' };
  }

  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();

  const userId = await getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email, name: input.name.trim(), passwordHash, role: 'admin' })
      .returning({ id: users.id });

    await tx.insert(settings).values({
      key: SETUP_COMPLETED_KEY,
      value: { completedAt: new Date().toISOString() },
    });

    return created?.id;
  });

  if (userId === undefined) return { ok: false, reason: 'no-disponible' };

  completedCache = true;

  await audit({
    action: 'setup.completed',
    actorId: userId,
    actorEmail: email,
    targetType: 'user',
    targetId: userId,
    ip: input.ip,
  });

  return { ok: true, userId };
}
