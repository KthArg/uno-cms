import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { authenticate } from '@/cms/auth/authenticate';
import {
  checkInvitation,
  redeemInvitation,
  resetInvitationLimiterForTests,
} from '@/cms/auth/invitations';
import { hashPassword } from '@/cms/auth/passwords';
import { auditLog, getDb, users } from '@/cms/db';
import { signToken } from '@/cms/security/tokens';
import { describeIntegration } from './env';

/**
 * T-E-5 y T-E-6: el canje de la invitación (SPEC §5.3, §10.2; issue #95).
 *
 * Lo que se prueba aquí y no en una pantalla: que el enlace **abre la cuenta de verdad** —se
 * comprueba entrando con la contraseña recién puesta— y que **no vale dos veces**.
 */

const IP = '5.5.5.5';
const PASSWORD_NUEVA = 'una-contrasena-larga-y-poco-comun';

async function crearInvitada(overrides: { active?: boolean } = {}) {
  const [fila] = await getDb()
    .insert(users)
    .values({
      email: 'invitada@ejemplo.com',
      name: 'Invitada',
      // La contraseña que pone `inviteUser` es aleatoria y no la conoce nadie. Se imita aquí
      // porque es lo que hace que la cuenta sea inaccesible sin canjear el enlace.
      passwordHash: await hashPassword(crypto.randomUUID() + crypto.randomUUID()),
      role: 'editor',
      active: overrides.active ?? true,
    })
    .returning();

  return fila!;
}

/** El enlace que `inviteUser` entrega: el identificador y la versión, dentro de la firma. */
function enlacePara(userId: string, passwordVersion: number): string {
  return signToken('password-reset', { userId, pwdV: String(passwordVersion) });
}

