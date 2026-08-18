import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { RETENTION_DAYS, audit, maybePrune, resetPruneClockForTests } from '@/cms/security/audit';
import { auditLog, getDb, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-58-1, T-58-2, T-58-5 y T-58-6: el registro de auditoría contra Postgres real.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function rows() {
  return getDb().select().from(auditLog);
}

describeIntegration('registro de auditoría', () => {
  it('T-58-1: registra actor, acción y fecha', async () => {
    resetPruneClockForTests();

    await audit({
      action: 'login.success',
      actorEmail: 'ana@ejemplo.com',
      targetType: 'user',
      targetId: 'abc',
      meta: { intentos: 1 },
    });

    const [row] = await rows();
    expect(row?.action).toBe('login.success');
    expect(row?.actorEmail).toBe('ana@ejemplo.com');
    expect(row?.targetType).toBe('user');
    expect(row?.targetId).toBe('abc');
    expect(row?.meta).toMatchObject({ intentos: 1 });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('T-58-2: el correo del actor sobrevive al borrado del usuario', async () => {
    resetPruneClockForTests();

    const [user] = await getDb()
      .insert(users)
      .values({ email: 'quien@ejemplo.com', name: 'Quien', passwordHash: 'x' })
      .returning();

    await audit({ action: 'content.publish', actorId: user?.id, actorEmail: 'quien@ejemplo.com' });
    await getDb().delete(users);

    const [row] = await rows();
    // `actor_id` no lleva clave foránea a propósito (SPEC §4): el rastro tiene que quedar
    // aunque la cuenta desaparezca, que es justo cuando más falta hace.
    expect(row?.actorEmail).toBe('quien@ejemplo.com');
    expect(row?.actorId).toBe(user?.id);
  });

  it('T-58-3: guarda la IP truncada, nunca la completa', async () => {
    resetPruneClockForTests();

    await audit({ action: 'login.fail', ip: '192.168.1.37', userAgent: 'Mozilla/5.0' });

    const [row] = await rows();
    const meta = row?.meta as Record<string, unknown>;
    expect(meta['ip']).toBe('192.168.1.0');
    expect(JSON.stringify(meta)).not.toContain('192.168.1.37');
  });

  it('T-58-4: no guarda contraseñas ni tokens, sobre un intento de login real', async () => {
    resetPruneClockForTests();

    // El caso que de verdad ocurre: alguien pasa el cuerpo de la petición entero para
    // "tener contexto" y la contraseña se va a la base de datos con él.
    await audit({
      action: 'login.fail',
      actorEmail: 'ana@ejemplo.com',
      meta: {
        body: { email: 'ana@ejemplo.com', password: 'hunter2-secreto' },
        setupToken: 'tok_123456',
      },
    });

    const [row] = await rows();
    const serializado = JSON.stringify(row?.meta);

    expect(serializado).not.toContain('hunter2-secreto');
    expect(serializado).not.toContain('tok_123456');
    expect(serializado).toContain('redactado');
    // Y lo que no es secreto sigue ahí, o el registro no serviría para nada.
    expect(serializado).toContain('ana@ejemplo.com');
  });

  it('T-58-5: poda los registros de más de 90 días', async () => {
    resetPruneClockForTests();

    const ahora = Date.UTC(2026, 0, 1);
    const viejo = new Date(ahora - (RETENTION_DAYS + 1) * DAY_MS);
    const reciente = new Date(ahora - (RETENTION_DAYS - 1) * DAY_MS);

    await getDb().execute(sql`
      insert into audit_log (action, created_at) values
        ('viejo', ${viejo.toISOString()}),
        ('reciente', ${reciente.toISOString()})
    `);

    const borrados = await maybePrune(() => ahora);
    expect(borrados).toBe(1);

    const acciones = (await rows()).map((row) => row.action);
    expect(acciones).toEqual(['reciente']);
  });

  it('la poda no se ejecuta más de una vez por hora', async () => {
    resetPruneClockForTests();

    const ahora = Date.UTC(2026, 0, 1);
    await getDb().execute(sql`
      insert into audit_log (action, created_at)
      values ('viejo', ${new Date(ahora - (RETENTION_DAYS + 1) * DAY_MS).toISOString()})
    `);

    await maybePrune(() => ahora);

    // Segunda llamada inmediata: no debe volver a barrer la tabla. Podar en cada escritura
    // convertiría cada evento de auditoría en un recorrido completo de la tabla.
    await getDb().execute(sql`
      insert into audit_log (action, created_at)
      values ('otro-viejo', ${new Date(ahora - (RETENTION_DAYS + 1) * DAY_MS).toISOString()})
    `);
    const segunda = await maybePrune(() => ahora + 1000);
    expect(segunda).toBe(0);

    // Pasada la hora, sí.
    const tercera = await maybePrune(() => ahora + 60 * 60 * 1000 + 1);
    expect(tercera).toBe(1);
  });

  it('T-58-6: un fallo al auditar no tumba la operación, pero se ve', async () => {
    resetPruneClockForTests();

    const log: unknown[][] = [];

    // Una acción que viola el `not null` de la columna: el insert falla de verdad, no
    // simulado.
    await expect(
      audit(
        { action: undefined as unknown as string },
        { log: (message, error) => log.push([message, error]) }
      )
    ).resolves.toBeUndefined();

    expect(log).toHaveLength(1);
    expect(String(log[0]?.[0])).toContain('la operación continúa');
    // El error real se pasa al log; tragárselo dejaría creer que hay rastro cuando no lo hay.
    expect(log[0]?.[1]).toBeDefined();
  });
});
