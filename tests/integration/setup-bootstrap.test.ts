import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  MIN_SETUP_TOKEN_LENGTH,
  SETUP_COMPLETED_KEY,
  completeSetup,
  isSetupCompleted,
  resetSetupCacheForTests,
} from '@/cms/auth/setup';
import { auditLog, getDb, settings, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-61-1 a T-61-7: bootstrap del primer administrador (SPEC §7.3).
 */

const TOKEN = 'un-token-de-instalacion-con-mas-de-32-caracteres';
const PASSWORD = 'una-contrasena-larga-y-poco-comun';

const ENTRADA = {
  token: TOKEN,
  email: 'jefa@ejemplo.com',
  name: 'Jefa',
  password: PASSWORD,
};

describeIntegration('bootstrap del primer administrador', () => {
  beforeEach(() => {
    // El caché es de proceso: sin esto, el primer test que complete el bootstrap dejaría a
    // todos los siguientes creyendo que ya está hecho.
    resetSetupCacheForTests();
    vi.stubEnv('SETUP_TOKEN', TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('T-61-4: con token correcto crea el primer administrador', async () => {
    const result = await completeSetup(ENTRADA);

    expect(result.ok).toBe(true);

    const [user] = await getDb().select().from(users);
    expect(user?.email).toBe('jefa@ejemplo.com');
    // Rol `admin`, no `editor`: es la cuenta con la que se administra el sitio.
    expect(user?.role).toBe('admin');
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('T-61-5: el segundo uso ya no está disponible, con el token aún definido', async () => {
    await completeSetup(ENTRADA);

    const segundo = await completeSetup({ ...ENTRADA, email: 'otro@ejemplo.com' });

    expect(segundo).toEqual({ ok: false, reason: 'no-disponible' });
    expect(await getDb().select().from(users)).toHaveLength(1);
  });

  it('T-61-2: sin SETUP_TOKEN en el entorno no se crea nada', async () => {
    vi.stubEnv('SETUP_TOKEN', '');

    expect(await completeSetup(ENTRADA)).toEqual({ ok: false, reason: 'no-disponible' });
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it('T-61-2: un SETUP_TOKEN corto se trata como si no existiera', async () => {
    // Uno corto convertiría el bootstrap en adivinable: quien acierte crea la cuenta de
    // administrador de un sitio que todavía no tiene dueño.
    const corto = 'x'.repeat(MIN_SETUP_TOKEN_LENGTH - 1);
    vi.stubEnv('SETUP_TOKEN', corto);

    expect(await completeSetup({ ...ENTRADA, token: corto })).toEqual({
      ok: false,
      reason: 'no-disponible',
    });
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it('T-61-3: token incorrecto se rechaza', async () => {
    const falso = 'otro-token-igual-de-largo-pero-completamente-falso';

    expect(await completeSetup({ ...ENTRADA, token: falso })).toEqual({
      ok: false,
      reason: 'token',
    });
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it('T-61-3: un token con el prefijo correcto tampoco pasa', async () => {
    // La comparación es en tiempo constante justamente para que acertar los primeros
    // caracteres no sea distinguible de no acertar ninguno.
    const casi = TOKEN.slice(0, -1) + 'X';

    expect(await completeSetup({ ...ENTRADA, token: casi })).toEqual({
      ok: false,
      reason: 'token',
    });
  });

  it('T-61-7: la contraseña del primer administrador pasa la política', async () => {
    expect(await completeSetup({ ...ENTRADA, password: 'corta' })).toEqual({
      ok: false,
      reason: 'password',
    });
    expect(await completeSetup({ ...ENTRADA, password: 'passwordpassword' })).toEqual({
      ok: false,
      reason: 'password',
    });
    expect(await getDb().select().from(users)).toHaveLength(0);
  });

  it('T-61-6: el usuario y la marca se escriben juntos', async () => {
    await completeSetup(ENTRADA);

    const marca = await getDb()
      .select()
      .from(settings)
      .where(sql`${settings.key} = ${SETUP_COMPLETED_KEY}`);

    expect(marca).toHaveLength(1);
    expect(await getDb().select().from(users)).toHaveLength(1);
  });

  it('T-61-1: con usuarios pero sin marca, el bootstrap se considera hecho', async () => {
    // Una restauración parcial podría dejar la base así. Crear un segundo "primer
    // administrador" sobre un sitio que ya tiene usuarios sería una toma de control.
    await getDb()
      .insert(users)
      .values({ email: 'alguien@ejemplo.com', name: 'Alguien', passwordHash: 'x' });
    resetSetupCacheForTests();

    expect(await isSetupCompleted()).toBe(true);
    expect(await completeSetup(ENTRADA)).toEqual({ ok: false, reason: 'no-disponible' });
  });

  it('el bootstrap queda registrado en la auditoría, sin la contraseña ni el token', async () => {
    await completeSetup({ ...ENTRADA, ip: '192.168.1.37' });

    const rows = await getDb().select().from(auditLog);
    const serializado = JSON.stringify(rows);

    expect(rows.map((row) => row.action)).toContain('setup.completed');
    expect(serializado).not.toContain(PASSWORD);
    expect(serializado).not.toContain(TOKEN);
    // Y la IP truncada, igual que en cualquier otro evento.
    expect(serializado).toContain('192.168.1.0');
  });

  it('los intentos rechazados también se registran', async () => {
    await completeSetup({ ...ENTRADA, token: 'otro-token-igual-de-largo-pero-falso' });

    const acciones = (await getDb().select().from(auditLog)).map((row) => row.action);
    expect(acciones).toContain('setup.rejected');
  });
});
