import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, users } from '@/cms/db';
import { audit } from '@/cms/security/audit';
import { createRateLimiter } from '@/cms/security/ratelimit';
import { verifyToken } from '@/cms/security/tokens';
import { checkPasswordPolicy, hashPassword } from './passwords';

/**
 * Canje de la invitación (SPEC §5.3, §10.2; issue #95).
 *
 * `inviteUser` (#81) crea la cuenta con una contraseña aleatoria que **no se devuelve nunca** y
 * entrega al administrador un token de 24 h para compartir a mano. Sin esta pieza, esa cuenta
 * es una cuenta a la que no puede entrar nadie: el token existía y no había dónde canjearlo.
 *
 * ## Por qué no es una server action
 *
 * `defineAction` empieza por `requireSession`, y aquí no hay sesión por definición: quien canjea
 * la invitación todavía no puede entrar. Sigue el mismo camino que el bootstrap
 * (`cms/auth/setup.ts`): un módulo del servidor con su propio límite de intentos, su validación
 * y su auditoría, invocado desde un `'use server'` de la página.
 *
 * ## De un solo uso, sin columna nueva
 *
 * El token lleva dentro de la firma el `password_version` que tenía la cuenta al invitarla.
 * Canjear la incrementa, así que el mismo enlace deja de coincidir: se invalida solo. Esto es
 * lo mismo que ya expulsa las sesiones abiertas (ADR-301), reutilizado — un token de un solo
 * uso sin tabla que limpiar ni fecha de caducidad que vigilar aparte de la del propio token.
 */

/**
 * Límite de intentos, por IP.
 *
 * Más suelto que el del bootstrap (10/hora) porque aquí sí hay alguien que puede equivocarse
 * varias veces seguidas: quien canja está eligiendo contraseña, y la política puede rechazarle
 * dos o tres. Y más estricto que el login, porque no es una pantalla de uso diario.
 *
 * Lo que este límite protege no es adivinar el token —está firmado con HMAC y eso no se
 * adivina— sino que alguien use esta ruta para tantear la política de contraseñas o para
 * gastar Argon2 del servidor a coste cero para él.
 */
const invitationLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

/** Solo para tests: el limitador es estado de módulo y sobrevive entre tests. */
export function resetInvitationLimiterForTests(ip: string): void {
  invitationLimiter.reset(`invitacion:${ip}`);
}

export interface DatosDeInvitacion {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  /**
   * La versión que tenía la cuenta al comprobar el token.
   *
   * Viaja hasta el `update` para condicionarlo: es lo que impide que dos canjes simultáneos
   * del mismo enlace pisen el uno la contraseña del otro.
   */
  readonly passwordVersion: number;
}

/**
 * Comprueba el token y devuelve a quién pertenece, o `null`.
 *
 * Un único `null` para todo: firma mala, propósito equivocado, caducado, cuenta borrada,
 * cuenta desactivada o token ya usado. La página lo convierte en **404**, que es lo que pide
 * el criterio de aceptación: un mensaje que distinguiera "caducado" de "no existe"
 * confirmaría que ese enlace fue real alguna vez.
 *
 * `verifyToken` **lanza** si `APP_SECRET` falta o es corto, y eso no se captura aquí a
 * propósito: es una configuración rota del despliegue, no un token inválido. Quien llama desde
 * una ruta pública tiene que capturarlo y responder 404 — está escrito en la spec de M2 §3.2 y
 * lo hace la página.
 */
export async function checkInvitation(token: unknown): Promise<DatosDeInvitacion | null> {
  const verificado = verifyToken('password-reset', token);
  if (!verificado.ok) return null;

  const userId = verificado.data['userId'];
  const pwdV = verificado.data['pwdV'];
  if (userId === undefined || pwdV === undefined) return null;

  const [usuario] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      active: users.active,
      passwordVersion: users.passwordVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (usuario === undefined) return null;

  // Una cuenta desactivada entre la invitación y el canje no se abre. Quien la desactivó
  // esperaría justo eso, y sin esta línea el enlace seguiría siendo una puerta abierta.
  if (!usuario.active) return null;

  // Aquí está el "un solo uso": la versión del payload firmado contra la de la fila.
  if (String(usuario.passwordVersion) !== pwdV) return null;

  return {
    userId: usuario.id,
    email: usuario.email,
    name: usuario.name,
    passwordVersion: usuario.passwordVersion,
  };
}

