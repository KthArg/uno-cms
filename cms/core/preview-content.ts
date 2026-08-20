import 'server-only';
import appConfig from '@/cms.config';
import { getDraft, readCollection, readCollectionForPreview, readContent } from './content';
import type { CollectionKey, SingletonKey } from './types';

/**
 * Compone el contenido que ve la vista previa (SPEC §6.1 paso 2, ADR-501).
 *
 * ## Un solo borrador, no todos
 *
 * §6.1 dice "carga drafts de todo el contenido". No se hace, y está razonado en ADR-501: el
 * token lleva **una** clave dentro de la firma (#82) justo para que un enlace filtrado no sea
 * una llave maestra a todo lo que hay sin publicar. Cargar todos los borradores dejaría esa
 * clave sin acotar nada.
 *
 * Así que la landing se compone entera con lo **publicado**, y encima va el **borrador** de la
 * clave autorizada. Sigue siendo la página completa —que es lo que hace falta para ver una
 * sección en su sitio— y lo que un enlace expone es exactamente lo que su dueño editaba.
 *
 * ## Las claves salen de la configuración
 *
 * Escribirlas a mano aquí sería un cuarto sitio que hay que tocar al añadir una sección, y §6.3
 * promete que solo hay que tocar `cms.config.ts` y los componentes.
 *
 * ## Sin caché, y a propósito
 *
 * Se usan las lecturas directas (`readContent`, `readCollection`) y no las cacheadas que sirven
 * la landing. El caché de §8 existe para el camino caliente del **visitante**; aquí hay un
 * editor mirando un iframe, y servirle una versión guardada de lo publicado le enseñaría el
 * resto del sitio como estaba antes de que un compañero publicara hace un minuto. La vista
 * previa tiene que enseñar lo que hay, no lo que había.
 *
 * De paso, es lo que la hace comprobable: `unstable_cache` necesita el contexto de una petición
 * de Next y fuera de él lanza. Un módulo que solo se puede probar dentro de un servidor acaba
 * sin probarse.
 */

/**
 * A qué afecta el token dentro de una colección.
 *
 * - `'toda'`: el token autoriza la colección entera (`testimonials`).
 * - una cadena: autoriza **ese** elemento (`testimonials.abc123`).
 * - `null`: no la toca.
 */
function alcanceEnColeccion(key: string, coleccion: string): 'toda' | string | null {
  if (key === coleccion) return 'toda';

  // Los elementos son `coleccion.id`. Se compara el prefijo completo y no `startsWith`, que
  // haría que `testimonials2.x` pasara por un elemento de `testimonials`.
  const [prefijo] = key.split('.');
  return prefijo === coleccion && key.length > coleccion.length ? key : null;
}

export async function previewContent(key: string): Promise<Record<string, unknown>> {
  const singletons = Object.keys(appConfig.singletons) as SingletonKey[];
  const collections = Object.keys(appConfig.collections) as CollectionKey[];

  const entradas = await Promise.all([
    ...singletons.map(async (nombre): Promise<[string, unknown]> => [
      nombre,
      // `getDraft` no se cachea a propósito: cambia cada pocos segundos mientras alguien edita,
      // y un caché aquí haría que el editor viese su propio texto con retraso.
      nombre === key ? await getDraft(nombre) : await readContent(nombre),
    ]),
    ...collections.map(async (nombre): Promise<[string, unknown]> => {
      const alcance = alcanceEnColeccion(key, nombre);

      if (alcance === null) return [nombre, await readCollection(nombre)];

      return [nombre, await readCollectionForPreview(nombre, alcance === 'toda' ? null : alcance)];
    }),
  ]);

  return Object.fromEntries(entradas);
}
