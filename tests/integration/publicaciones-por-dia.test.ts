import { beforeEach, expect, it } from 'vitest';
import { contentEntries, getDb, revisions } from '@/cms/db';
import {
  DIAS_DE_LA_VENTANA,
  publicacionesPorDia,
  totalDeLaVentana,
} from '@/cms/core/publicaciones';
import { describeIntegration } from './env';

/**
 * T-216-3: **la serie de publicaciones cuenta lo que dice contar** (spec 12 §7, ADR-812).
 *
 * ## Por qué esto es de integración y no unitario
 *
 * Porque lo que puede fallar es la consulta, no la aritmética. El `not exists` que recoge las
 * entradas publicadas **una sola vez** —las que no dejaron revisión, y por tanto las que una
 * implementación ingenua se dejaría— solo se ejercita contra Postgres.
 *
 * ## El caso que de verdad importa
 *
 * `revisions` no es una tabla de publicaciones: la revisión solo se crea si ya había algo
 * publicado (ADR-402). Contar solo revisiones deja fuera la primera publicación de cada entrada,
 * que en un sitio recién estrenado **son todas**. La gráfica saldría plana a cero justo el día
 * que alguien publica su web por primera vez.
 */

function haceDias(dias: number): Date {
  const momento = new Date();
  momento.setHours(12, 0, 0, 0);
  momento.setDate(momento.getDate() - dias);

  return momento;
}

/** El día de un `Date` en la zona local, igual que lo calcula el módulo. */
function clave(momento: Date): string {
  const mes = String(momento.getMonth() + 1).padStart(2, '0');
  const dia = String(momento.getDate()).padStart(2, '0');

  return `${String(momento.getFullYear())}-${mes}-${dia}`;
}

async function crearEntrada(key: string, publishedAt: Date | null): Promise<void> {
  await getDb()
    .insert(contentEntries)
    .values({
      key,
      type: 'faqs',
      draft: { question: key },
      published: publishedAt === null ? null : { question: key },
      status: publishedAt === null ? 'changed' : 'published',
      publishedAt,
    });
}

async function crearRevision(key: string, publishedAt: Date): Promise<void> {
  await getDb()
    .insert(revisions)
    .values({ entryKey: key, data: { question: 'lo de antes' }, publishedAt });
}

describeIntegration('T-216-3 — publicaciones por día', () => {
  beforeEach(async () => {
    await getDb().delete(revisions);
    await getDb().delete(contentEntries);
  });

  it('sin nada publicado, la serie existe y está a cero', async () => {
    const serie = await publicacionesPorDia();

    // **La serie trae todos los días, no solo los que tienen algo.** Una que omitiera los ceros
    // se dibujaría como una línea continua y haría parecer constante lo que fueron tres días
    // sueltos.
    expect(serie).toHaveLength(DIAS_DE_LA_VENTANA);
    expect(totalDeLaVentana(serie)).toBe(0);
  });

  it('cuenta la entrada publicada UNA sola vez, que no deja revisión', async () => {
    // **Este es el caso que se sale de `revisions` y el que justifica media consulta.** Una
    // implementación que solo mirara revisiones daría cero aquí — y cero es justo lo que vería
    // quien acaba de publicar su web por primera vez.
    const ayer = haceDias(1);
    await crearEntrada('faqs.una-vez', ayer);

    const serie = await publicacionesPorDia();

    expect(totalDeLaVentana(serie)).toBe(1);
    expect(serie.find((dia) => dia.dia === clave(ayer))?.publicaciones).toBe(1);
  });

  it('cuenta cada revisión, que es cada vez que se sustituyó algo publicado', async () => {
    const hoy = haceDias(0);
    const anteayer = haceDias(2);

    await crearEntrada('faqs.varias', hoy);
    await crearRevision('faqs.varias', hoy);
    await crearRevision('faqs.varias', anteayer);

    const serie = await publicacionesPorDia();

    // Dos revisiones, y **la fecha de `content_entries` no se suma**: esa entrada ya tiene
    // revisiones, así que su publicación más reciente es la que creó la revisión de hoy.
    // Sumarla sería contar la misma publicación dos veces.
    expect(totalDeLaVentana(serie)).toBe(2);
    expect(serie.find((dia) => dia.dia === clave(hoy))?.publicaciones).toBe(1);
    expect(serie.find((dia) => dia.dia === clave(anteayer))?.publicaciones).toBe(1);
  });

  it('deja fuera lo anterior a la ventana', async () => {
    await crearEntrada('faqs.vieja', haceDias(DIAS_DE_LA_VENTANA + 5));
    await crearEntrada('faqs.reciente', haceDias(1));

    expect(totalDeLaVentana(await publicacionesPorDia())).toBe(1);
  });

  it('y no cuenta lo que nunca se publicó', async () => {
    // Sin esto, una consulta que se dejara el filtro de `published_at` contaría los borradores
    // como publicaciones y la gráfica subiría al escribir, no al publicar.
    await crearEntrada('faqs.borrador', null);

    expect(totalDeLaVentana(await publicacionesPorDia())).toBe(0);
  });

  it('suma las dos fuentes sin pisarse', async () => {
    // El caso completo: una entrada publicada una sola vez y otra con historia, el mismo día.
    const hoy = haceDias(0);

    await crearEntrada('faqs.una-vez', hoy);
    await crearEntrada('faqs.con-historia', hoy);
    await crearRevision('faqs.con-historia', hoy);

    const serie = await publicacionesPorDia();

    expect(serie.find((dia) => dia.dia === clave(hoy))?.publicaciones).toBe(2);
  });
});
