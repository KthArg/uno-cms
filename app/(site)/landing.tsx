import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCollection, getContent } from '@/cms/core/content';
import { isSiteConfigured } from '@/cms/core/settings';
import { StaticContentProvider } from '@/cms/preview/ContentContext';
import { laWebViveFuera } from '@/cms/vista-previa-remota';
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
  // Antes que nada: un sitio recién desplegado no tiene contenido **ni** dueño, y lo útil ahí no
  // es una página en blanco.
  //
  // **Y va delante del redirect de abajo a propósito** (spec 14 §3, caso T-248-4). Hoy nada más
  // en la aplicación lleva a `/setup`: esta pantalla es la única forma de descubrir esa dirección
  // en un despliegue recién hecho. Con el orden al revés, quien despliegue el CMS para una web de
  // fuera se queda sin puerta de entrada y tiene que conocer `/setup` de memoria.
  if (!(await isSiteConfigured())) return <SinConfigurar />;

  /**
   * Si la web vive fuera (ADR-701), esta landing no es la de nadie: es la de ejemplo con el
   * contenido de verdad dentro, servida en el dominio del panel. Quien escribe esa dirección
   * quiere el panel.
   *
   * `redirect` emite un **307**, temporal, y eso importa: esto depende de una variable de entorno
   * que quien despliega puede quitar, y un 308 se queda cacheado en el navegador de cada
   * visitante mucho después. El coste de equivocarse en ese sentido lo paga alguien que ya no ve
   * su propia web y no sabe por qué.
   */
  if (laWebViveFuera()) redirect('/admin');

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
