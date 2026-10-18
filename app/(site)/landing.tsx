import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCollection, getContent } from '@/cms/core/content';
import { isSiteConfigured } from '@/cms/core/settings';
import { StaticContentProvider } from '@/cms/preview/ContentContext';
import { webExterna } from '@/cms/core/web-externa';
import { About } from '@/components/site/About';
import { Faqs } from '@/components/site/Faqs';
import { Hero } from '@/components/site/Hero';
import { Testimonials } from '@/components/site/Testimonials';

/**
 * La landing, compuesta en un idioma (spec 17 §5.6).
 *
 * Vive aquí y no dentro de `page.tsx` porque la usan dos rutas: `/` con el idioma por defecto y
 * `/[idioma]` con los demás. Lo que cuenta `page.tsx` sobre cómo se adapta a otro proyecto se
 * aplica igual: esta es la composición que se toca.
 */
export async function Landing({ idioma }: { idioma: string }) {
  /**
   * Si la web vive fuera (ADR-701), esta landing no es la de nadie: es la de ejemplo con el
   * contenido de verdad dentro, servida en el dominio del panel. Quien escribe esa dirección
   * quiere el panel, o configurarlo si todavía no lo está (spec 18).
   *
   * Los dos `redirect` emiten un **307**, temporal, y eso importa: dependen de un estado que
   * cambia. `/setup` responde 404 en cuanto se completa, y la variable de la vista previa la
   * puede quitar quien despliega; un 308 se quedaría cacheado en el navegador de cada visitante
   * mandándolo a donde ya no toca.
   */
  const fuera = webExterna();

  // Primero el sitio sin configurar (spec 14 §3): un despliegue recién hecho no tiene contenido
  // **ni** dueño. Con la web en casa se enseña el camino a `/setup` en vez de saltar, y esa
  // pantalla es la única forma de descubrir la dirección. Con la web fuera se va directamente:
  // en este dominio no hay nada más que hacer que configurar el panel (ADR-1200).
  if (!(await isSiteConfigured())) {
    if (fuera) redirect('/setup');
    return <SinConfigurar />;
  }

  if (fuera) redirect('/admin');

  // Las cuatro lecturas van en paralelo. Son independientes entre sí y cada una tiene su propia
  // entrada de caché, así que encadenarlas con `await` sueltos solo añadiría latencia.
  const [hero, about, testimonials, faqs] = await Promise.all([
    getContent('hero', idioma),
    getContent('about', idioma),
    getCollection('testimonials', idioma),
    getCollection('faqs', idioma),
  ]);

  return (
    <StaticContentProvider value={{ hero, about, testimonials, faqs }}>
      {/* El idioma va aquí y no en el `<html>`, que es del layout raíz y lo comparte el panel
          (spec 17 §5.6). `lang` en un elemento es HTML válido y lo respetan los lectores de
          pantalla: es lo que hace que lean `/en` con voz inglesa. */}
      <main lang={idioma}>
        <Hero />
        <About />
        <Testimonials />
        <Faqs />
      </main>
    </StaticContentProvider>
  );
}

/**
 * Lo que se ve en un despliegue recién hecho, antes de crear la primera cuenta.
 *
 * Dice qué falta y a dónde ir. La alternativa —la landing vacía— deja a quien acaba de
 * desplegar mirando una página en blanco sin saber si ha fallado algo.
 *
 * No se indexa: mientras el sitio no esté configurado, esto no es contenido de nadie.
 */
function SinConfigurar() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Este sitio todavía no está listo</h1>
      <p className="text-slate-600">
        Falta crear la cuenta con la que se administrará la web. Se hace una sola vez y hace falta
        el código de instalación del despliegue.
      </p>
      <Link
        href="/setup"
        className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Configurar el sitio
      </Link>
    </main>
  );
}
