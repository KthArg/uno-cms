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
 * sitio no hay ninguna consulta más en todo el proceso. Pero **la ruta sigue siendo
 * dinámica**, y eso choca con el ISR por tags que llega en M5. Está registrado como issue
 * para resolverlo entonces, cuando exista el contenido real que cachear y se pueda medir el
 * coste de verdad en vez de suponerlo.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupCompleted())) redirect('/setup');

  return <>{children}</>;
}
