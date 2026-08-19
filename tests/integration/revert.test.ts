import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { publish, restoreRevision, revertDraft } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { contentEntries, getDb, revisions, users } from '@/cms/db';
import { describeIntegration } from './env';

/** T-79-1 a T-79-4: deshacer (SPEC §5.3, §9). */

// `revalidateTag` necesita el contexto de petición de Next y lanza fuera de él (ADR-405).
// Aquí solo se usa de refilón, al comprobar que el borrador restaurado es publicable.
vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

async function crearEditor() {
  const [user] = await getDb()
    .insert(users)
    .values({ email: 'e@ejemplo.com', name: 'Editora', passwordHash: 'x', role: 'editor' })
    .returning();
  return user!;
}

async function crearEntrada(opciones: {
  key: string;
  type: string;
  draft: Record<string, unknown>;
  published?: Record<string, unknown> | null;
  status?: 'draft' | 'published' | 'changed';
}) {
  await getDb()
    .insert(contentEntries)
    .values({
      key: opciones.key,
      type: opciones.type,
      draft: opciones.draft,
      published: opciones.published ?? null,
      status: opciones.status ?? 'changed',
      version: 0,
    });
}

async function leer(key: string) {
  const [row] = await getDb().select().from(contentEntries).where(eq(contentEntries.key, key));
  return row!;
}

