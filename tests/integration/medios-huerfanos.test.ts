import { expect, it } from 'vitest';
import { compararMedios, pathnamesDeLaBase } from '@/scripts/medios-huerfanos.mjs';
import { getDb, media } from '@/cms/db';
import { databaseUrl, describeIntegration } from './env';

/**
 * T-206-1 y T-206-2 contra Postgres real (issue #206, ADR-705).
 *
 * Lo que la suite unitaria no puede: que la lectura de la base devuelva **lo que hay**. Allí la
 * comparación se ejercita con dos listas escritas a mano, y eso no dice nada sobre la consulta.
 *
 * El almacén sí se simula, y es lo correcto: listarlo de verdad exige una cuenta de Vercel Blob,
 * y lo que este fichero comprueba es el otro lado.
 */

async function ponerFila(pathname: string) {
  await getDb()
    .insert(media)
    .values({
      url: `https://ejemplo.test/${pathname}`,
      pathname,
      filename: pathname.split('/').pop() ?? pathname,
      mimeType: 'image/png',
      sizeBytes: 1,
    });
}

/** El `Pool` que espera el script, montado sobre la misma base que usa la suite. */
async function conPool<T>(
  usar: (pool: { query: (sql: string) => Promise<{ rows: { pathname: string }[] }> }) => Promise<T>
): Promise<T> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    return await usar(pool as never);
  } finally {
    await pool.end();
  }
}

describeIntegration('medios huérfanos', () => {
  it('T-206-1: un objeto en el almacén sin fila se detecta contra la base de verdad', async () => {
    await ponerFila('media/2026-09/conocida.png');

    const enBase = await conPool((pool) => pathnamesDeLaBase(pool));
    const { sinFila, sinFichero } = compararMedios(
      ['media/2026-09/conocida.png', 'media/2026-09/huerfana.png'],
      enBase
    );

    expect(sinFila).toEqual(['media/2026-09/huerfana.png']);
    expect(sinFichero).toEqual([]);
  });

  it('T-206-2: y una fila cuyo fichero no está, también', async () => {
    await ponerFila('media/2026-09/perdida.png');

    const enBase = await conPool((pool) => pathnamesDeLaBase(pool));

    expect(enBase).toContain('media/2026-09/perdida.png');
    expect(compararMedios([], enBase).sinFichero).toEqual(['media/2026-09/perdida.png']);
  });

  it('T-206-3: con todo en orden no señala nada, y la base no se toca', async () => {
    await ponerFila('media/2026-09/a.png');
    await ponerFila('media/2026-09/b.png');

    const antes = await conPool((pool) => pathnamesDeLaBase(pool));
    const resultado = compararMedios([...antes], antes);

    expect(resultado.sinFila).toEqual([]);
    expect(resultado.sinFichero).toEqual([]);

    // **Y sigue habiendo lo mismo.** Es la mitad de T-206-3 que la suite unitaria no puede
    // afirmar: que mirar no escribe.
    expect((await conPool((pool) => pathnamesDeLaBase(pool))).sort()).toEqual([...antes].sort());
  });
});
