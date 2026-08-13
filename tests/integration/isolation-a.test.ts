import { expect, it } from 'vitest';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-41-2, primera mitad. Este fichero y `isolation-b.test.ts` insertan **la misma clave**,
 * que tiene índice único. Si la limpieza entre tests no funcionara, el segundo en ejecutarse
 * fallaría con violación de unicidad.
 *
 * Un mecanismo de limpieza que nadie ejercita es un mecanismo del que no se sabe nada. Y el
 * modo en que falla —según el orden de ejecución— es de los peores de diagnosticar, así que
 * conviene que falle aquí, donde el nombre del test dice qué pasa.
 */
describeIntegration('aislamiento entre ficheros (A)', () => {
  it('inserta la clave compartida y deja la base sucia a propósito', async () => {
    await getDb()
      .insert(contentEntries)
      .values({ key: 'clave-compartida', type: 'hero', draft: { title: 'desde A' } });

    const rows = await getDb().select().from(contentEntries);
    expect(rows).toHaveLength(1);
  });

  it('el test anterior no deja rastro en este', async () => {
    // T-41-2 dentro de un mismo fichero: el `beforeEach` global ya ha limpiado.
    const rows = await getDb().select().from(contentEntries);
    expect(rows).toHaveLength(0);
  });
});
