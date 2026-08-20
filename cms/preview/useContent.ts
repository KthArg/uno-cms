'use client';

import { useContext } from 'react';
import type { CollectionItem, CollectionKey, Content, SingletonKey } from '@/cms/core/types';
import { ContentContext } from './ContentContext';

/**
 * El hook que consumen las secciones de la landing (SPEC §6.3).
 *
 * El mismo en producción y en vista previa: quien escribe una sección no sabe —ni le importa—
 * en cuál de los dos está. Eso es lo que hace cierta la promesa de §6.3 de que adaptar el CMS a
 * otro proyecto sea escribir `cms.config.ts`, las secciones y componer la página.
 *
 * Los tipos vienen de `cms/core/types`, que es el único módulo de `cms/core` sin `server-only`
 * porque no emite ni una línea de JavaScript. Importarlo desde aquí no arrastra nada del
 * servidor al navegador.
 */

/**
 * Los dos casos que no son el feliz, y por qué no se tratan igual.
 *
 * **Sin proveedor: lanza.** Un componente montado fuera de los dos proveedores es un error de
 * composición. Devolver `undefined` o un objeto vacío lo convertiría en una sección que se pinta
 * en blanco, sin ningún síntoma que lleve a la causa — y quien lo mire buscará el fallo en el
 * contenido, que es donde no está.
 *
 * **Con proveedor y sin esa clave: devuelve `{}`.** Es el estado normal del primer día: una
 * instalación recién desplegada no tiene nada publicado, y la landing tiene que renderizarse
 * igual (ADR-404). Aquí lanzar sería tumbar el sitio entero por no haber escrito todavía.
 *
 * La diferencia entre los dos casos es la que hace útil el primero: si ambos lanzaran, el error
 * dejaría de significar "te falta el proveedor".
 */
function useContenidoDelContexto(nombreDelHook: string): Readonly<Record<string, unknown>> {
  const contenido = useContext(ContentContext);

  if (contenido === null) {
    throw new Error(
      `${nombreDelHook} se ha usado fuera de un proveedor de contenido. ` +
        'Envuelve la página con <StaticContentProvider> (producción) o con el proveedor de la ' +
        'vista previa. En producción lo hace app/(site)/page.tsx.'
    );
  }

  return contenido;
}

/** El contenido publicado de una sección fija. */
export function useContent<K extends SingletonKey>(key: K): Content<K> {
  const contenido = useContenidoDelContexto('useContent');

  const valor = contenido[key];

  // El objeto vacío se crea aquí y no se comparte entre llamadas: devolver siempre la misma
  // referencia parece un ahorro y es una trampa, porque un componente que la mutara afectaría a
  // todos los demás.
  //
  // Y se comprueba que sea un objeto en vez de darlo por hecho, por el mismo motivo que en
  // `useCollection`: en la vista previa esto llega por `postMessage`. El aserto de tipo que
  // sigue es inevitable —en tiempo de ejecución no se puede comprobar que el JSON encaja con el
  // esquema— y quien lo garantiza es el servidor al leerlo, o el esquema laxo al recibirlo.
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return {} as Content<K>;

  return valor as Content<K>;
}

/**
 * Los elementos de una colección, en su orden.
 *
 * `SPEC.md` §6.3 solo enseña el caso del singleton, pero la landing de ejemplo tiene
 * testimonios y preguntas frecuentes: sin esto, esas dos secciones tendrían que recibir sus
 * datos por props y **dejarían de funcionar en la vista previa**, que es donde el contenido
 * llega por contexto y no por el servidor.
 *
 * Se guarda bajo la clave de la colección, con la lista ya ordenada por quien la sirve.
 */
export function useCollection<K extends CollectionKey>(key: K): readonly CollectionItem<K>[] {
  const contenido = useContenidoDelContexto('useCollection');
  const valor = contenido[key];

  // Una colección vacía y una colección ausente se ven igual desde una sección: en las dos no
  // hay nada que pintar. La diferencia solo importaría si hubiera que distinguir "todavía no
  // has escrito nada" de "lo borraste todo", y en la landing pública no la hay.
  //
  // Se comprueba que sea una lista en vez de darlo por hecho: en la vista previa este valor
  // llega por `postMessage` (#115), y ahí lo que entra no lo escribe el servidor.
  return Array.isArray(valor) ? (valor as CollectionItem<K>[]) : [];
}
