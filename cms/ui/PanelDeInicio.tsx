// isomorphic: solo presentación. Los datos llegan calculados desde la página, que es quien
// tiene la sesión y la base de datos.
import Link from 'next/link';
import type { SectionSummary } from '@/cms/core/content';
import type { DiaConPublicaciones } from '@/cms/core/publicaciones';
import { EstadoDeSeccion } from './EstadoDeSeccion';
import { Icono } from './iconos';
import { PublicacionesPorDia } from './PublicacionesPorDia';
import { ANILLO_DE_FOCO, TARJETA } from './estilos';

/**
 * El panel de inicio, en bento (spec 12 §2, issue #229).
 *
 * ## Qué cambia respecto de la rejilla de tarjetas
 *
 * La forma, y la forma es lo que se reconoce antes que el color. Antes eran cinco tarjetas
 * iguales en una rejilla; ahora hay **una pieza que manda** —la portada, con su imagen y la
 * acción principal—, una columna de apoyo a la derecha y la lista de secciones en filas anchas
 * abajo.
 *
 * ## Lo que `SPEC.md` §9 exige, y sigue estando
 *
 * §9 pide «tarjeta por sección con estado + botón Publicar todo». Las dos cosas están: el estado
 * de cada sección, con su vocabulario intacto, vive en la lista de abajo, y «Publicar todo» es la
 * acción de la pieza principal. Esto reordena lo que §9 pide; no lo sustituye. Se dice porque
 * reordenar una pantalla está a un paso de quitarle algo que la spec exigía.
 *
 * ## El texto no va encima de la foto
 *
 * La imagen sangra por la derecha y el texto vive a la izquierda, sobre superficie opaca. No es
 * una decisión de composición: es **ADR-800**. La foto la sube quien usa el CMS y puede ser
 * blanca, negra o un degradado; encima de ella ningún texto tiene contraste garantizado, y es el
 * único fondo del panel que no ponemos nosotros.
 */

export interface Cifra {
  readonly valor: number;
  readonly etiqueta: string;
}

export interface UltimaImagen {
  readonly url: string;
  readonly alt: string;
  readonly filename: string;
}

export interface PanelDeInicioProps {
  readonly secciones: readonly SectionSummary[];
  readonly cifras: readonly Cifra[];
  readonly serieDePublicaciones: readonly DiaConPublicaciones[];
  readonly totalDePublicaciones: number;
  readonly ultimaImagen: UltimaImagen | null;
  /** El título de la portada, si tiene. Es lo que el sitio dice de sí mismo. */
  readonly tituloDeLaPortada: string;
  /** La imagen de fondo de la portada, si la hay. */
  readonly imagenDeLaPortada: string;
  /** «Publicar todo», que solo se pinta cuando hay algo que publicar. */
  readonly publicarTodo: React.ReactNode;
  readonly pendientes: number;
}

