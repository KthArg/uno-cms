'use client';

import { RichText } from '@/cms/preview/RichText';
import { useCollection } from '@/cms/preview/useContent';

/**
 * Preguntas frecuentes (SPEC §5.1).
 *
 * La respuesta es `richtext` y la pinta `<RichText>`.
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
            <dd className="mt-1">
              <RichText value={pregunta.answer} className="space-y-2 text-slate-600" />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
