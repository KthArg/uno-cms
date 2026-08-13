import { expect, it } from 'vitest';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-41-2, segunda mitad. Ver `isolation-a.test.ts`: los dos ficheros insertan la misma
 * clave, que es única. Sin limpieza entre ficheros, uno de los dos falla.
 */
describeIntegration('aislamiento entre ficheros (B)', () => {
  it('puede insertar la misma clave que el otro fichero', async () => {
    await getDb()
      .insert(contentEntries)
      .values({ key: 'clave-compartida', type: 'hero', draft: { title: 'desde B' } });

    const rows = await getDb().select().from(contentEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.draft).toEqual({ title: 'desde B' });
  });
});
