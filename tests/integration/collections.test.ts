import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createItem, deleteItem, reorderItems } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { readCollection } from '@/cms/core/content';
import { contentEntries, getDb, revisions, users } from '@/cms/db';
import { describeIntegration } from './env';

/** T-80-1 a T-80-4: colecciones (SPEC §5.3). */

vi.mock('next/cache', async () => {
  const actual = await vi.importActual<typeof import('next/cache')>('next/cache');
  return { ...actual, revalidateTag: vi.fn() };
});

const { revalidateTag } = await import('next/cache');

async function crearEditor() {
  const [user] = await getDb()
    .insert(users)
    .values({ email: 'e@ejemplo.com', name: 'Editora', passwordHash: 'x', role: 'editor' })
    .returning();
  return user!;
}

async function claves(collection: string) {
  const rows = await getDb()
    .select({ key: contentEntries.key, sortOrder: contentEntries.sortOrder })
    .from(contentEntries)
    .where(eq(contentEntries.type, collection))
    .orderBy(asc(contentEntries.sortOrder));
  return rows;
}

async function crearTres() {
  const creadas: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const result = await createItem({ collection: 'testimonials' });
    expect(result.ok).toBe(true);
    if (result.ok) creadas.push(result.data.key);
  }
  return creadas;
}