describeIntegration('deshacer', () => {
  beforeEach(async () => {
    resetBucketsForTests();
    const editor = await crearEditor();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: editor.id, email: editor.email, role: 'editor' as const })
    );
  });

  afterEach(() => {
    setSessionProviderForTests(null);
    vi.restoreAllMocks();
  });

  it('T-79-1: revertDraft deja el borrador igual que lo publicado', async () => {
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'Cambios que quiero descartar' },
      published: { title: 'Lo que está publicado' },
    });

    const result = await revertDraft({ key: 'hero' });

    expect(result.ok).toBe(true);
    const fila = await leer('hero');
    expect(fila.draft).toMatchObject({ title: 'Lo que está publicado' });
    expect(fila.status).toBe('published');
    // Y lo publicado no se toca: descartar cambios no es publicar.
    expect(fila.published).toMatchObject({ title: 'Lo que está publicado' });
  });

  it('T-79-1: revertDraft sube la versión', async () => {
    // Para el bloqueo optimista esto **es** una escritura. Sin subirla, un guardado en curso
    // con la versión vieja pisaría el descarte sin detectar el conflicto — y devolvería los
    // cambios que el editor acaba de tirar.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'a' },
      published: { title: 'b' },
    });

    const result = await revertDraft({ key: 'hero' });

    expect(result).toMatchObject({ ok: true, data: { version: 1 } });
  });

  it('T-79-2: sin nada publicado da NEVER_PUBLISHED y no toca el borrador', async () => {
    // Descartar exige tener algo a lo que volver. Vaciar el borrador sería destruir lo único
    // que existe.
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'Lo único que hay' },
      published: null,
    });

    const result = await revertDraft({ key: 'hero' });

    expect(result).toMatchObject({ ok: false, code: 'NEVER_PUBLISHED' });
    expect((await leer('hero')).draft).toMatchObject({ title: 'Lo único que hay' });
  });

  it('T-79-3: restoreRevision va al borrador y NO publica', async () => {
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'Lo de ahora' },
      published: { title: 'Lo publicado ahora' },
      status: 'published',
    });
    const [revision] = await getDb()
      .insert(revisions)
      .values({ entryKey: 'hero', data: { title: 'Lo de hace tres versiones' } })
      .returning();

    const result = await restoreRevision({ key: 'hero', revisionId: revision!.id });

    expect(result.ok).toBe(true);
    const fila = await leer('hero');
    expect(fila.draft).toMatchObject({ title: 'Lo de hace tres versiones' });
    expect(fila.status).toBe('changed');
    // Lo que importa: **el sitio público no ha cambiado**. Publicar aquí convertiría un clic
    // exploratorio en el historial en un cambio en producción (SPEC §9).
    expect(fila.published).toMatchObject({ title: 'Lo publicado ahora' });
  });

  it('T-79-4: una revisión de otra entrada da NOT_FOUND y no cambia nada', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: { title: 'hero' } });
    await crearEntrada({ key: 'about', type: 'about', draft: { heading: 'about' } });

    const [ajena] = await getDb()
      .insert(revisions)
      .values({ entryKey: 'about', data: { heading: 'Texto de otra sección' } })
      .returning();

    // Buscando la revisión solo por id, esto restauraría el texto de `about` dentro de
    // `hero`. No es un escalado de privilegios —el editor puede tocar todo el contenido—
    // pero sí un destrozo que nadie sabría explicar.
    const result = await restoreRevision({ key: 'hero', revisionId: ajena!.id });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect((await leer('hero')).draft).toMatchObject({ title: 'hero' });
  });

  it('restaurar una revisión anterior a un cambio de config no deja al editor encerrado', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await crearEntrada({ key: 'hero', type: 'hero', draft: { title: 'ahora' } });

    // Una revisión de cuando la config tenía otro campo, y con un tipo que ya no encaja.
    const [revision] = await getDb()
      .insert(revisions)
      .values({
        entryKey: 'hero',
        data: {
          title: 'Título que sí sigue valiendo',
          campoQueYaNoExiste: 'texto viejo',
          subtitle: 12345,
        },
      })
      .returning();

    const result = await restoreRevision({ key: 'hero', revisionId: revision!.id });
    expect(result.ok).toBe(true);

    const draft = (await leer('hero')).draft as Record<string, unknown>;

    // Lo que sigue encajando se conserva…
    expect(draft['title']).toBe('Título que sí sigue valiendo');
    // …y lo que no, se descarta. Sin esto, el formulario del panel —generado desde la
    // config— no pintaría esos campos y el publicado los rechazaría por desconocidos: el
    // editor no podría publicar ni arreglar lo que se lo impide, porque no lo ve.
    expect(draft).not.toHaveProperty('campoQueYaNoExiste');
    expect(draft).not.toHaveProperty('subtitle');
    expect(errores).toHaveBeenCalled();

    // La prueba de que no está encerrado: el borrador restaurado es publicable.
    const publicado = await publish({ key: 'hero', version: 1 });
    expect(publicado.ok).toBe(true);
  });

  it('revertDraft aplica el mismo filtro a lo publicado', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'cambios' },
      published: { title: 'publicado', campoFantasma: 'de otra época' },
    });

    const result = await revertDraft({ key: 'hero' });
    expect(result.ok).toBe(true);

    const draft = (await leer('hero')).draft as Record<string, unknown>;
    expect(draft['title']).toBe('publicado');
    expect(draft).not.toHaveProperty('campoFantasma');
    expect(errores).toHaveBeenCalled();
  });

  it('una revisión que no existe da NOT_FOUND', async () => {
    await crearEntrada({ key: 'hero', type: 'hero', draft: { title: 'hero' } });

    const result = await restoreRevision({
      key: 'hero',
      revisionId: '00000000-0000-4000-8000-000000000000',
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('un revisionId que no es un uuid se rechaza antes de tocar la base de datos', async () => {
    const result = await restoreRevision({ key: 'hero', revisionId: "'; drop table users; --" });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('una clave que no existe da NOT_FOUND en las dos', async () => {
    expect(await revertDraft({ key: 'no-existe' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(
      await restoreRevision({
        key: 'no-existe',
        revisionId: '00000000-0000-4000-8000-000000000000',
      })
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('las dos quedan auditadas con la clave como objetivo', async () => {
    await crearEntrada({
      key: 'hero',
      type: 'hero',
      draft: { title: 'a' },
      published: { title: 'b' },
    });

    await revertDraft({ key: 'hero' });

    const { auditLog } = await import('@/cms/db');
    const [row] = await getDb().select().from(auditLog);
    expect(row).toMatchObject({
      action: 'content.revertDraft',
      targetType: 'content',
      targetId: 'hero',
    });
  });
});