export function PanelDeInicio({
  secciones,
  cifras,
  serieDePublicaciones,
  totalDePublicaciones,
  ultimaImagen,
  tituloDeLaPortada,
  imagenDeLaPortada,
  publicarTodo,
  pendientes,
}: PanelDeInicioProps) {
  return (
    <div className="space-y-4">
      {/* **El título de la pantalla, que el bento se llevó por delante.**
       *
       * La primera versión de esta composición no tenía `<h1>`: la pieza principal empezaba
       * directamente con el nombre de la portada. Lo cazó un e2e que ya existía —el que
       * comprueba que el panel carga— y tenía razón por debajo de lo que decía: una página sin
       * encabezado de nivel 1 deja sin punto de partida a quien navega por encabezados, y es de
       * las cosas que Lighthouse mira en la nota de accesibilidad que va en CI.
       *
       * `sr-only` no: se pinta. La referencia también lleva el nombre de la pantalla arriba a la
       * izquierda, y esconderlo sería quitar de la vista algo que ayuda a los dos lados. */}
      <h1 className="px-1 text-2xl font-semibold tracking-tight text-tinta">Contenido</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* La pieza que manda. Ocupa dos tercios y es lo primero que se lee. */}
        <section className={`${TARJETA} relative overflow-hidden lg:col-span-2`}>
          {imagenDeLaPortada !== '' && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagenDeLaPortada}
                alt=""
                // Decorativa a propósito: lo que dice esta imagen ya lo dice el título de al
                // lado, y describirla dos veces es ruido para quien la escucha.
                aria-hidden="true"
                className="absolute inset-y-0 right-0 hidden h-full w-3/5 object-cover sm:block"
              />
              {/* La banda que funde la foto con la tarjeta. Va **sobre la imagen y bajo el
                  texto**, y el texto nunca la pisa: en su columna la superficie es opaca.

                  **Tres paradas y no dos**, y esto se vio en una captura: con `from-superficie
                  to-transparent` a secas, la fusión terminaba justo donde empezaba la foto y
                  dejaba **un corte vertical duro** en mitad de la tarjeta. La parada intermedia
                  al 40 % es la que hace que se lea como una imagen que se desvanece y no como
                  dos rectángulos pegados. */}
              <div
                aria-hidden="true"
                className="absolute inset-y-0 right-0 hidden w-3/5 bg-gradient-to-r from-superficie from-15% via-superficie/60 via-45% to-transparent sm:block"
              />
            </>
          )}

          {/* `justify-between` reparte **todo** el sobrante entre el texto y las cifras, y la
              columna de la derecha es más alta que este contenido: el resultado era un agujero
              de cien píxeles en mitad de la tarjeta. Con `gap` fijo y `mt-auto` en las cifras,
              el aire va donde se ve bien —debajo del botón— en vez de partir la pieza en dos. */}
          <div className="relative flex h-full flex-col gap-10 p-6 sm:w-[55%] sm:p-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-balance text-tinta sm:text-3xl">
                {tituloDeLaPortada === '' ? 'Todavía no has puesto un título' : tituloDeLaPortada}
              </h2>

              <p className="mt-2 flex items-center gap-2 text-sm text-tinta-suave">
                <Icono
                  de={pendientes === 0 ? 'publicado' : 'conCambios'}
                  tamano={16}
                  className={pendientes === 0 ? 'text-publicado-tinta' : 'text-pendiente-tinta'}
                />
                {pendientes === 0
                  ? 'Todo está publicado.'
                  : pendientes === 1
                    ? 'Hay 1 sección con cambios sin publicar.'
                    : `Hay ${String(pendientes)} secciones con cambios sin publicar.`}
              </p>

              <div className="mt-5">{publicarTodo}</div>
            </div>

            {/* **Las cifras van dentro de la pieza, no en tarjetas sueltas**: es lo que hace que
                la zona de arriba se lea como un objeto y no como cinco. */}
            <dl className="mt-auto grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {cifras.map((cifra) => (
                // **El número arriba y la etiqueta debajo**, como en la referencia. Con la
                // etiqueta encima, «Sin publicar» se partía en dos líneas en las columnas
                // estrechas y empujaba su cifra un renglón por debajo de las demás: cuatro
                // números que deberían leerse de una pasada quedaban desalineados.
                <div key={cifra.etiqueta}>
                  <dd className="text-2xl font-semibold tracking-tight text-tinta">
                    {cifra.valor}
                  </dd>
                  <dt className="mt-0.5 text-xs text-tinta-tenue">{cifra.etiqueta}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* La columna de apoyo. Dos tarjetas apiladas que se leen de un vistazo y no piden nada. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <section className={`${TARJETA} p-5`}>
            <PublicacionesPorDia serie={serieDePublicaciones} total={totalDePublicaciones} />
          </section>

          <section className={`${TARJETA} flex flex-col gap-3 p-5`}>
            <h2 className="text-sm font-medium text-tinta-suave">Última imagen</h2>

            {ultimaImagen === null ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
                <Icono de="imagenes" tamano={24} className="text-tinta-tenue" />
                <p className="text-sm text-tinta-tenue">Todavía no has subido ninguna.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* Superficie opaca bajo la miniatura, por lo mismo de siempre: es una foto de
                    fuera y nada translúcido va encima (ADR-800). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ultimaImagen.url}
                  alt={ultimaImagen.alt === '' ? ultimaImagen.filename : ultimaImagen.alt}
                  className="size-14 shrink-0 rounded-xl border border-linea bg-papel object-cover"
                />
                <p
                  className="min-w-0 flex-1 truncate text-sm text-tinta"
                  title={ultimaImagen.filename}
                >
                  {ultimaImagen.filename}
                </p>
              </div>
            )}

            <Link
              href="/admin/media"
              className={`mt-auto inline-flex h-11 items-center gap-1.5 text-sm text-tinta-suave transition hover:text-tinta ${ANILLO_DE_FOCO}`}
            >
              Ver la biblioteca
              <Icono de="volver" tamano={16} className="rotate-180" />
            </Link>
          </section>
        </div>
      </div>

      {/* La lista ancha. Es lo que `SPEC.md` §9 pide, en filas en vez de en rejilla. */}
      <section className={`${TARJETA} overflow-hidden`}>
        <h2 className="px-5 pt-5 pb-3 text-sm font-medium text-tinta-suave">Tus secciones</h2>

        <ul>
          {secciones.map((seccion) => (
            <li key={seccion.key} className="border-t border-linea">
              <Link
                href={
                  seccion.tipo === 'coleccion'
                    ? `/admin/collections/${seccion.key}`
                    : `/admin/content/${seccion.key}`
                }
                className={`group flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-superficie-suave ${ANILLO_DE_FOCO}`}
              >
                <span className="min-w-0 flex-1 font-medium text-tinta">{seccion.nombre}</span>

                <span className="text-sm text-tinta-tenue">
                  {seccion.elementos === undefined
                    ? ''
                    : seccion.elementos === 1
                      ? '1 elemento'
                      : `${String(seccion.elementos)} elementos`}
                </span>

                <EstadoDeSeccion estado={seccion.estado} />

                <span
                  aria-hidden="true"
                  className="text-tinta-tenue transition group-hover:translate-x-0.5 group-hover:text-acento"
                >
                  <Icono de="volver" tamano={18} className="rotate-180" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
