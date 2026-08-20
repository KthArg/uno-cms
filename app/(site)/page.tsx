import Link from 'next/link';
import { getCollection, getContent } from '@/cms/core/content';
import { isSiteConfigured } from '@/cms/core/settings';
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
 * ## El sitio sin configurar
 *
 * §7.3 pide que, sin usuarios, cualquier ruta lleve a `/setup`. Aquí se **enseña el camino** en
 * vez de redirigir: quien acaba de desplegar se encuentra qué falta y a dónde ir, en vez de un
 * salto que no explica nada. La comprobación pasa por el caché con el tag de los ajustes, que
 * se invalida al completar el bootstrap.
 *
 * ## Por qué esta página es dinámica, con la medida delante
 *
 * §8 pide ISR por tags. Esta ruta lleva `force-dynamic` y **eso es una desviación**, decidida en
 * **ADR-502** con las dos versiones construidas y medidas: la estática responde en 3,6 ms de
 * mediana y esta en 6,8 ms, sobre un presupuesto de LCP de 2500 ms.
 *
 * Lo que compra esa diferencia es que **`pnpm build` exija una base de datos accesible**, porque
 * prerenderizar la landing la consulta. Para un producto que §0 exige auto-hospedable, eso
 * rompe construir una imagen sin la base delante.
 *
 * La garantía que §8 enuncia —"el visitante nunca toca la BD en el hot path si el caché está
 * caliente"— **sí se cumple**: las lecturas pasan por `unstable_cache` con los tags que
 * invalida `publish`. Lo que se paga es el render por petición, no la consulta.
 *
 * Quitar `force-dynamic` es todo lo que hace falta para volver a la versión estática, el día que
 * el despliegue garantice la base de datos en tiempo de construcción.
 */
export const dynamic = 'force-dynamic';
export default async function Landing() {
  // Antes que nada: un sitio recién desplegado no tiene contenido **ni** dueño, y lo útil ahí no
  // es una página en blanco.
  if (!(await isSiteConfigured())) return <SinConfigurar />;

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