describeIntegration('canje de la invitación', () => {
  beforeEach(() => {
    // `signToken` y `verifyToken` **lanzan** sin `APP_SECRET`, y eso es un contrato deliberado
    // de M2: una configuración rota no puede disfrazarse de enlace inválido. El job de
    // integración no define el secreto, así que lo pone el test — igual que `users.test.ts`.
    vi.stubEnv('APP_SECRET', 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');

    // El limitador es estado de módulo y sobrevive entre tests.
    resetInvitationLimiterForTests(IP);
    resetInvitationLimiterForTests('desconocida');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('T-E-5: la contraseña queda puesta y la cuenta entra', async () => {
    const invitada = await crearInvitada();

    const resultado = await redeemInvitation({
      token: enlacePara(invitada.id, invitada.passwordVersion),
      password: PASSWORD_NUEVA,
      ip: IP,
    });

    expect(resultado).toEqual({ ok: true });

    // La prueba de que sirvió no es que la fila cambiara: es que se puede entrar. Sin esto, un
    // hash escrito en la columna equivocada pasaría el test igual.
    const acceso = await authenticate({ email: 'invitada@ejemplo.com', password: PASSWORD_NUEVA });
    expect(acceso.ok).toBe(true);
  });

  it('T-E-6: el mismo enlace no vale dos veces', async () => {
    const invitada = await crearInvitada();
    const enlace = enlacePara(invitada.id, invitada.passwordVersion);

    expect(await redeemInvitation({ token: enlace, password: PASSWORD_NUEVA, ip: IP })).toEqual({
      ok: true,
    });

    const segundo = await redeemInvitation({
      token: enlace,
      password: 'otra-contrasena-distinta-y-larga',
      ip: IP,
    });

    expect(segundo).toEqual({ ok: false, reason: 'no-disponible' });

    // Y la primera contraseña sigue siendo la buena: el segundo intento no pisó nada.
    const acceso = await authenticate({ email: 'invitada@ejemplo.com', password: PASSWORD_NUEVA });
    expect(acceso.ok).toBe(true);
  });

  it('lo que invalida el enlace es la versión, no una tabla que limpiar', async () => {
    const invitada = await crearInvitada();
    const enlace = enlacePara(invitada.id, invitada.passwordVersion);

    // Cualquier cosa que suba `password_version` gasta el enlace, no solo canjearlo. Es la
    // consecuencia de reutilizar ADR-301 y conviene tenerla fijada: si alguien invita y la
    // persona cambia su contraseña por otra vía antes de canjear, el enlace muere.
    await getDb()
      .update(users)
      .set({ passwordVersion: invitada.passwordVersion + 1 })
      .where(eq(users.id, invitada.id));

    expect(await checkInvitation(enlace)).toBeNull();
  });

  it('una cuenta desactivada entre la invitación y el canje no se abre', async () => {
    const invitada = await crearInvitada({ active: false });

    expect(await checkInvitation(enlacePara(invitada.id, invitada.passwordVersion))).toBeNull();
  });

  it('un enlace de otro propósito no vale, aunque esté bien firmado', async () => {
    const invitada = await crearInvitada();

    // Un token de vista previa está tan bien firmado como este. Lo único que los distingue es
    // el propósito, que va dentro de la firma.
    const deOtroSitio = signToken('preview', {
      userId: invitada.id,
      pwdV: String(invitada.passwordVersion),
    });

    expect(await checkInvitation(deOtroSitio)).toBeNull();
  });

  it('un enlace de una cuenta que ya no existe no vale', async () => {
    const invitada = await crearInvitada();
    const enlace = enlacePara(invitada.id, invitada.passwordVersion);

    await getDb().delete(users).where(eq(users.id, invitada.id));

    expect(await checkInvitation(enlace)).toBeNull();
  });

  it('una contraseña que no cumple la política no toca la cuenta', async () => {
    const invitada = await crearInvitada();
    const enlace = enlacePara(invitada.id, invitada.passwordVersion);

    const resultado = await redeemInvitation({ token: enlace, password: 'corta', ip: IP });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.reason).toBe('password');

    // Y el enlace **sigue sirviendo**: rechazar una contraseña débil no puede gastar la
    // invitación, o quien se equivoque al elegirla se queda fuera para siempre.
    expect(await checkInvitation(enlace)).not.toBeNull();
  });

  it('el enlace se comprueba antes que la contraseña', async () => {
    // Es la decisión contraria a la de `completeSetup`, y está razonada en el módulo: aquí el
    // token no se adivina, y quien llega con un enlace muerto tiene que enterarse **antes** de
    // pelearse con la política de contraseñas.
    const resultado = await redeemInvitation({ token: 'basura', password: 'corta', ip: IP });

    expect(resultado).toEqual({ ok: false, reason: 'no-disponible' });
  });

  it('demasiados intentos desde la misma dirección se cortan', async () => {
    const invitada = await crearInvitada();
    const enlace = enlacePara(invitada.id, invitada.passwordVersion);

    // 20 rechazados por contraseña débil, que no gastan el enlace pero sí la cuota.
    for (let i = 0; i < 20; i += 1) {
      await redeemInvitation({ token: enlace, password: 'corta', ip: IP });
    }

    const cortado = await redeemInvitation({ token: enlace, password: PASSWORD_NUEVA, ip: IP });

    expect(cortado).toEqual({ ok: false, reason: 'no-disponible' });

    const acciones = (await getDb().select().from(auditLog)).map((fila) => fila.action);
    expect(acciones).toContain('invitation.rejected');
  });

  it('dos canjes a la vez: gana uno y solo uno', async () => {
    const invitada = await crearInvitada();
    const enlace = enlacePara(invitada.id, invitada.passwordVersion);

    const [primero, segundo] = await Promise.all([
      redeemInvitation({ token: enlace, password: PASSWORD_NUEVA, ip: IP }),
      redeemInvitation({ token: enlace, password: 'la-otra-contrasena-larga', ip: IP }),
    ]);

    const exitos = [primero, segundo].filter((resultado) => resultado.ok);
    expect(exitos).toHaveLength(1);

    // **Lo que este test fija es el contrato, no el mecanismo.** Puede que los dos canjes se
    // solapen de verdad —y entonces quien los separa es la condición sobre `password_version`
    // del `update`— o puede que el pool los sirva en serie, y entonces los separa la
    // comprobación de `checkInvitation`. No se puede forzar el solapamiento desde fuera sin
    // abrir una costura en el módulo solo para el test.
    //
    // Está anotado en `docs/PENDIENTES.md`: la condición del `update` es la red para el caso
    // solapado y no tiene test que la ejercite a solas.
    const conLaPrimera = await authenticate({
      email: 'invitada@ejemplo.com',
      password: PASSWORD_NUEVA,
    });
    const conLaOtra = await authenticate({
      email: 'invitada@ejemplo.com',
      password: 'la-otra-contrasena-larga',
    });

    // Y la cuenta acaba con **una** contraseña, no con las dos ni con ninguna.
    expect([conLaPrimera.ok, conLaOtra.ok].filter(Boolean)).toHaveLength(1);
  });

  it('canjear deja constancia de quién', async () => {
    const invitada = await crearInvitada();

    await redeemInvitation({
      token: enlacePara(invitada.id, invitada.passwordVersion),
      password: PASSWORD_NUEVA,
      ip: IP,
    });

    const filas = await getDb().select().from(auditLog).where(eq(auditLog.actorId, invitada.id));

    expect(filas.map((fila) => fila.action)).toContain('invitation.redeemed');
    // El enlace es una credencial y no puede acabar en la auditoría.
    expect(JSON.stringify(filas)).not.toContain('pwdV');
  });

  it('desbloquea una cuenta que estaba bloqueada por fallos', async () => {
    const invitada = await crearInvitada();

    await getDb()
      .update(users)
      .set({ failedLogins: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) })
      .where(eq(users.id, invitada.id));

    await redeemInvitation({
      token: enlacePara(invitada.id, invitada.passwordVersion),
      password: PASSWORD_NUEVA,
      ip: IP,
    });

    // Dar la llave de una puerta que sigue atrancada no es dar acceso.
    const acceso = await authenticate({ email: 'invitada@ejemplo.com', password: PASSWORD_NUEVA });
    expect(acceso.ok).toBe(true);
  });
});