export type ResultadoDeCanje =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'no-disponible' | 'password';
      readonly message?: string;
    };

export interface EntradaDeCanje {
  readonly token: string;
  readonly password: string;
  readonly ip?: string;
}

/**
 * Establece la contraseña de una invitación válida.
 *
 * ## El orden: primero el token, y aquí sí
 *
 * `completeSetup` comprueba la contraseña **antes** que el token, y a propósito: allí, recibir
 * "contraseña débil" en vez de "token incorrecto" confirmaría haber acertado un `SETUP_TOKEN`
 * que se adivina a fuerza bruta.
 *
 * Aquí se hace al revés, y no por descuido. Este token es un HMAC de 24 h: no se adivina, así
 * que no hay oráculo que cerrar. Y la validez del token **ya es observable** de todas formas,
 * porque la página tiene que comprobarla para decidir si pinta el formulario o devuelve 404.
 *
 * Lo que queda, entonces, es a quién le sirve más cada orden. Con la contraseña primero, quien
 * llega con un enlace caducado corrige su contraseña, la vuelve a enviar y **solo entonces**
 * descubre que el enlace estaba muerto y que necesita pedir otro. El problema que bloquea se
 * dice primero.
 */
export async function redeemInvitation(input: EntradaDeCanje): Promise<ResultadoDeCanje> {
  const ip = input.ip ?? 'desconocida';

  if (!invitationLimiter.check(`invitacion:${ip}`).allowed) {
    await audit({
      action: 'invitation.rejected',
      ip: input.ip,
      meta: { motivo: 'demasiados-intentos' },
    });
    return { ok: false, reason: 'no-disponible' };
  }

  const invitacion = await checkInvitation(input.token);

  if (invitacion === null) {
    await audit({ action: 'invitation.rejected', ip: input.ip, meta: { motivo: 'token' } });
    return { ok: false, reason: 'no-disponible' };
  }

  const politica = checkPasswordPolicy(input.password);
  if (!politica.ok) return { ok: false, reason: 'password', message: politica.reason };

  const passwordHash = await hashPassword(input.password);

  // El incremento de `password_version` es lo que gasta el token, así que va en la misma
  // escritura que la contraseña: separarlos dejaría una ventana en la que la contraseña ya
  // está puesta y el enlace todavía sirve para volver a ponerla.
  //
  // Se condiciona a la versión **leída al comprobar el token**, no a la que haya ahora: dos
  // canjes simultáneos del mismo enlace pasan los dos la comprobación de arriba, y sin esta
  // condición el segundo pisaría la contraseña que acaba de elegir el primero. Con ella, el
  // segundo no actualiza ninguna fila y se va por `no-disponible`, que es lo correcto: ese
  // enlace ya se gastó.
  const actualizadas = await getDb()
    .update(users)
    .set({
      passwordHash,
      passwordVersion: sql`${users.passwordVersion} + 1`,
      // La cuenta nace sin intentos fallidos, pero un enlace de invitación también sirve para
      // reponer la contraseña de una cuenta bloqueada por fallos: dejarla bloqueada tras
      // ponerle contraseña nueva sería dar la llave de una puerta atrancada.
      failedLogins: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(users.id, invitacion.userId), eq(users.passwordVersion, invitacion.passwordVersion))
    )
    .returning({ id: users.id });

  if (actualizadas.length === 0) return { ok: false, reason: 'no-disponible' };

  await audit({
    action: 'invitation.redeemed',
    actorId: invitacion.userId,
    actorEmail: invitacion.email,
    targetType: 'user',
    targetId: invitacion.userId,
    ip: input.ip,
  });

  return { ok: true };
}
