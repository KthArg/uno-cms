import 'server-only';
import { asc, eq } from 'drizzle-orm';
import appConfig from '@/cms.config';
import { contentEntries, getDb } from '@/cms/db';
import type { ObjectSchema } from './config';
import type { SectionState } from './content';

/**
 * La lectura de una colección para el panel (SPEC §5.1, §9).
 *
 * Vive en `cms/core` y no junto a las actions por lo que enseñó el PR #97: leer no es mutar, y
 * el test T-75-6 exige que todo lo exportado desde `cms/actions` pase por el envoltorio.
 *
 * Devuelve `getCollectionDrafts`, que se quitó del PR #87 por no estar en los criterios de #76
 * con la nota "vuelve en #80". No volvió: #80 fueron las actions, no la lectura del panel. Lo
 * encontró la auditoría de pendientes, y este es su sitio de verdad.
 */

export interface DefinicionDeColeccion {
  readonly label: string;
  readonly titleField: string;
  readonly schema: ObjectSchema;
}

export interface ElementoDeColeccion {
  readonly key: string;
  /** Lo que se enseña en la lista: el `titleField` de SPEC §5.1. */
  readonly titulo: string;
  readonly estado: SectionState;
  readonly sortOrder: number;
}

/** La definición de una colección declarada en `cms.config.ts`, o `null` si no existe. */
export function definicionDeColeccion(key: string): DefinicionDeColeccion | null {
  const declarada = (appConfig.collections as Record<string, DefinicionDeColeccion | undefined>)[
    key
  ];

  return declarada ?? null;
}

/**
 * El título de un elemento, tomado del campo que la configuración señala.
 *
 * `SPEC.md` §5.1 llama a `titleField` "qué mostrar en la lista del admin", así que este es
 * exactamente su propósito. Un elemento recién creado lo tiene vacío —nace con los valores por
 * defecto— y ahí hace falta decir algo: una lista con cuatro filas en blanco no se puede usar,
 * y enseñar la clave técnica es la jerga que §9 prohíbe.
 */
export function tituloDeElemento(borrador: unknown, titleField: string): string {
  if (typeof borrador !== 'object' || borrador === null) return 'Sin título';

  const valor = (borrador as Record<string, unknown>)[titleField];
  if (typeof valor !== 'string' || valor.trim() === '') return 'Sin título';

  // Se recorta para la lista: un testimonio de quinientos caracteres como título deja la
  // pantalla inservible.
  const limpio = valor.trim();
  return limpio.length > 80 ? `${limpio.slice(0, 80)}…` : limpio;
}

export async function listCollectionItems(key: string): Promise<ElementoDeColeccion[]> {
  const definicion = definicionDeColeccion(key);
  if (definicion === null) return [];

  const filas = await getDb()
    .select({
      key: contentEntries.key,
      draft: contentEntries.draft,
      published: contentEntries.published,
      status: contentEntries.status,
      sortOrder: contentEntries.sortOrder,
    })
    .from(contentEntries)
    .where(eq(contentEntries.type, key))
    // El mismo orden que sirve la landing, con el mismo desempate: si el panel enseñara otro,
    // arrastrar un elemento aquí movería otra cosa allí.
    .orderBy(asc(contentEntries.sortOrder), asc(contentEntries.key));

  return filas.map((fila) => ({
    key: fila.key,
    titulo: tituloDeElemento(fila.draft, definicion.titleField),
    estado:
      fila.published === null
        ? 'sin-publicar'
        : fila.status === 'published'
          ? 'publicado'
          : 'con-cambios',
    sortOrder: fila.sortOrder,
  }));
}
