// isomorphic: solo presentación, sin acceso a base de datos ni a la sesión. Se renderiza en
// el servidor, pero no arrastra nada de `cms/db` ni de `cms/auth`.
import Link from 'next/link';
import type { SectionState } from '@/cms/core/content';
import { EstadoDeSeccion } from './EstadoDeSeccion';
import { Icono } from './iconos';
import { ANILLO_DE_FOCO } from './estilos';

/**
 * La tarjeta de una sección en el panel (SPEC §9: "tarjeta por sección con estado").
 *
 * ## Por qué tres estados y no dos
 *
 * La tentación es "Publicado" / "Cambios sin publicar", que es lo que dice §9 literalmente.
 * Pero hay un tercer caso que el editor vive de forma completamente distinta: la sección que
 * **nunca se ha publicado**. Mostrarla como "Cambios sin publicar" sugiere que hay una
 * versión pública que difiere, y no la hay: la landing está enseñando valores vacíos.
 *
 * Distinguirlo no cuesta nada —la fila ya trae `published`— y evita que alguien crea que su
 * sitio está publicado cuando no lo está.
 *
 * ## El vidrio, y el borde que se enciende (spec 11)
 *
 * La tarjeta flota sobre el fondo con luz. Al pasar por encima **no cambia de fondo**: se le
 * enciende el filo. Cambiar el fondo de una superficie translúcida al vuelo obliga al navegador
 * a rehacer el desenfoque de esa caja, y son las cuatro o cinco tarjetas del panel a la vez si
 * se pasa el ratón en diagonal.
 */

export interface SectionCardProps {
  /** Lo que ve el editor. Nunca la clave técnica (SPEC §9). */
  readonly nombre: string;
  readonly href: string;
  readonly estado: SectionState;
  /** Cuántos elementos tiene, si es una lista. */
  readonly elementos?: number;
}

export function SectionCard({ nombre, href, estado, elementos }: SectionCardProps) {
  return (
    <Link
      href={href}
      className={`lamina-tarjeta group flex h-full flex-col gap-4 rounded-2xl p-5 transition hover:border-acento ${ANILLO_DE_FOCO}`}
    >
      {/* **El título tiene la línea entera, y la etiqueta va debajo.** Estaban en la misma fila
          y con la etiqueta al lado —que mide lo que mide su texto— «Sobre nosotros» se partía en
          dos líneas y «SEO y redes sociales» en tres. Las tarjetas quedaban de alturas
          distintas y el nombre de la sección, que es lo que se busca, era lo peor colocado.

          No se vio revisando el código: se vio en la captura. */}
      <h3 className="text-base font-semibold text-balance text-tinta">{nombre}</h3>

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <EstadoDeSeccion estado={estado} />

          {elementos !== undefined && (
            <p className="text-sm text-tinta-tenue">
              {elementos === 1 ? '1 elemento' : `${String(elementos)} elementos`}
            </p>
          )}
        </div>

        {/* La flecha dice "esto se abre" sin gastar una palabra, y **está oculta al lector de
            pantalla a propósito**: el enlace ya se anuncia como enlace, así que leerla sería
            decir dos veces lo mismo. */}
        <span
          aria-hidden="true"
          className="text-tinta-tenue transition group-hover:translate-x-0.5 group-hover:text-acento"
        >
          <Icono de="volver" tamano={18} className="rotate-180" />
        </span>
      </div>
    </Link>
  );
}