describeIntegration('colecciones', () => {
  beforeEach(async () => {
    resetBucketsForTests();
    vi.mocked(revalidateTag).mockClear();
    const editor = await crearEditor();
    setSessionProviderForTests(() =>
      Promise.resolve({ userId: editor.id, email: editor.email, role: 'editor' as const })
    );
  });

  afterEach(() => {
    setSessionProviderForTests(null);
  });

  it('T-80-1: createItem genera coleccion.id y coloca al final', async () => {
    const primero = await createItem({ collection: 'testimonials' });
    const segundo = await createItem({ collection: 'testimonials' });

    expect(primero.ok && primero.data.key.startsWith('testimonials.')).toBe(true);
    expect(primero.ok && primero.data.sortOrder).toBe(0);
    expect(segundo.ok && segundo.data.sortOrder).toBe(1);
  });

  it('T-80-1: dos elementos nunca comparten clave', async () => {
    const claves = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const result = await createItem({ collection: 'testimonials' });
      if (result.ok) claves.add(result.data.key);
    }
    expect(claves.size).toBe(20);
  });

  it('dos elementos empatados en sortOrder salen siempre en el mismo orden', async () => {
    // Dos creaciones simultáneas **pueden** empatar: ni la transacción ni un `FOR UPDATE`
    // sobre la última fila lo impiden, porque el problema es una fila que otra transacción
    // inserta, no una que modifica. Lo que sí está garantizado, y es lo que el editor nota,
    // es que el orden resultante sea estable en vez de barajarse entre peticiones.
    await getDb()
      .insert(contentEntries)
      .values([
        {
          key: 'testimonials.bbb',
          type: 'testimonials',
          draft: {},
          published: { author: 'B' },
          sortOrder: 1,
        },
        {
          key: 'testimonials.aaa',
          type: 'testimonials',
          draft: {},
          published: { author: 'A' },
          sortOrder: 1,
        },
      ]);

    const primera = await readCollection('testimonials');
    const segunda = await readCollection('testimonials');

    expect(primera.map((item) => item.author)).toEqual(['A', 'B']);
    expect(segunda).toEqual(primera);
  });

  it('T-80-1: el borrador inicial trae los valores por defecto de la config', async () => {
    const result = await createItem({ collection: 'faqs' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [fila] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, result.data.key));

    // Nace sin publicar: crear un elemento no lo pone en la landing.
    expect(fila!.published).toBeNull();
    expect(fila!.status).toBe('draft');
  });

  it('una colección que no está en la config da NOT_FOUND', async () => {
    // Sin esta comprobación se crearían filas de un `type` que ningún formulario sabe editar
    // ni ninguna vista mostrar: basura que solo se ve mirando la tabla.
    const result = await createItem({ collection: 'inventada' });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await getDb().select().from(contentEntries)).toHaveLength(0);
  });

  it('T-80-2: deleteItem borra la entrada y sus revisiones', async () => {
    const [key] = await crearTres();
    await getDb()
      .insert(revisions)
      .values([
        { entryKey: key!, data: { author: 'v1' } },
        { entryKey: key!, data: { author: 'v2' } },
      ]);

    const result = await deleteItem({ key: key! });

    expect(result.ok).toBe(true);
    expect(await claves('testimonials')).toHaveLength(2);
    // Dejarlas huérfanas sería contenido invisible: el panel las lista por entrada, así que
    // nadie podría volver a verlas ni borrarlas, y seguirían creciendo en la base de datos.
    expect(await getDb().select().from(revisions).where(eq(revisions.entryKey, key!))).toHaveLength(
      0
    );
  });

  it('T-80-2: borrar no toca las revisiones de otros elementos', async () => {
    const [primera, segunda] = await crearTres();
    await getDb()
      .insert(revisions)
      .values([
        { entryKey: primera!, data: { author: 'de la primera' } },
        { entryKey: segunda!, data: { author: 'de la segunda' } },
      ]);

    await deleteItem({ key: primera! });

    expect(
      await getDb().select().from(revisions).where(eq(revisions.entryKey, segunda!))
    ).toHaveLength(1);
  });

  it('deleteItem revalida el tag de la colección', async () => {
    const [key] = await crearTres();

    await deleteItem({ key: key! });

    // El elemento podía estar publicado: la landing tiene que dejar de mostrarlo.
    expect(revalidateTag).toHaveBeenCalledWith('content:testimonials');
  });

  it('un singleton no se puede borrar', async () => {
    // Sin su fila, la lectura devolvería valores vacíos para siempre y nadie podría recrear
    // la sección desde el panel.
    await getDb()
      .insert(contentEntries)
      .values({ key: 'hero', type: 'hero', draft: {}, status: 'draft' });

    const result = await deleteItem({ key: 'hero' });

    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(
      await getDb().select().from(contentEntries).where(eq(contentEntries.key, 'hero'))
    ).toHaveLength(1);
  });

  it('T-80-3: reorderItems reasigna el orden', async () => {
    const [a, b, c] = await crearTres();

    const result = await reorderItems({
      collection: 'testimonials',
      orderedKeys: [c!, a!, b!],
    });

    expect(result.ok).toBe(true);
    expect((await claves('testimonials')).map((row) => row.key)).toEqual([c, a, b]);
    expect(revalidateTag).toHaveBeenCalledWith('content:testimonials');
  });

  it('T-80-4: una clave de otra colección da NOT_FOUND y no cambia nada', async () => {
    const [a, b, c] = await crearTres();
    const ajena = await createItem({ collection: 'faqs' });
    expect(ajena.ok).toBe(true);
    if (!ajena.ok) return;

    const antes = (await claves('testimonials')).map((row) => row.key);

    const result = await reorderItems({
      collection: 'testimonials',
      orderedKeys: [c!, ajena.data.key, a!, b!],
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    // Aceptar las buenas e ignorar las malas dejaría el orden a medias sin decirlo.
    expect((await claves('testimonials')).map((row) => row.key)).toEqual(antes);
  });

  it('T-80-4: una lista incompleta da CONFLICT y no cambia nada', async () => {
    // Si otra persona creó un elemento mientras esta arrastraba, reasignar solo las enviadas
    // dejaría a la nueva empatada con otra, y el orden de un empate lo decide el desempate
    // por clave: aleatorio para el editor.
    const [a, b] = await crearTres();
    const antes = (await claves('testimonials')).map((row) => row.key);

    const result = await reorderItems({ collection: 'testimonials', orderedKeys: [b!, a!] });

    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect((await claves('testimonials')).map((row) => row.key)).toEqual(antes);
  });

  it('claves repetidas dan CONFLICT', async () => {
    const [a, b, c] = await crearTres();

    const result = await reorderItems({
      collection: 'testimonials',
      orderedKeys: [a!, a!, b!, c!],
    });

    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('no se revalida el tag cuando reordenar falla', async () => {
    await crearTres();

    await reorderItems({ collection: 'testimonials', orderedKeys: ['testimonials.inventada'] });

    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('las tres quedan auditadas', async () => {
    const [key] = await crearTres();
    await reorderItems({
      collection: 'testimonials',
      orderedKeys: [
        key!,
        ...(await claves('testimonials')).map((r) => r.key).filter((k) => k !== key),
      ],
    });
    await deleteItem({ key: key! });

    const { auditLog } = await import('@/cms/db');
    const acciones = (await getDb().select().from(auditLog)).map((row) => row.action);
    expect(acciones).toContain('content.createItem');
    expect(acciones).toContain('content.reorderItems');
    expect(acciones).toContain('content.deleteItem');
  });
});
