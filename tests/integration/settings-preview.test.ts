import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewToken, updateSettings } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { readSettings, SETTINGS_TAG } from '@/cms/core/settings';
import { getDb, settings, users } from '@/cms/db';
import { verifyToken } from '@/cms/security/tokens';
import { describeIntegration } from './env';

/** T-82-1 y T-82-2: ajustes y token de vista previa (SPEC §5.3). */

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

const { revalidateTag } = await import('next/cache');

async function crearUsuario(role: 'admin' | 'editor') {
  const [user] = await getDb()
    .insert(users)
    .values({ email: `${role}@ejemplo.com`, name: 'Persona', passwordHash: 'x', role })
    .returning();
  setSessionProviderForTests(() => Promise.resolve({ userId: user!.id, email: user!.email, role }));
  return user!;
}

describeIntegration('ajustes y vista previa', () => {
  beforeEach(() => {
    resetBucketsForTests();
    vi.mocked(revalidateTag).mockClear();
    vi.stubEnv('APP_SECRET', 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.unstubAllEnvs();
  });

  it('T-82-1: un editor no puede cambiar los ajustes', async () => {
    await crearUsuario('editor');

    const result = await updateSettings({ key: 'site', value: { siteName: 'Otro' } });

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await getDb().select().from(settings)).toHaveLength(0);
  });

  it('T-82-1: un admin sí, y se revalida el tag global', async () => {
    await crearUsuario('admin');

    const result = await updateSettings({ key: 'site', value: { siteName: 'Mi Empresa Nueva' } });

    expect(result.ok).toBe(true);
    const [fila] = await getDb().select().from(settings).where(eq(settings.key, 'site'));
    expect(fila!.value).toMatchObject({ siteName: 'Mi Empresa Nueva' });
    // Los ajustes se leen en el layout: un cambio afecta a todas las páginas.
    expect(revalidateTag).toHaveBeenCalledWith(SETTINGS_TAG);
  });

  it('un valor que no pasa el esquema se rechaza y no se guarda', async () => {
    await crearUsuario('admin');

    const result = await updateSettings({ key: 'site', value: { siteName: '' } });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await getDb().select().from(settings)).toHaveLength(0);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('una clave desconocida en el valor se rechaza, no se guarda en silencio', async () => {
    await crearUsuario('admin');

    // `strict()`: guardar un campo que ninguna pantalla puede volver a editar es basura que
    // solo se ve mirando la tabla.
    const result = await updateSettings({
      key: 'site',
      value: { siteName: 'Válido', campoInventado: 'x' },
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('actualizar dos veces sobreescribe en lugar de fallar', async () => {
    await crearUsuario('admin');

    await updateSettings({ key: 'site', value: { siteName: 'Primero' } });
    await updateSettings({ key: 'site', value: { siteName: 'Segundo' } });

    const filas = await getDb().select().from(settings).where(eq(settings.key, 'site'));
    expect(filas).toHaveLength(1);
    expect(filas[0]!.value).toMatchObject({ siteName: 'Segundo' });
  });

  it('readSettings cae a los valores por defecto si no hay fila', async () => {
    // Una instalación recién desplegada no tiene ajustes guardados y tiene que renderizar.
    const site = await readSettings('site');

    expect(site['siteName']).toBe('Mi Empresa');
  });

  it('readSettings no se cae si lo guardado ya no encaja con su esquema', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await getDb()
      .insert(settings)
      .values({ key: 'site', value: { siteName: 12345 } });

    // Mismo criterio que ADR-404: un ajuste que dejó de encajar no puede tumbar el sitio.
    const site = await readSettings('site');

    expect(site['siteName']).toBe('Mi Empresa');
    expect(errores).toHaveBeenCalled();
    errores.mockRestore();
  });

  it('T-82-2: createPreviewToken emite un token válido de 2 h para esa clave', async () => {
    await crearUsuario('editor');

    const result = await createPreviewToken({ key: 'hero' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.expiresInSeconds).toBe(2 * 60 * 60);

    const verificado = verifyToken('preview', result.data.token);
    expect(verificado.ok).toBe(true);
    // La clave va **dentro** del token firmado: sin ella, el enlace compartible de §6.1 sería
    // una llave maestra que abre la vista previa de cualquier entrada.
    expect(verificado.ok && verificado.data['key']).toBe('hero');
  });

  it('T-82-2: el token de vista previa no vale para otro propósito', async () => {
    await crearUsuario('editor');

    const result = await createPreviewToken({ key: 'hero' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(verifyToken('setup', result.data.token).ok).toBe(false);
    expect(verifyToken('password-reset', result.data.token).ok).toBe(false);
  });

  it('un ogImageUrl con destino no permitido se rechaza', async () => {
    await crearUsuario('admin');

    // El criterio de qué destino es aceptable está en `isSafeLink` y se reutiliza aquí. Sin
    // esto entraría cualquier cadena en una URL que sale en el HTML de todas las páginas.
    const result = await updateSettings({
      key: 'seo',
      value: { ogImageUrl: 'javascript:alert(1)' },
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await getDb().select().from(settings)).toHaveLength(0);
  });

  it('un ogImageUrl con ruta interna o https sí se acepta', async () => {
    await crearUsuario('admin');

    expect((await updateSettings({ key: 'seo', value: { ogImageUrl: '/og.png' } })).ok).toBe(true);
    expect(
      (await updateSettings({ key: 'seo', value: { ogImageUrl: 'https://ejemplo.com/og.png' } })).ok
    ).toBe(true);
  });

  it('createPreviewToken no firma tokens para claves que no existen', async () => {
    await crearUsuario('editor');

    // Un token firmado es una afirmación. Sin esta comprobación diría "esta clave es
    // previsualizable" sin haberlo comprobado, y el problema aparecería en M5.
    expect(await createPreviewToken({ key: 'inventada' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('createPreviewToken sí firma para un elemento de colección', async () => {
    await crearUsuario('editor');

    // Las claves de elemento son `coleccion.id`: lo que se valida es la colección.
    const result = await createPreviewToken({ key: 'testimonials.abc-123' });

    expect(result.ok).toBe(true);
  });

  it('no se puede tocar setup_completed a través de los ajustes', async () => {
    await crearUsuario('admin');

    // Es la fila que decide si `/setup` está abierto (SPEC §7.3). La entrada es un `enum`, así
    // que queda fuera de alcance.
    const result = await updateSettings({
      key: 'setup_completed' as 'site',
      value: { completedAt: null },
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('el token no queda registrado en la auditoría', async () => {
    await crearUsuario('editor');

    const result = await createPreviewToken({ key: 'hero' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { auditLog } = await import('@/cms/db');
    const filas = await getDb().select().from(auditLog);
    expect(JSON.stringify(filas)).not.toContain(result.data.token);
    expect(filas[0]?.targetId).toBe('hero');
  });

  it('sin sesión no se emite ningún token', async () => {
    setSessionProviderForTests(() => Promise.resolve(null));

    expect(await createPreviewToken({ key: 'hero' })).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    });
  });
});
