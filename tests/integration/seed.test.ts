import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import appConfig from '@/cms.config';
import { seedSingletons } from '@/cms/core/seed';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-42-1 a T-42-4: el seed de singletons (SPEC §5.1).
 */

const singletonKeys = Object.keys(appConfig.singletons);

describeIntegration('seed de singletons', () => {
  it('T-42-1: crea una fila por singleton ausente', async () => {
    const result = await seedSingletons();

    expect(result.created.sort()).toEqual([...singletonKeys].sort());
    expect(result.untouched).toEqual([]);

    const rows = await getDb().select().from(contentEntries);
    expect(rows).toHaveLength(singletonKeys.length);
  });

  it('las filas nuevas nacen en el estado que dice SPEC §4', async () => {
    await seedSingletons();

    const [hero] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'hero'));

    expect(hero?.status).toBe('draft');
    expect(hero?.published).toBeNull();
    expect(hero?.publishedAt).toBeNull();
    expect(hero?.version).toBe(0);
    expect(hero?.type).toBe('hero');
  });

  it('T-42-2: es idempotente', async () => {
    await seedSingletons();
    const second = await seedSingletons();

    expect(second.created).toEqual([]);
    expect(second.untouched.sort()).toEqual([...singletonKeys].sort());

    const rows = await getDb().select().from(contentEntries);
    expect(rows).toHaveLength(singletonKeys.length);
  });

  it('T-42-3: NO pisa un borrador existente', async () => {
    // El requisito central. Esta función corre en cada arranque; si sobreescribiera, cada
    // reinicio borraría lo que el editor llevara escrito sin publicar, y sin dejar rastro.
    await seedSingletons();

    const editado = { title: 'Lo que escribió el editor', subtitle: 'A medias' };
    await getDb()
      .update(contentEntries)
      .set({ draft: editado, status: 'changed', version: 7 })
      .where(eq(contentEntries.key, 'hero'));

    await seedSingletons();

    const [hero] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'hero'));

    expect(hero?.draft).toEqual(editado);
    expect(hero?.status).toBe('changed');
    expect(hero?.version).toBe(7);
  });

  it('T-42-4: aplica los `default` de la config', async () => {
    await seedSingletons();

    const [about] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'about'));

    // `visible: s.boolean({ default: true })` en cms.config.ts.
    expect(about?.draft).toEqual({ visible: true });

    // `hero` no tiene ningún default, así que su borrador nace vacío.
    const [hero] = await getDb()
      .select()
      .from(contentEntries)
      .where(eq(contentEntries.key, 'hero'));
    expect(hero?.draft).toEqual({});
  });

  it('siembra solo los que faltan, sin tocar los presentes', async () => {
    await getDb()
      .insert(contentEntries)
      .values({ key: 'seo', type: 'seo', draft: { title: 'Ya estaba' } });

    const result = await seedSingletons();

    expect(result.untouched).toEqual(['seo']);
    expect(result.created.sort()).toEqual(singletonKeys.filter((key) => key !== 'seo').sort());

    const [seo] = await getDb().select().from(contentEntries).where(eq(contentEntries.key, 'seo'));
    expect(seo?.draft).toEqual({ title: 'Ya estaba' });
  });
});
