import { redirect } from 'next/navigation';
import { isSetupCompleted } from '@/cms/auth/setup';

/**
 * Layout de la landing pública (SPEC §3).
 *
 * Aquí vive el "sin usuarios en BD, toda ruta redirige a /setup" de SPEC §7.3. No puede
 * estar en el middleware: el middleware corre en edge y esto necesita consultar la base de
 * datos.
 *
 * ## Tensión con SPEC §8, dicha en voz alta
 *
 * §8 exige que la landing sea estática con ISR y que el visitante nunca toque la base de
 * datos en el camino caliente. Un layout `async` que consulta la base la vuelve dinámica.
 *
 * La mitigación es que `isSetupCompleted()` memoriza el `true`: una vez configurado el
 * sitio no hay ninguna consulta más en todo el proceso. Pero la ruta sigue siendo dinámica,
 * y eso choca con el ISR por tags que llega en M5.
 *
 * `force-dynamic` es obligatorio, no una preferencia: sin él, Next intenta **prerenderizar
 * la landing durante el build** y el guard consulta la base de datos ahí mismo. El resultado
 * es un build que falla sin `DATABASE_URL` —lo tumbó en CI— y, peor, una landing con el
 * estado del bootstrap **congelado en el momento del build**.
 *
 * O sea que la tensión con §8 no es teórica ni futura: hoy cuesta la estaticidad de la
 * landing entera. Está en el issue #71 con cuatro salidas evaluadas, para resolverlo en M5
 * con contenido real que medir en vez de suponer.
 */
export const dynamic = 'force-dynamic';
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupCompleted())) redirect('/setup');

  return <>{children}</>;
}
