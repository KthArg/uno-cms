import { eq } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import { authenticate, invalidateSessions, isSessionStillValid } from '@/cms/auth/authenticate';
import { hashPassword } from '@/cms/auth/passwords';
import { auditLog, getDb, users } from '@/cms/db';
import { getLoginRateLimiter } from '@/cms/security/ratelimit';
import { describeIntegration } from './env';

/**
 * T-59-1 a T-59-11: el flujo de autenticación contra Postgres real (SPEC §7.1, ADR-004).
 */

const PASSWORD = 'una-contrasena-larga-y-poco-comun';
const EMAIL = 'ana@ejemplo.com';

let hash: string;

async function crearUsuario(email = EMAIL) {
  hash ??= await hashPassword(PASSWORD);
  const [user] = await getDb()
    .insert(users)
    .values({ email, name: 'Ana', passwordHash: hash, role: 'editor' })
    .returning();
  return user;
}

async function leerUsuario(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row;
}

async function acciones(): Promise<string[]> {
  return (await getDb().select().from(auditLog)).map((row) => row.action);
}

describeIntegration('autenticación', () => {
  beforeEach(() => {
    // El limitador es estado de módulo y sobrevive entre tests; sin esto, los intentos de
    // un test agotarían la cuota del siguiente y el fallo dependería del orden.
    getLoginRateLimiter().reset(`login:1.2.3.4:${EMAIL}`);
    getLoginRateLimiter().reset(`login:desconocida:${EMAIL}`);
  });

  it('T-59-1: credenciales correctas devuelven usuario con rol', async () => {
    const user = await crearUsuario();
    const result = await authenticate({ email: EMAIL, password: PASSWORD, ip: '1.2.3.4' });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.user).toMatchObject({
      id: user?.id,
      email: EMAIL,
      role: 'editor',
    });
    expect(await acciones()).toContain('login.success');
  });

  it('T-59-2 / T-59-3: contraseña incorrecta y usuario inexistente son indistinguibles', async () => {
    await crearUsuario();

    const malaPassword = await authenticate({ email: EMAIL, password: 'otra-cosa-larga-aqui' });
    const noExiste = await authenticate({ email: 'nadie@ejemplo.com', password: PASSWORD });

    // Mismo objeto, sin motivo ni código: cualquier diferencia convierte el formulario en
    // un comprobador de cuentas ajenas (SPEC §7.1, "Enumeración").
    expect(malaPassword).toEqual({ ok: false });
    expect(noExiste).toEqual({ ok: false });
    expect(Object.keys(malaPassword)).toEqual(Object.keys(noExiste));
  });

  it('T-59-4: el correo inexistente también paga el coste de verificar', async () => {
    await crearUsuario();

    const inicioReal = performance.now();
    await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga' });
    const real = performance.now() - inicioReal;

    const inicioFantasma = performance.now();
    await authenticate({ email: 'nadie@ejemplo.com', password: 'incorrecta-pero-larga' });
    const fantasma = performance.now() - inicioFantasma;

    // El umbral tiene que ser exigente, y aquí está el motivo: con `real / 10` este test
    // pasaba **aunque se quitara el señuelo**. Lo comprobé por mutación. El camino del
    // correo inexistente hace igualmente una consulta a la base de datos, que ya cuesta más
    // que la décima parte de una verificación de Argon2, así que el umbral laxo lo cubría
    // todo y no cubría nada.
    //
    // Con el señuelo, ambos caminos hacen consulta + Argon2 y la razón ronda 1. Sin él,
    // ronda 0,1. Un umbral de 0,5 separa las dos situaciones con margen de sobra para el
    // ruido de medir en CI.
    expect(fantasma / real).toBeGreaterThan(0.5);
  });

  it('T-59-5: cinco fallos bloquean la cuenta 15 minutos', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    for (let i = 0; i < 5; i += 1) {
      await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga' });
    }

    const row = await leerUsuario(user.id);
    expect(row?.failedLogins).toBe(5);
    expect(row?.lockedUntil).not.toBeNull();

    const minutos = (row!.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);
  });

  it('T-59-5: con la cuenta bloqueada, ni la contraseña correcta entra', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    await getDb()
      .update(users)
      .set({ failedLogins: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) })
      .where(eq(users.id, user.id));

    expect(await authenticate({ email: EMAIL, password: PASSWORD })).toEqual({ ok: false });
    expect(await acciones()).toContain('login.locked');
  });

  it('T-59-7: un intento durante el bloqueo no lo alarga', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    const hasta = new Date(Date.now() + 15 * 60 * 1000);
    await getDb()
      .update(users)
      .set({ failedLogins: 5, lockedUntil: hasta })
      .where(eq(users.id, user.id));

    await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga' });
    await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga' });

    const row = await leerUsuario(user.id);
    // Ni el contador sube ni la fecha se mueve. Si se movieran, cualquiera podría mantener
    // fuera a un usuario legítimo indefinidamente sabiendo solo su correo.
    expect(row?.failedLogins).toBe(5);
    expect(row?.lockedUntil?.getTime()).toBe(hasta.getTime());
  });

  it('T-59-8: un login correcto reinicia el contador', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga' });
    await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga' });
    expect((await leerUsuario(user.id))?.failedLogins).toBe(2);

    expect((await authenticate({ email: EMAIL, password: PASSWORD })).ok).toBe(true);

    const row = await leerUsuario(user.id);
    expect(row?.failedLogins).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it('T-59-9: el correo no distingue mayúsculas ni espacios (ADR-201)', async () => {
    await crearUsuario('Ana@Ejemplo.com');

    expect((await authenticate({ email: 'ana@ejemplo.com', password: PASSWORD })).ok).toBe(true);
    expect((await authenticate({ email: '  ANA@EJEMPLO.COM  ', password: PASSWORD })).ok).toBe(
      true
    );
  });

  it('T-59-10: cambiar la contraseña invalida las sesiones abiertas', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    expect(await isSessionStillValid(user.id, 0)).toBe(true);

    await invalidateSessions(user.id);

    // El JWT sigue firmado y sin caducar, pero su claim `pwdV` ya no coincide.
    expect(await isSessionStillValid(user.id, 0)).toBe(false);
    expect(await isSessionStillValid(user.id, 1)).toBe(true);
  });

  it('T-59-11: borrar el usuario invalida su sesión', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    expect(await isSessionStillValid(user.id, 0)).toBe(true);
    await getDb().delete(users).where(eq(users.id, user.id));

    // "He echado a alguien y sigue dentro". Se decide de forma explícita, no por cómo salga
    // comparar `undefined` con un número.
    expect(await isSessionStillValid(user.id, 0)).toBe(false);
  });

  it('el límite de intentos corta antes de tocar la base de datos', async () => {
    await crearUsuario();

    for (let i = 0; i < 5; i += 1) {
      await authenticate({ email: EMAIL, password: 'incorrecta-pero-larga', ip: '1.2.3.4' });
    }

    await authenticate({ email: EMAIL, password: PASSWORD, ip: '1.2.3.4' });

    // Aunque la contraseña sea correcta, el sexto intento no pasa del limitador.
    expect(await acciones()).toContain('login.ratelimited');
  });

  it('la auditoría del login no guarda la contraseña', async () => {
    await crearUsuario();
    await authenticate({ email: EMAIL, password: 'secreto-que-no-debe-aparecer' });

    const rows = await getDb().select().from(auditLog);
    expect(JSON.stringify(rows)).not.toContain('secreto-que-no-debe-aparecer');
  });
});
