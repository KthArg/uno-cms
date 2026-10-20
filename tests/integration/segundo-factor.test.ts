import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authenticate, isSessionStillValid } from '@/cms/auth/authenticate';
import { LOCKOUT_THRESHOLD } from '@/cms/auth/lockout';
import { hashPassword } from '@/cms/auth/passwords';
import { confirmarAlta, regenerarCodigos, secretoPendiente } from '@/cms/auth/segundo-factor';
import { auditLog, getDb, users } from '@/cms/db';
import { getLoginRateLimiter } from '@/cms/security/ratelimit';
import {
  cifrarSecreto,
  codigoTotp,
  generarCodigosDeRecuperacion,
  generarSecreto,
  huellaDeRecuperacion,
} from '@/cms/segundo-factor';
import { quitarSegundoFactor } from '@/scripts/quitar-segundo-factor.mjs';
import { databaseUrl, describeIntegration } from './env';

/** T-V-4 a T-V-8 y T-V-12 a T-V-18: la verificación en dos pasos contra la base (spec 20). */

const APP_SECRET = 'secreto-de-pruebas-de-2fa-con-mas-de-treinta-y-dos';
const PASSWORD = 'una-contrasena-larga-y-poco-comun';
const EMAIL = 'dos-pasos@ejemplo.com';

let hash: string | undefined;

/** Una cuenta con 2FA ya activada, con su secreto y sus códigos en claro para el test. */
async function conSegundoFactor() {
  hash ??= await hashPassword(PASSWORD);
  const secreto = generarSecreto();
  const codigos = generarCodigosDeRecuperacion();
  const [user] = await getDb()
    .insert(users)
    .values({
      email: EMAIL,
      name: 'Dos Pasos',
      passwordHash: hash,
      role: 'editor',
      totpSecret: cifrarSecreto(secreto, APP_SECRET),
      totpActivadoEn: new Date(),
      codigosRecuperacion: codigos.map(huellaDeRecuperacion),
    })
    .returning();
  return { user: user!, secreto, codigos };
}

async function sinSegundoFactor() {
  hash ??= await hashPassword(PASSWORD);
  const [user] = await getDb()
    .insert(users)
    .values({ email: EMAIL, name: 'Sin Dos Pasos', passwordHash: hash, role: 'editor' })
    .returning();
  return user!;
}

async function leer(id: string) {
  const [fila] = await getDb().select().from(users).where(eq(users.id, id));
  return fila!;
}

/** Un instante fijo a mitad de un paso de 30 s, para que «el código de ahora» no cambie a medias. */
const AHORA = new Date(Math.floor(Date.now() / 30_000) * 30_000 + 15_000);

