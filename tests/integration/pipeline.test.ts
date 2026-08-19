import { z } from 'zod';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  defineAction,
  fail,
  ok,
  resetBucketsForTests,
  setSessionProviderForTests,
  type ActionResult,
  type ActionSession,
} from '@/cms/actions/pipeline';
import { auditLog, contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-75-1 a T-75-6: el envoltorio de las server actions (SPEC §5.3, §7.1).
 *
 * Van contra Postgres real porque lo que hay que demostrar no es que la función devuelva el
 * código correcto, sino que **no se escribe nada** cuando no debe. Un test que solo mirase
 * la respuesta pasaría igual con una action que rechaza después de haber insertado.
 */

const EDITOR: ActionSession = {
  userId: crypto.randomUUID(),
  email: 'ed@ejemplo.com',
  role: 'editor',
};
const ADMIN: ActionSession = {
  userId: crypto.randomUUID(),
  email: 'ad@ejemplo.com',
  role: 'admin',
};

function sesion(session: ActionSession | null) {
  setSessionProviderForTests(() => Promise.resolve(session));
}

/** Una action de prueba que escribe de verdad, para poder comprobar que NO escribe. */
const escribir = defineAction({
  name: 'test.escribir',
  role: 'editor',
  bucket: 'saveDraft',
  input: z.object({ key: z.string().min(1) }),
  targetType: 'content',
  targetId: (input) => input.key,
  handler: async (input) => {
    await getDb().insert(contentEntries).values({ key: input.key, type: 'hero', draft: {} });
    return ok({ key: input.key });
  },
});

const soloAdmin = defineAction({
  name: 'test.admin',
  role: 'admin',
  bucket: 'admin',
  input: z.object({}),
  handler: async () => {
    await getDb().insert(contentEntries).values({ key: 'admin-escribio', type: 'hero', draft: {} });
    return ok(true);
  },
});

const revienta = defineAction({
  name: 'test.revienta',
  role: 'editor',
  bucket: 'saveDraft',
  input: z.object({}),
  handler: async () => {
    throw new Error('secreto-interno-que-no-debe-salir');
  },
});

async function filas() {
  return getDb().select().from(contentEntries);
}

describeIntegration('envoltorio de actions', () => {
  beforeEach(() => {
    resetBucketsForTests();
    sesion(EDITOR);
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.restoreAllMocks();
  });

  it('T-75-1: sin sesión devuelve UNAUTHORIZED y NO escribe', async () => {
    sesion(null);

    const result = await escribir({ key: 'hero' });

    expect(result).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(await filas(), 'no debe haberse insertado nada').toHaveLength(0);
  });

  it('T-75-2: rol insuficiente devuelve FORBIDDEN y NO escribe', async () => {
    sesion(EDITOR);

    const result = await soloAdmin({});

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await filas()).toHaveLength(0);
  });

  it('un admin puede ejecutar lo que exige rol editor, pero no al revés', async () => {
    sesion(ADMIN);
    expect((await escribir({ key: 'hero' })).ok).toBe(true);

    sesion(ADMIN);
    expect((await soloAdmin({})).ok).toBe(true);
  });

  it('el rol sale de la sesión, nunca del input', async () => {
    // Si el envoltorio leyera el rol del payload, esto pasaría. Es el error que convierte
    // "chequeo de rol en el servidor" en decorativo.
    sesion(EDITOR);

    // Se llama a través de un tipo laxo a propósito: quien invoca una Server Action de
    // verdad es una petición HTTP, y ahí no hay tipos que valgan. El tipado del envoltorio
    // es comodidad para el panel, no una barrera.
    const comoLaLlamaLaRed = soloAdmin as (raw: unknown) => Promise<ActionResult<unknown>>;
    const result = await comoLaLlamaLaRed({ role: 'admin' });

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('T-75-3: input inválido devuelve VALIDATION_FAILED con los campos', async () => {
    const result = await escribir({ key: '' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok === false && result.fields?.[0]?.path).toBe('key');
    expect(await filas()).toHaveLength(0);
  });

  it('T-75-4: una excepción interna se convierte en INTERNAL sin filtrar el mensaje', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await revienta({});

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL' });
    // Lo que importa: el detalle no sale hacia el cliente.
    expect(JSON.stringify(result)).not.toContain('secreto-interno-que-no-debe-salir');
    // Pero sí queda en el log del servidor: tragárselo dejaría el fallo invisible.
    expect(spy).toHaveBeenCalled();
  });

  it('los mensajes van en español llano, sin jerga técnica', async () => {
    sesion(null);
    const result = await escribir({ key: 'hero' });

    expect(result.ok === false && result.message).toBe('Inicia sesión para continuar.');
  });

  it('T-75-5: cada operación queda auditada con actor y acción', async () => {
    await escribir({ key: 'hero' });

    const [row] = await getDb().select().from(auditLog);
    expect(row?.action).toBe('test.escribir');
    expect(row?.actorId).toBe(EDITOR.userId);
    expect(row?.actorEmail).toBe(EDITOR.email);
    expect(row?.targetType).toBe('content');
    expect(row?.targetId).toBe('hero');
  });

  it('T-75-7: los rechazos también se auditan, con su código', async () => {
    sesion(EDITOR);
    await soloAdmin({});

    // Un rechazo por rol es exactamente lo que interesa tener registrado.
    const [row] = await getDb().select().from(auditLog);
    expect(row?.action).toBe('test.admin.rejected');
    expect(row?.actorEmail).toBe(EDITOR.email);
    expect(row?.meta).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un input inválido también queda auditado', async () => {
    await escribir({ key: '' });

    const [row] = await getDb().select().from(auditLog);
    expect(row?.action).toBe('test.escribir.rejected');
    expect(row?.meta).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('T-75-8: sin sesión NO se audita: sería una escritura por petición anónima', async () => {
    // La regla es "se audita lo que pasa el límite". Un anónimo no lo pasa nunca, y
    // registrarlo dejaría que cualquiera en internet haga crecer la tabla.
    sesion(null);
    await escribir({ key: 'hero' });

    expect(await getDb().select().from(auditLog)).toHaveLength(0);
  });

  it('T-75-9: un rechazo por rol consume cuota, y con ella deja de auditarse', async () => {
    // Si el rechazo saliera gratis, un editor en bucle contra una action de admin
    // escribiría filas de auditoría sin tope. Consumir cuota acota cuántas caben.
    sesion(EDITOR);

    for (let i = 0; i < 20; i += 1) {
      expect((await soloAdmin({})).ok, `intento ${i + 1}`).toBe(false);
    }

    // El 21.º sigue siendo FORBIDDEN —el rol se decide antes que el límite (SPEC §5.3)—
    // pero ya no escribe.
    expect(await soloAdmin({})).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await getDb().select().from(auditLog)).toHaveLength(20);
  });

  it('RATE_LIMITED no se audita', async () => {
    const gastar = defineAction({
      name: 'test.sinAuditar',
      role: 'editor',
      bucket: 'admin',
      input: z.object({}),
      handler: async () => ok(true),
    });

    for (let i = 0; i < 20; i += 1) await gastar({});
    const antes = (await getDb().select().from(auditLog)).length;

    expect(await gastar({})).toMatchObject({ ok: false, code: 'RATE_LIMITED' });

    // Auditar lo que el límite acaba de frenar convierte la protección en el gasto que
    // pretendía evitar.
    expect(await getDb().select().from(auditLog)).toHaveLength(antes);
  });

  it('el límite corta y devuelve RATE_LIMITED', async () => {
    const gastar = defineAction({
      name: 'test.limite',
      role: 'editor',
      bucket: 'admin', // 20 por 5 min
      input: z.object({}),
      handler: async () => ok(true),
    });

    for (let i = 0; i < 20; i += 1) {
      expect((await gastar({})).ok, `intento ${i + 1}`).toBe(true);
    }

    expect(await gastar({})).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });

  it('T-77-6: la cuota de saveDraft aguanta el autosave de SPEC §8', async () => {
    // El autosave guarda cada 2 s tras el último tecleo. Con una cuota estricta, el CMS
    // dejaría de guardar a los diez segundos de escribir y el editor lo viviría como
    // pérdida de su trabajo.
    const guardar = defineAction({
      name: 'test.autosave',
      role: 'editor',
      bucket: 'saveDraft',
      input: z.object({}),
      handler: async () => ok(true),
    });

    for (let i = 0; i < 100; i += 1) {
      expect((await guardar({})).ok, `guardado ${i + 1}`).toBe(true);
    }
  });

  it('la cuota es por usuario, no global', async () => {
    const gastar = defineAction({
      name: 'test.porUsuario',
      role: 'editor',
      bucket: 'admin',
      input: z.object({}),
      handler: async () => ok(true),
    });

    sesion(EDITOR);
    for (let i = 0; i < 20; i += 1) await gastar({});
    expect(await gastar({})).toMatchObject({ ok: false, code: 'RATE_LIMITED' });

    // Otro usuario tiene su propia cuota: si fuera global, un editor podría bloquear a los
    // demás simplemente trabajando mucho.
    sesion(ADMIN);
    expect((await gastar({})).ok).toBe(true);
  });

  it('un targetId que lanza no tumba la operación ni escapa del envoltorio', async () => {
    // El hueco que esto cierra: el cálculo del objetivo de auditoría lo escribe quien define
    // la action, y si lanzara fuera de la protección la excepción saldría de la Server
    // Action tal cual — el error genérico de Next que ADR-400 existe para evitar.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const conTargetRoto = defineAction({
      name: 'test.targetRoto',
      role: 'editor',
      bucket: 'saveDraft',
      input: z.object({}),
      targetType: 'content',
      targetId: () => {
        throw new Error('el callback de auditoría revienta');
      },
      handler: async () => ok('guardado'),
    });

    // Lo que importa: la operación se completa. El objetivo es un dato de auditoría, no de
    // negocio, y perderlo no puede costar el trabajo del editor.
    await expect(conTargetRoto({})).resolves.toMatchObject({ ok: true, data: 'guardado' });

    const [row] = await getDb().select().from(auditLog);
    expect(row?.action).toBe('test.targetRoto');
    expect(row?.targetId).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('los errores de campo van en español y no devuelven el valor recibido', async () => {
    const conEnum = defineAction({
      name: 'test.enum',
      role: 'editor',
      bucket: 'saveDraft',
      input: z.object({ estado: z.enum(['borrador', 'publicado']) }),
      handler: async () => ok(true),
    });

    const laRed = conEnum as unknown as (raw: unknown) => Promise<ActionResult<unknown>>;
    const result = await laRed({ estado: '<script>ojo</script>' });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.fields?.[0]?.message).toBe('Elige una de las opciones disponibles.');
    // Zod, por defecto, incluiría el valor recibido en el mensaje. React lo escaparía al
    // pintarlo, pero devolver entrada del usuario sin motivo no aporta nada al editor.
    expect(JSON.stringify(result)).not.toContain('script');
  });

  it('un campo obligatorio que falta lo dice en español', async () => {
    const result = await escribir({} as { key: string });

    expect(result.ok === false && result.fields?.[0]).toMatchObject({
      path: 'key',
      message: 'Este campo es obligatorio.',
    });
  });

  it('un fallo devuelto por el handler no se convierte en INTERNAL', async () => {
    const conflicto = defineAction({
      name: 'test.conflicto',
      role: 'editor',
      bucket: 'saveDraft',
      input: z.object({}),
      handler: async () => fail('VERSION_CONFLICT'),
    });

    const result = await conflicto({});
    expect(result).toMatchObject({
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'Otra persona guardó cambios mientras editabas.',
    });
  });
});
