import 'server-only';
import appConfig from '@/cms.config';
import {
  collectionKeysInOrder,
  getDraft,
  readCollection,
  readCollectionForPreview,
  readContent,
} from './content';
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

/**
 * A dónde van los cambios que llegan por `postMessage` (#115).
 *
 * El panel manda `{ key, data }` con la clave de la entrada que se está editando. Para un
 * singleton eso es una entrada del contexto; para un elemento de colección hay que sustituirlo
 * **dentro de su lista**, y la lista que ve la landing no lleva claves —lo publicado es solo el
 * contenido—, así que la posición la calcula el servidor aquí y viaja con el resto.
 *
 * Calcularla en el cliente exigiría mandarle las claves de todos los elementos, que es contarle
 * al navegador cosas de la base de datos para resolver algo que el servidor ya sabe.
 */
export interface ObjetivoDeLaVistaPrevia {
  /** La clave que autoriza el token. Solo se aceptan mensajes para esta. */
  readonly key: string;
  /** Si es un elemento de colección: en qué lista y en qué posición. */
  readonly coleccion?: string;
  readonly indice?: number;
}

export interface ContenidoDeVistaPrevia {
  readonly contenido: Record<string, unknown>;
  readonly objetivo: ObjetivoDeLaVistaPrevia;
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

/**
 * Lo que necesita la ruta: el contenido y a dónde aplicar los cambios en vivo.
 *
 * Se calcula aquí, con la misma lectura, en vez de en la página: la posición del elemento
 * depende del orden con el que se compuso la lista, y separarlas dejaría dos sitios que tienen
 * que estar de acuerdo sobre ese orden.
 */
export async function previewContentConObjetivo(key: string): Promise<ContenidoDeVistaPrevia> {
  const contenido = await previewContent(key);

  const collections = Object.keys(appConfig.collections);
  const coleccion = collections.find((nombre) => alcanceEnColeccion(key, nombre) === key);

  if (coleccion === undefined) return { contenido, objetivo: { key } };

  // La posición se busca por la clave del elemento, que `readCollectionForPreview` conserva en
  // el orden de la lista: es el mismo índice que verá el componente.
  const claves = await collectionKeysInOrder(coleccion as CollectionKey);
  const indice = claves.indexOf(key);

  // Si no está —lo borraron entre emitir el token y abrir la vista previa— no hay dónde aplicar
  // nada. Se sirve el contenido y los mensajes de esa clave no encontrarán destino, que es
  // mejor que inventarse una posición.
  if (indice === -1) return { contenido, objetivo: { key } };

  return { contenido, objetivo: { key, coleccion, indice } };
}
