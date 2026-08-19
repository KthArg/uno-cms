import { eq } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import { authenticate, invalidateSessions, isSessionStillValid } from '@/cms/auth/authenticate';
import { hashPassword, verifyDecoy, verifyPassword } from '@/cms/auth/passwords';
import { auditLog, getDb, users } from '@/cms/db';
import { getLoginRateLimiter } from '@/cms/security/ratelimit';
import { describeIntegration } from './env';

/**
 * T-59-1 a T-59-12: el flujo de autenticación contra Postgres real (SPEC §7.1, ADR-004).
 */

/**
 * El señuelo se envuelve para poder **contar** sus llamadas, sin sustituirlo.
 *
 * `vi.fn(real.verifyDecoy)` conserva la implementación: Argon2 se ejecuta de verdad y el coste
 * se paga igual. Lo único que se añade es un contador.
 *
 * El motivo está en #131. Que el camino del correo inexistente verifique un señuelo es un hecho
 * **estructural** sobre el código, y antes se afirmaba con un cronómetro que comparaba dos
 * llamadas a `authenticate` con distinto trabajo de disco. Eso falla en CI sin que nada se haya
 * roto, y falla en la dirección peor: en verde por casualidad cuando el disco va rápido.
 */
vi.mock('@/cms/auth/passwords', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/cms/auth/passwords')>();
  return { ...real, verifyDecoy: vi.fn(real.verifyDecoy) };
});

const PASSWORD = 'una-contrasena-larga-y-poco-comun';
const EMAIL = 'ana@ejemplo.com';

/**
 * El hash se calcula una vez y se reutiliza: Argon2 cuesta decenas de milisegundos y aquí
 * hay doce tests.
 *
 * **Ojo al añadir tests:** este helper crea usuarios cuya contraseña es siempre `PASSWORD`.
 * Si necesitas otra, no reutilices `crearUsuario` — obtendrías un usuario cuyo hash no
 * corresponde a lo que crees.
 */
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
    vi.mocked(verifyDecoy).mockClear();
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

    await authenticate({ email: 'nadie@ejemplo.com', password: 'incorrecta-pero-larga' });

    // La afirmación que discrimina, y no depende de ningún reloj: el camino del correo
    // inexistente **verifica el señuelo**. Quitar esa línea de `authenticate` pone esto en
    // rojo siempre, no unas veces sí y otras no.
    expect(vi.mocked(verifyDecoy)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyDecoy)).toHaveBeenCalledWith('incorrecta-pero-larga');

    // Y se ejecutó de verdad: un doble hueco devolvería `undefined`. Que ese `false` cueste
    // decenas de milisegundos —o sea, que el hash señuelo tenga los parámetros de producción y
    // no sea un adorno— lo afirma `tests/unit/passwords.test.ts`.
    await expect(vi.mocked(verifyDecoy).mock.results[0]?.value).resolves.toBe(false);
  });

  it('T-59-4: y el coste se nota de punta a punta', { timeout: 60_000 }, async () => {
    await crearUsuario();

    // El coste de una verificación Argon2, medido **suelto**. Se toma el mínimo de tres
    // muestras: el mínimo es la ejecución menos estorbada, o sea una cota inferior del coste
    // real. Un tropiezo del planificador en una muestra no lo mueve.
    const muestras: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const inicio = performance.now();
      await verifyPassword(hash, 'incorrecta-pero-larga');
      muestras.push(performance.now() - inicio);
    }
    const argon2 = Math.min(...muestras);

    const inicio = performance.now();
    await authenticate({ email: 'nadie@ejemplo.com', password: 'incorrecta-pero-larga' });
    const fantasma = performance.now() - inicio;

    // Antes esto comparaba dos llamadas a `authenticate` entre sí, y por eso fallaba en CI
    // (#131): el camino de contraseña incorrecta escribe **dos** filas —contador de fallos y
    // auditoría— y el del correo inexistente una. La razón entre ambas depende de lo rápido
    // que sea el disco, no de si el señuelo está.
    //
    // Contra el coste de Argon2 suelto no pasa eso. El camino fantasma hace, como mínimo, ese
    // mismo Argon2 más una consulta y una inserción: un disco lento solo puede **subir** el
    // numerador. La comprobación no puede romperse por lentitud, que es justo lo que le pasaba.
    //
    // Lo que caza esto y no caza el contador de arriba es el fallo gordo de punta a punta: que
    // el señuelo se invoque pero responda al instante. Quien discrimina de verdad es el test
    // anterior; este es la red por debajo.
    expect(fantasma).toBeGreaterThan(argon2 * 0.5);
  });

  it('T-59-12: una cuenta desactivada no entra, y también paga el señuelo', async () => {
    const user = await crearUsuario();
    if (user === undefined) throw new Error('sin usuario');

    await getDb().update(users).set({ active: false }).where(eq(users.id, user.id));

    // Con la contraseña **correcta**: lo que cierra la puerta es `active`, no equivocarse.
    expect(await authenticate({ email: EMAIL, password: PASSWORD })).toEqual({ ok: false });

    // Y se verifica igualmente contra el señuelo. Sin esto, una cuenta desactivada respondería
    // en microsegundos y una activa en decenas de milisegundos: "¿existe y está activa esta
    // cuenta?" se contestaría con un cronómetro (SPEC §7.1, enumeración).
    expect(vi.mocked(verifyDecoy)).toHaveBeenCalledTimes(1);

    const filas = await getDb().select().from(auditLog);
    expect(filas.map((fila) => fila.meta)).toContainEqual({ motivo: 'cuenta-desactivada' });

    // El contador de fallos no se toca: la cuenta ya está cerrada y sumar intentos ahí solo
    // serviría para que, al reactivarla, apareciera bloqueada sin motivo.
    expect((await leerUsuario(user.id))?.failedLogins).toBe(0);
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

  it('un login correcto NO consume cuota del límite', async () => {
    // La clave es IP + correo. Si un acierto gastara cuota, en una red compartida —una
    // oficina, un NAT de operador— cinco entradas correctas seguidas dejarían al sexto
    // usuario legítimo sin poder entrar. Y peor: cinco errores de tecleo de un compañero
    // dejan fuera al dueño de la cuenta desde toda la red.
    await crearUsuario();

    for (let i = 0; i < 8; i += 1) {
      const result = await authenticate({ email: EMAIL, password: PASSWORD, ip: '1.2.3.4' });
      expect(result.ok, `el intento correcto ${i + 1} debería pasar`).toBe(true);
    }

    expect(await acciones()).not.toContain('login.ratelimited');
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
