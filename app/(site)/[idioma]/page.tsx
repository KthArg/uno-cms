import { notFound, permanentRedirect } from 'next/navigation';
import { hayVariosIdiomas, idiomaDeCodigo, idiomaPorDefecto } from '@/cms/core/idiomas';
import { Landing } from '../landing';

/**
 * La landing en un idioma que no es el de por defecto: `/en` (spec 17 §5.6).
 *
 * Tres respuestas, y las tres son a propósito:
 *
 * - **Un idioma declarado**: su landing, con lo publicado en él y nada más (ADR-1101).
 * - **El de por defecto** (`/es`): redirección permanente a `/`. Las dos URLs servirían la misma
 *   página, y un buscador que encuentra dos direcciones con el mismo contenido reparte entre
 *   ellas lo que valdría una. Permanente porque no depende de nada que cambie: el de por defecto
 *   vive en `/` por diseño, no por configuración.
 * - **Cualquier otra cosa**: 404. Este segmento atrapa toda ruta de un nivel que no sea nuestra,
 *   así que tiene que responder lo mismo que respondía antes de existir.
 *
 * Con un solo idioma, ni siquiera la redirección: `/es` es un 404 como lo era antes, porque un
 * sitio que no ha declarado idiomas no tiene por qué ganar rutas nuevas (spec 17 §6).
 */
export const dynamic = 'force-dynamic';

export default async function LandingEnOtroIdioma({
  params,
}: {
  params: Promise<{ idioma: string }>;
}) {
  const { idioma } = await params;

  if (!hayVariosIdiomas() || idiomaDeCodigo(idioma) === null) notFound();

  if (idioma === idiomaPorDefecto().codigo) permanentRedirect('/');

  return <Landing idioma={idioma} />;
}
