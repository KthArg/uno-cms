import 'server-only';
import { gte, sql } from 'drizzle-orm';
import { contentEntries, getDb, revisions } from '@/cms/db';

/**
 * Cuántas veces se ha publicado, por día (spec 12 §7, ADR-812).
 *
 * Vive en `cms/core` y no junto a las actions por lo que enseñó el PR #97: **leer no es
 * mutar**, y el test T-75-6 exige que todo lo exportado desde `cms/actions` pase por el
 * envoltorio.
 *
 * ## Lo que esta serie cuenta, y lo que no puede contar
 *
 * Este CMS no tiene analítica: no hay visitas, ni usuarios activos, ni ventas. Lo único con
 * historia es `revisions`, y **no cuenta lo que parece**:
 *
 * 1. La revisión solo se crea **si ya había algo publicado** (ADR-402), así que la primera
 *    publicación de una entrada no genera ninguna.
 * 2. Su `published_at` es `defaultNow()`: marca **cuándo se sustituyó**, no cuándo se publicó
 *    lo que guarda dentro.
 * 3. Se podan a 20 por entrada (`SPEC.md` §4).
 *
 * De ahí sale lo que se consulta: **las revisiones de la ventana, más la fecha de publicación
 * de las entradas que no tienen ninguna revisión** — o sea, las publicadas una sola vez, que
 * son las que se salen de `revisions` y las que una implementación ingenua se dejaría.
 *
 * **Y lo que no ve**, escrito aquí para que nadie lo descubra creyendo que es un fallo: si una
 * entrada se publica por primera vez y se republica **dentro de la misma ventana**, la primera
 * publicación no aparece. Su fecha no está registrada en ninguna parte del esquema — no es que
 * la consulta la ignore, es que no existe.
 *
 * Puede subcontar, nunca sobrecontar. De los dos lados en los que se puede fallar, es el que no
 * infla.
 */

/** Los días que mira la tarjeta. Dos semanas: suficiente para ver un ritmo, poco para un hueco. */
export const DIAS_DE_LA_VENTANA = 14;

export interface DiaConPublicaciones {
  /** El día, en `YYYY-MM-DD` y en la zona del servidor. */
  readonly dia: string;
  readonly publicaciones: number;
}

/**
 * La serie, un punto por día, **incluidos los días sin nada**.
 *
 * Los ceros importan: una serie que solo trae los días con actividad se dibuja como una línea
 * continua y hace parecer constante lo que fueron tres días sueltos.
 */
export async function publicacionesPorDia(
  dias = DIAS_DE_LA_VENTANA
): Promise<DiaConPublicaciones[]> {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  const db = getDb();

  const [deRevisiones, dePrimeras] = await Promise.all([
    db
      .select({ momento: revisions.publishedAt })
      .from(revisions)
      .where(gte(revisions.publishedAt, desde)),

    // Las entradas publicadas **una sola vez**: su publicación no dejó revisión, así que la
    // única fecha que tiene es la suya. El `not exists` y no un `left join`: con join habría
    // que desduplicar después, y una entrada con veinte revisiones traería veinte filas para
    // decidir una cosa que es sí o no.
    db
      .select({ momento: contentEntries.publishedAt })
      .from(contentEntries)
      .where(
        sql`${contentEntries.publishedAt} >= ${desde} and not exists (
          select 1 from ${revisions} where ${revisions.entryKey} = ${contentEntries.key}
        )`
      ),
  ]);

  const cuenta = new Map<string, number>();

  // Todos los días de la ventana a cero, y **antes** de contar nada: si se rellenaran después
  // solo los que faltan, un día con actividad que cayera fuera de la ventana por un desfase de
  // zona horaria se colaría como un punto extra al final de la serie.
  for (let i = 0; i < dias; i += 1) {
    const dia = new Date(desde);
    dia.setDate(desde.getDate() + i);
    cuenta.set(claveDelDia(dia), 0);
  }

  for (const { momento } of [...deRevisiones, ...dePrimeras]) {
    if (momento === null) continue;

    const clave = claveDelDia(momento);
    // Solo si el día está en la ventana. La consulta ya filtra por fecha, pero el corte lo hace
    // Postgres con su zona y la clave se calcula aquí con la del proceso: en el borde pueden no
    // coincidir, y un `Map` sin esta comprobación crecería con un día de más.
    const previo = cuenta.get(clave);
    if (previo !== undefined) cuenta.set(clave, previo + 1);
  }

  return [...cuenta.entries()]
    .map(([dia, publicaciones]) => ({ dia, publicaciones }))
    .sort((uno, otro) => uno.dia.localeCompare(otro.dia));
}

/**
 * `YYYY-MM-DD` en la zona horaria local del proceso.
 *
 * No `toISOString()`, que convierte a UTC: en cualquier zona con desfase negativo, una
 * publicación de por la tarde se contaría al día siguiente. Es la clase de fallo que solo se ve
 * en producción y solo a ciertas horas.
 */
function claveDelDia(momento: Date): string {
  const mes = String(momento.getMonth() + 1).padStart(2, '0');
  const dia = String(momento.getDate()).padStart(2, '0');

  return `${String(momento.getFullYear())}-${mes}-${dia}`;
}

/** Cuántas publicaciones hubo en toda la ventana. Es el número que acompaña a la gráfica. */
export function totalDeLaVentana(serie: readonly DiaConPublicaciones[]): number {
  return serie.reduce((suma, dia) => suma + dia.publicaciones, 0);
}
