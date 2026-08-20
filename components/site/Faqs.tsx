'use client';

import { useCollection } from '@/cms/preview/useContent';

/**
 * Preguntas frecuentes (SPEC §5.1).
 *
 * La respuesta es `richtext` y se pinta con `<RichText>` en #113. Hasta entonces se enseña la
 * pregunta, que es lo que se puede enseñar sin inventar nada.
 */
export function Faqs() {
  const preguntas = useCollection('faqs');

  if (preguntas.length === 0) return null;

  return (
    <section data-cms-key="faqs" className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Preguntas frecuentes</h2>
      <dl className="mt-6 space-y-4">
        {preguntas.map((pregunta, indice) => (
          <div key={`${pregunta.question}-${indice}`} className="border-t border-slate-200 pt-4">
            <dt className="font-medium text-slate-900">{pregunta.question}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
