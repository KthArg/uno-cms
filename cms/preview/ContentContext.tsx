'use client';

import { createContext, type ReactNode } from 'react';

/**
 * El contexto que alimenta a `useContent` (SPEC §6.3).
 *
 * ## Uno solo para los dos modos, y es lo que hace que el contrato funcione
 *
 * La promesa de §6.3 es que **el mismo componente** sirve en producción y en vista previa:
 *
 * > `const hero = useContent('hero');` — prod: valor serializado desde el server (estático);
 * > preview: valor reactivo con overrides
 *
 * Eso solo se cumple si el componente no sabe en cuál de los dos está. Si hubiera dos hooks, o
 * uno con un parámetro de modo, cada sección tendría que decidir — y adaptar el CMS a otro
 * proyecto dejaría de ser "escribe secciones que usen `useContent`".
 *
 * Así que hay un contexto y dos proveedores que lo rellenan de forma distinta:
 * `StaticContentProvider` con lo publicado, que no cambia, y el de la vista previa (#115) con
 * los borradores más lo que va llegando por `postMessage`.
 *
 * ## Por qué el valor por defecto es `null` y no un objeto vacío
 *
 * Para poder distinguir **"no hay proveedor"** de **"el proveedor no tiene esa clave"**. Son dos
 * situaciones que no se parecen en nada: la primera es un error de composición de quien
 * programa; la segunda es el estado normal de una instalación recién desplegada. Con un objeto
 * vacío por defecto, las dos se verían igual — una sección en blanco y nadie sabe por qué.
 */

/**
 * Lo que hay dentro: cada clave con su contenido, tal y como lo devuelve el servidor.
 *
 * El valor es `unknown` y no un objeto, porque una sección fija guarda un objeto y una colección
 * guarda una lista. Meter las dos en la misma forma —envolviendo la lista en `{ items: [...] }`,
 * por ejemplo— inventaría un concepto que no existe en ningún otro sitio del proyecto: en la
 * base de datos, en las actions y en el panel, una colección **es** una lista.
 */
export type ContenidoPorClave = Readonly<Record<string, unknown>>;

export const ContentContext = createContext<ContenidoPorClave | null>(null);

/**
 * El proveedor de producción: los valores **publicados**, ya serializados por el servidor.
 *
 * No tiene estado ni efectos. Lo que entra por `value` es lo que sale, y eso es deliberado:
 * `SPEC.md` §8 exige que el visitante no toque la base de datos en el camino caliente, y una
 * petición desde el navegador la incumpliría igual que una consulta. Aquí no hay ninguna.
 */
export function StaticContentProvider({
  value,
  children,
}: {
  readonly value: ContenidoPorClave;
  readonly children: ReactNode;
}) {
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
