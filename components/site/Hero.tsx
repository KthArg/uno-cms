'use client';

import { isSafeLink } from '@/cms/links';
import { useContent } from '@/cms/preview/useContent';

/**
 * La portada (SPEC §6.3, que la usa como ejemplo del contrato).
 *
 * Es literalmente el componente del ejemplo de la spec: lee con `useContent`, expone
 * `data-cms-key` y no sabe si está en producción o en la vista previa. Si al escribirla hubiera
 * hecho falta tocar algo de `cms/`, la promesa de §6.3 sería falsa.
 *
 * `'use client'` porque consume contexto. Lo que **no** hace es pedir nada: el valor ya viene
 * dentro del árbol que sirve el servidor, así que el navegador no abre ninguna petición de datos
 * (§8, "el visitante nunca toca la BD en el hot path").
 */
export function Hero() {
  const hero = useContent('hero');

  // Sin título no se pinta la sección. Es el caso de una instalación recién desplegada: enseñar
  // un hueco con un botón suelto es peor que no enseñar nada (ADR-404).
  if (!hero.title) return null;

  return (
    <section
      data-cms-key="hero"
      className="mx-auto flex max-w-3xl flex-col items-start gap-5 px-6 py-24"
    >
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
        {hero.title}
      </h1>

      {hero.subtitle && <p className="text-lg text-slate-600">{hero.subtitle}</p>}

      {/* El botón necesita las dos cosas. Un texto sin destino es un botón que no lleva a
          ninguna parte, y un destino sin texto no se puede pulsar.

          Y el destino se comprueba **también al pintarlo** (#143), con la misma función que
          valida al guardar (ADR-500). Antes dependía de que React bloquease las URL
          `javascript:` y de que el navegador no navegue a `data:`: las dos son ciertas hoy y
          ninguna es nuestra, así que el día que cambien no se enteraría nadie. */}
      {hero.ctaLabel && isSafeLink(hero.ctaHref) && (
        <a
          href={hero.ctaHref}
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {hero.ctaLabel}
        </a>
      )}
    </section>
  );
}
