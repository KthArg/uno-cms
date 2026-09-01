// isomorphic: solo presentación. Recibe la serie ya calculada y dibuja; no consulta nada.
import type { DiaConPublicaciones } from '@/cms/core/publicaciones';

/**
 * La tarjeta de publicaciones del panel de inicio (spec 12 §7, ADR-812).
 *
 * ## Por qué barras y no la curva de la referencia
 *
 * Porque los datos son **conteos discretos y pequeños**: cero, uno, dos publicaciones en un día.
 * Una curva suave entre esos puntos interpola valores que no existen — dibuja "1,4 publicaciones"
 * a media tarde del martes— y sugiere una continuidad que no hay. Con barras, un día sin publicar
 * es un hueco y se ve como lo que es.
 *
 * La referencia visual tenía una curva porque medía usuarios activos, que sí es una magnitud
 * continua. Copiar la forma sin mirar el dato es como se hacen los gráficos que mienten.
 *
 * ## Cero JavaScript
 *
 * Es un SVG que sale del servidor. El valor de cada día se lee al pasar por encima con el
 * `<title>` nativo de SVG, que además es lo que hace la gráfica alcanzable sin ratón; un tooltip
 * propio habría que hacerlo accesible por teclado, y este ya lo está.
 *
 * ## El texto no lleva el color de la serie
 *
 * Los números y las etiquetas van en fichas de tinta. El naranja se queda en las barras, que es
 * lo que carga con la identidad; texto de color sobre vidrio es la forma más rápida de perder
 * contraste sin enterarse.
 */

export interface PublicacionesPorDiaProps {
  readonly serie: readonly DiaConPublicaciones[];
  readonly total: number;
}

/** El alto del dibujo, en unidades del `viewBox`. El ancho lo pone el número de días. */
const ALTO = 40;
const ANCHO_DE_BARRA = 6;
const HUECO = 3;

export function PublicacionesPorDia({ serie, total }: PublicacionesPorDiaProps) {
  const ancho = serie.length * (ANCHO_DE_BARRA + HUECO) - HUECO;

  // El máximo manda la escala, con **suelo de 1**: sin él, una semana entera a cero divide por
  // cero y las barras salen infinitas o desaparecen según por dónde se mire.
  const maximo = Math.max(1, ...serie.map((dia) => dia.publicaciones));

  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-tinta-suave">Publicaciones</h2>
        <p className="text-xs text-tinta-tenue">{serie.length} días</p>
      </div>

      <div>
        <p className="text-3xl font-semibold tracking-tight text-tinta">{total}</p>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          {total === 1 ? 'vez has publicado' : 'veces has publicado'}
        </p>
      </div>

      {/* `role="img"` con nombre: sin él, un lector de pantalla encuentra un dibujo sin
          descripción. El resumen dice lo mismo que el número grande, que es lo que se lee. */}
      <svg
        role="img"
        aria-label={`${String(total)} publicaciones en los últimos ${String(serie.length)} días`}
        viewBox={`0 0 ${String(ancho)} ${String(ALTO)}`}
        preserveAspectRatio="none"
        className="h-10 w-full"
      >
        {serie.map((dia, indice) => {
          // Las barras de valor cero se pintan igual, con una altura mínima: el día sin publicar
          // es información, y un hueco vacío se confunde con el final de la serie.
          const alto = dia.publicaciones === 0 ? 2 : (dia.publicaciones / maximo) * ALTO;

          return (
            <rect
              key={dia.dia}
              x={indice * (ANCHO_DE_BARRA + HUECO)}
              y={ALTO - alto}
              width={ANCHO_DE_BARRA}
              height={alto}
              rx={2}
              className={dia.publicaciones === 0 ? 'fill-linea' : 'fill-acento'}
            >
              <title>{textoDelDia(dia)}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Lo que se lee al pasar por encima de un día.
 *
 * En español y con la fecha escrita, no `2026-09-01`: es la interfaz de quien edita, y una fecha
 * ISO ahí es la clave técnica asomando por la misma puerta por la que `SPEC.md` §9 no deja pasar
 * a «slug» ni a «cache».
 */
function textoDelDia(dia: DiaConPublicaciones): string {
  const [ano, mes, numero] = dia.dia.split('-').map(Number);
  const fecha = new Date(ano ?? 1970, (mes ?? 1) - 1, numero ?? 1).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
  });

  if (dia.publicaciones === 0) return `${fecha}: sin publicar`;

  return dia.publicaciones === 1
    ? `${fecha}: 1 publicación`
    : `${fecha}: ${String(dia.publicaciones)} publicaciones`;
}
