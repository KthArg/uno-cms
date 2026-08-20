import { getCollection, getContent } from '@/cms/core/content';
import { StaticContentProvider } from '@/cms/preview/ContentContext';
import { About } from '@/components/site/About';
import { Faqs } from '@/components/site/Faqs';
import { Hero } from '@/components/site/Hero';
import { Testimonials } from '@/components/site/Testimonials';

/**
 * La landing (SPEC §6.3, §8).
 *
 * ## Esto es todo lo que hay que escribir para adaptar el CMS a otro proyecto
 *
 * §6.3 lo promete así: **`cms.config.ts` + secciones que usen `useContent` + componer
 * `page.tsx`**. Esta página es la tercera parte de esa promesa, y por eso conviene mirar lo que
 * **no** tiene: ni consultas escritas a mano, ni tipos declarados aparte, ni nada que haya que
 * tocar dentro de `cms/` al añadir una sección. Se lee, se pasa al proveedor y se compone.
 *
 * ## Por qué el servidor lee y el cliente solo pinta
 *
 * §8 exige que el visitante no toque la base de datos en el camino caliente. Aquí las lecturas
 * son de servidor y pasan por `getContent`/`getCollection`, que llevan `unstable_cache` con el
 * tag que invalida `publish`. El navegador recibe el contenido **dentro del árbol que ya se le
 * manda**: no abre ninguna petición de datos.
 *
 * Las secciones son de cliente porque consumen contexto, no porque pidan nada.
 *
 * ## Lo que falta y de dónde viene
 *
 * Los campos `richtext` —el cuerpo de "Sobre nosotros" y las respuestas— se pintan con
 * `<RichText>` en #113. Hasta entonces esas secciones enseñan lo que se puede enseñar sin
 * improvisar una conversión que habría que quitar después.
 */
export default async function Landing() {
  // Las cuatro lecturas van en paralelo. Son independientes entre sí y cada una tiene su propia
  // entrada de caché, así que encadenarlas con `await` sueltos solo añadiría latencia.
  const [hero, about, testimonials, faqs] = await Promise.all([
    getContent('hero'),
    getContent('about'),
    getCollection('testimonials'),
    getCollection('faqs'),
  ]);

  return (
    <StaticContentProvider value={{ hero, about, testimonials, faqs }}>
      <main>
        <Hero />
        <About />
        <Testimonials />
        <Faqs />
      </main>
    </StaticContentProvider>
  );
}
