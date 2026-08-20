'use client';

import { useContent } from '@/cms/preview/useContent';

/**
 * Sobre nosotros (SPEC §6.3).
 *
 * El campo `body` es `richtext`, y su renderizado llega con `<RichText>` en #113: hasta
 * entonces esta sección enseña el encabezado y **nada más**, en vez de improvisar una
 * conversión a texto plano que habría que quitar después.
 */
export function About() {
  const about = useContent('about');

  // `visible` es un campo del propio contenido: quien edita puede apagar la sección sin
  // borrarla, y eso lo decide desde el panel, no desde el código.
  if (about.visible === false || !about.heading) return null;

  return (
    <section data-cms-key="about" className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{about.heading}</h2>
    </section>
  );
}