describeIntegration('verificación en dos pasos', () => {
  beforeEach(() => {
    vi.stubEnv('APP_SECRET', APP_SECRET);
    vi.useFakeTimers({ toFake: ['Date'], now: AHORA });
    for (const ip of ['desconocida', '1.1.1.1', '2.2.2.2']) {
      getLoginRateLimiter().reset(`login:${ip}:${EMAIL}`);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('T-V-4: sin código, con uno equivocado o con uno viejo no entra; con el de ahora, sí', async () => {
    const { secreto } = await conSegundoFactor();
    const viejo = codigoTotp(secreto, new Date(AHORA.getTime() - 3 * 30_000));

    expect(await authenticate({ email: EMAIL, password: PASSWORD })).toEqual({ ok: false });
    expect(await authenticate({ email: EMAIL, password: PASSWORD, codigo: '000000' })).toEqual({
      ok: false,
    });
    expect(await authenticate({ email: EMAIL, password: PASSWORD, codigo: viejo })).toEqual({
      ok: false,
    });

    const bueno = await authenticate({
      email: EMAIL,
      password: PASSWORD,
      codigo: codigoTotp(secreto, AHORA),
    });
    expect(bueno.ok && bueno.user.mfa).toBe('ok');
  });

  it('T-V-4: y el código no sirve sin la contraseña', async () => {
    const { secreto } = await conSegundoFactor();
    const resultado = await authenticate({
      email: EMAIL,
      password: 'otra-contrasena-larga',
      codigo: codigoTotp(secreto, AHORA),
    });
    expect(resultado).toEqual({ ok: false });
  });

  it('T-V-5: el mismo código no vale dos veces', async () => {
    const { secreto } = await conSegundoFactor();
    const codigo = codigoTotp(secreto, AHORA);

    expect((await authenticate({ email: EMAIL, password: PASSWORD, codigo })).ok).toBe(true);
    expect((await authenticate({ email: EMAIL, password: PASSWORD, codigo })).ok).toBe(false);
  });

  it('T-V-5: ni a la vez: de dos intentos con el mismo código, entra uno', async () => {
    const { secreto } = await conSegundoFactor();
    const codigo = codigoTotp(secreto, AHORA);

    const resultados = await Promise.all([
      authenticate({ email: EMAIL, password: PASSWORD, codigo, ip: '1.1.1.1' }),
      authenticate({ email: EMAIL, password: PASSWORD, codigo, ip: '2.2.2.2' }),
    ]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
  });

  it('T-V-6: un código de recuperación entra una vez, y se gasta', async () => {
    const { user, codigos } = await conSegundoFactor();
    const codigo = codigos[3]!.toLowerCase();

    const primera = await authenticate({ email: EMAIL, password: PASSWORD, codigo });
    expect(primera.ok && primera.user.mfa).toBe('ok');
    expect(await authenticate({ email: EMAIL, password: PASSWORD, codigo })).toEqual({ ok: false });
    expect((await leer(user.id)).codigosRecuperacion).toHaveLength(9);
  });

  it('T-V-7: un código equivocado cuenta en el bloqueo como una contraseña mal', async () => {
    const { user, secreto } = await conSegundoFactor();

    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      await authenticate({ email: EMAIL, password: PASSWORD, codigo: '000000' });
    }

    expect((await leer(user.id)).lockedUntil).not.toBeNull();
    // Y con el bloqueo puesto, ni el código bueno.
    const bueno = await authenticate({
      email: EMAIL,
      password: PASSWORD,
      codigo: codigoTotp(secreto, AHORA),
    });
    expect(bueno).toEqual({ ok: false });

    const motivos = (await getDb().select().from(auditLog)).map(
      (r) => (r.meta as Record<string, unknown> | null)?.['motivo']
    );
    expect(motivos).toContain('segundo-factor');
  });

  it('T-V-8: una cuenta sin 2FA entra con la contraseña, a una sesión de alta', async () => {
    await sinSegundoFactor();
    const resultado = await authenticate({ email: EMAIL, password: PASSWORD });
    expect(resultado.ok && resultado.user.mfa).toBe('alta');
  });

  it('T-V-8: un secreto que no se puede descifrar deja fuera, no dentro', async () => {
    const { secreto } = await conSegundoFactor();
    vi.stubEnv('APP_SECRET', `${APP_SECRET}-cambiado`);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const resultado = await authenticate({
      email: EMAIL,
      password: PASSWORD,
      codigo: codigoTotp(secreto, AHORA),
    });
    expect(resultado).toEqual({ ok: false });
  });

  it('T-V-12: activar exige un código del secreto pendiente; uno mal no activa nada', async () => {
    const user = await sinSegundoFactor();
    const secreto = (await secretoPendiente(user.id))!;

    expect(await confirmarAlta(user.id, '000000', AHORA)).toBeNull();
    expect((await leer(user.id)).totpActivadoEn).toBeNull();

    const codigos = await confirmarAlta(user.id, codigoTotp(secreto, AHORA), AHORA);
    expect(codigos).toHaveLength(10);
    const fila = await leer(user.id);
    expect(fila.totpActivadoEn).not.toBeNull();
    expect(fila.codigosRecuperacion).toEqual(codigos!.map(huellaDeRecuperacion));
  });

  it('#333: la lista de personas dice quién tiene ya la verificación', async () => {
    const user = await sinSegundoFactor();
    const { listUsers } = await import('@/cms/core/users');
    const comoSeVe = async () => (await listUsers()).find((p) => p.id === user.id)!;

    expect((await comoSeVe()).dosPasos).toBe(false);
    // Un alta empezada y sin confirmar no cuenta: el secreto existe, pero no protege nada.
    const secreto = (await secretoPendiente(user.id))!;
    expect((await comoSeVe()).dosPasos).toBe(false);

    await confirmarAlta(user.id, codigoTotp(secreto, AHORA), AHORA);
    expect((await comoSeVe()).dosPasos).toBe(true);
  });

  it('T-V-12: pedir el pendiente dos veces da el mismo secreto, no uno nuevo', async () => {
    const user = await sinSegundoFactor();
    expect(await secretoPendiente(user.id)).toBe(await secretoPendiente(user.id));
  });

  it('T-V-13: una cuenta que ya la tiene no puede darla de alta otra vez', async () => {
    const { user, secreto } = await conSegundoFactor();
    const antes = (await leer(user.id)).totpSecret;

    expect(await secretoPendiente(user.id)).toBeNull();
    expect(await confirmarAlta(user.id, codigoTotp(secreto, AHORA), AHORA)).toBeNull();
    expect((await leer(user.id)).totpSecret).toBe(antes);
  });

  it('T-V-14: el secreto se guarda cifrado', async () => {
    const user = await sinSegundoFactor();
    const secreto = (await secretoPendiente(user.id))!;

    const guardado = (await leer(user.id)).totpSecret!;
    expect(guardado).not.toContain(secreto);
    expect(guardado.startsWith('v1.')).toBe(true);
  });

  it('T-V-15: terminar el alta cierra las sesiones (lo que hace la página es esto)', async () => {
    // La página llama a `invalidateSessions` al pulsar «Ya los he guardado». Lo que se comprueba
    // aquí es que una sesión `alta` de antes deja de valer, que es lo que importa.
    const user = await sinSegundoFactor();
    const { invalidateSessions } = await import('@/cms/auth/authenticate');
    expect(await isSessionStillValid(user.id, 0)).toBe(true);
    await invalidateSessions(user.id);
    expect(await isSessionStillValid(user.id, 0)).toBe(false);
  });

  it('T-V-17: códigos nuevos exigen uno de la app e invalidan los viejos', async () => {
    const { user, secreto, codigos } = await conSegundoFactor();

    expect(await regenerarCodigos(user.id, '000000', AHORA)).toBeNull();
    // Uno de recuperación no sirve para fabricar diez más. **Y no se gasta al intentarlo**: el
    // rechazo va antes de comprobarlo, que es lo que lo gastaría.
    expect(await regenerarCodigos(user.id, codigos[0]!, AHORA)).toBeNull();
    expect((await leer(user.id)).codigosRecuperacion).toHaveLength(10);

    const nuevos = await regenerarCodigos(user.id, codigoTotp(secreto, AHORA), AHORA);
    expect(nuevos).toHaveLength(10);

    const viejo = await authenticate({ email: EMAIL, password: PASSWORD, codigo: codigos[1]! });
    expect(viejo).toEqual({ ok: false });
  });

  it('T-V-18: pnpm mfa:quitar la quita y cierra las sesiones de esa cuenta', async () => {
    const { user } = await conSegundoFactor();
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      expect(await quitarSegundoFactor(pool, EMAIL.toUpperCase())).toBe(true);
      expect(await quitarSegundoFactor(pool, 'nadie@ejemplo.com')).toBe(false);
    } finally {
      await pool.end();
    }

    const fila = await leer(user.id);
    expect(fila.totpSecret).toBeNull();
    expect(fila.totpActivadoEn).toBeNull();
    expect(fila.codigosRecuperacion).toEqual([]);
    expect(await isSessionStillValid(user.id, 0)).toBe(false);

    const entra = await authenticate({ email: EMAIL, password: PASSWORD });
    expect(entra.ok && entra.user.mfa).toBe('alta');
  });
});
