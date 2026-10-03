import { notFound } from 'next/navigation';
import { idiomaDeCodigo } from '@/cms/core/idiomas';
import { previewContentConObjetivo } from '@/cms/core/preview-content';
import { PreviewProvider } from '@/cms/preview/PreviewProvider';
import { verifyToken } from '@/cms/security/tokens';
import { About } from '@/components/site/About';
import { Faqs } from '@/components/site/Faqs';
import { Hero } from '@/components/site/Hero';
import { Testimonials } from '@/components/site/Testimonials';

/**
 * La landing en modo vista previa, dentro del iframe del panel (SPEC §6.1, §6.2).
 *
 * ## Las mismas secciones, sin una sola bifurcación
 *
 * Se componen exactamente los mismos componentes que `app/(site)/page.tsx`. Si aquí hubiera una
 * versión distinta —aunque fuera un `if (esPreview)` dentro de una sección— la vista previa
 * dejaría de enseñar la web y pasaría a enseñar *otra cosa parecida*, que es peor que no tener
 * vista previa: se confía en ella para decidir si publicar.
 *
 * Lo único que cambia es **quién rellena el contexto**.
 *
 * ## Token inválido → 404, sin distinguir el motivo
 *
 * Mal firmado, caducado, de otro propósito o ausente responden igual. Distinguirlos convertiría
 * esta ruta en un comprobador: "este enlace existió alguna vez" es exactamente lo que le falta
 * a quien encuentre uno viejo en un historial ajeno.
 *
 * `X-Robots-Tag: noindex` lo pone el middleware desde M2 para todo `/preview`.
 */
export const dynamic = 'force-dynamic';

export default async function VistaPrevia({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let key: string | undefined;
  let idioma: string | undefined;
  try {
    const verificado = verifyToken('preview', token);
    key = verificado.ok ? verificado.data['key'] : undefined;
    // Sin idioma dentro es un token del de por defecto: todos los de antes de la spec 17 lo son.
    idioma = verificado.ok ? verificado.data['idioma'] : undefined;
  } catch {
    // `verifyToken` **lanza** si `APP_SECRET` falta o es corto: es un despliegue mal
    // configurado, no un token inválido. Desde una ruta pública se responde 404 igualmente,
    // porque un 500 con traza confirma que la ruta existe y que algo interno se ha roto
    // (spec de M2, §3.2).
    key = undefined;
  }

  if (key === undefined) notFound();

  // Un token firmado para un idioma que `cms.config.ts` ya no declara: el enlace es nuestro, pero
  // apunta a algo que ha dejado de existir, y eso es un 404 y no un 500.
  if (idioma !== undefined && idiomaDeCodigo(idioma) === null) notFound();

  // Lo publicado de todo, y el borrador de lo que autoriza el token (ADR-501). Esta ruta **no
  // escribe nada**: la vista previa no llama a ninguna action.
  //
  // El objetivo dice a dónde aplicar los cambios que lleguen por `postMessage`. Lo calcula el
  // servidor porque, para un elemento de colección, hace falta su posición en la lista — y la
  // lista que ve la landing no lleva claves.
  const { contenido, objetivo } = await previewContentConObjetivo(key, idioma);

  return (
    <PreviewProvider initial={contenido} objetivo={objetivo}>
      <main lang={idioma}>
        <Hero />
        <About />
        <Testimonials />
        <Faqs />
      </main>
    </PreviewProvider>
  );
}
