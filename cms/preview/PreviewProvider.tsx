'use client';

import { useState, type ReactNode } from 'react';
import { ContentContext, type ContenidoPorClave } from './ContentContext';

/**
 * El proveedor de la vista previa (SPEC §6.1, pasos 2–4).
 *
 * Rellena el **mismo contexto** que `StaticContentProvider`, y eso es lo que hace cierta la
 * promesa de §6.3: las secciones no saben en cuál de los dos están.
 *
 * ## Lo que hace hoy y lo que le falta
 *
 * Hoy sostiene el estado inicial que le da el servidor. En **#115** aprende a escuchar
 * `postMessage` y a aplicar los cambios que manda el panel mientras alguien teclea, que es la
 * razón de existir de todo esto.
 *
 * Existe ya, en vez de montar la ruta con el proveedor estático y cambiarlo después, porque el
 * estado vive aquí: con `StaticContentProvider` el contenido sería una prop inmutable y #115
 * tendría que sustituir el componente en vez de añadirle un oyente.
 */

export interface PreviewProviderProps {
  /** Lo que sirve el servidor: el borrador de la clave autorizada y lo publicado del resto. */
  readonly initial: ContenidoPorClave;
  readonly children: ReactNode;
}

export function PreviewProvider({ initial, children }: PreviewProviderProps) {
  // `useState` y no una constante: en #115 este mismo estado es el que actualizan los mensajes
  // del panel. El valor inicial se toma **una vez**, que es lo correcto — una vez que el editor
  // empieza a escribir, la verdad de esta pestaña es lo que llega por mensajes, no lo que había
  // en la base cuando se cargó el iframe.
  const [contenido] = useState<ContenidoPorClave>(initial);

  return <ContentContext.Provider value={contenido}>{children}</ContentContext.Provider>;
}
