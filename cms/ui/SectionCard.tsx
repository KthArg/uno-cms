// isomorphic: solo presentación, sin acceso a base de datos ni a la sesión. Se renderiza en
// el servidor, pero no arrastra nada de `cms/db` ni de `cms/auth`.
import Link from 'next/link';
import type { SectionState } from '@/cms/core/content';
import { EstadoDeSeccion } from './EstadoDeSeccion';

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
      className="group block rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-slate-900 group-hover:underline">{nombre}</h3>
        <EstadoDeSeccion estado={estado} />
      </div>

      {elementos !== undefined && (
        <p className="mt-2 text-sm text-slate-600">
          {elementos === 1 ? '1 elemento' : `${String(elementos)} elementos`}
        </p>
      )}
    </Link>
  );
}
