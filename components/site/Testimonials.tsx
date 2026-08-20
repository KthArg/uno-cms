'use client';

import { useCollection } from '@/cms/preview/useContent';

/**
 * Testimonios (SPEC §5.1, colección ordenable).
 *
 * Lee la colección por contexto y no por props, que es lo que la hace funcionar también en la
 * vista previa: ahí el contenido llega por `postMessage`, no del servidor.
 */
export function Testimonials() {
  const testimonios = useCollection('testimonials');

  if (testimonios.length === 0) return null;

  return (
    <section data-cms-key="testimonials" className="mx-auto max-w-3xl px-6 py-16">
      <ul className="grid gap-6 sm:grid-cols-2">
        {testimonios.map((testimonio, indice) => (
          // La clave del elemento no llega hasta la landing —lo publicado es solo el
          // contenido—, así que se usa el nombre y, de empatar, la posición. Es estable dentro
          // de un render y suficiente para una lista que no se reordena en el navegador.
          <li
            key={`${testimonio.author}-${indice}`}
            className="rounded-lg border border-slate-200 bg-white p-6"
          >
            <blockquote className="text-slate-700">{testimonio.quote}</blockquote>
            <p className="mt-3 text-sm font-medium text-slate-900">{testimonio.author}</p>
            {typeof testimonio.rating === 'number' && (
              // El número también, no solo las estrellas: quien use un lector de pantalla oiría
              // "estrella estrella estrella" sin saber sobre cuántas.
              <p className="mt-1 text-sm text-slate-500">
                <span aria-hidden="true">{'★'.repeat(testimonio.rating)}</span>
                <span className="sr-only">{testimonio.rating} de 5</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
